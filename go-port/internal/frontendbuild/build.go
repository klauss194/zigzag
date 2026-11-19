package frontendbuild

import (
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/evanw/esbuild/pkg/api"
)

var ErrBuildFailed = errors.New("frontendbuild: build failed")

const staleBindingsText = "frontend/bindings is stale or missing — run `task bindings` (or `npm run go`, which regenerates them)"

const keepFile = ".gitkeep"

func Build(o Options) (Result, error) {
	start := time.Now()
	var err error
	if o.Root, err = filepath.Abs(o.Root); err != nil {
		return Result{}, fmt.Errorf("frontendbuild: root: %w", err)
	}
	if o.OutDir, err = filepath.Abs(o.OutDir); err != nil {
		return Result{}, fmt.Errorf("frontendbuild: out dir: %w", err)
	}
	pages, err := pagesFor(o)
	if err != nil {
		return Result{}, err
	}

	result := Result{Files: map[string][]byte{}}
	for _, page := range pages {
		built := api.Build(buildOptions(o, page))
		result.Diags = append(result.Diags, diagsOf(built.Errors, false)...)
		result.Diags = append(result.Diags, diagsOf(built.Warnings, true)...)
		if len(built.Errors) > 0 {
			continue
		}
		result.Metafiles = append(result.Metafiles, built.Metafile)

		withCSS := false
		for _, file := range built.OutputFiles {
			name, err := filepath.Rel(o.OutDir, file.Path)
			if err != nil {
				return Result{}, fmt.Errorf("frontendbuild: output %s: %w", file.Path, err)
			}
			name = filepath.ToSlash(name)
			result.Files[name] = file.Contents
			if name == page.Name+".bundle.css" {
				withCSS = true
			}
		}

		template, err := readTemplate(o, page.Template)
		if err != nil {
			result.Diags = append(result.Diags, Diag{File: page.Template, Text: err.Error()})
			continue
		}
		html, err := renderPage(template, page.Name, withCSS)
		if err != nil {
			result.Diags = append(result.Diags, Diag{File: page.Template, Text: err.Error()})
			continue
		}
		result.Files[page.Name+".html"] = html
	}
	result.Diags = collapseStaleBindings(result.Diags)
	result.Took = time.Since(start)

	if failed := countErrors(result.Diags); failed > 0 {
		result.Files, result.Metafiles = nil, nil
		return result, fmt.Errorf("%w: %d error(s)", ErrBuildFailed, failed)
	}
	if o.Sources != nil {
		return result, nil
	}
	if err := replaceOutDir(o.OutDir, result.Files); err != nil {
		return result, err
	}
	result.Took = time.Since(start)
	return result, nil
}

func readTemplate(o Options, name string) ([]byte, error) {
	if o.Sources != nil {
		data, ok := o.Sources.Files[name]
		if !ok {
			return nil, fmt.Errorf("%s: not in the source", name)
		}
		return data, nil
	}
	return os.ReadFile(filepath.Join(o.Root, filepath.FromSlash(name)))
}

func pagesFor(o Options) ([]Page, error) {
	for _, name := range o.Pages {
		if !slices.ContainsFunc(Pages, func(p Page) bool { return p.Name == name }) {
			return nil, fmt.Errorf("frontendbuild: unknown page %q", name)
		}
	}
	var pages []Page
	for _, page := range Pages {
		if len(o.Pages) > 0 && !slices.Contains(o.Pages, page.Name) {
			continue
		}
		if page.Module == "" {
			pages = append(pages, page)
			continue
		}
		if !slices.Contains(o.Manifest, page.Module) {
			return nil, fmt.Errorf("frontendbuild: page %s names unknown module %q (modules.json)", page.Name, page.Module)
		}
		if slices.Contains(o.Modules, page.Module) {
			pages = append(pages, page)
		}
	}
	return pages, nil
}

func buildOptions(o Options, page Page) api.BuildOptions {
	enabled := o.Modules
	if enabled == nil {
		enabled = []string{}
	}
	modulesJSON, _ := json.Marshal(enabled)
	define := maps.Clone(o.Define)
	if define == nil {
		define = map[string]string{}
	}

	define["__ZZ_MODULES__"] = string(modulesJSON)

	release := o.Mode == Release
	options := api.BuildOptions{
		EntryPointsAdvanced: []api.EntryPoint{{
			InputPath:  filepath.Join(o.Root, filepath.FromSlash(page.Entry)),
			OutputPath: page.Name,
		}},
		AbsWorkingDir: o.Root,
		Bundle:        true,
		Write:         false,

		Format:     api.FormatESModule,
		Platform:   api.PlatformBrowser,
		Target:     api.ES2022,
		Outdir:     o.OutDir,
		EntryNames: "[name].bundle",
		PublicPath: "/",

		ResolveExtensions: []string{".js"},
		Alias:             aliases(o),

		Define:  define,
		Plugins: []api.Plugin{rawPlugin(o.Root)},

		Loader: map[string]api.Loader{
			".svg": api.LoaderFile, ".png": api.LoaderFile, ".jpg": api.LoaderFile,
			".jpeg": api.LoaderFile, ".gif": api.LoaderFile,
			".woff": api.LoaderFile, ".woff2": api.LoaderFile,
		},
		MinifyWhitespace:  release,
		MinifyIdentifiers: release,
		MinifySyntax:      release,
		Metafile:          true,
		LogLevel:          api.LogLevelSilent,
	}

	if o.Sources != nil {
		options.Plugins = []api.Plugin{memPlugin(o.Root, o.Sources)}
	}
	if release {
		options.Sourcemap = api.SourceMapNone
		options.LegalComments = api.LegalCommentsEndOfFile
	} else {
		options.Sourcemap = api.SourceMapLinked
		options.LegalComments = api.LegalCommentsInline
	}
	return options
}

func diagsOf(messages []api.Message, warning bool) []Diag {
	diags := make([]Diag, 0, len(messages))
	for _, message := range messages {
		diag := Diag{Text: message.Text, Warning: warning}
		if message.Location != nil {
			diag.File = message.Location.File
			diag.Line = message.Location.Line
			diag.Column = message.Location.Column + 1
		}
		diags = append(diags, diag)
	}
	return diags
}

func collapseStaleBindings(diags []Diag) []Diag {
	var out []Diag
	collapsed := false
	for _, diag := range diags {
		if !diag.Warning && strings.HasPrefix(diag.Text, "Could not resolve") && strings.Contains(diag.Text, "bindings/") {
			if !collapsed {
				diag.Text = staleBindingsText
				out = append(out, diag)
				collapsed = true
			}
			continue
		}
		out = append(out, diag)
	}
	return out
}

func countErrors(diags []Diag) int {
	n := 0
	for _, diag := range diags {
		if !diag.Warning {
			n++
		}
	}
	return n
}

func replaceOutDir(outDir string, files map[string][]byte) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("frontendbuild: out dir: %w", err)
	}
	staging, err := os.MkdirTemp(filepath.Dir(outDir), ".frontendbuild-")
	if err != nil {
		return fmt.Errorf("frontendbuild: staging dir: %w", err)
	}
	defer os.RemoveAll(staging)

	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		target := filepath.Join(staging, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return fmt.Errorf("frontendbuild: staging %s: %w", name, err)
		}
		if err := os.WriteFile(target, files[name], 0o644); err != nil {
			return fmt.Errorf("frontendbuild: staging %s: %w", name, err)
		}
	}

	entries, err := os.ReadDir(outDir)
	if err != nil {
		return fmt.Errorf("frontendbuild: reading %s: %w", outDir, err)
	}
	for _, entry := range entries {
		if entry.Name() == keepFile {
			continue
		}
		if err := os.RemoveAll(filepath.Join(outDir, entry.Name())); err != nil {
			return fmt.Errorf("frontendbuild: clearing %s: %w", outDir, err)
		}
	}
	for _, name := range names {
		target := filepath.Join(outDir, filepath.FromSlash(name))
		if dir := path.Dir(name); dir != "." {
			if err := os.MkdirAll(filepath.Join(outDir, filepath.FromSlash(dir)), 0o755); err != nil {
				return fmt.Errorf("frontendbuild: %s: %w", name, err)
			}
		}
		if err := os.Rename(filepath.Join(staging, filepath.FromSlash(name)), target); err != nil {
			return fmt.Errorf("frontendbuild: moving %s into place: %w", name, err)
		}
	}
	return nil
}

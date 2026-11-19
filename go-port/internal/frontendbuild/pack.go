package frontendbuild

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"iter"
	"maps"
	"os"
	"path"
	"path/filepath"
	"runtime/debug"
	"slices"
	"strings"
	"time"
)

const PackBudget = 2 << 20

var ErrPackTooLarge = errors.New("frontendbuild: source pack over budget")

const PackMetaName = "pack.json"

const ResolveName = "resolve.json"

type PackMeta struct {
	V       int      `json:"v"`
	Modules []string `json:"modules"`

	Manifest []string `json:"manifest"`

	Mode    Mode   `json:"mode"`
	Esbuild string `json:"esbuild"`
}

func packMetaOf(o Options) PackMeta {
	modules, manifest := o.Modules, o.Manifest
	if modules == nil {
		modules = []string{}
	}
	if manifest == nil {
		manifest = []string{}
	}
	return PackMeta{V: 1, Modules: modules, Manifest: manifest, Mode: o.Mode, Esbuild: esbuildVersion()}
}

func (m PackMeta) RebuildOptions(src *Sources, pages ...string) Options {
	root := filepath.Join(os.TempDir(), "zigzag-frontend-in-memory")
	return Options{
		Root:     root,
		OutDir:   filepath.Join(root, "dist"),
		Mode:     m.Mode,
		Modules:  m.Modules,
		Manifest: m.Manifest,
		Pages:    pages,
		Sources:  src,
	}
}

func WritePack(o Options, metafiles []string, w io.Writer) error {
	root, err := filepath.Abs(o.Root)
	if err != nil {
		return fmt.Errorf("frontendbuild: pack root: %w", err)
	}
	pages, err := pagesFor(o)
	if err != nil {
		return err
	}
	parsed, err := parseMetafiles(metafiles)
	if err != nil {
		return err
	}
	names, err := packFiles(root, parsed, pages)
	if err != nil {
		return err
	}

	meta, err := json.Marshal(packMetaOf(o))
	if err != nil {
		return fmt.Errorf("frontendbuild: pack.json: %w", err)
	}
	resolveJSON, err := json.Marshal(resolveTableOf(parsed))
	if err != nil {
		return fmt.Errorf("frontendbuild: %s: %w", ResolveName, err)
	}

	var archive bytes.Buffer
	gz, err := gzip.NewWriterLevel(&archive, gzip.BestCompression)
	if err != nil {
		return fmt.Errorf("frontendbuild: pack: %w", err)
	}
	tw := tar.NewWriter(gz)
	entries := append(slices.Clone(names), PackMetaName, ResolveName)
	slices.Sort(entries)
	for _, name := range entries {
		var data []byte
		if name == PackMetaName {
			data = meta
		} else if name == ResolveName {
			data = resolveJSON
		} else if data, err = os.ReadFile(filepath.Join(root, filepath.FromSlash(name))); err != nil {
			return fmt.Errorf("frontendbuild: pack: %w", err)
		}
		header := &tar.Header{
			Typeflag: tar.TypeReg,
			Name:     name,
			Size:     int64(len(data)),
			Mode:     0o644,
			ModTime:  time.Unix(0, 0),
		}
		if err := tw.WriteHeader(header); err != nil {
			return fmt.Errorf("frontendbuild: pack %s: %w", name, err)
		}
		if _, err := tw.Write(data); err != nil {
			return fmt.Errorf("frontendbuild: pack %s: %w", name, err)
		}
	}
	if err := tw.Close(); err != nil {
		return fmt.Errorf("frontendbuild: pack: %w", err)
	}
	if err := gz.Close(); err != nil {
		return fmt.Errorf("frontendbuild: pack: %w", err)
	}

	if archive.Len() > PackBudget {
		return fmt.Errorf("%w: %d bytes, budget %d", ErrPackTooLarge, archive.Len(), PackBudget)
	}
	if _, err := w.Write(archive.Bytes()); err != nil {
		return fmt.Errorf("frontendbuild: writing pack: %w", err)
	}
	return nil
}

var requiredPackFiles = []string{
	"src/index.js",
	"bindings/github.com/klauss/zigzag-go/internal/bridge/index.js",
	"node_modules/@wailsio/runtime/package.json",
}

func VerifyPack(data []byte, manifest, enabled []string) error {
	if len(data) > PackBudget {
		return fmt.Errorf("%w: %d bytes, budget %d", ErrPackTooLarge, len(data), PackBudget)
	}
	_, src, err := ReadPack(bytes.NewReader(data))
	if err != nil {
		return err
	}

	var problems []string
	for _, want := range requiredPackFiles {
		if _, ok := src.Files[want]; !ok {
			problems = append(problems, "missing "+want)
		}
	}
	names := slices.Sorted(maps.Keys(src.Files))
	for _, module := range manifest {
		if slices.Contains(enabled, module) {
			continue
		}
		for _, name := range names {
			if strings.HasPrefix(name, "src/modules/"+module+"/") ||
				(strings.HasPrefix(name, "bindings/") && strings.Contains(name, "/internal/modules/"+module+"/")) {
				problems = append(problems, fmt.Sprintf("holds %s, but %s is excluded", name, module))
			}
		}
	}
	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

type metafile struct {
	Inputs map[string]struct {
		Imports []metaImport `json:"imports"`
	} `json:"inputs"`
}

type metaImport struct {
	Path     string `json:"path"`
	Original string `json:"original"`
	External bool   `json:"external"`
}

func parseMetafiles(metafiles []string) ([]metafile, error) {
	parsed := make([]metafile, len(metafiles))
	for i, text := range metafiles {
		if err := json.Unmarshal([]byte(text), &parsed[i]); err != nil {
			return nil, fmt.Errorf("frontendbuild: metafile %d: %w", i, err)
		}
	}
	return parsed, nil
}

func packFiles(root string, metafiles []metafile, pages []Page) ([]string, error) {
	set := map[string]bool{}
	for _, page := range pages {
		set[page.Template] = true
	}
	var inputs []string
	for _, meta := range metafiles {
		for input := range meta.Inputs {
			name, ok := packInput(input)
			if !ok {
				continue
			}
			if !filepath.IsLocal(filepath.FromSlash(name)) {
				return nil, fmt.Errorf("frontendbuild: pack: input %q is outside the root", input)
			}
			if !set[name] {
				set[name] = true
				inputs = append(inputs, name)
			}
		}
	}
	for _, input := range inputs {
		for _, manifest := range packageJSONChain(root, input) {
			set[manifest] = true
		}
	}

	names := make([]string, 0, len(set))
	for name := range set {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(name))); err != nil {
			return nil, fmt.Errorf("frontendbuild: pack: %w", err)
		}
		names = append(names, name)
	}
	slices.Sort(names)
	return names, nil
}

func packInput(input string) (string, bool) {
	if strings.HasPrefix(input, "<") {
		return "", false
	}
	return strings.TrimPrefix(input, rawNamespace+":"), true
}

func packageDirs(name string) iter.Seq[string] {
	return func(yield func(string) bool) {
		at := strings.Index(name, "node_modules/")
		if at < 0 {
			return
		}
		top := name[:at+len("node_modules")]
		for dir := path.Dir(name); dir != top && strings.HasPrefix(dir, top+"/"); dir = path.Dir(dir) {
			if !yield(dir) {
				return
			}
		}
	}
}

func packageJSONChain(root, input string) []string {
	var found []string
	for dir := range packageDirs(input) {
		candidate := dir + "/package.json"
		if info, err := os.Stat(filepath.Join(root, filepath.FromSlash(candidate))); err == nil && info.Mode().IsRegular() {
			found = append(found, candidate)
		}
	}
	return found
}

func resolveTableOf(metafiles []metafile) map[string]map[string]string {
	table := map[string]map[string]string{}
	for _, meta := range metafiles {
		for importer, input := range meta.Inputs {
			for _, imp := range input.Imports {
				if imp.External || imp.Original == "" {
					continue
				}
				if table[importer] == nil {
					table[importer] = map[string]string{}
				}
				table[importer][imp.Original] = imp.Path
			}
		}
	}
	return table
}

func esbuildVersion() string {
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return "unknown"
	}
	for _, dep := range info.Deps {
		if dep.Path == "github.com/evanw/esbuild" {
			if dep.Replace != nil {
				return dep.Replace.Version
			}
			return dep.Version
		}
	}
	return "unknown"
}

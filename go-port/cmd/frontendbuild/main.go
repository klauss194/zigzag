package main

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/klauss/zigzag-go/internal/frontendbuild"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("frontendbuild", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", "frontend", "the frontend: the directory holding src/, bindings/ and node_modules/")
	out := flags.String("out", "frontend/dist", "where the built pages go (replaced, .gitkeep kept)")
	pack := flags.String("pack", "frontend/sourcepack/sourcepack.tar.gz", "where the source pack goes")
	modeName := flags.String("mode", "release", "release (minified, no source maps) or dev (readable, source maps)")
	modulesPath := flags.String("modules-json", "../modules.json", "the build-optional module list")
	verify := flags.String("verify-pack", "", "only check this source pack, then exit")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() > 0 {
		fmt.Fprintf(stderr, "frontendbuild: unexpected argument %q\n", flags.Arg(0))
		return 2
	}

	modulesJSON, err := os.ReadFile(*modulesPath)
	if err != nil {
		fmt.Fprintf(stderr, "frontendbuild: %v\n", err)
		return 2
	}
	manifest, enabled, err := frontendbuild.ResolveModules(modulesJSON, os.Getenv("ZIGZAG_EXCLUDE"))
	if err != nil {
		fmt.Fprintf(stderr, "frontendbuild: %v\n", err)
		return 2
	}

	if *verify != "" {
		if err := verifyPack(*verify, manifest, enabled); err != nil {
			fmt.Fprintf(stderr, "frontendbuild: %s: %v\n", *verify, err)
			return 1
		}
		fmt.Fprintf(stdout, "frontendbuild: %s is a complete source pack\n", *verify)
		return 0
	}

	mode, err := frontendbuild.ParseMode(*modeName)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 2
	}
	return build(frontendbuild.Options{Root: *root, OutDir: *out, Mode: mode, Modules: enabled, Manifest: manifest},
		*pack, stdout, stderr)
}

func build(o frontendbuild.Options, packPath string, stdout, stderr io.Writer) int {
	start := time.Now()
	fmt.Fprintf(stdout, "frontendbuild: %s build, modules: %s\n", o.Mode, describeModules(o.Manifest, o.Modules))

	result, err := frontendbuild.Build(o)
	for _, diag := range result.Diags {
		fmt.Fprintln(stderr, diag)
	}
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	names := make([]string, 0, len(result.Files))
	for name := range result.Files {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		fmt.Fprintf(stdout, "  %-30s %12s B\n", name, thousands(len(result.Files[name])))
	}

	packStart := time.Now()
	size, err := writePack(o, result.Metafiles, packPath)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	fmt.Fprintf(stdout, "  %-30s %12s B  (budget %s)\n", "source pack", thousands(size), thousands(frontendbuild.PackBudget))
	fmt.Fprintf(stdout, "built in %s (pages %s, pack %s)\n",
		round(time.Since(start)), round(result.Took), round(time.Since(packStart)))
	return 0
}

func writePack(o frontendbuild.Options, metafiles []string, packPath string) (int, error) {
	var buf bytes.Buffer
	if err := frontendbuild.WritePack(o, metafiles, &buf); err != nil {
		return 0, err
	}
	if err := os.MkdirAll(filepath.Dir(packPath), 0o755); err != nil {
		return 0, fmt.Errorf("frontendbuild: source pack: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(packPath), ".sourcepack-*")
	if err != nil {
		return 0, fmt.Errorf("frontendbuild: source pack: %w", err)
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(buf.Bytes()); err != nil {
		tmp.Close()
		return 0, fmt.Errorf("frontendbuild: source pack: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return 0, fmt.Errorf("frontendbuild: source pack: %w", err)
	}
	if err := os.Rename(tmp.Name(), packPath); err != nil {
		return 0, fmt.Errorf("frontendbuild: source pack: %w", err)
	}
	return buf.Len(), nil
}

func verifyPack(path string, manifest, enabled []string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return frontendbuild.VerifyPack(data, manifest, enabled)
}

func describeModules(manifest, enabled []string) string {
	parts := make([]string, 0, len(manifest))
	for _, name := range manifest {
		state := "on"
		if !slices.Contains(enabled, name) {
			state = "OFF"
		}
		parts = append(parts, name+" "+state)
	}
	return strings.Join(parts, ", ")
}

func thousands(n int) string {
	s := fmt.Sprint(n)
	var out []byte
	for i := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, s[i])
	}
	return string(out)
}

func round(d time.Duration) time.Duration {
	return d.Round(time.Millisecond)
}

package frontendbuild

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
)

const rawNamespace = "raw"

func rawPlugin(root string) api.Plugin {
	return api.Plugin{
		Name: "raw",
		Setup: func(build api.PluginBuild) {
			build.OnResolve(api.OnResolveOptions{Filter: `\?raw$`}, func(args api.OnResolveArgs) (api.OnResolveResult, error) {

				resolved := build.Resolve(strings.TrimSuffix(args.Path, "?raw"), api.ResolveOptions{
					Kind:       args.Kind,
					ResolveDir: args.ResolveDir,
					Importer:   args.Importer,
				})
				if len(resolved.Errors) > 0 {
					return api.OnResolveResult{}, fmt.Errorf("%s", resolved.Errors[0].Text)
				}
				shown := resolved.Path
				if rel, err := filepath.Rel(root, resolved.Path); err == nil && filepath.IsLocal(rel) {
					shown = filepath.ToSlash(rel)
				}
				return api.OnResolveResult{Path: shown, Namespace: rawNamespace, PluginData: resolved.Path}, nil
			})
			build.OnLoad(api.OnLoadOptions{Filter: `.*`, Namespace: rawNamespace}, func(args api.OnLoadArgs) (api.OnLoadResult, error) {
				file, _ := args.PluginData.(string)
				if file == "" {
					file = args.Path
				}
				data, err := os.ReadFile(file)
				if err != nil {
					return api.OnLoadResult{}, fmt.Errorf("reading %s for ?raw: %w", args.Path, err)
				}
				text := string(data)
				return api.OnLoadResult{Contents: &text, Loader: api.LoaderText}, nil
			})
		},
	}
}

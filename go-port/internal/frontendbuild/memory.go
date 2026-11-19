package frontendbuild

import (
	"encoding/json"
	"fmt"
	"path"
	"path/filepath"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
)

type Sources struct {
	Files map[string][]byte

	Resolve map[string]map[string]string
}

func memPlugin(root string, src *Sources) api.Plugin {
	byBare := map[string]string{}
	for _, imports := range src.Resolve {
		for spec, resolved := range imports {
			if isBare(spec) {
				byBare[spec] = resolved
			}
		}
	}
	rel := func(abs string) (string, bool) {
		r, err := filepath.Rel(root, abs)
		if err != nil || !filepath.IsLocal(r) {
			return "", false
		}
		return filepath.ToSlash(r), true
	}
	exists := func(name string) bool { _, ok := src.Files[name]; return ok }

	resolve := func(args api.OnResolveArgs) (string, error) {
		if filepath.IsAbs(args.Path) {
			if name, ok := rel(args.Path); ok && exists(name) {
				return name, nil
			}
			return "", fmt.Errorf("not in the source: %s", args.Path)
		}
		importer, _ := rel(args.Importer)
		if args.Namespace == rawNamespace {
			importer = args.Importer
		}
		if resolved, ok := src.Resolve[importer][args.Path]; ok {
			return resolved, nil
		}
		spec, suffix := strings.CutSuffix(args.Path, "?raw")
		if strings.HasPrefix(spec, "./") || strings.HasPrefix(spec, "../") {
			base := path.Join(path.Dir(importer), spec)
			for _, candidate := range []string{base, base + ".js", base + "/index.js"} {
				if exists(candidate) {
					if suffix {
						return rawNamespace + ":" + candidate, nil
					}
					return candidate, nil
				}
			}
			return "", fmt.Errorf("could not resolve %q from %s", args.Path, importer)
		}
		if resolved, ok := byBare[args.Path]; ok {
			return resolved, nil
		}
		return "", fmt.Errorf("could not resolve %q from %s: only packages the app itself uses are in the source", args.Path, importer)
	}

	return api.Plugin{
		Name: "memory",
		Setup: func(build api.PluginBuild) {
			build.OnResolve(api.OnResolveOptions{Filter: `.*`}, func(args api.OnResolveArgs) (api.OnResolveResult, error) {
				if isURL(args.Path) {

					return api.OnResolveResult{}, nil
				}
				name, err := resolve(args)
				if err != nil {
					return api.OnResolveResult{}, err
				}
				if file, ok := strings.CutPrefix(name, rawNamespace+":"); ok {

					return api.OnResolveResult{Path: file, Namespace: rawNamespace, PluginData: file}, nil
				}
				return api.OnResolveResult{
					Path:        filepath.Join(root, filepath.FromSlash(name)),
					Namespace:   "file",
					SideEffects: sideEffectsOf(src.Files, name),
				}, nil
			})
			build.OnLoad(api.OnLoadOptions{Filter: `.*`, Namespace: "file"}, func(args api.OnLoadArgs) (api.OnLoadResult, error) {
				name, ok := rel(args.Path)
				data, found := src.Files[name]
				if !ok || !found {
					return api.OnLoadResult{}, fmt.Errorf("not in the source: %s", args.Path)
				}
				text := string(data)

				return api.OnLoadResult{Contents: &text, Loader: api.LoaderDefault, ResolveDir: filepath.Dir(args.Path)}, nil
			})
			build.OnLoad(api.OnLoadOptions{Filter: `.*`, Namespace: rawNamespace}, func(args api.OnLoadArgs) (api.OnLoadResult, error) {
				data, found := src.Files[args.Path]
				if !found {
					return api.OnLoadResult{}, fmt.Errorf("reading %s for ?raw: not in the source", args.Path)
				}
				text := string(data)
				return api.OnLoadResult{Contents: &text, Loader: api.LoaderText}, nil
			})
		},
	}
}

func isURL(spec string) bool {
	return strings.HasPrefix(spec, "data:") || strings.HasPrefix(spec, "http://") ||
		strings.HasPrefix(spec, "https://") || strings.HasPrefix(spec, "//")
}

func isBare(spec string) bool {
	return spec != "" && !strings.HasPrefix(spec, ".") && !strings.HasPrefix(spec, "/") && !filepath.IsAbs(spec)
}

func sideEffectsOf(files map[string][]byte, name string) api.SideEffects {
	for dir := range packageDirs(name) {
		data, ok := files[dir+"/package.json"]
		if !ok {
			continue
		}
		var pkg struct {
			SideEffects json.RawMessage `json:"sideEffects"`
		}
		if json.Unmarshal(data, &pkg) != nil || pkg.SideEffects == nil {
			continue
		}
		var flag bool
		if json.Unmarshal(pkg.SideEffects, &flag) == nil {
			if flag {
				return api.SideEffectsTrue
			}
			return api.SideEffectsFalse
		}
		var patterns []string
		if json.Unmarshal(pkg.SideEffects, &patterns) != nil {
			return api.SideEffectsTrue
		}
		inPkg := strings.TrimPrefix(name, dir+"/")
		for _, pattern := range patterns {
			pattern = strings.TrimPrefix(pattern, "./")
			subject := inPkg
			if !strings.Contains(pattern, "/") {
				subject = path.Base(inPkg)
			}
			if ok, _ := path.Match(pattern, subject); ok {
				return api.SideEffectsTrue
			}
		}
		return api.SideEffectsFalse
	}
	return api.SideEffectsTrue
}

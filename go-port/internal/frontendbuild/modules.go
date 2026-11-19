package frontendbuild

import (
	"bytes"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
)

func ResolveModules(modulesJSON []byte, exclude string) (manifest []string, enabled []string, err error) {
	manifest, err = manifestKeys(modulesJSON)
	if err != nil {
		return nil, nil, err
	}

	known := make(map[string]bool, len(manifest))
	for _, name := range manifest {
		known[name] = true
	}
	excluded := map[string]bool{}
	var unknown []string
	for _, name := range strings.Split(exclude, ",") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if !known[name] {
			unknown = append(unknown, name)
			continue
		}
		excluded[name] = true
	}
	if len(unknown) > 0 {
		return nil, nil, fmt.Errorf("unknown module(s): %s — known: %s (modules.json)",
			strings.Join(unknown, ", "), strings.Join(manifest, ", "))
	}

	for _, name := range manifest {
		if !excluded[name] {
			enabled = append(enabled, name)
		}
	}
	return manifest, enabled, nil
}

func manifestKeys(modulesJSON []byte) ([]string, error) {
	decoder := json.NewDecoder(bytes.NewReader(modulesJSON))
	open, err := decoder.Token()
	if err != nil {
		return nil, fmt.Errorf("modules.json: %w", err)
	}
	if delim, ok := open.(json.Delim); !ok || delim != '{' {
		return nil, fmt.Errorf("modules.json: not a JSON object")
	}
	var keys []string
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return nil, fmt.Errorf("modules.json: %w", err)
		}
		key, ok := token.(string)
		if !ok {
			return nil, fmt.Errorf("modules.json: expected a key, got %v", token)
		}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, fmt.Errorf("modules.json: %s: %w", key, err)
		}
		if strings.HasPrefix(key, "/") {
			continue
		}
		keys = append(keys, key)
	}
	return keys, nil
}

func aliases(o Options) map[string]string {
	enabled := make(map[string]bool, len(o.Modules))
	for _, name := range o.Modules {
		enabled[name] = true
	}
	out := make(map[string]string, len(o.Manifest))
	for _, name := range o.Manifest {
		target := filepath.Join(o.Root, "src", "modules", "disabled.js")
		if enabled[name] {
			target = filepath.Join(o.Root, "src", "modules", name, "index.js")
		}
		out["@zz-modules/"+name] = target
	}
	return out
}

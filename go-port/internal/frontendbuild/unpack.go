package frontendbuild

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
)

func ReadPack(r io.Reader) (PackMeta, *Sources, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return PackMeta{}, nil, fmt.Errorf("frontendbuild: source pack: %w", err)
	}
	defer gz.Close()

	var meta PackMeta
	src := &Sources{Files: map[string][]byte{}}
	sawMeta, sawResolve := false, false
	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return PackMeta{}, nil, fmt.Errorf("frontendbuild: source pack: %w", err)
		}
		name := header.Name
		if header.Typeflag != tar.TypeReg || !cleanRelative(name) {
			return PackMeta{}, nil, fmt.Errorf("frontendbuild: source pack: refusing entry %q", name)
		}
		data, err := io.ReadAll(tr)
		if err != nil {
			return PackMeta{}, nil, fmt.Errorf("frontendbuild: source pack %s: %w", name, err)
		}
		switch name {
		case PackMetaName:
			if err := json.Unmarshal(data, &meta); err != nil {
				return PackMeta{}, nil, fmt.Errorf("frontendbuild: source pack %s: %w", name, err)
			}
			sawMeta = true
		case ResolveName:
			if err := json.Unmarshal(data, &src.Resolve); err != nil {
				return PackMeta{}, nil, fmt.Errorf("frontendbuild: source pack %s: %w", name, err)
			}
			sawResolve = true
		default:
			src.Files[name] = data
		}
	}
	for file, saw := range map[string]bool{PackMetaName: sawMeta, ResolveName: sawResolve} {
		if !saw {
			return PackMeta{}, nil, fmt.Errorf("frontendbuild: source pack has no %s — rebuild it (npm run build)", file)
		}
	}
	return meta, src, nil
}

func cleanRelative(name string) bool {
	return name != "" && path.Clean(name) == name && !path.IsAbs(name) &&
		name != ".." && !strings.HasPrefix(name, "../") &&
		!strings.ContainsAny(name, `\:`)
}

//go:build !android

package media

func publishDownload(path, name string) (string, error) { return path, nil }

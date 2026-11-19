package media

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func readRegularFile(path string, limit int64) ([]byte, error) {
	name := filepath.Base(path)
	if !filepath.IsAbs(path) {
		return nil, fmt.Errorf("media: %q is not an absolute path", path)
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("media: %s: %w", name, withoutPath(err))
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("media: %s is not a regular file", name)
	}
	if info.Size() > limit {
		return nil, tooLarge(name, info.Size(), limit)
	}

	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("media: %s: %w", name, withoutPath(err))
	}
	defer file.Close()
	data, err := readLimited(file, limit)
	if errors.Is(err, ErrTooLarge) {
		return nil, fmt.Errorf("%w: %s grew past the limit while it was read", ErrTooLarge, name)
	}
	if err != nil {
		return nil, fmt.Errorf("media: read %s: %w", name, err)
	}
	return data, nil
}

func withoutPath(err error) error {
	var pathError *os.PathError
	if errors.As(err, &pathError) {
		return pathError.Err
	}
	return err
}

func readLimited(reader io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("%w: more than %d bytes", ErrTooLarge, limit)
	}
	return data, nil
}

func tooLarge(name string, size, limit int64) error {
	return fmt.Errorf("%w: %s is %s, the limit is %s", ErrTooLarge, name, formatSize(size), formatSize(limit))
}

func formatSize(size int64) string {
	const mebibyte = 1024 * 1024
	if size < mebibyte {
		return fmt.Sprintf("%d bytes", size)
	}
	return fmt.Sprintf("%d MiB", (size+mebibyte-1)/mebibyte)
}

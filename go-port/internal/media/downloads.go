package media

import (
	"os"
	"path/filepath"
	"strings"
)

func downloadDirectory() (string, error) {
	if directory := strings.TrimSpace(os.Getenv("XDG_DOWNLOAD_DIR")); directory != "" {
		return directory, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	if directory := platformDownloadDirectory(home); directory != "" {
		return directory, nil
	}
	return filepath.Join(home, "Downloads"), nil
}

//go:build !windows && !darwin && !android

package media

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

func platformDownloadDirectory(home string) string {
	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		configHome = filepath.Join(home, ".config")
	}
	contents, err := os.ReadFile(filepath.Join(configHome, "user-dirs.dirs"))
	if err != nil {
		return ""
	}
	return parseUserDirs(string(contents), home)
}

func parseUserDirs(contents, home string) string {
	var directory string
	scanner := bufio.NewScanner(strings.NewReader(contents))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		value, ok := strings.CutPrefix(line, "XDG_DOWNLOAD_DIR=")
		if !ok {
			continue
		}
		value = strings.TrimSpace(value)
		if len(value) < 2 || value[0] != '"' || value[len(value)-1] != '"' {
			continue
		}
		value = strings.ReplaceAll(value[1:len(value)-1], `\"`, `"`)
		switch {
		case value == "$HOME" || value == "$HOME/":
			directory = ""
		case strings.HasPrefix(value, "$HOME/"):
			directory = filepath.Join(home, strings.TrimPrefix(value, "$HOME/"))
		case filepath.IsAbs(value):
			directory = value
		}
	}
	return directory
}

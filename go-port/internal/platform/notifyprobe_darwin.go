//go:build darwin

package platform

import (
	"os"
	"path/filepath"
	"strings"
)

func NativeNotificationsUnavailable() string {

	executable, err := os.Executable()
	if err != nil {
		return "the executable path could not be read"
	}
	if !strings.Contains(filepath.ToSlash(executable), ".app/Contents/MacOS/") {
		return "this macOS development binary is not an .app bundle — run `task package`"
	}
	return ""
}

//go:build android

package platform

import (
	"fmt"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func androidFilesDir() (string, error) {
	base := application.Android.StoragePath()
	if base == "" {
		return "", fmt.Errorf("platform: android storage path unavailable")
	}
	return base, nil
}

func UserConfigDir() (string, error) {
	base, err := androidFilesDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "config"), nil
}

func UserDataDir() (string, error) {
	base, err := androidFilesDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "data"), nil
}

func UserConfigDirFrom(func(string) string) (string, error) {
	return UserConfigDir()
}

func UserDataDirFrom(func(string) string) (string, error) {
	return UserDataDir()
}

func UserDataDirVar() string {
	return "XDG_DATA_HOME"
}

func UserCacheDir() (string, error) {
	base, err := androidFilesDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(base), "cache"), nil
}

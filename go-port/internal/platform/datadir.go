//go:build !android

package platform

import (
	"errors"
	"os"
	"path"
	"path/filepath"
	"runtime"
)

func UserConfigDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, AppID), nil
}

func UserConfigDirFrom(env func(string) string) (string, error) {
	base, err := configBase(runtime.GOOS, env)
	if err != nil {
		return "", err
	}
	return filepath.Join(base, AppID), nil
}

func UserDataDir() (string, error) {
	return UserDataDirFrom(os.Getenv)
}

func UserDataDirFrom(env func(string) string) (string, error) {
	base, err := dataBase(runtime.GOOS, env)
	if err != nil {
		return "", err
	}
	return filepath.Join(base, AppID), nil
}

func UserDataDirVar() string {
	return dataVar(runtime.GOOS)
}

func dataBase(goos string, env func(string) string) (string, error) {
	switch goos {
	case "windows":
		if base := env("LOCALAPPDATA"); base != "" {
			return base, nil
		}
		if base := env("APPDATA"); base != "" {
			return base, nil
		}
		home := env("USERPROFILE")
		if home == "" {
			return "", errors.New("%userprofile% is not defined")
		}
		return filepath.Join(home, "AppData", "Local"), nil
	case "darwin":
		home := env("HOME")
		if home == "" {
			return "", errors.New("$HOME is not defined")
		}
		return filepath.Join(home, "Library", "Application Support"), nil
	default:
		if base := env("XDG_DATA_HOME"); base != "" {

			if !path.IsAbs(base) {
				return "", errors.New("path in $XDG_DATA_HOME is relative")
			}
			return base, nil
		}
		home := env("HOME")
		if home == "" {
			return "", errors.New("$HOME is not defined")
		}
		return filepath.Join(home, ".local", "share"), nil
	}
}

func dataVar(goos string) string {
	switch goos {
	case "windows":
		return "LOCALAPPDATA"
	case "darwin":
		return "HOME"
	default:
		return "XDG_DATA_HOME"
	}
}

func configBase(goos string, env func(string) string) (string, error) {
	switch goos {
	case "windows":
		base := env("APPDATA")
		if base == "" {
			return "", errors.New("%AppData% is not defined")
		}
		return base, nil
	case "darwin":
		home := env("HOME")
		if home == "" {
			return "", errors.New("$HOME is not defined")
		}
		return filepath.Join(home, "Library", "Application Support"), nil
	default:
		if base := env("XDG_CONFIG_HOME"); base != "" {

			if !path.IsAbs(base) {
				return "", errors.New("path in $XDG_CONFIG_HOME is relative")
			}
			return base, nil
		}
		home := env("HOME")
		if home == "" {
			return "", errors.New("neither $XDG_CONFIG_HOME nor $HOME are defined")
		}
		return filepath.Join(home, ".config"), nil
	}
}

func UserCacheDir() (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, AppID), nil
}

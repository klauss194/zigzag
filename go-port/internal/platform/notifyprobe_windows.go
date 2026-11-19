//go:build windows

package platform

import "golang.org/x/sys/windows/registry"

var probeKeyPath = `Software\Classes\CLSID\{00000000-0000-0000-0000-000000000000}\` + AppID + `-probe`

func NativeNotificationsUnavailable() string {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, probeKeyPath, registry.ALL_ACCESS)
	if err != nil {
		return "the toast activator's registry key cannot be created under HKCU — " + err.Error()
	}
	_ = key.Close()

	_ = registry.DeleteKey(registry.CURRENT_USER, probeKeyPath)
	return ""
}

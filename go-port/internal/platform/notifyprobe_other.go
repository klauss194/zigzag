//go:build (!darwin && !linux && !windows) || android

package platform

import "runtime"

func NativeNotificationsUnavailable() string {
	if runtime.GOOS == "android" {
		return "android: native bridge notifier"
	}
	return ""
}

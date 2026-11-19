//go:build linux && !android

package platform

import "os"

func NativeNotificationsUnavailable() string {

	if os.Getenv("DBUS_SESSION_BUS_ADDRESS") == "" {
		return "no D-Bus session bus (DBUS_SESSION_BUS_ADDRESS is unset) — notifications need a desktop session"
	}
	return ""
}

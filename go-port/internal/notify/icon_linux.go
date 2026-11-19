//go:build linux && !android

package notify

import "github.com/wailsapp/wails/v3/pkg/services/notifications"

func iconAttachment(path string) []notifications.NotificationAttachment {
	if path == "" {
		return nil
	}
	return []notifications.NotificationAttachment{{Path: path}}
}

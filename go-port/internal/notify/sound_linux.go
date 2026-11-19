//go:build linux && !android

package notify

import "github.com/wailsapp/wails/v3/pkg/services/notifications"

func audibleSound() *notifications.NotificationSound {
	return &notifications.NotificationSound{Name: "message-new-instant"}
}

//go:build !linux || android

package notify

import "github.com/wailsapp/wails/v3/pkg/services/notifications"

func iconAttachment(string) []notifications.NotificationAttachment { return nil }

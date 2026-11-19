//go:build android

package notify

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type AndroidNotifier struct{}

func (AndroidNotifier) SendNotification(options notifications.NotificationOptions) error {
	application.Android.Notify(buildAndroidPayload(options))
	return nil
}

func (AndroidNotifier) RemoveDeliveredNotification(identifier string) error {
	if identifier == "" {
		return nil
	}
	application.Android.Notify(buildAndroidCancelPayload(identifier))
	return nil
}

func PlatformNotifier() Notifier { return AndroidNotifier{} }

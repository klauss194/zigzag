package bridge

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/klauss/zigzag-go/internal/trace"
)

func BindLifecycle(wails *application.App, setFocused func(bool), nudgeSync func()) {
	wails.Event.OnApplicationEvent(events.Android.ActivityResumed, func(*application.ApplicationEvent) {
		setFocused(true)
	})
	wails.Event.OnApplicationEvent(events.Android.ActivityPaused, func(*application.ApplicationEvent) {
		setFocused(false)
	})

	wails.Event.OnApplicationEvent(events.Common.NetworkChanged, func(event *application.ApplicationEvent) {
		if connected, _ := event.Context().Data()["connected"].(bool); connected {
			nudgeSync()
		}
	})

	lifecycleLog := trace.Log("lifecycle")
	wails.Event.OnApplicationEvent(events.Common.LowMemory, func(*application.ApplicationEvent) {
		lifecycleLog.Warn().Msg("android: low memory")
	})
}

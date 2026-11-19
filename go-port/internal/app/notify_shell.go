package app

import (
	"context"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"

	"github.com/klauss/zigzag-go/internal/appicon"
	"github.com/klauss/zigzag-go/internal/matrix/id"
	"github.com/klauss/zigzag-go/internal/notify"
	"github.com/klauss/zigzag-go/internal/platform"
	"github.com/klauss/zigzag-go/internal/trace"
)

func (a *App) showBadge(engine *notify.Engine) {
	a.stateMu.RLock()
	badge := a.appBadge
	a.stateMu.RUnlock()
	if badge != nil && a.stillCurrent(engine) {
		badge.Show(engine.AppBadge())
	}
}

func (a *App) clearBadge() {
	a.stateMu.RLock()
	badge := a.appBadge
	a.stateMu.RUnlock()
	if badge != nil {
		badge.Show(notify.AppBadge{})
	}
}

func (a *App) AttachNotifier(notifier notify.Notifier) {
	shell := notify.NewShell(notifier, trace.Log("notify"), notificationIconPath())
	shell.OnActivate(func(roomID id.RoomID, threadID id.EventID) {
		a.Emit(EventNotifyActivate, NotifyActivation{RoomID: string(roomID), ThreadRootID: string(threadID)})
	})
	shell.Start()

	a.stateMu.Lock()
	a.notifyShell = shell
	a.stateMu.Unlock()
}

type notificationLifecycle interface {
	ServiceStartup(ctx context.Context, options application.ServiceOptions) error
	ServiceShutdown() error
}

type NotificationHost struct {
	app     *App
	service notificationLifecycle
}

func (a *App) NewNotificationHost(service notificationLifecycle) *NotificationHost {
	return &NotificationHost{app: a, service: service}
}

func (h *NotificationHost) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	logger := trace.Log("notify")
	if err := h.service.ServiceStartup(ctx, options); err != nil {

		logger.Warn().Bool(trace.PinField, true).Err(err).Msg("native notifications could not start — running without them")
		h.app.CloseNotifier()
		return nil
	}
	h.app.notifierStarted.Store(true)
	logger.Info().Bool(trace.PinField, true).Msg("native notifications started")
	return nil
}

func (h *NotificationHost) ServiceShutdown() error {
	if !h.app.notifierStarted.Load() {
		return nil
	}
	return h.service.ServiceShutdown()
}

func (a *App) NotificationsStarted() bool { return a.notifierStarted.Load() }

func (a *App) AttachBadge(badger notify.Badger) {
	badge := notify.NewBadge(badger, trace.Log("notify"))
	badge.Start()

	a.stateMu.Lock()
	a.appBadge = badge
	a.stateMu.Unlock()
}

func (a *App) CloseBadge() {
	a.stateMu.Lock()
	badge := a.appBadge
	a.appBadge = nil
	a.stateMu.Unlock()

	if badge != nil {
		badge.Close()
	}
}

type BadgeHost struct {
	app     *App
	service notificationLifecycle
}

func (a *App) NewBadgeHost(service notificationLifecycle) *BadgeHost {
	return &BadgeHost{app: a, service: service}
}

func (h *BadgeHost) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	if err := h.service.ServiceStartup(ctx, options); err != nil {
		logger := trace.Log("notify")
		logger.Warn().Bool(trace.PinField, true).Err(err).Msg("app badge could not start — running without it")
		h.app.CloseBadge()
	}
	return nil
}

func (h *BadgeHost) ServiceShutdown() error {
	h.app.CloseBadge()
	return nil
}

func notificationIconPath() string {
	dir, err := platform.UserDataDir()
	if err != nil {
		return ""
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return ""
	}

	path := filepath.Join(dir, "app-icon.png")
	if err := os.WriteFile(path, appicon.PNG, 0600); err != nil {
		return ""
	}
	return path
}

func (a *App) CloseNotifier() {
	a.stateMu.RLock()
	shell := a.notifyShell
	a.stateMu.RUnlock()

	if shell != nil {
		shell.Close()
	}
}

func (a *App) SetWindowFocused(focused bool) {
	a.stateMu.RLock()
	shell := a.notifyShell
	a.stateMu.RUnlock()

	if shell != nil {
		shell.SetFocused(focused)
	}
	a.focusMu.Lock()
	defer a.focusMu.Unlock()
	if a.windowFocused.Swap(focused) != focused {
		a.focusSeq++
		a.EmitDirect(EventWindowFocus, WindowFocus{Focused: focused, Seq: a.focusSeq})
	}
}

func (a *App) WindowFocused() bool { return a.windowFocused.Load() }

func (a *App) HandleNotificationResponse(result notifications.NotificationResult) {
	a.stateMu.RLock()
	shell := a.notifyShell
	a.stateMu.RUnlock()

	if shell != nil {
		shell.HandleNotificationResponse(result)
	}
}

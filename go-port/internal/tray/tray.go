package tray

import (
	"errors"
	"fmt"
	"reflect"
	"runtime"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

type trayWindow interface {
	RegisterHook(eventType events.WindowEventType, callback func(event *application.WindowEvent)) func()
	Hide() application.Window
	Show() application.Window
	Restore()
	Focus()
}

type trayIcon interface {
	SetTooltip(tooltip string)
	SetLabel(label string)
	SetMenu(menu *application.Menu) *application.SystemTray
	SetIcon(icon []byte) *application.SystemTray
	OnClick(handler func()) *application.SystemTray
	Destroy()
}

type hostWatchFunc func(onChange func(live bool)) (live bool, stop func(), err error)

type Tray struct {
	mu sync.RWMutex

	opMu sync.Mutex

	app *application.App

	systemTray trayIcon

	window trayWindow

	cancelCloseHook func()

	generation uint64

	hostLive bool

	stopHostWatch func()

	startHostWatch hostWatchFunc

	hidden bool

	onVisibility func(hidden bool)
}

func (t *Tray) Setup(
	app *application.App,
	window application.Window,
	icon []byte,
) error {
	return t.setup(app, func() trayIcon { return app.SystemTray.New() }, app.Quit, window, icon)
}

func (t *Tray) setup(app *application.App, createIcon func() trayIcon, quit func(), window trayWindow, icon []byte) error {
	t.opMu.Lock()
	defer t.opMu.Unlock()
	if err := validateSetupArgs(app, window); err != nil {
		return err
	}

	t.mu.RLock()
	firstSetup := t.systemTray == nil
	t.mu.RUnlock()
	startedWatch := false
	if firstSetup {
		live, stop, err := t.hostWatch()(t.onHostChange)
		if err != nil {
			return fmt.Errorf("tray: host unavailable: %w", err)
		}
		t.mu.Lock()
		t.hostLive = live
		t.stopHostWatch = stop
		t.mu.Unlock()
		startedWatch = true
	}

	claim, err := t.claimTray(app, createIcon, window)
	if err != nil {
		if startedWatch {

			t.mu.Lock()
			stop := t.stopHostWatch
			t.stopHostWatch = nil
			t.hostLive = false
			t.mu.Unlock()
			stop()
		}
		return err
	}

	if claim.oldCancel != nil {
		claim.oldCancel()
	}

	if claim.created {
		t.configureNewTray(quit, claim.systemTray)
	}

	applyIcon(claim.systemTray, icon)

	if window != nil {
		t.registerCloseHook(window, claim.systemTray, claim.generation)
	}

	return nil
}

func (t *Tray) hostWatch() hostWatchFunc {
	if t.startHostWatch != nil {
		return t.startHostWatch
	}
	return watchTrayHost
}

func validateSetupArgs(app *application.App, window trayWindow) error {
	if app == nil {
		return errors.New("tray: setup requires an application")
	}

	if window != nil && isNilWindow(window) {
		return errors.New("tray: setup requires a real window")
	}
	return nil
}

func isNilWindow(window trayWindow) bool {
	if window == nil {
		return true
	}
	value := reflect.ValueOf(window)
	return value.Kind() == reflect.Ptr && value.IsNil()
}

type claimResult struct {
	systemTray trayIcon
	created    bool
	generation uint64
	oldCancel  func()
}

func (t *Tray) claimTray(app *application.App, createIcon func() trayIcon, window trayWindow) (claimResult, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.app != nil && t.app != app {
		return claimResult{}, errors.New("tray: cannot be rebound to another application")
	}

	result := claimResult{oldCancel: t.cancelCloseHook}
	t.cancelCloseHook = nil

	t.generation++
	result.generation = t.generation

	result.systemTray = t.systemTray
	result.created = result.systemTray == nil

	if result.created {

		result.systemTray = createIcon()
		t.app = app
		t.systemTray = result.systemTray
	}

	if window != nil {
		t.window = window
	}

	return result, nil
}

func (t *Tray) configureNewTray(quit func(), systemTray trayIcon) {
	systemTray.SetTooltip("Zigzag")

	if runtime.GOOS != "darwin" {
		systemTray.SetLabel("Zigzag")
	}

	if runtime.GOOS != "linux" {
		systemTray.OnClick(t.Restore)
	}

	menu := application.NewMenu()
	menu.Add("Show Zigzag").OnClick(func(_ *application.Context) {
		t.Restore()
	})
	menu.Add("Quit").OnClick(func(_ *application.Context) {
		t.quitTray(quit)
	})
	systemTray.SetMenu(menu)
}

func (t *Tray) quitTray(quit func()) {
	t.Teardown()
	quit()
}

func applyIcon(systemTray trayIcon, icon []byte) {
	if len(icon) == 0 {
		return
	}

	owned := append([]byte(nil), icon...)
	systemTray.SetIcon(owned)
}

func (t *Tray) registerCloseHook(window trayWindow, systemTray trayIcon, generation uint64) {
	cancelClose := window.RegisterHook(
		events.Common.WindowClosing,
		func(event *application.WindowEvent) {
			t.mu.RLock()
			active := t.generation == generation && t.hostLive
			t.mu.RUnlock()

			if !active {
				return
			}

			window.Hide()
			event.Cancel()
			t.setHidden(true)
		},
	)

	t.mu.Lock()
	t.cancelCloseHook = cancelClose
	t.mu.Unlock()
}

func (t *Tray) Restore() {
	t.mu.RLock()
	window := t.window
	t.mu.RUnlock()

	if window == nil {
		return
	}

	window.Show()
	window.Restore()
	window.Focus()
	t.setHidden(false)
}

func (t *Tray) Unbind() {
	t.opMu.Lock()
	defer t.opMu.Unlock()

	t.mu.Lock()
	cancelClose := t.cancelCloseHook

	t.generation++
	t.cancelCloseHook = nil
	t.window = nil
	wasHidden := t.hidden
	t.hidden = false
	observer := t.onVisibility
	t.mu.Unlock()

	if cancelClose != nil {
		cancelClose()
	}

	if wasHidden && observer != nil {
		observer(false)
	}
}

func (t *Tray) Teardown() {
	t.opMu.Lock()
	defer t.opMu.Unlock()

	t.mu.Lock()

	cancelClose := t.cancelCloseHook
	systemTray := t.systemTray
	stopWatch := t.stopHostWatch
	wasHidden := t.hidden
	observer := t.onVisibility

	t.generation++
	t.cancelCloseHook = nil
	t.systemTray = nil
	t.window = nil
	t.app = nil
	t.stopHostWatch = nil
	t.hostLive = false
	t.hidden = false

	t.mu.Unlock()

	if cancelClose != nil {
		cancelClose()
	}
	if stopWatch != nil {
		stopWatch()
	}
	if systemTray != nil {
		systemTray.Destroy()
	}
	if wasHidden && observer != nil {
		observer(false)
	}
}

func (t *Tray) onHostChange(live bool) {
	t.mu.Lock()

	if t.stopHostWatch == nil {
		t.mu.Unlock()
		return
	}
	t.hostLive = live
	restore := !live && t.hidden
	t.mu.Unlock()

	if restore {
		t.Restore()
	}
}

func (t *Tray) OnVisibilityChange(fn func(hidden bool)) {
	t.mu.Lock()
	t.onVisibility = fn
	t.mu.Unlock()
}

func (t *Tray) setHidden(hidden bool) {
	t.mu.Lock()
	changed := t.hidden != hidden
	t.hidden = hidden
	observer := t.onVisibility
	t.mu.Unlock()

	if changed && observer != nil {
		observer(hidden)
	}
}

package bridge

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/klauss/zigzag-go/internal/appicon"
	"github.com/klauss/zigzag-go/internal/tray"
)

var closeToTray tray.Tray

func BindTray(wails *application.App, window application.Window, setFocused func(bool)) error {

	if application.System.IsMobile() {
		return nil
	}

	closeToTray.OnVisibilityChange(func(hidden bool) {
		setFocused(!hidden && window != nil && window.IsFocused())
	})
	return closeToTray.Setup(wails, window, appicon.PNG)
}

func UnbindTray() {
	closeToTray.Unbind()
}

func RestoreWindow() {
	closeToTray.Restore()

	wails := application.Get()
	if wails == nil {
		return
	}
	if login, ok := wails.Window.GetByName(LoginWindowName); ok {
		login.Show()
		login.Focus()
	}
}

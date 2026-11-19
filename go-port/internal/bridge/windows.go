package bridge

import (
	"net/url"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/klauss/zigzag-go/internal/serversettings"
	"github.com/klauss/zigzag-go/internal/session"
)

const (
	LoginWindowName = "zigzag-login"
	MainWindowName  = "zigzag-main"
)

func OpenLoginWindow(wails *application.App) application.Window {
	if existing, ok := wails.Window.GetByName(LoginWindowName); ok {
		existing.Show()
		existing.Focus()
		return existing
	}

	return newAuthWindow(wails, "zigzag — sign in", loginURL())
}

func newAuthWindow(wails *application.App, title, pageURL string) application.Window {
	return wails.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             LoginWindowName,
		Title:            title,
		Width:            520,
		Height:           600,
		URL:              pageURL,
		BackgroundColour: application.NewRGB(15, 17, 23),

		Frameless: true,

		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
	})
}

func loginURL() string {
	lastServer := session.LastServer()
	if lastServer == "" {
		return "/login.html"
	}
	return "/login.html?" + url.Values{"hs": {lastServer}}.Encode()
}

func mainURL(userID string) string {
	settings := serversettings.Current()
	fragment := url.Values{"u": {userID}}
	if settings.HomeserverURL != "" {
		fragment.Set("hs", settings.HomeserverURL)
	}
	return "/#" + fragment.Encode()
}

func OpenMainWindow(wails *application.App, userID string, onFocusChange func(bool)) application.Window {
	if existing, ok := wails.Window.GetByName(MainWindowName); ok {
		existing.Show()
		existing.Focus()
		return existing
	}

	window := wails.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             MainWindowName,
		EnableFileDrop:   true,
		Title:            "zigzag",
		Width:            1280,
		Height:           820,
		URL:              mainURL(userID),
		BackgroundColour: application.NewRGB(15, 17, 23),

		Frameless: true,

		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
	})

	if onFocusChange != nil {

		reportFocus := func(*application.WindowEvent) { onFocusChange(window.IsFocused()) }
		window.OnWindowEvent(events.Common.WindowFocus, reportFocus)
		window.OnWindowEvent(events.Common.WindowLostFocus, reportFocus)

		window.OnWindowEvent(events.Common.WindowRuntimeReady, reportFocus)
	}

	window.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
		turnOffWebKitFullscreen(window)
	})

	return window
}

func swapWindows(wails *application.App, open func() application.Window, closeName string) application.Window {
	opened := open()
	if old, ok := wails.Window.GetByName(closeName); ok {
		old.Close()
	}
	return opened
}

func theOnlyWindow(wails *application.App) application.Window {
	if window := wails.Window.Current(); window != nil {
		return window
	}
	all := wails.Window.GetAll()
	if len(all) == 0 {
		return nil
	}
	return all[0]
}

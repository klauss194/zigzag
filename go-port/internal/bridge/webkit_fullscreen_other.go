//go:build !(linux && cgo && !gtk3 && !android && !server)

package bridge

import "github.com/wailsapp/wails/v3/pkg/application"

func turnOffWebKitFullscreen(application.Window) {}

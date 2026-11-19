package platform

import (
	"runtime"
	"strings"
)

var AppID = "zigzag-chat"

var ServiceName = "chat.tryzigzag.app"

func SingleInstanceID() string {
	if runtime.GOOS == "linux" {
		return "org.wails_app_" + strings.ReplaceAll(AppID, "-", "_")
	}
	return AppID
}

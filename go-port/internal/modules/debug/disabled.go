//go:build no_debug

package debug

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

const Enabled = false

func RegisterEvents() {}

func Setup() []application.Service { return nil }

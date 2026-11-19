//go:build !no_debug

package debug

import (
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/klauss/zigzag-go/internal/trace"
)

const Enabled = true

const traceLineEvent = "trace:line"

func RegisterEvents() {
	application.RegisterEvent[trace.Entry](traceLineEvent)
}

func Setup() []application.Service {
	return []application.Service{application.NewService(&DebugService{})}
}

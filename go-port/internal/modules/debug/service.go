//go:build !no_debug

package debug

import (
	"errors"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"

	"github.com/klauss/zigzag-go/internal/trace"
)

const debugWindowName = "zigzag-debug"

var errNoApplication = errors.New("zigzag: no application to open the trace viewer in")

type DebugService struct{}

func (s *DebugService) OpenDebugWindow() error {
	wails := application.Get()
	if wails == nil {
		return errNoApplication
	}

	if existing, ok := wails.Window.GetByName(debugWindowName); ok {
		existing.Show()
		existing.Focus()
		return nil
	}

	window := wails.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             debugWindowName,
		Title:            "zigzag — trace",
		Width:            1100,
		Height:           720,
		URL:              "/debug.html",
		BackgroundColour: application.NewRGB(10, 12, 16),
	})

	lines, unsubscribe := trace.Subscribe()
	stop := make(chan struct{})
	go func() {
		for {
			select {
			case entry := <-lines:
				wails.Event.Emit(traceLineEvent, entry)
			case <-stop:
				return
			}
		}
	}()

	var stopOnce sync.Once
	window.OnWindowEvent(events.Common.WindowClosing, func(*application.WindowEvent) {
		stopOnce.Do(func() {
			unsubscribe()
			close(stop)
		})
	})
	return nil
}

func (s *DebugService) TraceSnapshot() []trace.Entry {
	return trace.Snapshot()
}

func (s *DebugService) TraceDropped() uint64 {
	return trace.Default.Dropped()
}

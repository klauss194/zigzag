package application

import (
	"encoding/json"
	"fmt"
	"runtime"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"unsafe"

	"github.com/wailsapp/wails/v3/internal/assetserver"
	"github.com/wailsapp/wails/v3/internal/optional"
	"github.com/wailsapp/wails/v3/pkg/events"
)

var Enabled = optional.True

var Disabled = optional.False

var shouldSkipHideOnFocusLost = func() bool { return false }

type LRTB struct {
	Left   int
	Right  int
	Top    int
	Bottom int
}

type (
	webviewWindowImpl interface {
		setTitle(title string)
		setSize(width, height int)
		setAlwaysOnTop(alwaysOnTop bool)
		setURL(url string)
		setResizable(resizable bool)
		setMinSize(width, height int)
		setMaxSize(width, height int)
		execJS(js string)
		setBackgroundColour(color RGBA)
		run()
		center()
		size() (int, int)
		width() int
		height() int
		destroy()
		reload()
		forceReload()
		openDevTools()
		zoomReset()
		zoomIn()
		zoomOut()
		getZoom() float64
		setZoom(zoom float64)
		close()
		zoom()
		setHTML(html string)
		on(eventID uint)
		minimise()
		unminimise()
		maximise()
		unmaximise()
		fullscreen()
		unfullscreen()
		isMinimised() bool
		isMaximised() bool
		isFullscreen() bool
		isNormal() bool
		isVisible() bool
		isFocused() bool
		focus()
		show()
		hide()
		getScreen() (*Screen, error)
		setFrameless(bool)
		openContextMenu(menu *Menu, data *ContextMenuData)
		nativeWindow() unsafe.Pointer
		startDrag() error
		startResize(border string) error
		print() error
		setEnabled(enabled bool)
		physicalBounds() Rect
		setPhysicalBounds(physicalBounds Rect)
		bounds() Rect
		setBounds(bounds Rect)
		position() (int, int)
		setPosition(x int, y int)
		centerOnScreen(screen *Screen)
		relativePosition() (int, int)
		setRelativePosition(x int, y int)
		flash(enabled bool)
		handleKeyEvent(acceleratorString string)
		getBorderSizes() *LRTB
		setMinimiseButtonState(state ButtonState)
		setMaximiseButtonState(state ButtonState)
		setCloseButtonState(state ButtonState)
		setFullscreenButtonState(state ButtonState)
		isIgnoreMouseEvents() bool
		setIgnoreMouseEvents(ignore bool)
		cut()
		copy()
		paste()
		undo()
		delete()
		selectAll()
		redo()
		showMenuBar()
		hideMenuBar()
		toggleMenuBar()
		setMenu(menu *Menu)
		snapAssist()
		setContentProtection(enabled bool)
		attachModal(modalWindow *WebviewWindow)
		setNonClientHitTestRegions([]nonClientHitTestRegion)
	}

	nonClientHitTestKind string

	nonClientHitTestRegion struct {
		Kind   nonClientHitTestKind `json:"kind,omitempty"`
		Left   int                  `json:"left"`
		Top    int                  `json:"top"`
		Right  int                  `json:"right"`
		Bottom int                  `json:"bottom"`
	}

	nonClientHitTestRegionsMessage struct {
		Version int                      `json:"version,omitempty"`
		Regions []nonClientHitTestRegion `json:"regions"`
	}
)

const (
	nonClientHitTestKindCaption  nonClientHitTestKind = "caption"
	nonClientHitTestKindMinimize nonClientHitTestKind = "minimize"
	nonClientHitTestKindMaximize nonClientHitTestKind = "maximize"
	nonClientHitTestKindClose    nonClientHitTestKind = "close"
)

type WindowEvent struct {
	ctx       *WindowEventContext
	cancelled atomic.Bool
}

func (w *WindowEvent) Context() *WindowEventContext {
	return w.ctx
}

func NewWindowEvent() *WindowEvent {
	return &WindowEvent{}
}

func (w *WindowEvent) IsCancelled() bool {
	return w.cancelled.Load()
}

func (w *WindowEvent) Cancel() {
	w.cancelled.Store(true)
}

type WindowEventListener struct {
	callback func(event *WindowEvent)
}

type WebviewWindow struct {
	options WebviewWindowOptions
	impl    webviewWindowImpl
	id      uint

	notchWindow *notchWindowConfig

	eventListeners     map[uint][]*WindowEventListener
	eventListenersLock sync.RWMutex
	eventHooks         map[uint][]*WindowEventListener
	eventHooksLock     sync.RWMutex

	cancellersLock sync.RWMutex
	cancellers     []func()

	keyBindings     map[string]func(Window)
	keyBindingsLock sync.RWMutex

	menuBindings     map[string]*MenuItem
	menuBindingsLock sync.RWMutex

	eventQueueMu     sync.Mutex
	eventQueueCond   *sync.Cond
	eventQueue       []string
	eventDraining    bool
	eventQueueClosed bool
	eventQueueHigh   int

	destroyed     bool
	destroyedLock sync.RWMutex

	runtimeLoaded  bool
	pendingJS      []string
	pendingJSMutex sync.Mutex

	unconditionallyClose uint32

	savedMinWidth    int
	savedMinHeight   int
	savedMaxWidth    int
	savedMaxHeight   int
	constraintsSaved bool
}

func (w *WebviewWindow) SetMenu(menu *Menu) {
	switch runtime.GOOS {
	case "darwin":
		return
	case "windows":
		w.options.Windows.Menu = menu
	case "linux":
		w.options.Linux.Menu = menu
	}
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setMenu(menu)
		})
	}
}

func (w *WebviewWindow) EmitEvent(name string, data ...any) bool {
	event := &CustomEvent{
		Name:   name,
		Sender: w.Name(),
	}

	if len(data) == 1 {
		event.Data = data[0]
	} else if len(data) > 1 {
		event.Data = data
	}

	return globalApplication.Event.EmitEvent(event)
}

var windowID uint
var windowIDLock sync.RWMutex

func getWindowID() uint {
	windowIDLock.Lock()
	defer windowIDLock.Unlock()
	windowID++
	return windowID
}

func (w *WebviewWindow) onApplicationEvent(
	eventType events.ApplicationEventType,
	callback func(*ApplicationEvent),
) {
	cancelFn := globalApplication.Event.OnApplicationEvent(eventType, callback)
	w.addCancellationFunction(cancelFn)
}

func (w *WebviewWindow) markAsDestroyed() {
	w.destroyedLock.Lock()
	w.destroyed = true
	w.destroyedLock.Unlock()

	w.closeEventQueue()

	if globalApplication != nil && globalApplication.eventPayloads != nil {
		globalApplication.eventPayloads.dropWindow(w.id)
	}

	if globalApplication != nil && globalApplication.streams != nil {
		globalApplication.streams.dropWindow(w.id)
	}
}

func (w *WebviewWindow) setupEventMapping() {

	var mapping map[events.WindowEventType]events.WindowEventType
	switch runtime.GOOS {
	case "darwin":
		mapping = w.options.Mac.EventMapping
	case "windows":
		mapping = w.options.Windows.EventMapping
	case "linux":

	}
	if mapping == nil {
		mapping = events.DefaultWindowEventMapping()
	}

	for source, target := range mapping {
		source := source
		target := target
		w.OnWindowEvent(source, func(event *WindowEvent) {
			w.emit(target)
		})
	}
}

func NewWindow(options WebviewWindowOptions) *WebviewWindow {

	thisWindowID := getWindowID()

	if options.Width == 0 {
		options.Width = 800
	}
	if options.Height == 0 {
		options.Height = 600
	}
	if options.URL == "" {
		options.URL = "/"
	}

	if options.Name == "" {
		options.Name = fmt.Sprintf("window-%d", thisWindowID)
	}

	options.HTML = maybeInjectInlineEventShim(options.HTML, options.AllowSimpleEventEmit)

	result := &WebviewWindow{
		id:             thisWindowID,
		options:        options,
		eventListeners: make(map[uint][]*WindowEventListener),
		eventHooks:     make(map[uint][]*WindowEventListener),
		menuBindings:   make(map[string]*MenuItem),
	}

	result.setupEventMapping()

	result.OnWindowEvent(events.Common.WindowClosing, func(event *WindowEvent) {
		atomic.StoreUint32(&result.unconditionallyClose, 1)
		InvokeSync(result.markAsDestroyed)
		InvokeSync(result.impl.close)
		globalApplication.Window.Remove(result.id)
	})

	if result.options.KeyBindings != nil {
		result.keyBindings = processKeyBindingOptions(result.options.KeyBindings)
	}
	if result.options.HideOnEscape {
		result.RegisterKeyBinding("escape", func(window Window) {
			window.Hide()
		})
	}

	if result.options.HideOnFocusLost {
		result.setupHideOnFocusLost()
	}

	return result
}

func processKeyBindingOptions(
	keyBindings map[string]func(window Window),
) map[string]func(window Window) {
	result := make(map[string]func(window Window))
	for key, callback := range keyBindings {

		acc, err := parseAccelerator(key)
		if err != nil {
			globalApplication.error("invalid keybinding: %w", err)
			continue
		}
		result[acc.String()] = callback
		globalApplication.debug("Added Keybinding", "accelerator", acc.String())
	}
	return result
}

func (w *WebviewWindow) setupHideOnFocusLost() {
	if runtime.GOOS == "linux" && shouldSkipHideOnFocusLost() {
		return
	}
	w.OnWindowEvent(events.Common.WindowLostFocus, func(event *WindowEvent) {
		w.Hide()
	})
}

func (w *WebviewWindow) addCancellationFunction(canceller func()) {
	w.cancellersLock.Lock()
	defer w.cancellersLock.Unlock()
	w.cancellers = append(w.cancellers, canceller)
}

func (w *WebviewWindow) ID() uint {
	return w.id
}

func (w *WebviewWindow) SetTitle(title string) Window {
	w.options.Title = title
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setTitle(title)
		})
	}
	return w
}

func (w *WebviewWindow) Name() string {
	return w.options.Name
}

func (w *WebviewWindow) SetSize(width, height int) Window {

	if w.IsFullscreen() {
		return w
	}
	w.options.Width = width
	w.options.Height = height

	var newMaxWidth = w.options.MaxWidth
	var newMaxHeight = w.options.MaxHeight
	if width > w.options.MaxWidth && w.options.MaxWidth != 0 {
		newMaxWidth = width
	}
	if height > w.options.MaxHeight && w.options.MaxHeight != 0 {
		newMaxHeight = height
	}

	if newMaxWidth != 0 || newMaxHeight != 0 {
		w.SetMaxSize(newMaxWidth, newMaxHeight)
	}

	var newMinWidth = w.options.MinWidth
	var newMinHeight = w.options.MinHeight
	if width < w.options.MinWidth && w.options.MinWidth != 0 {
		newMinWidth = width
	}
	if height < w.options.MinHeight && w.options.MinHeight != 0 {
		newMinHeight = height
	}

	if newMinWidth != 0 || newMinHeight != 0 {
		w.SetMinSize(newMinWidth, newMinHeight)
	}

	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setSize(width, height)
		})
	}
	return w
}

func (w *WebviewWindow) Run() {
	if w.impl != nil {
		return
	}
	w.impl = newWindowImpl(w)

	if nativeApp := globalApplication.impl; nativeApp != nil {
		if waiter, ok := nativeApp.(interface{ waitForActivation() }); ok {
			waiter.waitForActivation()
		}
	}

	InvokeSync(w.impl.run)
}

func (w *WebviewWindow) SetAlwaysOnTop(b bool) Window {
	w.options.AlwaysOnTop = b
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setAlwaysOnTop(b)
		})
	}
	return w
}

func (w *WebviewWindow) Show() Window {
	if globalApplication.impl == nil {
		return w
	}
	if w.impl == nil || w.isDestroyed() {
		InvokeSync(w.Run)
		return w
	}
	w.options.Hidden = false
	InvokeSync(w.impl.show)
	return w
}

func (w *WebviewWindow) Hide() Window {
	w.options.Hidden = true
	if w.impl != nil {
		InvokeSync(w.impl.hide)
	}
	return w
}

func (w *WebviewWindow) SetURL(s string) Window {
	url, _ := assetserver.GetStartURL(s)
	w.options.URL = url
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setURL(url)
		})
	}
	return w
}

func (w *WebviewWindow) GetBorderSizes() *LRTB {
	if w.impl != nil {
		return InvokeSyncWithResult(w.impl.getBorderSizes)
	}
	return &LRTB{}
}

func (w *WebviewWindow) SetZoom(magnification float64) Window {
	w.options.Zoom = magnification
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setZoom(magnification)
		})
	}
	return w
}

func (w *WebviewWindow) GetZoom() float64 {
	if w.impl != nil {
		return InvokeSyncWithResult(w.impl.getZoom)
	}
	return 1
}

func (w *WebviewWindow) SetResizable(b bool) Window {
	w.options.DisableResize = !b
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setResizable(b)
		})
	}
	return w
}

func (w *WebviewWindow) SetContentProtection(b bool) Window {
	if w.impl == nil {
		w.options.ContentProtectionEnabled = b
	} else {
		InvokeSync(func() {
			w.impl.setContentProtection(b)
		})
	}
	return w
}

func (w *WebviewWindow) Resizable() bool {
	return !w.options.DisableResize
}

func (w *WebviewWindow) SetMinSize(minWidth, minHeight int) Window {
	currentWidth, currentHeight := w.Size()
	newWidth, newHeight := currentWidth, currentHeight

	var newSize bool
	if minHeight != 0 && currentHeight < minHeight {
		newHeight = minHeight
		newSize = true
	}
	if minWidth != 0 && currentWidth < minWidth {
		newWidth = minWidth
		newSize = true
	}
	InvokeSync(func() {
		w.options.MinWidth = minWidth
		w.options.MinHeight = minHeight
		if newSize {
			w.options.Height = newHeight
			w.options.Width = newWidth
			if w.impl != nil {
				w.impl.setSize(newWidth, newHeight)
			}
		}
		if w.impl != nil {
			w.impl.setMinSize(minWidth, minHeight)
		}
	})
	return w
}

func (w *WebviewWindow) SetMaxSize(maxWidth, maxHeight int) Window {
	currentWidth, currentHeight := w.Size()
	newWidth, newHeight := currentWidth, currentHeight

	var newSize bool
	if maxHeight != 0 && currentHeight > maxHeight {
		newHeight = maxHeight
		newSize = true
	}
	if maxWidth != 0 && currentWidth > maxWidth {
		newWidth = maxWidth
		newSize = true
	}
	InvokeSync(func() {
		w.options.MaxWidth = maxWidth
		w.options.MaxHeight = maxHeight
		if newSize {
			w.options.Height = newHeight
			w.options.Width = newWidth
			if w.impl != nil {
				w.impl.setSize(newWidth, newHeight)
			}
		}
		if w.impl != nil {
			w.impl.setMaxSize(maxWidth, maxHeight)
		}
	})
	return w
}

func (w *WebviewWindow) ExecJS(js string) {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	w.pendingJSMutex.Lock()
	if w.runtimeLoaded {
		w.pendingJSMutex.Unlock()
		InvokeSync(func() {
			w.impl.execJS(js)
		})
	} else {
		w.pendingJS = append(w.pendingJS, js)
		w.pendingJSMutex.Unlock()
	}
}

func (w *WebviewWindow) Fullscreen() Window {
	if w.impl == nil || w.isDestroyed() {
		w.options.StartState = WindowStateFullscreen
		return w
	}
	if !w.IsFullscreen() {
		w.DisableSizeConstraints()
		InvokeSync(w.impl.fullscreen)
	}
	return w
}

func (w *WebviewWindow) SetMinimiseButtonState(state ButtonState) Window {
	w.options.MinimiseButtonState = state
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setMinimiseButtonState(state)
		})
	}
	return w
}

func (w *WebviewWindow) SetMaximiseButtonState(state ButtonState) Window {
	w.options.MaximiseButtonState = state
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setMaximiseButtonState(state)
		})
	}
	return w
}

func (w *WebviewWindow) SetCloseButtonState(state ButtonState) Window {
	w.options.CloseButtonState = state
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setCloseButtonState(state)
		})
	}
	return w
}

func (w *WebviewWindow) SetFullscreenButtonState(state ButtonState) Window {
	w.options.FullscreenButtonState = state
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setFullscreenButtonState(state)
		})
	}
	return w
}

func (w *WebviewWindow) Flash(enabled bool) {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.impl.flash(enabled)
	})
}

func (w *WebviewWindow) IsMinimised() bool {
	if w.impl == nil || w.isDestroyed() {
		return false
	}
	return InvokeSyncWithResult(w.impl.isMinimised)
}

func (w *WebviewWindow) IsVisible() bool {
	if w.impl == nil || w.isDestroyed() {
		return false
	}
	return InvokeSyncWithResult(w.impl.isVisible)
}

func (w *WebviewWindow) IsMaximised() bool {
	if w.impl == nil || w.isDestroyed() {
		return false
	}
	return InvokeSyncWithResult(w.impl.isMaximised)
}

func (w *WebviewWindow) Size() (int, int) {
	if w.impl == nil || w.isDestroyed() {
		return 0, 0
	}
	var width, height int
	InvokeSync(func() {
		width, height = w.impl.size()
	})
	return width, height
}

func (w *WebviewWindow) IsFocused() bool {
	if w.impl == nil || w.isDestroyed() {
		return false
	}
	return InvokeSyncWithResult(w.impl.isFocused)
}

func (w *WebviewWindow) IsFullscreen() bool {
	if w.impl == nil || w.isDestroyed() {
		return false
	}
	return InvokeSyncWithResult(w.impl.isFullscreen)
}

func (w *WebviewWindow) SetBackgroundColour(colour RGBA) Window {
	w.options.BackgroundColour = colour
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setBackgroundColour(colour)
		})
	}
	return w
}

func (w *WebviewWindow) HandleMessage(message string) {

	switch true {
	case message == "wails:drag":
		if w.notchWindow != nil {
			return
		}
		if !w.IsFullscreen() {
			InvokeSync(func() {
				err := w.startDrag()
				if err != nil {
					w.Error("failed to start drag: %w", err)
				}
			})
		}
	case message == "wails:drag:doubleclick":
		if w.notchWindow != nil {
			return
		}
		w.handleTitlebarDoubleClick()
	case strings.HasPrefix(message, "wails:resize:"):
		if !w.IsFullscreen() {
			sl := strings.Split(message, ":")
			if len(sl) != 3 {
				w.Error("unknown message returned from dispatcher: %s", message)
				return
			}
			err := w.startResize(sl[2])
			if err != nil {
				w.Error("%w", err)
			}
		}
	case strings.HasPrefix(message, "wails:non-client-region:"):
		message = strings.Replace(message, "wails:non-client-region:", "", 1)
		w.handleNonClientRegionMessage(message)
	case message == "wails:runtime:ready":
		w.emit(events.Common.WindowRuntimeReady)
		w.pendingJSMutex.Lock()
		w.runtimeLoaded = true
		pending := w.pendingJS
		w.pendingJS = nil
		w.pendingJSMutex.Unlock()
		w.SetResizable(!w.options.DisableResize)
		for _, js := range pending {
			InvokeSync(func() {
				w.impl.execJS(js)
			})
		}
	case strings.HasPrefix(message, "wails:event:emit:"):

		if !w.options.AllowSimpleEventEmit {
			w.Error("wails:event:emit received but AllowSimpleEventEmit is not set on this window: %v", message)
			return
		}
		name := strings.TrimPrefix(message, "wails:event:emit:")
		if name == "" {
			w.Error("empty event name in wails:event:emit")
			return
		}
		evt := &CustomEvent{Name: name, Sender: w.Name()}
		globalApplication.Event.EmitEvent(evt)
	default:
		w.Error("unknown message sent via 'invoke' on frontend: %v", message)
	}
}

func (w *WebviewWindow) handleNonClientRegionMessage(payload string) {
	var message nonClientHitTestRegionsMessage
	if err := json.Unmarshal([]byte(payload), &message); err != nil {
		w.Error("failed to parse non-client regions: %w", err)
		return
	}

	regions := make([]nonClientHitTestRegion, 0, len(message.Regions))
	for i, region := range message.Regions {
		normalised, err := normaliseNonClientHitTestRegion(region)
		if err != nil {
			w.Error("region %d: %w", i, err)
			continue
		}
		regions = append(regions, normalised)
	}

	InvokeSync(func() {
		w.impl.setNonClientHitTestRegions(regions)
	})
}

func normaliseNonClientHitTestRegion(region nonClientHitTestRegion) (nonClientHitTestRegion, error) {
	if region.Right <= region.Left || region.Bottom <= region.Top {
		return nonClientHitTestRegion{}, fmt.Errorf("invalid rectangle")
	}

	kind := nonClientHitTestKind(strings.ToLower(string(region.Kind)))
	switch kind {
	case nonClientHitTestKindCaption,
		nonClientHitTestKindMinimize,
		nonClientHitTestKindMaximize,
		nonClientHitTestKindClose:
		region.Kind = kind
		return region, nil
	default:
		return nonClientHitTestRegion{}, fmt.Errorf("unknown region kind %q", region.Kind)
	}
}

func (w *WebviewWindow) startResize(border string) error {
	if w.impl == nil || w.isDestroyed() {
		return nil
	}
	return InvokeSyncWithResult(func() error {
		return w.impl.startResize(border)
	})
}

func (w *WebviewWindow) Center() {
	if w.impl == nil || w.isDestroyed() {
		w.options.InitialPosition = WindowCentered
		return
	}
	InvokeSync(w.impl.center)
}

func (w *WebviewWindow) OnWindowEvent(
	eventType events.WindowEventType,
	callback func(event *WindowEvent),
) func() {
	eventID := uint(eventType)
	windowEventListener := &WindowEventListener{
		callback: callback,
	}
	w.eventListenersLock.Lock()
	w.eventListeners[eventID] = append(w.eventListeners[eventID], windowEventListener)
	w.eventListenersLock.Unlock()
	if w.impl != nil {
		w.impl.on(eventID)
	}

	return func() {

		w.eventListenersLock.Lock()
		w.eventListeners[eventID] = slices.DeleteFunc(w.eventListeners[eventID], func(l *WindowEventListener) bool {
			return l == windowEventListener
		})
		w.eventListenersLock.Unlock()
	}
}

func (w *WebviewWindow) RegisterHook(
	eventType events.WindowEventType,
	callback func(event *WindowEvent),
) func() {
	eventID := uint(eventType)
	w.eventHooksLock.Lock()
	defer w.eventHooksLock.Unlock()
	windowEventHook := &WindowEventListener{
		callback: callback,
	}
	w.eventHooks[eventID] = append(w.eventHooks[eventID], windowEventHook)

	return func() {
		w.eventHooksLock.Lock()
		defer w.eventHooksLock.Unlock()
		w.eventHooks[eventID] = slices.DeleteFunc(w.eventHooks[eventID], func(l *WindowEventListener) bool {
			return l == windowEventHook
		})
	}
}

func (w *WebviewWindow) HandleWindowEvent(id uint) {

	w.eventHooksLock.RLock()
	hooks := w.eventHooks[id]
	w.eventHooksLock.RUnlock()

	thisEvent := NewWindowEvent()

	for _, thisHook := range hooks {
		thisHook.callback(thisEvent)
		if thisEvent.IsCancelled() {
			return
		}
	}

	w.eventListenersLock.RLock()
	var tempListeners = slices.Clone(w.eventListeners[id])
	w.eventListenersLock.RUnlock()

	for _, listener := range tempListeners {
		go func() {
			if thisEvent.IsCancelled() {
				return
			}
			defer handlePanic()
			listener.callback(thisEvent)
		}()
	}
	w.dispatchWindowEvent(id)
}

func (w *WebviewWindow) Width() int {
	if w.impl == nil || w.isDestroyed() {
		return 0
	}
	return InvokeSyncWithResult(w.impl.width)
}

func (w *WebviewWindow) Height() int {
	if w.impl == nil || w.isDestroyed() {
		return 0
	}
	return InvokeSyncWithResult(w.impl.height)
}

func (w *WebviewWindow) PhysicalBounds() Rect {
	if w.impl == nil || w.isDestroyed() {
		return Rect{}
	}
	var rect Rect
	InvokeSync(func() {
		rect = w.impl.physicalBounds()
	})
	return rect
}

func (w *WebviewWindow) SetPhysicalBounds(physicalBounds Rect) {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.impl.setPhysicalBounds(physicalBounds)
	})
}

func (w *WebviewWindow) Bounds() Rect {
	if w.impl == nil || w.isDestroyed() {
		return Rect{}
	}
	var rect Rect
	InvokeSync(func() {
		rect = w.impl.bounds()
	})
	return rect
}

func (w *WebviewWindow) SetBounds(bounds Rect) {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.impl.setBounds(bounds)
	})
}

func (w *WebviewWindow) Position() (int, int) {
	if w.impl == nil || w.isDestroyed() {
		return 0, 0
	}
	var x, y int
	InvokeSync(func() {
		x, y = w.impl.position()
	})
	return x, y
}

func (w *WebviewWindow) SetPosition(x int, y int) {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.impl.setPosition(x, y)
	})
}

func (w *WebviewWindow) SetScreen(screen *Screen) Window {
	if screen == nil {
		return w
	}
	w.options.Screen = screen
	if w.impl == nil || w.isDestroyed() {
		return w
	}
	InvokeSync(func() {
		w.impl.centerOnScreen(screen)
	})
	return w
}

func (w *WebviewWindow) RelativePosition() (int, int) {
	if w.impl == nil || w.isDestroyed() {
		return 0, 0
	}
	var x, y int
	InvokeSync(func() {
		x, y = w.impl.relativePosition()
	})
	return x, y
}

func (w *WebviewWindow) SetRelativePosition(x, y int) Window {
	w.options.X = x
	w.options.Y = y
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setRelativePosition(x, y)
		})
	}
	return w
}

func (w *WebviewWindow) destroy() {
	if w.impl == nil || w.isDestroyed() {
		return
	}

	if globalApplication.messageProcessor != nil {
		globalApplication.messageProcessor.CancelWindowCalls(w.id)
	}

	for _, cancelFunc := range w.cancellers {
		cancelFunc()
	}

	InvokeSync(w.impl.destroy)
}

func (w *WebviewWindow) Reload() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.reload)
}

func (w *WebviewWindow) ForceReload() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.forceReload)
}

func (w *WebviewWindow) ToggleFullscreen() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		if w.IsFullscreen() {
			w.UnFullscreen()
		} else {
			w.Fullscreen()
		}
	})
}

func (w *WebviewWindow) ToggleMaximise() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		if w.IsMaximised() {
			w.UnMaximise()
		} else {
			w.Maximise()
		}
	})
}

func (w *WebviewWindow) ToggleFrameless() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.SetFrameless(!w.options.Frameless)
	})
}

func (w *WebviewWindow) OpenDevTools() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.openDevTools)
}

func (w *WebviewWindow) ZoomReset() Window {
	if w.impl != nil {
		InvokeSync(w.impl.zoomReset)
	}
	return w
}

func (w *WebviewWindow) ZoomIn() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.zoomIn)
}

func (w *WebviewWindow) ZoomOut() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.zoomOut)
}

func (w *WebviewWindow) Close() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.emit(events.Common.WindowClosing)
	})
}

func (w *WebviewWindow) Zoom() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.zoom)
}

func (w *WebviewWindow) SetHTML(html string) Window {
	w.options.HTML = html
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setHTML(html)
		})
	}
	return w
}

func (w *WebviewWindow) Minimise() Window {
	if w.impl == nil || w.isDestroyed() {
		w.options.StartState = WindowStateMinimised
		return w
	}
	if !w.IsMinimised() {
		InvokeSync(w.impl.minimise)
	}
	return w
}

func (w *WebviewWindow) Maximise() Window {
	if w.impl == nil || w.isDestroyed() {
		w.options.StartState = WindowStateMaximised
		return w
	}
	if !w.IsMaximised() {
		w.DisableSizeConstraints()
		InvokeSync(w.impl.maximise)
	}
	return w
}

func (w *WebviewWindow) UnMinimise() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	if w.IsMinimised() {
		InvokeSync(w.impl.unminimise)
	}
}

func (w *WebviewWindow) UnMaximise() {
	if w.IsMaximised() {
		w.EnableSizeConstraints()
		InvokeSync(w.impl.unmaximise)
	}
}

func (w *WebviewWindow) UnFullscreen() {
	if w.IsFullscreen() {
		w.EnableSizeConstraints()
		InvokeSync(w.impl.unfullscreen)
	}
}

func (w *WebviewWindow) Restore() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		if w.IsMinimised() {
			w.UnMinimise()
		} else if w.IsFullscreen() {
			w.UnFullscreen()
		} else if w.IsMaximised() {
			w.UnMaximise()
		}
	})
}

func (w *WebviewWindow) DisableSizeConstraints() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		if !w.constraintsSaved {
			w.savedMinWidth = w.options.MinWidth
			w.savedMinHeight = w.options.MinHeight
			w.savedMaxWidth = w.options.MaxWidth
			w.savedMaxHeight = w.options.MaxHeight
			w.constraintsSaved = true
		}
		if w.options.MinWidth > 0 || w.options.MinHeight > 0 {
			w.impl.setMinSize(0, 0)
		}
		if w.options.MaxWidth > 0 || w.options.MaxHeight > 0 {
			w.impl.setMaxSize(0, 0)
		}
	})
}

func (w *WebviewWindow) restoreSavedSizeConstraintOptions() bool {
	if !w.constraintsSaved {
		return false
	}
	w.options.MinWidth = w.savedMinWidth
	w.options.MinHeight = w.savedMinHeight
	w.options.MaxWidth = w.savedMaxWidth
	w.options.MaxHeight = w.savedMaxHeight
	w.constraintsSaved = false
	return true
}

func (w *WebviewWindow) EnableSizeConstraints() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.restoreSavedSizeConstraintOptions()
		if w.options.MinWidth > 0 || w.options.MinHeight > 0 {
			w.SetMinSize(w.options.MinWidth, w.options.MinHeight)
		}
		if w.options.MaxWidth > 0 || w.options.MaxHeight > 0 {
			w.SetMaxSize(w.options.MaxWidth, w.options.MaxHeight)
		}
	})
}

func (w *WebviewWindow) GetScreen() (*Screen, error) {
	if w.impl == nil || w.isDestroyed() {
		return nil, nil
	}
	return InvokeSyncWithResultAndError(w.impl.getScreen)
}

func (w *WebviewWindow) SetFrameless(frameless bool) Window {
	w.options.Frameless = frameless
	if w.impl != nil {
		InvokeSync(func() {
			w.impl.setFrameless(frameless)
		})
	}
	return w
}

const (
	inlineEventJS = "if(window._wails&&window._wails.dispatchWailsEvent){var w=window._wails;" +
		"if(w.__eq){w.__eq=w.__eq.then(function(){w.dispatchWailsEvent(%s);}).catch(function(){});}" +
		"else{w.dispatchWailsEvent(%[1]s);}}"

	refEventJS = "if(window._wails&&window._wails.dispatchWailsEvent){var w=window._wails;" +
		"w.__eq=(w.__eq||Promise.resolve()).then(function(){" +
		"return fetch(%q,{cache:'no-store'}).then(function(r){return r.json();})" +
		".then(function(e){w.dispatchWailsEvent(e);});}).catch(function(){});}"
)

func (w *WebviewWindow) DispatchWailsEvent(event *CustomEvent) {
	if w.impl == nil || w.isDestroyed() {
		return
	}

	payload := event.ToJSON()

	if len(payload) > maxInlineEventPayload {
		if store := globalApplication.eventPayloads; store != nil {
			if id, ok := store.put(w.id, []byte(payload)); ok {
				if w.enqueueEventJS(fmt.Sprintf(refEventJS, eventPayloadPath+id)) {
					return
				}

				store.take(id, w.id)
				return
			}
		}

	}

	w.enqueueEventJS(fmt.Sprintf(inlineEventJS, payload))
}

const eventQueueCapacity = 64

func (w *WebviewWindow) enqueueEventJS(js string) bool {

	onMainThread := globalApplication != nil &&
		globalApplication.impl != nil &&
		globalApplication.impl.isOnMainThread()

	w.eventQueueMu.Lock()
	if w.eventQueueCond == nil {
		w.eventQueueCond = sync.NewCond(&w.eventQueueMu)
	}

	for !onMainThread && !w.eventQueueClosed && len(w.eventQueue) >= eventQueueCapacity {
		w.eventQueueCond.Wait()
	}
	if w.eventQueueClosed {
		w.eventQueueMu.Unlock()
		return false
	}

	w.eventQueue = append(w.eventQueue, js)
	if n := len(w.eventQueue); n > w.eventQueueHigh {
		w.eventQueueHigh = n
	}

	scheduleDrain := !w.eventDraining
	if scheduleDrain {
		w.eventDraining = true
	}
	w.eventQueueMu.Unlock()

	if scheduleDrain {

		InvokeAsync(w.drainEventQueue)
	}
	return true
}

func (w *WebviewWindow) drainEventQueue() {
	for {
		w.eventQueueMu.Lock()
		if len(w.eventQueue) == 0 || w.eventQueueClosed {
			w.eventDraining = false
			w.eventQueueMu.Unlock()
			return
		}

		batch := w.eventQueue
		w.eventQueue = nil
		w.eventQueueCond.Broadcast()
		w.eventQueueMu.Unlock()

		for _, js := range batch {
			if w.isDestroyed() {
				return
			}
			w.ExecJS(js)
		}
	}
}

func (w *WebviewWindow) closeEventQueue() {
	w.eventQueueMu.Lock()
	w.eventQueueClosed = true
	w.eventQueue = nil
	if w.eventQueueCond != nil {
		w.eventQueueCond.Broadcast()
	}
	w.eventQueueMu.Unlock()
}

func (w *WebviewWindow) eventQueueHighWater() int {
	w.eventQueueMu.Lock()
	defer w.eventQueueMu.Unlock()
	return w.eventQueueHigh
}

func (w *WebviewWindow) dispatchWindowEvent(id uint) {

	jsEvent := &CustomEvent{
		Name: events.JSEvent(id),
	}
	w.DispatchWailsEvent(jsEvent)
}

func (w *WebviewWindow) Info(message string, args ...any) {
	var messageArgs []interface{}
	messageArgs = append(messageArgs, args...)
	messageArgs = append(messageArgs, "sender", w.Name())
	globalApplication.info(message, messageArgs...)
}

func (w *WebviewWindow) Error(message string, args ...any) {
	args = append([]any{w.Name()}, args...)
	globalApplication.error("in window '%s': "+message, args...)
}

func (w *WebviewWindow) handleDragAndDropMessage(filenames []string, dropTarget *DropTargetDetails) {
	thisEvent := NewWindowEvent()
	ctx := newWindowEventContext()
	ctx.setDroppedFiles(filenames)
	if dropTarget != nil {
		ctx.setDropTargetDetails(dropTarget)
	}
	thisEvent.ctx = ctx

	listeners := w.eventListeners[uint(events.Common.WindowFilesDropped)]
	for _, listener := range listeners {
		if listener == nil {
			continue
		}
		listener.callback(thisEvent)
	}
}

func (w *WebviewWindow) OpenContextMenu(data *ContextMenuData) {

	menu, ok := globalApplication.ContextMenu.Get(data.Id)
	if !ok {
		w.Error("no context menu found for id: %s", data.Id)
		return
	}
	menu.setContextData(data)
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.impl.openContextMenu(menu.Menu, data)
	})
}

func (w *WebviewWindow) NativeWindow() unsafe.Pointer {
	if w.impl == nil || w.isDestroyed() {
		return nil
	}
	return w.impl.nativeWindow()
}

func (w *WebviewWindow) AttachModal(modalWindow Window) {
	if w.impl == nil || w.isDestroyed() {
		return
	}

	modalWebviewWindow, ok := modalWindow.(*WebviewWindow)
	if !ok || modalWebviewWindow == nil {
		return
	}

	InvokeSync(func() {
		w.impl.attachModal(modalWebviewWindow)
	})
}

func (w *WebviewWindow) shouldUnconditionallyClose() bool {
	return atomic.LoadUint32(&w.unconditionallyClose) != 0
}

func (w *WebviewWindow) Focus() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.focus)
}

func (w *WebviewWindow) emit(eventType events.WindowEventType) {
	windowEvents <- &windowEvent{
		WindowID: w.id,
		EventID:  uint(eventType),
	}
}

func (w *WebviewWindow) startDrag() error {
	if w.impl == nil || w.isDestroyed() {
		return nil
	}
	return InvokeSyncWithError(w.impl.startDrag)
}

func (w *WebviewWindow) Print() error {
	if w.impl == nil || w.isDestroyed() {
		return nil
	}
	return InvokeSyncWithError(w.impl.print)
}

func (w *WebviewWindow) SetEnabled(enabled bool) {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.impl.setEnabled(enabled)
	})
}

func (w *WebviewWindow) processKeyBinding(acceleratorString string) bool {

	if w.menuBindings != nil {
		w.menuBindingsLock.RLock()
		defer w.menuBindingsLock.RUnlock()
		if menuItem := w.menuBindings[acceleratorString]; menuItem != nil {
			menuItem.handleClick()
			return true
		}
	}

	if w.keyBindings != nil {
		w.keyBindingsLock.RLock()
		defer w.keyBindingsLock.RUnlock()
		if callback := w.keyBindings[acceleratorString]; callback != nil {

			go func() {
				defer handlePanic()
				callback(w)
			}()
			return true
		}
	}

	return globalApplication.KeyBinding.Process(acceleratorString, w)
}

func (w *WebviewWindow) HandleKeyEvent(acceleratorString string) {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(func() {
		w.impl.handleKeyEvent(acceleratorString)
	})
}

func (w *WebviewWindow) isDestroyed() bool {
	w.destroyedLock.RLock()
	defer w.destroyedLock.RUnlock()
	return w.destroyed
}

func (w *WebviewWindow) RegisterKeyBinding(binding string, callback func(window Window)) *WebviewWindow {
	acc, err := parseAccelerator(binding)
	if err != nil {
		globalApplication.error("invalid keybinding: %w", err)
		return w
	}
	w.keyBindingsLock.Lock()
	defer w.keyBindingsLock.Unlock()
	if w.keyBindings == nil {
		w.keyBindings = make(map[string]func(Window))
	}
	w.keyBindings[acc.String()] = callback
	return w
}

func (w *WebviewWindow) removeMenuBinding(a *accelerator) {
	w.menuBindingsLock.Lock()
	defer w.menuBindingsLock.Unlock()
	w.menuBindings[a.String()] = nil
}

func (w *WebviewWindow) addMenuBinding(a *accelerator, menuItem *MenuItem) {
	w.menuBindingsLock.Lock()
	defer w.menuBindingsLock.Unlock()
	w.menuBindings[a.String()] = menuItem
}

func (w *WebviewWindow) IsIgnoreMouseEvents() bool {
	if w.impl == nil || w.isDestroyed() {
		return false
	}
	return InvokeSyncWithResult(w.impl.isIgnoreMouseEvents)
}

func (w *WebviewWindow) SetIgnoreMouseEvents(ignore bool) Window {
	w.options.IgnoreMouseEvents = ignore
	if w.impl == nil || w.isDestroyed() {
		return w
	}
	InvokeSync(func() {
		w.impl.setIgnoreMouseEvents(ignore)
	})
	return w
}

func (w *WebviewWindow) cut() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	w.impl.cut()
}

func (w *WebviewWindow) copy() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	w.impl.copy()
}

func (w *WebviewWindow) paste() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	w.impl.paste()
}

func (w *WebviewWindow) selectAll() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	w.impl.selectAll()
}

func (w *WebviewWindow) undo() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	w.impl.undo()
}

func (w *WebviewWindow) delete() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	w.impl.delete()
}

func (w *WebviewWindow) redo() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	w.impl.redo()
}

func (w *WebviewWindow) ShowMenuBar() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.showMenuBar)
}

func (w *WebviewWindow) HideMenuBar() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.hideMenuBar)
}

func (w *WebviewWindow) ToggleMenuBar() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.toggleMenuBar)
}

func (w *WebviewWindow) InitiateFrontendDropProcessing(filenames []string, x int, y int) {
	if w.impl == nil || w.isDestroyed() {
		return
	}

	notifyNativeFileDrop(filenames)

	filenamesJSON, err := json.Marshal(filenames)
	if err != nil {
		w.Error("Error marshalling filenames for drop processing: %s", err)
		return
	}

	jsCall := fmt.Sprintf(
		"window._wails.handlePlatformFileDrop(%s, %d, %d);",
		string(filenamesJSON),
		x,
		y,
	)

	w.pendingJSMutex.Lock()
	if !w.runtimeLoaded {
		w.pendingJS = append(w.pendingJS, jsCall)
		w.pendingJSMutex.Unlock()
		return
	}
	w.pendingJSMutex.Unlock()

	InvokeSync(func() {
		w.impl.execJS(jsCall)
	})
}

func (w *WebviewWindow) HandleDragEnter() {
	if w.impl == nil || w.isDestroyed() || !w.runtimeLoaded {
		return
	}

	dragHover.lastSentX = 0
	dragHover.lastSentY = 0

	w.impl.execJS("window._wails.handleDragEnter();")
}

var dragHover struct {
	lastSentX int
	lastSentY int
}

func (w *WebviewWindow) HandleDragOver(x int, y int) {
	if w.impl == nil || w.isDestroyed() || !w.runtimeLoaded {
		return
	}

	dx := x - dragHover.lastSentX
	dy := y - dragHover.lastSentY
	if dx < 0 {
		dx = -dx
	}
	if dy < 0 {
		dy = -dy
	}
	if dx < 5 && dy < 5 {
		return
	}
	dragHover.lastSentX = x
	dragHover.lastSentY = y

	if impl, ok := w.impl.(interface{ execJSDragOver(x, y int) }); ok {
		impl.execJSDragOver(x, y)
	} else {
		w.impl.execJS(fmt.Sprintf("window._wails.handleDragOver(%d,%d)", x, y))
	}
}

func (w *WebviewWindow) HandleDragLeave() {
	if w.impl == nil || w.isDestroyed() || !w.runtimeLoaded {
		return
	}

	w.impl.execJS("window._wails.handleDragLeave();")
}

func (w *WebviewWindow) SnapAssist() {
	if w.impl == nil || w.isDestroyed() {
		return
	}
	InvokeSync(w.impl.snapAssist)
}

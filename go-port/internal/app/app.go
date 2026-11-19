package app

import (
	"context"
	"sync"
	"sync/atomic"

	"github.com/rs/zerolog"
	"go.mau.fi/util/dbutil"

	"github.com/klauss/zigzag-go/internal/devicetrust"
	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/matrix/syncloop"
	"github.com/klauss/zigzag-go/internal/notify"
	"github.com/klauss/zigzag-go/internal/session"
	"github.com/klauss/zigzag-go/internal/trace"
)

type Emitter func(name string, data ...any)

type App struct {
	stateMu sync.RWMutex

	roomLifecycleMu       sync.Mutex
	roomLifecycleInFlight map[string]struct{}

	graph *sessionGraph

	notifyShell *notify.Shell

	appBadge *notify.Badge

	notifierStarted atomic.Bool

	windowFocused atomic.Bool
	focusMu       sync.Mutex
	focusSeq      uint64

	eventGate *gate

	listeners []Listener

	sessionEventsMu sync.Mutex

	bootLogger zerolog.Logger
	authLogger zerolog.Logger

	deviceLogger  zerolog.Logger
	hydrateLogger zerolog.Logger
	roomLogger    zerolog.Logger

	sendLogger zerolog.Logger

	roomArrivals roomArrivals
}

type sessionGraph struct {
	session *session.Session

	client *matrix.Client

	directWrites *directWrites

	sendResumer *sendResumer

	joiner *autoJoiner

	notifyStore *notify.Store

	notifyEngine *notify.Engine

	database *dbutil.Database

	syncLoop syncConnection

	supervisor *syncloop.Supervisor

	cancelSync context.CancelFunc

	deviceTrust *devicetrust.Manager
}

func New() *App {
	app := &App{
		roomLifecycleInFlight: make(map[string]struct{}),
		eventGate:             newGate(),
		bootLogger:            trace.Log("boot"),
		authLogger:            trace.Log("auth"),
		deviceLogger:          trace.Log("devices"),
		hydrateLogger:         trace.Log("hydrate"),
		roomLogger:            trace.Log("rooms"),
		sendLogger:            trace.Log("send"),
	}
	app.windowFocused.Store(true)

	return app
}

func (a *App) AttachEmitter(emit Emitter) { a.eventGate.attach(emit) }

func (a *App) Session() *SessionInfo {
	a.stateMu.RLock()
	defer a.stateMu.RUnlock()

	if a.graph == nil || a.graph.session == nil {
		return nil
	}
	stored := a.graph.session
	return &SessionInfo{
		UserID:     stored.UserID,
		DeviceID:   stored.DeviceID,
		Homeserver: stored.HomeserverURL,
	}
}

type syncConnection interface {
	Position() string
	HasPosition() bool
	ResetPosition(reason string)
}

func (a *App) readGraph() *sessionGraph {
	a.stateMu.RLock()
	defer a.stateMu.RUnlock()
	return a.graph
}

func (a *App) readClient() (*matrix.Client, error) {
	graph := a.readGraph()
	if graph == nil || graph.client == nil {
		return nil, ErrNoSession
	}
	return graph.client, nil
}

func (a *App) readDirectWriter() (*matrix.Client, *directWrites, error) {
	graph := a.readGraph()
	if graph == nil || graph.client == nil || graph.directWrites == nil {
		return nil, nil, ErrNoSession
	}
	return graph.client, graph.directWrites, nil
}

func (a *App) readSendResumer() *sendResumer {
	if graph := a.readGraph(); graph != nil {
		return graph.sendResumer
	}
	return nil
}

func (a *App) readNotify() (*notify.Engine, *notify.Store) {
	if graph := a.readGraph(); graph != nil {
		return graph.notifyEngine, graph.notifyStore
	}
	return nil, nil
}

package app

import (
	"sync"

	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/trace"
)

type gate struct {
	mu sync.Mutex

	emit Emitter

	ready bool

	latest      map[string]any
	latestOrder []string

	sticky map[string]any

	log *batchLog

	logger zerolog.Logger
}

var stickyEvents = map[string]bool{EventSession: true}

func newGate() *gate {
	return &gate{
		sticky: map[string]any{},
		latest: map[string]any{},
		log:    newBatchLog(),
		logger: trace.Log("hydrate"),
	}
}

func (g *gate) attach(emit Emitter) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.emit = emit
}

func (g *gate) retain(payload *RoomsPayload) { g.log.append(payload) }

func (g *gate) Emit(name string, data any) (delivered bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.emit == nil {
		return false
	}
	if stickyEvents[name] {
		g.sticky[name] = data
	}
	if g.ready {
		g.emit(name, data)
		return true
	}
	if name != EventRooms {
		if _, seen := g.latest[name]; !seen {
			g.latestOrder = append(g.latestOrder, name)
		}
		g.latest[name] = data
	}
	return false
}

func (g *gate) Open(from string) (replayed int, covered bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	batches, covered := g.log.since(from)

	g.ready = true
	if g.emit == nil {
		return 0, covered
	}

	if covered {
		for _, payload := range batches {
			g.emit(EventRooms, payload)
			replayed++
		}
	}

	for _, name := range g.latestOrder {
		g.emit(name, g.latest[name])
	}

	for name, data := range g.sticky {
		if _, justSaid := g.latest[name]; !justSaid {
			g.emit(name, data)
		}
	}
	g.latest = map[string]any{}
	g.latestOrder = nil

	count, bytes, floor, head, evicted := g.log.stats()
	logEvent := g.logger.Info().
		Str("since", shortPos(from)).
		Int("replayed", replayed).
		Bool("covered", covered).
		Int("log_batches", count).
		Int("log_bytes", bytes).
		Str("log_floor", shortPos(floor)).
		Str("log_head", shortPos(head))
	if evicted > 0 {
		logEvent = logEvent.Uint64("log_evicted", evicted)
	}
	logEvent.Msg("gate open")

	return replayed, covered
}

func (g *gate) Reset(resumeFrom string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.ready = false
	g.latest = map[string]any{}
	g.latestOrder = nil
	g.sticky = map[string]any{}
	g.log.reset(resumeFrom)
}

func (g *gate) EmitDirect(name string, data any) {
	g.mu.Lock()
	emit := g.emit
	g.mu.Unlock()

	if emit == nil {
		return
	}

	emit(name, data)
}

var shortPos = trace.Pos

package syncloop

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/trace"
)

type State uint8

const (
	StateIdle State = iota

	StateRunning

	StateOffline

	StateTerminated

	StateError
)

func (s State) String() string {
	switch s {
	case StateIdle:
		return "idle"
	case StateRunning:
		return "running"
	case StateOffline:
		return "offline"
	case StateTerminated:
		return "terminated"
	case StateError:
		return "error"
	}
	return "unknown"
}

var probeInterval = 2 * time.Second

const probeTimeout = 10 * time.Second

type Supervisor struct {
	loop *Loop

	mu    sync.RWMutex
	state State

	stateSince time.Time

	onState func(State, error)

	cancel context.CancelFunc
	done   chan struct{}

	wake *wakeEvent

	log zerolog.Logger
}

func NewSupervisor(loop *Loop, onState func(State, error)) *Supervisor {
	return &Supervisor{
		loop:  loop,
		state: StateIdle,

		stateSince: time.Now(),
		onState:    onState,
		wake:       &wakeEvent{},
		log:        trace.Log("supervisor"),
	}
}

func (s *Supervisor) set(state State, err error) {
	s.mu.Lock()
	previous, heldFor := s.state, time.Since(s.stateSince)
	s.state, s.stateSince = state, time.Now()
	s.mu.Unlock()

	event := s.log.Info()
	if err != nil {
		event = s.log.Warn().Err(err)
	}
	event.
		Stringer("from", previous).
		Stringer("to", state).
		Dur("held_ms", heldFor).
		Msg("state changed")

	if s.onState != nil {
		s.onState(state, err)
	}
}

func (s *Supervisor) Start(ctx context.Context) {
	s.mu.Lock()
	if s.cancel != nil {
		s.mu.Unlock()
		return
	}
	runCtx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	s.done = make(chan struct{})
	done := s.done
	s.mu.Unlock()

	go func() {
		defer close(done)
		s.supervise(runCtx)
	}()
}

func (s *Supervisor) Stop() {
	s.mu.Lock()
	cancel, done := s.cancel, s.done
	s.cancel, s.done = nil, nil
	s.mu.Unlock()

	if cancel == nil {
		return
	}

	s.loop.Stop()
	cancel()

	select {
	case <-done:
	case <-time.After(10 * time.Second):

		s.set(StateError, errors.New("sliding: shutdown timed out"))
	}
}

func (s *Supervisor) supervise(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			s.set(StateTerminated, nil)
			return
		}

		s.set(StateRunning, nil)

		deliveredBeforeRun := s.loop.DeliveredBatches()
		runStarted := time.Now()
		err := s.loop.Run(ctx)
		batchesThisRun := s.loop.DeliveredBatches() - deliveredBeforeRun
		runLasted := time.Since(runStarted)

		outcome := "unknown"
		switch {
		case ctx.Err() != nil:
			s.set(StateTerminated, nil)
			return

		case err == nil:

			s.set(StateTerminated, nil)
			return

		case errors.Is(err, ErrSessionExpired):

			s.set(StateError, err)
			return

		case isTransport(err):

			outcome = "transport"
			s.set(StateOffline, err)

		default:

			outcome = "protocol"
			s.set(StateError, err)
		}

		s.log.Info().
			Str("outcome", outcome).
			Uint64("batches", batchesThisRun).
			Dur("ran_ms", runLasted).
			Err(err).
			Msg("run ended — probing until the homeserver answers")

		switch s.waitUntilOnline(ctx) {
		case waitCancelled:
			s.set(StateTerminated, nil)
			return

		case waitPoked:

			s.log.Info().Msg("poked — someone says conditions changed, retrying now")
		}
	}
}

func (s *Supervisor) waitUntilOnline(ctx context.Context) waitOutcome {
	outageStarted := time.Now()
	for probesSent := 1; ; probesSent++ {
		switch pause(ctx, s.wake, probeInterval) {
		case waitCancelled:
			return waitCancelled
		case waitPoked:
			return waitPoked
		}

		if err := s.loop.ProbeHomeserver(ctx); err != nil {

			s.log.Debug().
				Err(err).
				Int("probes", probesSent).
				Dur("down_ms", time.Since(outageStarted)).
				Msg("homeserver still unreachable")
			continue
		}

		s.log.Info().
			Int("probes", probesSent).
			Dur("down_ms", time.Since(outageStarted)).
			Msg("homeserver answered — resuming sync")
		return waitReady
	}
}

func (s *Supervisor) Notify() {

	s.wake.Notify()
}

type waitOutcome uint8

const (
	waitReady waitOutcome = iota
	waitCancelled
	waitPoked
)

func pause(ctx context.Context, wake *wakeEvent, howLong time.Duration) waitOutcome {

	poked, unregister := wake.register()
	defer unregister()

	timer := time.NewTimer(howLong)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return waitCancelled
	case <-poked:
		return waitPoked
	case <-timer.C:
		return waitReady
	}
}

func isTransport(err error) bool {

	if matrixErr, ok := matrix.AsError(err); ok {
		return matrixErr.Transport
	}
	var netErr interface{ Timeout() bool }
	if errors.As(err, &netErr) {
		return true
	}
	return errors.Is(err, context.DeadlineExceeded)
}

type wakeEvent struct {
	mu sync.Mutex
	ch chan struct{}
}

func (e *wakeEvent) register() (<-chan struct{}, func()) {
	ch := make(chan struct{})
	e.mu.Lock()
	e.ch = ch
	e.mu.Unlock()
	return ch, func() {
		e.mu.Lock()
		if e.ch == ch {
			e.ch = nil
		}
		e.mu.Unlock()
	}
}

func (e *wakeEvent) Notify() {
	e.mu.Lock()
	if e.ch != nil {
		close(e.ch)
		e.ch = nil
	}
	e.mu.Unlock()
}

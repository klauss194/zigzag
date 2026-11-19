package app

import (
	"context"
	"sync"
	"time"

	"github.com/klauss/zigzag-go/internal/matrix"
)

const sendResumeDelay = 500 * time.Millisecond

const sendBackoffCap = time.Minute

func roomBackoff(base time.Duration, n int) time.Duration {
	if n < 1 {
		n = 1
	}
	if n > 4 {
		return sendBackoffCap
	}
	return min(base<<(2*(n-1)), sendBackoffCap)
}

type sendResumer struct {
	enable     func()
	enableRoom func(roomID string)
	delay      time.Duration

	mu      sync.Mutex
	running bool
	timer   *time.Timer
	stopped bool

	failures map[string]int
}

func newSendResumer(enable func(), enableRoom func(roomID string), delay time.Duration) *sendResumer {
	return &sendResumer{
		enable:     enable,
		enableRoom: enableRoom,
		delay:      delay,
		failures:   make(map[string]int),
	}
}

func (r *sendResumer) syncState(running bool) {
	r.mu.Lock()
	r.running = running
	if running {
		clear(r.failures)
	}
	r.mu.Unlock()
	r.poke()
}

func (r *sendResumer) roomFailed(roomID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stopped {
		return
	}
	r.failures[roomID]++
	wait := roomBackoff(r.delay, r.failures[roomID])
	time.AfterFunc(wait, func() { r.fireRoom(roomID) })
}

func (r *sendResumer) roomSent(roomID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.failures, roomID)
}

func (r *sendResumer) poke() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stopped {
		return
	}
	if r.timer != nil {
		r.timer.Stop()
	}
	r.timer = time.AfterFunc(r.delay, r.fire)
}

func (r *sendResumer) fire() {
	r.mu.Lock()
	turnOn := r.running && !r.stopped
	r.mu.Unlock()
	if turnOn {
		r.enable()
	}
}

func (r *sendResumer) fireRoom(roomID string) {
	r.mu.Lock()
	turnOn := r.running && !r.stopped
	r.mu.Unlock()
	if turnOn {
		r.enableRoom(roomID)
	}
}

func (r *sendResumer) stop() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.stopped = true
	if r.timer != nil {
		r.timer.Stop()
	}
}

func (a *App) enableSendQueues(client *matrix.Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := client.SetSendQueueEnabled(ctx, true); err != nil {
		a.sendLogger.Warn().Err(err).Msg("could not turn the send queues on")
		return
	}
	a.sendLogger.Debug().Msg("send queues on: the sync is running")
}

func (a *App) enableRoomSendQueue(client *matrix.Client, roomID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := client.SetRoomSendQueueEnabled(ctx, roomID, true); err != nil {
		a.sendLogger.Warn().Err(err).Str("room_id", roomID).Msg("could not turn the room's send queue on")
		return
	}
	a.sendLogger.Debug().Str("room_id", roomID).Msg("room's send queue on again after a failure")
}

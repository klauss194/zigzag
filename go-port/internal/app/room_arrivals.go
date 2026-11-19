package app

import (
	"context"
	"sync"
	"time"

	"github.com/klauss/zigzag-go/internal/matrix/syncwire"
)

const roomArrivalWait = 5 * time.Second

const roomArrivalMemory = 2 * time.Minute

type roomArrivals struct {
	mu      sync.Mutex
	seen    map[string]time.Time
	waiters map[string][]chan struct{}
}

func (r *roomArrivals) saw(rooms map[string]syncwire.Room) {
	if len(rooms) == 0 {
		return
	}
	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.seen == nil {
		r.seen = make(map[string]time.Time)
	}
	for roomID, at := range r.seen {
		if now.Sub(at) > roomArrivalMemory {
			delete(r.seen, roomID)
		}
	}
	for roomID := range rooms {
		r.seen[roomID] = now
		for _, waiter := range r.waiters[roomID] {
			close(waiter)
		}
		delete(r.waiters, roomID)
	}
}

func (r *roomArrivals) wait(ctx context.Context, roomID string, since time.Time, within time.Duration) bool {
	r.mu.Lock()
	if at, ok := r.seen[roomID]; ok && !at.Before(since) {
		r.mu.Unlock()
		return true
	}
	if r.waiters == nil {
		r.waiters = make(map[string][]chan struct{})
	}
	arrived := make(chan struct{})
	r.waiters[roomID] = append(r.waiters[roomID], arrived)
	r.mu.Unlock()

	timer := time.NewTimer(within)
	defer timer.Stop()
	select {
	case <-arrived:
		return true
	case <-timer.C:
	case <-ctx.Done():
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	select {
	case <-arrived:
		return true
	default:
	}
	kept := r.waiters[roomID][:0]
	for _, waiter := range r.waiters[roomID] {
		if waiter != arrived {
			kept = append(kept, waiter)
		}
	}
	if len(kept) == 0 {
		delete(r.waiters, roomID)
	} else {
		r.waiters[roomID] = kept
	}
	return false
}

package devicetrust

import (
	"context"
	"sync"
)

type job struct {
	name string

	ctx context.Context
	run func(ctx context.Context)

	abort func(err error)
}

type mailbox struct {
	mu     sync.Mutex
	queue  []job
	closed bool

	wake chan struct{}
}

func newMailbox() *mailbox {
	return &mailbox{wake: make(chan struct{}, 1)}
}

func (m *mailbox) push(j job) bool {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return false
	}
	m.queue = append(m.queue, j)
	m.mu.Unlock()

	select {
	case m.wake <- struct{}{}:
	default:
	}
	return true
}

func (m *mailbox) pop() (job, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.queue) == 0 {
		return job{}, false
	}
	next := m.queue[0]
	m.queue[0] = job{}
	m.queue = m.queue[1:]
	return next, true
}

func (m *mailbox) len() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.queue)
}

func (m *mailbox) close() []job {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	left := m.queue
	m.queue = nil
	return left
}

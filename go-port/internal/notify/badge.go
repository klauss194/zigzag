package notify

import (
	"strconv"
	"sync"

	"github.com/rs/zerolog"
)

type AppBadge struct {
	Important int
	Other     bool
}

const maxBadgeNumber = 99

func (b AppBadge) Label() (string, bool) {
	switch {
	case b.Important > maxBadgeNumber:
		return strconv.Itoa(maxBadgeNumber) + "+", true
	case b.Important > 0:
		return strconv.Itoa(b.Important), true
	case b.Other:
		return "", true
	default:
		return "", false
	}
}

func (e *Engine) AppBadge() AppBadge {
	e.mu.Lock()
	defer e.mu.Unlock()

	var badge AppBadge
	for roomID, state := range e.rooms {
		if state.Mode == ModeMute {
			continue
		}
		count := e.roomCounts(roomID)
		important := count.HighlightCount
		if state.MemberCount == 2 {
			important = max(count.NotificationCount, count.HighlightCount)
		}
		badge.Important += important
		if count.NotificationCount > important {
			badge.Other = true
		}
	}
	return badge
}

type Badger interface {
	SetBadge(label string) error
	RemoveBadge() error
}

type Badge struct {
	badger Badger
	logger zerolog.Logger

	mu      sync.Mutex
	pending *AppBadge
	wake    chan struct{}

	stop     chan struct{}
	stopOnce sync.Once

	shown   string
	visible bool
}

func NewBadge(badger Badger, logger zerolog.Logger) *Badge {
	return &Badge{
		badger: badger,
		logger: logger,
		wake:   make(chan struct{}, 1),
		stop:   make(chan struct{}),
	}
}

func (b *Badge) Start() { go b.run() }

func (b *Badge) Close() { b.stopOnce.Do(func() { close(b.stop) }) }

func (b *Badge) Show(badge AppBadge) {
	b.mu.Lock()
	b.pending = &badge
	b.mu.Unlock()
	select {
	case b.wake <- struct{}{}:
	default:
	}
}

func (b *Badge) run() {
	for {
		select {
		case <-b.stop:
			return
		case <-b.wake:
		}
		b.mu.Lock()
		next := b.pending
		b.pending = nil
		b.mu.Unlock()
		if next != nil {
			b.apply(*next)
		}
	}
}

func (b *Badge) apply(badge AppBadge) {
	label, visible := badge.Label()
	if label == b.shown && visible == b.visible {
		return
	}
	var err error
	if visible {
		err = b.badger.SetBadge(label)
	} else {
		err = b.badger.RemoveBadge()
	}
	if err != nil {
		b.logger.Debug().Err(err).Str("label", label).Msg("app badge not set")
		return
	}
	b.shown, b.visible = label, visible
}

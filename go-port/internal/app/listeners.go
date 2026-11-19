package app

import (
	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/matrix/syncwire"
)

type Listener interface {
	SessionStarted(userID string, client *matrix.Client)

	SessionEnded()
}

type RoomLeftListener interface {
	RoomLeft(roomID string)
}

type BatchListener interface {
	BatchReceived(response *syncwire.Response)
}

type SignOutListener interface {
	SignedOut(userID string)
}

func (a *App) AddListener(listener Listener) {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()
	a.listeners = append(a.listeners, listener)
}

func (a *App) notify(tell func(Listener)) {
	a.stateMu.RLock()
	listeners := a.listeners
	a.stateMu.RUnlock()
	for _, listener := range listeners {
		tell(listener)
	}
}

func (a *App) notifyRoomLeft(roomID string) {
	a.notify(func(listener Listener) {
		if roomLeft, ok := listener.(RoomLeftListener); ok {
			roomLeft.RoomLeft(roomID)
		}
	})
}

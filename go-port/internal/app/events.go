package app

import (
	"github.com/go-json-experiment/json/jsontext"
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/klauss/zigzag-go/internal/notify"
)

const (
	EventRooms          = "sliding:rooms"
	EventNet            = "sliding:net"
	EventSession        = "sliding:session"
	EventSyncState      = "sliding:state"
	EventNotifyUpdate   = "notify:update"
	EventNotifyActivate = "notify:activate"
	EventWindowFocus    = "window:focus"
	EventSendUpdate     = "send:update"
	EventTyping         = "typing:update"
)

func RegisterEvents() {
	application.RegisterEvent[*RoomsPayload](EventRooms)
	application.RegisterEvent[NetVerdict](EventNet)
	application.RegisterEvent[SessionVerdict](EventSession)
	application.RegisterEvent[*SyncState](EventSyncState)

	application.RegisterEvent[*notify.Update](EventNotifyUpdate)
	application.RegisterEvent[NotifyActivation](EventNotifyActivate)
	application.RegisterEvent[WindowFocus](EventWindowFocus)

	application.RegisterEvent[SendUpdate](EventSendUpdate)
	application.RegisterEvent[TypingUpdate](EventTyping)
}

type SyncState struct {
	State string `json:"state"`
	Error string `json:"error,omitempty"`
}

type NotifyActivation struct {
	RoomID       string `json:"roomId"`
	ThreadRootID string `json:"threadRootId,omitempty"`
}

type WindowFocus struct {
	Focused bool   `json:"focused"`
	Seq     uint64 `json:"seq"`
}

type NetVerdict uint8

const (
	NetNone NetVerdict = iota
	NetUp
	NetDown
)

type SessionVerdict uint8

const (
	SessionNone SessionVerdict = iota
	SessionExpired
	SessionExpiredSoft
)

type RoomsPayload struct {
	From string `json:"from"`

	To string `json:"to"`

	Body jsontext.Value `json:"body"`

	Decrypted map[string]jsontext.Value `json:"decrypted"`
}

type SendUpdate struct {
	RoomID string `json:"roomId"`
	TxnID  string `json:"txnId"`

	Kind string `json:"kind"`

	EventID string `json:"eventId,omitempty"`

	Reason    string `json:"reason,omitempty"`
	Temporary bool   `json:"temporary,omitempty"`
	Error     string `json:"error,omitempty"`
}

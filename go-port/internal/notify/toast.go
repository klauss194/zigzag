package notify

import (
	"unicode/utf8"

	"github.com/klauss/zigzag-go/internal/matrix/event"
	"github.com/klauss/zigzag-go/internal/matrix/id"
)

const maxBodyBytes = 280

type Toast struct {
	RoomID     id.RoomID  `json:"room_id"`
	EventID    id.EventID `json:"event_id"`
	RoomName   string     `json:"room_name"`
	SenderName string     `json:"sender_name"`
	Body       string     `json:"body"`

	ThreadRootID id.EventID `json:"thread_root_id,omitempty"`

	Highlight bool `json:"highlight"`

	Sound bool `json:"sound"`

	roomUnread int

	summary bool
}

func (t Toast) Title() string {
	sender, room := t.SenderName, t.RoomName

	switch {
	case sender != "" && room != "" && sender != room:
		return sender + " — " + room
	case sender != "":
		return sender
	case room != "":
		return room
	default:

		return "Zigzag"
	}
}

func senderLabel(sender id.UserID) string {
	if sender == "" {
		return ""
	}
	return localpart(sender)
}

func toastBody(evt *event.Event) string {
	switch evt.Type.Type {
	case event.EventEncrypted.Type:

		return "Encrypted message"
	case event.EventSticker.Type:
		return "Sticker"
	}

	body, ok := evt.Content.GetRaw()["body"].(string)
	if !ok || body == "" {
		return "New message"
	}
	if len(body) <= maxBodyBytes {
		return body
	}

	end := maxBodyBytes
	for end > 0 && !utf8.RuneStart(body[end]) {
		end--
	}
	return body[:end]
}

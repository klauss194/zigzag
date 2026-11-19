package event

import (
	"bytes"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/matrix/id"
)

type Type struct {
	Type string
}

func (t Type) String() string { return t.Type }

func (t Type) MarshalJSON() ([]byte, error) { return jsonv2.Marshal(t.Type) }

func (t *Type) UnmarshalJSON(b []byte) error { return jsonv2.Unmarshal(b, &t.Type) }

var (
	EventMessage   = Type{"m.room.message"}
	EventEncrypted = Type{"m.room.encrypted"}
	EventSticker   = Type{"m.sticker"}
	EventRedaction = Type{"m.room.redaction"}
)

type Event struct {
	StateKey  *string    `json:"state_key,omitempty"`
	Sender    id.UserID  `json:"sender"`
	Type      Type       `json:"type"`
	Timestamp int64      `json:"origin_server_ts"`
	ID        id.EventID `json:"event_id"`
	RoomID    id.RoomID  `json:"room_id,omitempty"`
	Content   Content    `json:"content"`
	Redacts   id.EventID `json:"redacts,omitempty"`
	Unsigned  Unsigned   `json:"unsigned,omitzero"`

	Raw jsontext.Value `json:"-"`
}

func (e *Event) UnmarshalJSON(b []byte) error {
	type plain Event
	var decoded plain
	if err := jsonv2.Unmarshal(b, &decoded); err != nil {
		return err
	}
	*e = Event(decoded)
	e.Raw = bytes.Clone(b)
	return nil
}

type Unsigned struct {
	RedactedBecause *Event    `json:"redacted_because,omitempty"`
	TransactionID   string    `json:"transaction_id,omitempty"`
	Relations       Relations `json:"m.relations,omitzero"`
}

type Relations struct {
	Thread *ThreadSummary `json:"m.thread,omitempty"`
}

type ThreadSummary struct {
	LatestEvent             *Event `json:"latest_event,omitempty"`
	Count                   int    `json:"count"`
	CurrentUserParticipated bool   `json:"current_user_participated"`
}

func (e *Event) GetThreadSummary() *ThreadSummary {
	if e == nil {
		return nil
	}
	return e.Unsigned.Relations.Thread
}

type Content struct {
	VeryRaw jsontext.Value
	parsed  map[string]any
}

func (c Content) MarshalJSON() ([]byte, error) {
	if len(c.VeryRaw) == 0 {
		return []byte("{}"), nil
	}
	return c.VeryRaw, nil
}

func (c *Content) UnmarshalJSON(b []byte) error {
	c.VeryRaw = bytes.Clone(b)
	c.parsed = nil
	return nil
}

func (c *Content) GetRaw() map[string]any {
	if c.parsed == nil {
		c.parsed = map[string]any{}
		if len(c.VeryRaw) > 0 {
			_ = jsonv2.Unmarshal(c.VeryRaw, &c.parsed)
		}
	}
	return c.parsed
}

const (
	RelThread     = "m.thread"
	RelReplace    = "m.replace"
	RelAnnotation = "m.annotation"
)

type ReceiptType string

const (
	ReceiptTypeRead        ReceiptType = "m.read"
	ReceiptTypeReadPrivate ReceiptType = "m.read.private"
)

type ThreadID string

func (t ThreadID) String() string { return string(t) }

const ReadReceiptThreadMain ThreadID = "main"

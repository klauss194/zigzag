package matrix

import (
	"context"
	"errors"
	"fmt"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/rustcore"
	"github.com/klauss/zigzag-go/internal/trace"
)

type SendQueueUpdateKind string

const (
	QueueNewLocalEvent SendQueueUpdateKind = "new_local_event"

	QueueCancelledLocalEvent SendQueueUpdateKind = "cancelled_local_event"

	QueueReplacedLocalEvent SendQueueUpdateKind = "replaced_local_event"

	QueueSendError SendQueueUpdateKind = "send_error"

	QueueRetryEvent SendQueueUpdateKind = "retry_event"

	QueueSentEvent SendQueueUpdateKind = "sent_event"

	QueueMediaUpload SendQueueUpdateKind = "media_upload"

	QueueLagged SendQueueUpdateKind = "lagged"
)

type SendQueueUpdate struct {
	RoomID        string
	Kind          SendQueueUpdateKind
	TransactionID string

	Echo *LocalEcho

	EventType string
	Content   jsontext.Value

	Err         error
	Recoverable bool

	EventID string

	Index, Current, Total int64
	File                  jsontext.Value

	Missed int64
}

type LocalEcho struct {
	RoomID        string
	TransactionID string

	Kind string

	EventType string
	Content   jsontext.Value
	CreatedAt int64

	SendError jsontext.Value

	Key       string
	AppliesTo string

	Redacts string
	Reason  string
}

func (e LocalEcho) Wedged() bool { return len(e.SendError) > 0 && string(e.SendError) != "null" }

type queueEchoWire struct {
	RoomID        string         `json:"room_id"`
	TransactionID string         `json:"transaction_id"`
	Kind          string         `json:"kind"`
	EventType     string         `json:"event_type"`
	Content       jsontext.Value `json:"content"`
	CreatedAt     int64          `json:"created_at"`
	SendError     jsontext.Value `json:"send_error"`
	Key           string         `json:"key"`
	AppliesTo     string         `json:"applies_to"`
	Redacts       string         `json:"redacts"`
	Reason        *string        `json:"reason"`
}

func (w queueEchoWire) echo() LocalEcho {
	sendError := w.SendError
	if string(sendError) == "null" {
		sendError = nil
	}
	return LocalEcho{
		RoomID:        w.RoomID,
		TransactionID: w.TransactionID,
		Kind:          w.Kind,
		EventType:     w.EventType,
		Content:       w.Content,
		CreatedAt:     w.CreatedAt,
		SendError:     sendError,
		Key:           w.Key,
		AppliesTo:     w.AppliesTo,
		Redacts:       w.Redacts,
		Reason:        deref(w.Reason),
	}
}

type queueUpdateWire struct {
	RoomID        string         `json:"room_id"`
	Kind          string         `json:"kind"`
	TransactionID string         `json:"transaction_id"`
	Echo          *queueEchoWire `json:"echo"`
	EventType     string         `json:"event_type"`
	Content       jsontext.Value `json:"content"`
	Recoverable   bool           `json:"recoverable"`
	Error         *coreErrorWire `json:"error"`
	EventID       string         `json:"event_id"`
	Index         int64          `json:"index"`
	Current       int64          `json:"current"`
	Total         int64          `json:"total"`
	File          jsontext.Value `json:"file"`
	Missed        int64          `json:"missed"`
}

type coreErrorWire struct {
	Status    int            `json:"status"`
	Body      jsontext.Value `json:"body"`
	Transport bool           `json:"transport"`
	Message   string         `json:"message"`
}

func (w *coreErrorWire) err() error {
	switch {
	case w == nil:
		return nil
	case w.Status != 0:
		body := []byte(w.Body)
		if len(body) == 0 {
			body = []byte("{}")
		}
		return newAPIError(w.Status, body)
	case w.Transport:
		return &Error{Transport: true, Message: w.Message}
	case w.Message != "":
		return fmt.Errorf("matrix: %s", w.Message)
	}
	return errors.New("matrix: unknown error")
}

func decodeQueueUpdate(payload string) (SendQueueUpdate, error) {
	var wire queueUpdateWire
	if err := jsonv2.Unmarshal([]byte(payload), &wire); err != nil {
		return SendQueueUpdate{}, err
	}
	if wire.Kind == "" {
		return SendQueueUpdate{}, errors.New("send queue update without a kind")
	}
	update := SendQueueUpdate{
		RoomID:        wire.RoomID,
		Kind:          SendQueueUpdateKind(wire.Kind),
		TransactionID: wire.TransactionID,
		EventType:     wire.EventType,
		Content:       wire.Content,
		Recoverable:   wire.Recoverable,
		Err:           wire.Error.err(),
		EventID:       wire.EventID,
		Index:         wire.Index,
		Current:       wire.Current,
		Total:         wire.Total,
		Missed:        wire.Missed,
	}
	if string(wire.File) != "null" {
		update.File = wire.File
	}
	if wire.Echo != nil {
		echo := wire.Echo.echo()
		echo.RoomID = wire.RoomID
		update.Echo = &echo
	}
	return update, nil
}

type queueBridge struct{ handle func(SendQueueUpdate) }

func (b queueBridge) OnUpdate(payloadJSON string) {
	update, err := decodeQueueUpdate(payloadJSON)
	if err != nil {
		log := trace.Log("sendqueue")
		log.Warn().Err(err).Msg("send queue update does not decode — dropped")
		return
	}
	b.handle(update)
}

func (c *Client) ListenSendQueue(handle func(SendQueueUpdate)) error {
	return c.CoreCall(func(core *rustcore.Core) error {
		core.SendQueueListen(queueBridge{handle})
		return nil
	})
}

var errNotObject = errors.New("matrix: event content must be a JSON object")

func jsonObject(content []byte) error {
	value := jsontext.Value(content)
	if !value.IsValid() || value.Kind() != '{' {
		return errNotObject
	}
	return nil
}

func (c *Client) EnqueueEvent(ctx context.Context, roomID, eventType string, content []byte) (string, error) {
	core, err := c.needCore()
	if err != nil {
		return "", err
	}
	if err := jsonObject(content); err != nil {
		return "", err
	}
	return await(ctx, func() (string, error) {
		return core.SendQueueSend(roomID, eventType, string(content))
	})
}

func (c *Client) AbortQueued(ctx context.Context, roomID, transactionID string) (bool, error) {
	core, err := c.needCore()
	if err != nil {
		return false, err
	}
	return await(ctx, func() (bool, error) { return core.SendQueueAbort(roomID, transactionID) })
}

func (c *Client) UnwedgeQueued(ctx context.Context, roomID, transactionID string) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	_, err = await(ctx, func() (struct{}, error) {
		return struct{}{}, core.SendQueueUnwedge(roomID, transactionID)
	})
	return err
}

func (c *Client) QueuedEvents(ctx context.Context, roomID string) ([]LocalEcho, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	payload, err := await(ctx, func() (string, error) { return core.SendQueuePending(optional(roomID)) })
	if err != nil {
		return nil, err
	}
	var wire []queueEchoWire
	if err := jsonv2.Unmarshal([]byte(payload), &wire); err != nil {
		return nil, fmt.Errorf("matrix: queued events: %w", err)
	}
	echoes := make([]LocalEcho, len(wire))
	for i, w := range wire {
		echoes[i] = w.echo()
	}
	return echoes, nil
}

func (c *Client) SetSendQueueEnabled(ctx context.Context, enabled bool) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	_, err = await(ctx, func() (struct{}, error) {
		core.SendQueueSetEnabled(enabled)
		return struct{}{}, nil
	})
	return err
}

func (c *Client) SetRoomSendQueueEnabled(ctx context.Context, roomID string, enabled bool) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	_, err = await(ctx, func() (struct{}, error) {
		return struct{}{}, core.SendQueueRoomSetEnabled(roomID, enabled)
	})
	return err
}

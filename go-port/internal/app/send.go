package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/matrix/event"
)

func isEdit(content jsontext.Value) bool {
	var message struct {
		RelatesTo struct {
			RelType string `json:"rel_type"`
		} `json:"m.relates_to"`
	}
	if jsonv2.Unmarshal(content, &message) != nil {
		return false
	}
	return message.RelatesTo.RelType == event.RelReplace
}

const (
	sendStateQueued = "queued"
	sendStateSent   = "sent"
	sendStateFailed = "failed"
)

const directSendTimeout = 60 * time.Second

func (a *App) Send(ctx context.Context, req SendRequest) (*SendReceipt, error) {
	eventType := event.Type{Type: req.Type}
	if req.Type == "" {

		eventType = event.EventMessage
	}
	if req.Direct || isEdit(req.Content) {
		return a.sendDirect(ctx, req, eventType)
	}

	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	if req.RoomID == "" {
		return nil, errors.New("zigzag: send needs a room id")
	}

	a.sendLogger.Info().
		Str("room_id", req.RoomID).
		Str("type", eventType.Type).
		Int("content_bytes", len(req.Content)).
		Msg("send requested by the frontend")

	txnID, err := matrixClient.EnqueueEvent(ctx, req.RoomID, eventType.Type, req.Content)
	if err != nil {

		a.sendLogger.Err(err).Str("room_id", req.RoomID).Msg("send refused by the queue")
		receipt := &SendReceipt{State: sendStateFailed, Error: err.Error()}
		return receipt, fmt.Errorf("zigzag: send: %w", err)
	}
	return &SendReceipt{TxnID: txnID, State: sendStateQueued}, nil
}

func (a *App) sendDirect(ctx context.Context, req SendRequest, eventType event.Type) (*SendReceipt, error) {
	matrixClient, writes, err := a.readDirectWriter()
	if err != nil {
		return nil, err
	}
	if req.RoomID == "" {
		return nil, errors.New("zigzag: send needs a room id")
	}

	a.sendLogger.Info().
		Str("room_id", req.RoomID).
		Str("type", eventType.Type).
		Int("content_bytes", len(req.Content)).
		Msg("direct send requested by the frontend")

	started := time.Now()
	eventID, err := writes.do(ctx, func(writeCtx context.Context) (string, error) {
		return matrixClient.SendEvent(writeCtx, req.RoomID, eventType.Type, req.Content, req.TxnID)
	})
	if err != nil {
		a.sendLogger.Err(err).Str("room_id", req.RoomID).Dur("ms", time.Since(started)).Msg("direct send failed")
		receipt := &SendReceipt{TxnID: req.TxnID, State: sendStateFailed, Error: err.Error()}
		return receipt, fmt.Errorf("zigzag: send: %w", err)
	}
	a.sendLogger.Info().Str("room_id", req.RoomID).Str("event_id", eventID).Dur("ms", time.Since(started)).Msg("sent directly")
	return &SendReceipt{TxnID: req.TxnID, EventID: eventID, State: sendStateSent}, nil
}

func (a *App) SendState(ctx context.Context, req SendStateRequest) (*SendReceipt, error) {
	matrixClient, writes, err := a.readDirectWriter()
	if err != nil {
		return nil, err
	}
	if req.RoomID == "" {
		return nil, errors.New("zigzag: send state needs a room id")
	}
	if req.Type == "" {
		return nil, errors.New("zigzag: send state needs an event type")
	}

	a.sendLogger.Info().
		Str("room_id", req.RoomID).
		Str("type", req.Type).
		Str("state_key", req.StateKey).
		Int("content_bytes", len(req.Content)).
		Msg("→ state write")

	started := time.Now()
	var eventID string
	err = checkStateContent(req.Content)
	if err == nil {
		eventID, err = writes.do(ctx, func(writeCtx context.Context) (string, error) {
			return matrixClient.SendState(writeCtx, req.RoomID, req.Type, req.StateKey, req.Content)
		})
	}
	if err == nil && eventID == "" {

		err = errors.New("homeserver returned no event id")
	}
	if err != nil {
		a.sendLogger.Err(err).
			Str("room_id", req.RoomID).
			Str("type", req.Type).
			Str("state_key", req.StateKey).
			Dur("ms", time.Since(started)).
			Msg("← state write failed")
		receipt := &SendReceipt{State: sendStateFailed, Error: err.Error()}
		return receipt, fmt.Errorf("zigzag: send state: %w", err)
	}

	a.sendLogger.Info().
		Str("room_id", req.RoomID).
		Str("type", req.Type).
		Str("state_key", req.StateKey).
		Str("event_id", eventID).
		Dur("ms", time.Since(started)).
		Msg("← state written")
	return &SendReceipt{EventID: eventID, State: sendStateSent}, nil
}

func checkStateContent(raw jsontext.Value) error {
	switch {
	case len(raw) == 0:
		return errors.New("content is required")
	case !raw.IsValid():
		return errors.New("content is not valid JSON")
	case raw.Kind() != '{':
		return errors.New("content must be a JSON object")
	}
	return nil
}

var errSessionClosing = errors.New("session is closing")

type directWrites struct {
	mu       sync.Mutex
	closing  bool
	inFlight sync.WaitGroup
	stop     context.Context
	cancel   context.CancelFunc
}

func newDirectWrites() *directWrites {
	stop, cancel := context.WithCancel(context.Background())
	return &directWrites{stop: stop, cancel: cancel}
}

func (w *directWrites) do(ctx context.Context, write func(context.Context) (string, error)) (string, error) {
	w.mu.Lock()
	if w.closing {
		w.mu.Unlock()
		return "", errSessionClosing
	}
	w.inFlight.Add(1)
	w.mu.Unlock()
	defer w.inFlight.Done()

	writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), directSendTimeout)
	defer cancel()
	stopCancelOnClose := context.AfterFunc(w.stop, cancel)
	defer stopCancelOnClose()
	return write(writeCtx)
}

func (w *directWrites) close() {
	w.mu.Lock()
	w.closing = true
	w.mu.Unlock()
	w.cancel()
	w.inFlight.Wait()
}

var ErrNotOwnEvent = errors.New("zigzag: only your own messages can be deleted")

func (a *App) Redact(ctx context.Context, roomID, eventID string) (*SendReceipt, error) {
	matrixClient, writes, err := a.readDirectWriter()
	if err != nil {
		return nil, err
	}
	if roomID == "" {
		return nil, errors.New("zigzag: redact needs a room id")
	}
	if eventID == "" {
		return nil, errors.New("zigzag: redact needs an event id")
	}

	target, err := matrixClient.GetEvent(ctx, roomID, eventID)
	if err != nil {
		a.sendLogger.Err(err).Str("room_id", roomID).Str("event_id", eventID).Msg("redact: target unreadable")
		return nil, fmt.Errorf("zigzag: redact %s in %s: read the target: %w", eventID, roomID, err)
	}
	if string(target.Sender) != matrixClient.UserID() {
		a.sendLogger.Warn().Str("room_id", roomID).Str("event_id", eventID).
			Str("sender", string(target.Sender)).Msg("redact refused: not this account's event")
		return nil, fmt.Errorf("zigzag: redact %s in %s: %w", eventID, roomID, ErrNotOwnEvent)
	}

	a.sendLogger.Info().Str("room_id", roomID).Str("event_id", eventID).Msg("redact requested by the frontend")
	started := time.Now()
	redactionID, err := writes.do(ctx, func(writeCtx context.Context) (string, error) {
		return matrixClient.Redact(writeCtx, roomID, eventID, "", "")
	})
	if err != nil {
		a.sendLogger.Err(err).Str("room_id", roomID).Str("event_id", eventID).Dur("ms", time.Since(started)).Msg("redact failed")
		receipt := &SendReceipt{State: sendStateFailed, Error: err.Error()}
		return receipt, fmt.Errorf("zigzag: redact %s in %s: %w", eventID, roomID, err)
	}
	a.sendLogger.Info().Str("room_id", roomID).Str("event_id", eventID).Str("redaction_id", redactionID).
		Dur("ms", time.Since(started)).Msg("redacted")
	return &SendReceipt{EventID: redactionID, State: sendStateSent}, nil
}

const (
	sendFailedOffline      = "offline"
	sendFailedServerBusy   = "server_busy"
	sendFailedSignedOut    = "signed_out"
	sendFailedNoPermission = "no_permission"
	sendFailedTooLarge     = "too_large"
	sendFailedOther        = "other"
)

func sendFailureReason(err error) string {
	matrixErr, ok := matrix.AsError(err)
	switch {
	case !ok:
		return sendFailedOther
	case matrixErr.Transport:
		return sendFailedOffline
	case matrixErr.ErrCode == "M_UNKNOWN_TOKEN", matrixErr.ErrCode == "M_MISSING_TOKEN",
		matrixErr.ErrCode == "M_USER_DEACTIVATED", matrixErr.StatusCode == http.StatusUnauthorized:
		return sendFailedSignedOut
	case matrix.IsForbidden(err):
		return sendFailedNoPermission
	case matrix.ErrTooLarge(err):
		return sendFailedTooLarge
	case matrix.IsRateLimited(err), matrixErr.StatusCode >= http.StatusInternalServerError:
		return sendFailedServerBusy
	}
	return sendFailedOther
}

func sendFailureText(err error) string {
	if matrixErr, ok := matrix.AsError(err); ok {
		return matrixErr.Message
	}
	if err == nil {
		return ""
	}
	return err.Error()
}

var sendUpdateKinds = map[matrix.SendQueueUpdateKind]string{
	matrix.QueueNewLocalEvent:       sendStateQueued,
	matrix.QueueSentEvent:           "sent",
	matrix.QueueSendError:           "failed",
	matrix.QueueRetryEvent:          "retrying",
	matrix.QueueCancelledLocalEvent: "cancelled",
}

func sendUpdateOf(update matrix.SendQueueUpdate) (SendUpdate, bool) {
	kind, ok := sendUpdateKinds[update.Kind]
	if !ok {
		return SendUpdate{}, false
	}
	out := SendUpdate{
		RoomID:  update.RoomID,
		TxnID:   update.TransactionID,
		Kind:    kind,
		EventID: update.EventID,
	}
	if update.Kind == matrix.QueueSendError {
		out.Reason = sendFailureReason(update.Err)
		out.Temporary = update.Recoverable
		out.Error = sendFailureText(update.Err)
	}
	return out, true
}

func (a *App) onSendQueueUpdate(update matrix.SendQueueUpdate) {

	if sendResumer := a.readSendResumer(); sendResumer != nil {
		switch update.Kind {
		case matrix.QueueSendError:
			if update.Recoverable {
				sendResumer.roomFailed(update.RoomID)
			}
		case matrix.QueueSentEvent:
			sendResumer.roomSent(update.RoomID)
		}
	}

	if update.Kind == matrix.QueueSentEvent {
		a.NudgeSync()
	}
	out, ok := sendUpdateOf(update)
	if !ok {
		return
	}

	a.sendLogger.Info().
		Str("room_id", out.RoomID).
		Str("txn", out.TxnID).
		Str("kind", out.Kind).
		Str("event_id", out.EventID).
		Str("reason", out.Reason).
		Msg("send queue update")
	a.eventGate.EmitDirect(EventSendUpdate, out)
}

package app

import (
	"context"
	"errors"
	"fmt"

	"github.com/klauss/zigzag-go/internal/matrix"
)

func (a *App) UnsentMessages(ctx context.Context, roomID string) ([]UnsentMessage, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	return unsentMessages(ctx, matrixClient, roomID)
}

func unsentMessages(ctx context.Context, queue sendQueueControls, roomID string) ([]UnsentMessage, error) {
	if roomID == "" {
		return nil, errors.New("zigzag: unsent messages need a room id")
	}
	echoes, err := queue.QueuedEvents(ctx, roomID)
	if err != nil {
		return nil, fmt.Errorf("zigzag: unsent messages in %s: %w", roomID, err)
	}
	unsent := make([]UnsentMessage, 0, len(echoes))
	for _, echo := range echoes {
		unsent = append(unsent, unsentMessageOf(echo))
	}
	return unsent, nil
}

func unsentMessageOf(echo matrix.LocalEcho) UnsentMessage {
	out := UnsentMessage{
		RoomID:   echo.RoomID,
		TxnID:    echo.TransactionID,
		Kind:     echo.Kind,
		Type:     echo.EventType,
		Content:  echo.Content,
		QueuedAt: echo.CreatedAt,
		Redacts:  echo.Redacts,
		State:    sendStateQueued,
	}
	if echo.Wedged() {
		out.State = sendStateFailed
		out.Reason = sendFailedOther
		out.Error = string(echo.SendError)
	}
	return out
}

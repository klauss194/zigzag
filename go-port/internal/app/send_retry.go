package app

import (
	"context"
	"errors"
	"fmt"

	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/matrix"
)

var ErrNotQueued = errors.New("zigzag: that message is no longer waiting to be sent")

type sendQueueControls interface {
	QueuedEvents(ctx context.Context, roomID string) ([]matrix.LocalEcho, error)
	UnwedgeQueued(ctx context.Context, roomID, transactionID string) error
	AbortQueued(ctx context.Context, roomID, transactionID string) (bool, error)
	SetRoomSendQueueEnabled(ctx context.Context, roomID string, enabled bool) error
}

func (a *App) RetrySend(ctx context.Context, roomID, txnID string) (*SendReceipt, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	return retrySend(ctx, matrixClient, a.sendLogger, roomID, txnID)
}

func (a *App) DiscardSend(ctx context.Context, roomID, txnID string) (bool, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return false, err
	}
	return discardSend(ctx, matrixClient, a.sendLogger, roomID, txnID)
}

func retrySend(ctx context.Context, queue sendQueueControls, log zerolog.Logger, roomID, txnID string) (*SendReceipt, error) {
	echo, err := queuedEcho(ctx, queue, roomID, txnID)
	if err != nil {
		return nil, fmt.Errorf("zigzag: retry %s in %s: %w", txnID, roomID, err)
	}

	switch echo.Kind {
	case "event":
		if err := queue.UnwedgeQueued(ctx, roomID, txnID); err != nil {
			return nil, fmt.Errorf("zigzag: retry %s in %s: %w", txnID, roomID, err)
		}
	default:

		return nil, fmt.Errorf("zigzag: retry %s in %s: a queued %q cannot be retried", txnID, roomID, echo.Kind)
	}

	if err := queue.SetRoomSendQueueEnabled(ctx, roomID, true); err != nil {
		return nil, fmt.Errorf("zigzag: retry %s in %s: turn the room's queue on: %w", txnID, roomID, err)
	}
	log.Info().Str("room_id", roomID).Str("txn", txnID).Str("kind", echo.Kind).
		Bool("wedged", echo.Wedged()).Msg("send retried by the frontend")
	return &SendReceipt{TxnID: txnID, State: sendStateQueued}, nil
}

func discardSend(ctx context.Context, queue sendQueueControls, log zerolog.Logger, roomID, txnID string) (bool, error) {
	echo, err := queuedEcho(ctx, queue, roomID, txnID)
	if errors.Is(err, ErrNotQueued) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("zigzag: discard %s in %s: %w", txnID, roomID, err)
	}
	removed, err := queue.AbortQueued(ctx, roomID, txnID)
	if err != nil {
		return false, fmt.Errorf("zigzag: discard %s in %s: %w", txnID, roomID, err)
	}
	log.Info().Str("room_id", roomID).Str("txn", txnID).Str("kind", echo.Kind).
		Bool("wedged", echo.Wedged()).Bool("removed", removed).Msg("send discarded by the frontend")
	if removed {

		if err := queue.SetRoomSendQueueEnabled(ctx, roomID, true); err != nil {
			log.Warn().Err(err).Str("room_id", roomID).Msg("discard: the room's queue was not turned on")
		}
	}
	return removed, nil
}

func queuedEcho(ctx context.Context, queue sendQueueControls, roomID, txnID string) (matrix.LocalEcho, error) {
	if roomID == "" || txnID == "" {
		return matrix.LocalEcho{}, errors.New("a room id and a transaction id are required")
	}
	echoes, err := queue.QueuedEvents(ctx, roomID)
	if err != nil {
		return matrix.LocalEcho{}, err
	}
	for _, echo := range echoes {
		if echo.TransactionID == txnID {
			return echo, nil
		}
	}
	return matrix.LocalEcho{}, ErrNotQueued
}

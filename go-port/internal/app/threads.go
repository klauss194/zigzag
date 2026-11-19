package app

import (
	"context"
	"fmt"

	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/matrix"
	matrixid "github.com/klauss/zigzag-go/internal/matrix/id"
)

const (
	defaultChunkLimit = 50
	maxChunkLimit     = 200
)

func (a *App) Threads(ctx context.Context, req ThreadsRequest) (*EventChunk, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	if req.RoomID == "" {
		return nil, fmt.Errorf("threads: no room id")
	}
	participatedOnly := req.Include == "participated"
	page, err := matrixClient.Threads(ctx, req.RoomID, participatedOnly, req.From, clampChunkLimit(req.Limit))
	if err != nil {
		a.roomLogger.Err(err).Str("room_id", req.RoomID).Msg("/threads failed")
		return nil, fmt.Errorf("threads %s: %w", req.RoomID, err)
	}
	include := "all"
	if participatedOnly {
		include = "participated"
	}
	a.roomLogger.Info().
		Str("room_id", req.RoomID).
		Str("include", include).
		Int("roots", len(page.Events)).
		Int("utd", page.Undecryptable).
		Str("next_batch", page.End).
		Msg("thread roots fetched")
	a.noteServerThreads(matrixid.RoomID(req.RoomID), decodeEvents(page.Events), matrixid.UserID(matrixClient.UserID()))
	return &EventChunk{Chunk: nonNil(page.Events), NextBatch: page.End}, nil
}

func (a *App) Relations(ctx context.Context, req RelationsRequest) (*EventChunk, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	if req.RoomID == "" || req.EventID == "" {
		return nil, fmt.Errorf("relations: need a room id and an event id")
	}
	page, err := matrixClient.Relations(ctx, req.RoomID, req.EventID, matrix.RelationsQuery{
		RelType:   req.RelType,
		EventType: req.EventType,
		Recurse:   req.Recurse,
		Backward:  req.Dir != "f",
		From:      req.From,
		Limit:     clampChunkLimit(req.Limit),
	})
	if err != nil {
		a.roomLogger.Err(err).
			Str("room_id", req.RoomID).
			Str("event_id", req.EventID).
			Msg("/relations failed")
		return nil, fmt.Errorf("relations %s %s: %w", req.RoomID, req.EventID, err)
	}
	a.roomLogger.Info().
		Str("room_id", req.RoomID).
		Str("event_id", req.EventID).
		Int("events", len(page.Events)).
		Int("utd", page.Undecryptable).
		Str("next_batch", page.End).
		Msg("relations fetched")
	return &EventChunk{
		Chunk:     nonNil(page.Events),
		NextBatch: page.End,
		PrevBatch: page.Start,
	}, nil
}

func nonNil(events []jsontext.Value) []jsontext.Value {
	if events == nil {
		return []jsontext.Value{}
	}
	return events
}

func clampChunkLimit(limit int) int {
	if limit <= 0 || limit > maxChunkLimit {
		return defaultChunkLimit
	}
	return limit
}

package app

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
)

const roomCreateRequestTimeout = 40 * time.Second

func (a *App) CreateRoom(ctx context.Context, req CreateRoomRequest) (*CreateRoomResult, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	if len(req.Body) == 0 {
		return nil, errors.New("zigzag: create room needs a request body")
	}

	var createReq struct {
		Preset       string           `json:"preset"`
		RoomVersion  string           `json:"room_version"`
		IsDirect     bool             `json:"is_direct"`
		Invite       []string         `json:"invite"`
		InitialState []jsontext.Value `json:"initial_state"`
	}
	if err := json.Unmarshal(req.Body, &createReq); err != nil {
		return nil, fmt.Errorf("zigzag: create room: the request body is not a createRoom object: %w", err)
	}

	a.roomLogger.Info().
		Str("preset", createReq.Preset).
		Str("room_version", createReq.RoomVersion).
		Bool("is_direct", createReq.IsDirect).
		Int("invites", len(createReq.Invite)).
		Int("initial_state", len(createReq.InitialState)).
		Msg("room creation requested by the frontend")

	requested := time.Now()
	requestCtx, cancel := context.WithTimeout(ctx, roomCreateRequestTimeout)
	defer cancel()
	roomID, err := matrixClient.CreateRoom(requestCtx, req.Body)
	if err != nil {
		a.roomLogger.Err(err).Str("preset", createReq.Preset).Msg("room creation failed")
		return nil, fmt.Errorf("zigzag: create room: %w", err)
	}

	created := time.Now()
	arrived := a.roomArrivals.wait(ctx, roomID, requested, roomArrivalWait)
	a.roomLogger.Info().
		Str("room_id", roomID).
		Int("invites", len(createReq.Invite)).
		Bool("in_page", arrived).
		Int64("waited_ms", time.Since(created).Milliseconds()).
		Msg("room created")
	if !arrived {
		a.roomLogger.Warn().Str("room_id", roomID).
			Msg("no batch carried the new room to the page in time — returning it anyway")
	}
	return &CreateRoomResult{RoomID: roomID}, nil
}

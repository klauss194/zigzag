package app

import (
	"context"
	"fmt"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/matrix/event"
	matrixid "github.com/klauss/zigzag-go/internal/matrix/id"
)

func (a *App) MemberCount(roomID string) (int, error) {
	client, err := a.readClient()
	if err != nil {
		return 0, err
	}

	for _, room := range client.KnownRooms() {
		if room.RoomID == roomID {
			return room.JoinedMembers + room.InvitedMembers, nil
		}
	}
	return 0, nil
}

func (a *App) Timeline(ctx context.Context, roomID, fromToken string, maxEvents int, gapFill bool) (*TimelinePage, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}

	page, err := matrixClient.Messages(ctx, roomID, fromToken, clampChunkLimit(maxEvents), true)
	if err != nil {
		a.roomLogger.Err(err).Str("room_id", roomID).Msg("/messages failed")
		return nil, fmt.Errorf("timeline %s: %w", roomID, err)
	}

	result := &TimelinePage{End: page.End, Events: page.Events}
	if gapFill {
		a.noteGapPage(matrixid.RoomID(roomID), decodeEvents(page.Events))
	}

	a.roomLogger.Info().
		Str("room_id", roomID).
		Int("events", len(result.Events)).
		Int("utd", page.Undecryptable).
		Str("end", result.End).
		Msg("back-paginated")
	return result, nil
}

func decodeEvents(raws []jsontext.Value) []*event.Event {
	events := make([]*event.Event, 0, len(raws))
	for _, raw := range raws {
		var evt event.Event
		if jsonv2.Unmarshal(raw, &evt) == nil {
			events = append(events, &evt)
		}
	}
	return events
}

func (a *App) KnownRooms() []matrix.KnownRoom {
	client, err := a.readClient()
	if err != nil {
		return nil
	}
	return client.KnownRooms()
}

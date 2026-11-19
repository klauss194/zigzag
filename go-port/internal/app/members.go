package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/endpointspec"
	"github.com/klauss/zigzag-go/internal/matrix"
)

func (a *App) RoomMembers(ctx context.Context, roomID string) (*EventChunk, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	if roomID == "" {
		return nil, errors.New("zigzag: members needs a room id")
	}

	var resp struct {
		Chunk []jsontext.Value `json:"chunk"`
	}
	if err := matrixClient.Do(ctx, http.MethodGet, matrixClient.ClientURL("v3", "rooms", roomID, "members"), nil, nil, &resp); err != nil {
		a.roomLogger.Err(err).Str("room_id", roomID).Msg("/members failed")
		return nil, fmt.Errorf("zigzag: members %s: %w", roomID, err)
	}
	events := nonNil(resp.Chunk)
	a.roomLogger.Info().
		Str("room_id", roomID).
		Int("members", len(events)).
		Msg("roster fetched")

	return &EventChunk{Chunk: events}, nil
}

func (a *App) SearchUsers(ctx context.Context, term string, limit int) (*endpointspec.UserDirectoryResponse, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}

	resp, err := endpointspec.SearchDirectory(ctx, matrixClient, term, limit)
	if err != nil {
		a.roomLogger.Err(err).Msg("user directory search failed")
		return nil, fmt.Errorf("zigzag: user search: %w", err)
	}

	a.roomLogger.Info().
		Int("hits", len(resp.Results)).
		Bool("limited", resp.Limited).
		Msg("user directory searched")

	return resp, nil
}

func (a *App) InviteUser(ctx context.Context, roomID, userID, reason string) error {
	return a.changeMembership(ctx, matrix.MembershipInvite, roomID, userID, reason)
}

func (a *App) JoinRoom(ctx context.Context, roomIDOrAlias string) error {
	matrixClient, err := a.readClient()
	if err != nil {
		return err
	}
	if roomIDOrAlias == "" {
		return errors.New("zigzag: join needs a room id or alias")
	}

	a.roomLogger.Info().Str("room", roomIDOrAlias).Msg("join requested by the frontend")
	if _, err := matrixClient.JoinRoom(ctx, roomIDOrAlias, nil); err != nil {
		a.roomLogger.Err(err).Str("room", roomIDOrAlias).Msg("join failed")
		return fmt.Errorf("zigzag: join %s: %w", roomIDOrAlias, err)
	}
	return nil
}

func (a *App) KickUser(ctx context.Context, roomID, userID, reason string) error {
	return a.changeMembership(ctx, matrix.MembershipKick, roomID, userID, reason)
}

func (a *App) BanUser(ctx context.Context, roomID, userID, reason string) error {
	return a.changeMembership(ctx, matrix.MembershipBan, roomID, userID, reason)
}

func (a *App) UnbanUser(ctx context.Context, roomID, userID string) error {
	return a.changeMembership(ctx, matrix.MembershipUnban, roomID, userID, "")
}

func (a *App) RoomStateEvent(ctx context.Context, roomID, eventType, stateKey string) (map[string]any, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	if roomID == "" {
		return nil, errors.New("zigzag: state read needs a room id")
	}
	if eventType == "" {
		return nil, errors.New("zigzag: state read needs an event type")
	}

	content := map[string]any{}

	if err := matrixClient.StateEvent(
		ctx,
		roomID,
		eventType,
		stateKey,
		&content,
	); err != nil {

		a.roomLogger.Debug().
			Str("room_id", roomID).
			Str("type", eventType).
			Str("state_key", stateKey).
			Str("error", err.Error()).
			Msg("state read failed")
		return nil, err
	}
	return content, nil
}

func (a *App) UserProfile(ctx context.Context, userID string) (map[string]any, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	if userID == "" {
		return nil, errors.New("zigzag: profile read needs a user id")
	}

	profile, err := endpointspec.FetchProfile(ctx, matrixClient, userID)

	if matrix.IsNotFound(err) {
		return map[string]any{}, nil
	}
	if err != nil {

		a.roomLogger.Debug().
			Str("user_id", userID).
			Str("error", err.Error()).
			Msg("profile read failed")
		return nil, err
	}
	return profile, nil
}

func (a *App) SetMyProfileField(ctx context.Context, field string, value any) error {
	matrixClient, err := a.readClient()
	if err != nil {
		return err
	}
	if field == "" {
		return errors.New("zigzag: profile write needs a field name")
	}

	cleared := value == nil
	if cleared {
		a.roomLogger.Info().Str("field", field).Msg("profile field cleared by the frontend")
	} else {
		a.roomLogger.Info().Str("field", field).Msg("profile field written by the frontend")
	}

	if err := endpointspec.SetProfileField(ctx, matrixClient, field, value); err != nil {
		a.roomLogger.Err(err).Str("field", field).Bool("cleared", cleared).Msg("profile field write failed")
		if cleared {
			return fmt.Errorf("zigzag: clear profile field %s: %w", field, err)
		}
		return fmt.Errorf("zigzag: set profile field %s: %w", field, err)
	}
	return nil
}

var membershipWords = map[matrix.Membership]struct{ verb, preposition string }{
	matrix.MembershipInvite: {"invite", "to"},
	matrix.MembershipKick:   {"kick", "from"},
	matrix.MembershipBan:    {"ban", "from"},
	matrix.MembershipUnban:  {"unban", "from"},
}

func (a *App) changeMembership(ctx context.Context, change matrix.Membership, roomID, userID, reason string) error {
	words := membershipWords[change]
	matrixClient, err := a.readClient()
	if err != nil {
		return err
	}
	if roomID == "" {
		return fmt.Errorf("zigzag: %s needs a room id", words.verb)
	}
	if userID == "" {
		return fmt.Errorf("zigzag: %s needs a user id", words.verb)
	}

	a.roomLogger.Info().Str("room_id", roomID).Str("user_id", userID).Msg(words.verb + " requested by the frontend")
	if err := matrixClient.ChangeMembership(ctx, change, roomID, userID, reason); err != nil {
		a.roomLogger.Err(err).Str("room_id", roomID).Str("user_id", userID).Msg(words.verb + " failed")
		return fmt.Errorf("zigzag: %s %s %s %s: %w", words.verb, userID, words.preposition, roomID, err)
	}
	return nil
}

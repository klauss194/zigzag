package app

import (
	"context"
	"sync"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
)

const maxPresenceAsks = 8

type TypingUpdate struct {
	Rooms map[string][]string `json:"rooms"`
}

func (a *App) EmitTyping(rooms map[string]jsontext.Value) {
	parsed := typingRooms(rooms)
	a.roomLogger.Info().Int("in_answer", len(rooms)).Interface("rooms", parsed).Msg("typing received from the server")
	if len(parsed) > 0 {
		a.EmitDirect(EventTyping, TypingUpdate{Rooms: parsed})
	}
}

func typingRooms(rooms map[string]jsontext.Value) map[string][]string {
	parsed := make(map[string][]string, len(rooms))
	for roomID, raw := range rooms {
		var event struct {
			Content struct {
				UserIDs []string `json:"user_ids"`
			} `json:"content"`
		}
		if err := jsonv2.Unmarshal(raw, &event); err != nil {
			continue
		}
		if event.Content.UserIDs == nil {
			event.Content.UserIDs = []string{}
		}
		parsed[roomID] = event.Content.UserIDs
	}
	return parsed
}

func (a *App) TypingNotice(ctx context.Context, roomID string, typing bool) error {
	matrixClient, err := a.readClient()
	if err != nil {
		return err
	}
	err = matrixClient.TypingNotice(ctx, roomID, typing)
	a.roomLogger.Info().Err(err).Str("room", roomID).Bool("typing", typing).Msg("typing notice (rust-sdk may throttle it)")
	return err
}

func (a *App) SetPresence(ctx context.Context, state string) error {
	matrixClient, err := a.readClient()
	if err != nil {
		return err
	}
	err = matrixClient.SetPresence(ctx, state)
	a.roomLogger.Info().Err(err).Str("state", state).Msg("presence set")
	return err
}

func (a *App) PresenceOf(ctx context.Context, userIDs []string) (map[string]string, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	var (
		mu      sync.Mutex
		wg      sync.WaitGroup
		answers = make(map[string]string, len(userIDs))
		failed  = 0
		lastErr error
		slots   = make(chan struct{}, maxPresenceAsks)
	)
	for _, userID := range userIDs {
		wg.Add(1)
		slots <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-slots }()
			state, err := matrixClient.Presence(ctx, userID)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				failed++
				lastErr = err
				return
			}
			answers[userID] = state
		}()
	}
	wg.Wait()
	a.roomLogger.Info().Int("asked", len(userIDs)).Int("failed", failed).AnErr("last_error", lastErr).Interface("answers", answers).Msg("presence read")
	return answers, nil
}

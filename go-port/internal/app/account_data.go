package app

import (
	"context"
	"errors"
	"fmt"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
)

func (a *App) AccountDataGet(ctx context.Context, eventType string) (map[string]any, error) {
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	if eventType == "" {
		return nil, errors.New("zigzag: account data read needs an event type")
	}

	raw, err := matrixClient.AccountData(ctx, eventType)
	if err != nil {
		return nil, fmt.Errorf("zigzag: read account data %s: %w", eventType, err)
	}
	if raw == nil {
		a.roomLogger.Debug().Str("type", eventType).Msg("account data unset")
		return nil, nil
	}
	var content map[string]any
	if err := jsonv2.Unmarshal(raw, &content); err != nil {
		return nil, fmt.Errorf("zigzag: read account data %s: %w", eventType, err)
	}
	return content, nil
}

func (a *App) AccountDataSet(ctx context.Context, eventType string, content jsontext.Value) error {
	matrixClient, err := a.readClient()
	if err != nil {
		return err
	}
	if eventType == "" {
		return errors.New("zigzag: account data write needs an event type")
	}
	if len(content) == 0 {
		return errors.New("zigzag: account data write needs content")
	}

	if err := matrixClient.SetAccountData(ctx, eventType, content); err != nil {
		a.roomLogger.Err(err).Str("type", eventType).Msg("account data write failed")
		return fmt.Errorf("zigzag: write account data %s: %w", eventType, err)
	}
	a.roomLogger.Info().Str("type", eventType).Int("content_bytes", len(content)).Msg("account data written")
	return nil
}

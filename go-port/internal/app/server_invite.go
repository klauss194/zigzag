package app

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/klauss/zigzag-go/internal/matrix"
)

type serverInviteAdmin interface {
	serverAdminCheck
	RegistrationTokens(ctx context.Context) ([]matrix.RegistrationToken, error)
	CreateRegistrationToken(ctx context.Context, expiryMS *int64) (matrix.RegistrationToken, error)
	DeleteRegistrationToken(ctx context.Context, token string) error
}

var _ serverInviteAdmin = (*matrix.Client)(nil)

func (a *App) CreateServerInvite(ctx context.Context, expiresInDays int) (matrix.RegistrationToken, error) {
	client, err := a.readClient()
	if err != nil {
		return matrix.RegistrationToken{}, err
	}
	return createServerInvite(ctx, client, time.Now(), expiresInDays)
}

func (a *App) ListServerInvites(ctx context.Context) ([]matrix.RegistrationToken, error) {
	client, err := a.readClient()
	if err != nil {
		return nil, err
	}
	return listServerInvites(ctx, client)
}

func (a *App) RevokeServerInvite(ctx context.Context, code string) error {
	client, err := a.readClient()
	if err != nil {
		return err
	}
	return revokeServerInvite(ctx, client, code)
}

func createServerInvite(ctx context.Context, admin serverInviteAdmin, now time.Time, expiresInDays int) (matrix.RegistrationToken, error) {
	if expiresInDays < 1 {
		return matrix.RegistrationToken{}, errors.New("zigzag: an invite code must expire in at least 1 day")
	}
	if err := requireServerAdmin(ctx, admin); err != nil {
		return matrix.RegistrationToken{}, err
	}
	expiry := now.Add(time.Duration(expiresInDays) * 24 * time.Hour).UnixMilli()
	created, err := admin.CreateRegistrationToken(ctx, &expiry)
	if err != nil {
		return matrix.RegistrationToken{}, fmt.Errorf("zigzag: create server invite: %w", err)
	}
	return created, nil
}

func listServerInvites(ctx context.Context, admin serverInviteAdmin) ([]matrix.RegistrationToken, error) {
	if err := requireServerAdmin(ctx, admin); err != nil {
		return nil, err
	}
	tokens, err := admin.RegistrationTokens(ctx)
	if err != nil {
		return nil, fmt.Errorf("zigzag: list server invites: %w", err)
	}

	if tokens == nil {
		tokens = []matrix.RegistrationToken{}
	}
	return tokens, nil
}

func revokeServerInvite(ctx context.Context, admin serverInviteAdmin, code string) error {
	if code == "" {
		return errors.New("zigzag: revoke server invite needs a code")
	}
	if err := requireServerAdmin(ctx, admin); err != nil {
		return err
	}
	err := admin.DeleteRegistrationToken(ctx, code)
	if err != nil && !matrix.IsNotFound(err) {
		return fmt.Errorf("zigzag: revoke server invite: %w", err)
	}
	return nil
}

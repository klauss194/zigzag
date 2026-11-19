package app

import (
	"context"
	"errors"
	"fmt"

	"github.com/klauss/zigzag-go/internal/matrix"
)

type serverAdminCheck interface {
	IsServerAdmin(ctx context.Context) (bool, error)
}

var _ serverAdminCheck = (*matrix.Client)(nil)

var ErrNotServerAdmin = errors.New("zigzag: not a server admin")

func (a *App) IsServerAdmin(ctx context.Context) (bool, error) {
	client, err := a.readClient()
	if err != nil {
		return false, err
	}
	return isServerAdmin(ctx, client)
}

func isServerAdmin(ctx context.Context, admin serverAdminCheck) (bool, error) {
	isAdmin, err := admin.IsServerAdmin(ctx)
	switch {
	case err == nil:
		return isAdmin, nil
	case matrix.IsErrCode(err, "M_FORBIDDEN"):
		return false, nil
	default:
		return false, fmt.Errorf("zigzag: server admin check: %w", err)
	}
}

func requireServerAdmin(ctx context.Context, admin serverAdminCheck) error {
	isAdmin, err := isServerAdmin(ctx, admin)
	if err != nil {
		return err
	}
	if !isAdmin {
		return ErrNotServerAdmin
	}
	return nil
}

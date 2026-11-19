package app

import (
	"context"
	"errors"
	"fmt"

	"github.com/klauss/zigzag-go/internal/matrix"
	matrixid "github.com/klauss/zigzag-go/internal/matrix/id"
)

var (
	errDeleteSelf   = errors.New("zigzag: you can't delete your own account")
	errDeleteAdmin  = errors.New("zigzag: a server admin's account can't be deleted here")
	errDeleteSystem = errors.New("zigzag: the server's system account can't be deleted")
)

type serverMemberAdmin interface {
	serverAdminCheck
	UserID() string
	IsUserServerAdmin(ctx context.Context, userID string) (bool, error)
	ServerUsers(ctx context.Context) ([]matrix.ServerUser, error)
	DeactivateUser(ctx context.Context, userID string) error
}

var _ serverMemberAdmin = (*matrix.Client)(nil)

func (a *App) ListServerMembers(ctx context.Context) ([]matrix.ServerUser, error) {
	client, err := a.readClient()
	if err != nil {
		return nil, err
	}
	return listServerMembers(ctx, client)
}

func listServerMembers(ctx context.Context, admin serverMemberAdmin) ([]matrix.ServerUser, error) {
	if err := requireServerAdmin(ctx, admin); err != nil {
		return nil, err
	}
	users, err := admin.ServerUsers(ctx)
	if err != nil {
		return nil, fmt.Errorf("zigzag: list server members: %w", err)
	}

	if users == nil {
		users = []matrix.ServerUser{}
	}
	return users, nil
}

func (a *App) DeleteServerMember(ctx context.Context, userID string) error {
	client, err := a.readClient()
	if err != nil {
		return err
	}
	return deleteServerMember(ctx, client, userID)
}

func deleteServerMember(ctx context.Context, admin serverMemberAdmin, userID string) error {
	switch {
	case userID == "":
		return errors.New("zigzag: delete server member needs a user id")
	case userID == admin.UserID():
		return errDeleteSelf
	case matrixid.UserID(userID).Localpart() == SystemAccountLocalpart:
		return errDeleteSystem
	}
	if err := requireServerAdmin(ctx, admin); err != nil {
		return err
	}

	targetIsAdmin, err := admin.IsUserServerAdmin(ctx, userID)
	if err != nil {
		return fmt.Errorf("zigzag: delete server member: %w", err)
	}
	if targetIsAdmin {
		return errDeleteAdmin
	}

	if err := admin.DeactivateUser(ctx, userID); err != nil && !matrix.IsNotFound(err) {
		return fmt.Errorf("zigzag: delete server member: %w", err)
	}
	return nil
}

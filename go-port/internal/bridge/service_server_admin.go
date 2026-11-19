package bridge

import (
	"context"
	"time"

	"github.com/klauss/zigzag-go/internal/matrix"
)

func (s *Service) IsServerAdmin(ctx context.Context) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.core.IsServerAdmin(ctx)
}

func (s *Service) ListServerMembers(ctx context.Context) ([]matrix.ServerUser, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.core.ListServerMembers(ctx)
}

func (s *Service) DeleteServerMember(ctx context.Context, userID string) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	return s.core.DeleteServerMember(ctx, userID)
}

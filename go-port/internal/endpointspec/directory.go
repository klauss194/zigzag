package endpointspec

import (
	"context"
	"net/http"

	"github.com/klauss/zigzag-go/internal/matrix"
)

const (
	defaultDirectoryLimit = 20
	maxDirectoryLimit     = 100
)

type UserDirectoryRequest struct {
	SearchTerm string `json:"search_term"`
	Limit      int    `json:"limit,omitzero"`
}

type UserDirectoryEntry struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name,omitempty"`
	AvatarURL   string `json:"avatar_url,omitempty"`
}

type UserDirectoryResponse struct {
	Results []UserDirectoryEntry `json:"results"`

	Limited bool `json:"limited"`
}

var searchUserDirectory = Endpoint[UserDirectoryRequest, UserDirectoryResponse]{
	Name:   "user_directory/search",
	Method: http.MethodPost,
	Path: func(UserDirectoryRequest) []string {
		return []string{"v3", "user_directory", "search"}
	},
	Body: func(req UserDirectoryRequest) any { return req },
}

func SearchDirectory(ctx context.Context, client *matrix.Client, term string, limit int) (*UserDirectoryResponse, error) {
	if term == "" {
		return &UserDirectoryResponse{Results: []UserDirectoryEntry{}}, nil
	}
	return searchUserDirectory.Do(ctx, client, UserDirectoryRequest{
		SearchTerm: term,
		Limit:      clampDirectoryLimit(limit),
	})
}

func clampDirectoryLimit(limit int) int {
	if limit <= 0 {
		return defaultDirectoryLimit
	}
	if limit > maxDirectoryLimit {
		return maxDirectoryLimit
	}
	return limit
}

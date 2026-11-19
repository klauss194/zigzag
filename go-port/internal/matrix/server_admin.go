package matrix

import (
	"context"
	"errors"
	"net/http"
)

func (c *Client) IsServerAdmin(ctx context.Context) (bool, error) {
	return c.IsUserServerAdmin(ctx, c.UserID())
}

func (c *Client) IsUserServerAdmin(ctx context.Context, userID string) (bool, error) {
	var resp struct {
		Admin *bool `json:"admin"`
	}
	if err := c.Do(ctx, http.MethodGet, c.adminURL("v1", "users", userID, "admin"), nil, nil, &resp); err != nil {
		return false, err
	}
	if resp.Admin == nil {
		return false, errors.New("matrix: server admin check: the answer does not say")
	}
	return *resp.Admin, nil
}

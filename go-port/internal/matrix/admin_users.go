package matrix

import (
	"context"
	"errors"
	"net/http"
	"net/url"
)

type ServerUser struct {
	UserID      string `json:"name"`
	DisplayName string `json:"displayname"`
	Admin       bool   `json:"admin"`
	Guest       bool   `json:"is_guest"`
}

func (c *Client) ServerUsers(ctx context.Context) ([]ServerUser, error) {
	var all []ServerUser
	from := "0"
	for {
		var page struct {
			Users     *[]ServerUser `json:"users"`
			NextToken string        `json:"next_token"`
		}
		if err := c.Do(ctx, http.MethodGet, c.adminURL("v2", "users"), url.Values{"from": {from}}, nil, &page); err != nil {
			return nil, err
		}
		if page.Users == nil {
			return nil, errors.New("matrix: server users: the answer has no list")
		}
		all = append(all, *page.Users...)

		if page.NextToken == "" || page.NextToken == from {
			return all, nil
		}
		from = page.NextToken
	}
}

func (c *Client) DeactivateUser(ctx context.Context, userID string) error {
	return c.Do(ctx, http.MethodPost, c.adminURL("v1", "deactivate", userID), nil, nil, nil)
}

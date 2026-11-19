package matrix

import (
	"context"
	"net/http"
	"net/url"
)

type RegistrationToken struct {
	Token string `json:"token"`

	ExpiryTime *int64 `json:"expiry_time"`
}

func (c *Client) RegistrationTokens(ctx context.Context) ([]RegistrationToken, error) {
	var resp struct {
		RegistrationTokens []RegistrationToken `json:"registration_tokens"`
	}
	onlyValid := url.Values{"valid": {"true"}}
	if err := c.Do(ctx, http.MethodGet, c.adminURL("v1", "registration_tokens"), onlyValid, nil, &resp); err != nil {
		return nil, err
	}
	return resp.RegistrationTokens, nil
}

func (c *Client) CreateRegistrationToken(ctx context.Context, expiryMS *int64) (RegistrationToken, error) {
	body := struct {
		ExpiryTime *int64 `json:"expiry_time,omitzero"`
	}{expiryMS}
	var created RegistrationToken
	err := c.Do(ctx, http.MethodPost, c.adminURL("v1", "registration_tokens", "new"), nil, body, &created)
	return created, err
}

func (c *Client) DeleteRegistrationToken(ctx context.Context, token string) error {
	return c.Do(ctx, http.MethodDelete, c.adminURL("v1", "registration_tokens", token), nil, nil, nil)
}

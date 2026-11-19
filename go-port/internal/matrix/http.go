package matrix

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
)

func (c *Client) StateEvent(ctx context.Context, roomID, eventType, stateKey string, out any) error {
	return c.Do(ctx, http.MethodGet, c.ClientURL("v3", "rooms", roomID, "state", eventType, stateKey), nil, nil, out)
}

func (c *Client) PutStateHTTP(ctx context.Context, roomID, eventType, stateKey string, content []byte) (string, error) {
	var resp struct {
		EventID string `json:"event_id"`
	}
	err := c.Do(ctx, http.MethodPut, c.ClientURL("v3", "rooms", roomID, "state", eventType, stateKey), nil, jsontext.Value(content), &resp)
	return resp.EventID, err
}

type StateEntry struct {
	Type           string         `json:"type"`
	StateKey       *string        `json:"state_key"`
	Sender         string         `json:"sender"`
	EventID        string         `json:"event_id"`
	OriginServerTS int64          `json:"origin_server_ts"`
	Content        jsontext.Value `json:"content"`
}

func (c *Client) RoomState(ctx context.Context, roomID string) ([]StateEntry, error) {
	var events []StateEntry
	if err := c.Do(ctx, http.MethodGet, c.ClientURL("v3", "rooms", roomID, "state"), nil, nil, &events); err != nil {
		return nil, err
	}
	return events, nil
}

func (c *Client) JoinedRooms(ctx context.Context) ([]string, error) {
	var resp struct {
		JoinedRooms []string `json:"joined_rooms"`
	}
	if err := c.Do(ctx, http.MethodGet, c.ClientURL("v3", "joined_rooms"), nil, nil, &resp); err != nil {
		return nil, err
	}
	return resp.JoinedRooms, nil
}

func (c *Client) LeaveRoom(ctx context.Context, roomID, reason string) error {
	body := map[string]any{}
	if reason != "" {
		body["reason"] = reason
	}
	return c.Do(ctx, http.MethodPost, c.ClientURL("v3", "rooms", roomID, "leave"), nil, body, nil)
}

func (c *Client) ForgetRoom(ctx context.Context, roomID string) error {
	err := c.Do(ctx, http.MethodPost, c.ClientURL("v3", "rooms", roomID, "forget"), nil, struct{}{}, nil)
	if c.core == nil || (err != nil && !IsErrCode(err, "M_NOT_FOUND")) {
		return err
	}
	if localErr := c.forgetLocally(ctx, roomID); localErr != nil {
		return errors.Join(err, localErr)
	}
	return err
}

type OpenIDToken struct {
	AccessToken      string `json:"access_token"`
	TokenType        string `json:"token_type"`
	MatrixServerName string `json:"matrix_server_name"`
	ExpiresIn        int64  `json:"expires_in"`
}

func (c *Client) RequestOpenIDToken(ctx context.Context) (*OpenIDToken, error) {
	var token OpenIDToken
	err := c.Do(ctx, http.MethodPost, c.ClientURL("v3", "user", c.session.UserID, "openid", "request_token"), nil, struct{}{}, &token)
	if err != nil {
		return nil, err
	}
	return &token, nil
}

func (c *Client) MediaUploadSize(ctx context.Context) (int64, error) {
	var config struct {
		UploadSize int64 `json:"m.upload.size"`
	}
	if err := c.Do(ctx, http.MethodGet, c.ClientURL("v1", "media", "config"), nil, nil, &config); err != nil {
		return 0, err
	}
	return config.UploadSize, nil
}

func (c *Client) Upload(ctx context.Context, body io.Reader, size int64, contentType string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.MediaURL("v3", "upload"), io.LimitReader(body, size))
	if err != nil {
		return "", err
	}
	req.ContentLength = size
	req.Header.Set("Content-Type", contentType)
	resp, err := c.Send(req, true)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var uploaded struct {
		ContentURI string `json:"content_uri"`
	}
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", &Error{Transport: true, Message: err.Error()}
	}
	if err := jsonv2.Unmarshal(payload, &uploaded); err != nil || uploaded.ContentURI == "" {
		return "", fmt.Errorf("matrix: upload: no content_uri in %q", payload)
	}
	return uploaded.ContentURI, nil
}

func (c *Client) Download(ctx context.Context, mxcURI string) (io.ReadCloser, error) {
	server, mediaID, err := ParseContentURI(mxcURI)
	if err != nil {
		return nil, err
	}
	return c.DownloadMedia(ctx, server, mediaID)
}

func (c *Client) DownloadMedia(ctx context.Context, server, mediaID string) (io.ReadCloser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.ClientURL("v1", "media", "download", server, mediaID), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.Send(req, true)
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}

func ParseContentURI(uri string) (server, mediaID string, err error) {
	rest, ok := strings.CutPrefix(uri, "mxc://")
	if !ok {
		return "", "", fmt.Errorf("matrix: %q is not an mxc:// URI", uri)
	}
	server, mediaID, ok = strings.Cut(rest, "/")
	if !ok || server == "" || mediaID == "" || strings.Contains(mediaID, "/") {
		return "", "", fmt.Errorf("matrix: %q is not an mxc://server/media URI", uri)
	}
	return server, mediaID, nil
}

func ErrTooLarge(err error) bool {
	return IsErrCode(err, "M_TOO_LARGE") || IsStatus(err, http.StatusRequestEntityTooLarge)
}

func IsRateLimited(err error) bool {
	return IsErrCode(err, "M_LIMIT_EXCEEDED") || IsStatus(err, http.StatusTooManyRequests)
}

var errNoSender = errors.New("matrix: no way to send an event on this client")

package matrix

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	jsonv2 "github.com/go-json-experiment/json"

	"github.com/klauss/zigzag-go/internal/rustcore"
)

type Session struct {
	HomeserverURL string
	UserID        string
	DeviceID      string
	AccessToken   string
}

type StoreConfig struct {
	Dir string

	Passphrase string
}

func (s StoreConfig) core() rustcore.StoreConfig {
	var passphrase *string
	if s.Passphrase != "" {
		p := s.Passphrase
		passphrase = &p
	}
	return rustcore.StoreConfig{Path: s.Dir, Passphrase: passphrase}
}

type Client struct {
	core    *rustcore.Core
	closed  atomic.Bool
	session Session

	api      *http.Client
	transfer *http.Client

	unencrypted func(ctx context.Context, roomID string) error
}

const EnvRustLog = "ZIGZAG_RUST_LOG"

var rustLogOnce sync.Once

func enableRustLog() {
	rustLogOnce.Do(func() {
		filter := os.Getenv(EnvRustLog)
		if filter == "" {
			return
		}
		if problem := rustcore.EnableTracing(filter); problem != nil {
			fmt.Fprintf(os.Stderr, "matrix: %s: %s\n", EnvRustLog, *problem)
		}
	})
}

func SQLiteVersion() (runtime, bundled string) {
	version := rustcore.CoreSqliteVersion()
	return version.Runtime, version.Bundled
}

func Login(ctx context.Context, store StoreConfig, server, username, password, deviceDisplayName string) (*Client, error) {
	return openNewDevice(ctx, func() (*rustcore.Core, error) {
		return rustcore.LoginPassword(store.core(), server, username, password, deviceDisplayName)
	})
}

func Register(ctx context.Context, store StoreConfig, server, username, password, token, deviceDisplayName string) (*Client, error) {
	return openNewDevice(ctx, func() (*rustcore.Core, error) {
		return rustcore.RegisterWithToken(store.core(), server, username, password, token, deviceDisplayName)
	})
}

func openNewDevice(ctx context.Context, open func() (*rustcore.Core, error)) (*Client, error) {
	enableRustLog()
	done := make(chan loginResult, 1)
	go func() {
		var core *rustcore.Core
		var err error
		func() {
			defer recoverClosed(&err)
			core, err = open()
		}()
		done <- loginResult{core, FromCore(err)}
	}()
	select {
	case landed := <-done:
		if landed.err != nil {
			return nil, landed.err
		}
		return newClient(landed.core)
	case <-ctx.Done():
		go signOutAbandonedLogin(done)
		return nil, ctx.Err()
	}
}

type loginResult struct {
	core *rustcore.Core
	err  error
}

func signOutAbandonedLogin(done <-chan loginResult) {
	landed := <-done
	if landed.err != nil || landed.core == nil {
		return
	}
	client, err := newClient(landed.core)
	if err != nil {
		return
	}
	logoutCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	_ = client.Logout(logoutCtx)
	cancel()
	client.Close()
}

func Restore(ctx context.Context, store StoreConfig, session Session) (*Client, error) {
	enableRustLog()
	core, err := await(ctx, func() (*rustcore.Core, error) {
		return rustcore.RestoreSession(store.core(), rustcore.SessionData{
			HomeserverUrl: session.HomeserverURL,
			UserId:        session.UserID,
			DeviceId:      session.DeviceID,
			AccessToken:   session.AccessToken,
		})
	})
	if err != nil {
		return nil, err
	}
	return newClient(core)
}

func newClient(core *rustcore.Core) (*Client, error) {
	data := core.Session()
	if data == nil {
		core.Destroy()
		return nil, errors.New("matrix: the core has no session")
	}
	transport := newTransport()
	return &Client{
		core: core,
		session: Session{
			HomeserverURL: strings.TrimSuffix(data.HomeserverUrl, "/"),
			UserID:        data.UserId,
			DeviceID:      data.DeviceId,
			AccessToken:   data.AccessToken,
		},
		api:      &http.Client{Transport: transport, Timeout: 2 * time.Minute},
		transfer: &http.Client{Transport: transport},
	}, nil
}

func NewHTTPOnly(session Session) *Client {
	transport := newTransport()
	session.HomeserverURL = strings.TrimSuffix(session.HomeserverURL, "/")
	return &Client{
		session:  session,
		api:      &http.Client{Transport: transport, Timeout: 2 * time.Minute},
		transfer: &http.Client{Transport: transport},
	}
}

func NewHTTPOnlyWith(session Session, api, transfer *http.Client) *Client {
	if transfer == nil {
		transfer = api
	}
	session.HomeserverURL = strings.TrimSuffix(session.HomeserverURL, "/")
	return &Client{session: session, api: api, transfer: transfer}
}

func (c *Client) Session() Session { return c.session }

func (c *Client) UserID() string { return c.session.UserID }

func (c *Client) DeviceID() string { return c.session.DeviceID }

func (c *Client) HomeserverURL() string { return c.session.HomeserverURL }

func (c *Client) AccessToken() string { return c.session.AccessToken }

func (c *Client) Core() *rustcore.Core {
	if c.closed.Load() {
		return nil
	}
	return c.core
}

var ErrClosed = errors.New("matrix: the session is closed")

func (c *Client) CoreCall(fn func(core *rustcore.Core) error) (err error) {
	if c.core == nil {
		return ErrNoCore
	}
	if c.closed.Load() {
		return ErrClosed
	}
	defer recoverClosed(&err)
	return fn(c.core)
}

func recoverClosed(err *error) {
	recovered := recover()
	if recovered == nil {
		return
	}
	if failure, ok := recovered.(error); ok && strings.Contains(failure.Error(), "has already been destroyed") {
		*err = ErrClosed
		return
	}
	panic(recovered)
}

func (c *Client) Logout(ctx context.Context) error {
	if c.core == nil {
		return c.Do(ctx, http.MethodPost, c.ClientURL("v3", "logout"), nil, struct{}{}, nil)
	}
	_, err := await(ctx, func() (struct{}, error) { return struct{}{}, c.core.Logout() })
	return err
}

const releaseWait = 5 * time.Second

func (c *Client) Close() {
	if c.core != nil && c.closed.CompareAndSwap(false, true) {
		release := c.core.Release()
		defer release.Destroy()
		c.core.SyncStop()
		c.core.Destroy()
		release.Wait(uint64(releaseWait.Milliseconds()))
	}
}

func (c *Client) ClientURL(segments ...string) string {
	return c.urlUnder("/_matrix/client", segments)
}

func (c *Client) MediaURL(segments ...string) string {
	return c.urlUnder("/_matrix/media", segments)
}

func (c *Client) adminURL(version string, segments ...string) string {
	return c.urlUnder("/_synapse/admin/"+version, segments)
}

func (c *Client) urlUnder(prefix string, segments []string) string {
	var b strings.Builder
	b.WriteString(c.session.HomeserverURL)
	b.WriteString(prefix)
	for _, segment := range segments {
		b.WriteByte('/')
		b.WriteString(url.PathEscape(segment))
	}
	return b.String()
}

func WithQuery(rawURL string, query url.Values) string {
	if len(query) == 0 {
		return rawURL
	}
	return rawURL + "?" + query.Encode()
}

func (c *Client) Do(ctx context.Context, method, fullURL string, query url.Values, reqBody, respBody any) error {
	var body io.Reader
	if reqBody != nil {
		encoded, err := jsonv2.Marshal(reqBody)
		if err != nil {
			return fmt.Errorf("matrix: encode request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, WithQuery(fullURL, query), body)
	if err != nil {
		return err
	}
	if reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.Send(req, false)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return &Error{Transport: true, Message: err.Error()}
	}
	if respBody == nil || len(payload) == 0 {
		return nil
	}
	if err := jsonv2.Unmarshal(payload, respBody); err != nil {
		return fmt.Errorf("matrix: decode %s: %w", req.URL.Path, err)
	}
	return nil
}

func (c *Client) Send(req *http.Request, transfer bool) (*http.Response, error) {
	if c.session.AccessToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.session.AccessToken)
	}
	httpClient := c.api
	if transfer {
		httpClient = c.transfer
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		if ctxErr := req.Context().Err(); ctxErr != nil {
			return nil, ctxErr
		}
		return nil, &Error{Transport: true, Message: err.Error(), Cause: err}
	}
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return resp, nil
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	apiErr := newAPIError(resp.StatusCode, payload)
	apiErr.Header = resp.Header
	return nil, apiErr
}

func await[T any](ctx context.Context, call func() (T, error)) (T, error) {
	type result struct {
		value T
		err   error
	}
	done := make(chan result, 1)
	go func() {
		var value T
		var err error
		func() {
			defer recoverClosed(&err)
			value, err = call()
		}()
		done <- result{value, FromCore(err)}
	}()
	select {
	case r := <-done:
		return r.value, r.err
	case <-ctx.Done():
		var zero T
		return zero, ctx.Err()
	}
}

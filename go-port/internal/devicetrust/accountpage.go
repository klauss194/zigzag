package devicetrust

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"sync"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/matrix"
)

type accountManagementAction string

const (
	actionSessionsList        accountManagementAction = "org.matrix.sessions_list"
	actionDevicesList         accountManagementAction = "org.matrix.devices_list"
	actionSessionEnd          accountManagementAction = "org.matrix.session_end"
	actionDeviceDelete        accountManagementAction = "org.matrix.device_delete"
	actionCrossSigningReset   accountManagementAction = "org.matrix.cross_signing_reset"
	uiaStageOAuth                                     = "m.oauth"
	uiaStageCrossSigningReset                         = "org.matrix.cross_signing_reset"
)

type serverMetadata struct {
	Issuer                            string                    `json:"issuer"`
	AccountManagementURI              string                    `json:"account_management_uri"`
	AccountManagementActionsSupported []accountManagementAction `json:"account_management_actions_supported"`
}

type accountPage struct {
	base    string
	actions map[accountManagementAction]bool
}

func (p *accountPage) url(deviceID string, actions ...accountManagementAction) string {
	if p == nil || p.base == "" {
		return ""
	}
	parsed, err := url.Parse(p.base)
	if err != nil {
		return ""
	}
	for _, action := range actions {
		if !p.actions[action] {
			continue
		}
		query := parsed.Query()
		query.Set("action", string(action))
		if deviceID != "" {
			query.Set("device_id", deviceID)
		}
		parsed.RawQuery = query.Encode()
		break
	}
	return parsed.String()
}

func (p *accountPage) sessionsURL() string {
	return p.url("", actionSessionsList, actionDevicesList)
}

func (p *accountPage) endSessionURL(deviceID string) string {
	return p.url(deviceID, actionSessionEnd, actionDeviceDelete)
}

func (p *accountPage) crossSigningResetURL() string {
	return p.url("", actionCrossSigningReset)
}

func safeExternalURL(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return ""
	}
	return parsed.String()
}

func discoverAccountPage(ctx context.Context, client *matrix.Client) (page *accountPage, known bool) {
	paths := []string{
		client.ClientURL("v1", "auth_metadata"),
		client.ClientURL("unstable", "org.matrix.msc2965", "auth_metadata"),
	}
	for _, path := range paths {
		var meta serverMetadata
		err := client.Do(ctx, http.MethodGet, path, nil, nil, &meta)
		if err == nil {

			if meta.Issuer == "" && meta.AccountManagementURI == "" {
				return nil, true
			}
			page := &accountPage{
				base:    safeExternalURL(meta.AccountManagementURI),
				actions: make(map[accountManagementAction]bool, len(meta.AccountManagementActionsSupported)),
			}
			for _, action := range meta.AccountManagementActionsSupported {
				page.actions[action] = true
			}
			return page, true
		}
		if !isClientError(err) {
			return nil, false
		}
	}
	return nil, true
}

func isClientError(err error) bool {
	matrixErr, ok := matrix.AsError(err)
	return ok && matrixErr.StatusCode >= 400 && matrixErr.StatusCode < 500
}

type accountPages struct {
	mu sync.Mutex

	page     *accountPage
	known    bool
	resetURL string
}

func (c *accountPages) get(ctx context.Context, client *matrix.Client, log zerolog.Logger) *accountPage {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.known {
		return c.page
	}
	page, known := discoverAccountPage(ctx, client)
	if known {
		c.page, c.known = page, true
		if page != nil {
			log.Info().Str("account_page", page.base).Msg("logins are run by an OAuth server; sessions and trust resets go through its account page")
		}
	} else {
		log.Warn().Msg("could not tell whether an OAuth server runs this account's logins; asking again next time")
	}
	return page
}

func (c *accountPages) setResetURL(approval string) {
	c.mu.Lock()
	c.resetURL = approval
	c.mu.Unlock()
}

func (c *accountPages) lastResetURL() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.resetURL
}

func (m *Manager) accountPage(ctx context.Context) *accountPage {
	return m.pages.get(ctx, m.client, m.log)
}

func approvalURL(challenge []byte) string {
	var body struct {
		Params map[string]jsontext.Value `json:"params"`
	}
	if jsonv2.Unmarshal(challenge, &body) != nil {
		return ""
	}
	for _, stage := range []string{uiaStageOAuth, uiaStageCrossSigningReset} {
		var params struct {
			URL string `json:"url"`
		}
		raw, ok := body.Params[stage]
		if !ok || jsonv2.Unmarshal(raw, &params) != nil {
			continue
		}
		if safe := safeExternalURL(params.URL); safe != "" {
			return safe
		}
	}
	return ""
}

func (m *Manager) setResetURL(approval string) {
	m.pages.setResetURL(approval)
}

func (m *Manager) describeAccountPage(ctx context.Context, status *Status) {
	page := m.accountPage(ctx)
	if page == nil {
		return
	}

	status.Delegated = true
	status.AccountURL = page.sessionsURL()
	status.ResetURL = m.pages.lastResetURL()
	if status.ResetURL == "" {
		status.ResetURL = page.crossSigningResetURL()
	}
	for index := range status.Devices {
		if !status.Devices[index].IsSelf {
			status.Devices[index].SignOutURL = page.endSessionURL(status.Devices[index].DeviceID)
		}
	}
}

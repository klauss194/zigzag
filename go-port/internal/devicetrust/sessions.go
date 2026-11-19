package devicetrust

import (
	"context"
	"fmt"
	"net/http"

	"github.com/klauss/zigzag-go/internal/matrix"
)

type session struct {
	DeviceID    string `json:"device_id"`
	DisplayName string `json:"display_name"`
	LastSeenIP  string `json:"last_seen_ip"`
	LastSeenTS  int64  `json:"last_seen_ts"`
}

func (m *Manager) listSessions(ctx context.Context) ([]session, error) {
	var response struct {
		Devices []session `json:"devices"`
	}
	if err := m.client.Do(ctx, http.MethodGet, m.client.ClientURL("v3", "devices"), nil, nil, &response); err != nil {
		return nil, fmt.Errorf("devicetrust: list sessions: %w", err)
	}
	return response.Devices, nil
}

func (m *Manager) otherSessions(ctx context.Context) ([]string, error) {
	sessions, err := m.listSessions(ctx)
	if err != nil {
		return nil, err
	}
	others := make([]string, 0, len(sessions))
	for _, session := range sessions {
		if session.DeviceID != m.client.DeviceID() {
			others = append(others, session.DeviceID)
		}
	}
	return others, nil
}

func (m *Manager) signOutOthers(ctx context.Context, password string) error {
	others, err := m.otherSessions(ctx)
	if err != nil {
		return err
	}
	if len(others) == 0 {
		m.log.Debug().Msg("no other sessions to sign out")
		return nil
	}
	m.log.Info().Int("sessions", len(others)).Msg("signing out every other session")
	return deleteDevices(ctx, m.client, others, password)
}

func (m *Manager) SignOut(ctx context.Context, deviceIDs []string, password string) (*Status, error) {
	targets := make([]string, 0, len(deviceIDs))
	for _, deviceID := range deviceIDs {
		if deviceID == "" {
			continue
		}
		if deviceID == m.client.DeviceID() {
			return nil, ErrCannotSignOutSelf
		}
		targets = append(targets, deviceID)
	}
	if len(targets) == 0 {

		return m.Status(ctx)
	}

	if m.accountPage(ctx) != nil {
		m.log.Info().Int("sessions", len(targets)).Msg("sessions are ended from the account page on this server")
		return nil, ErrSignOutAtAccountPage
	}

	if err := deleteDevices(ctx, m.client, targets, password); err != nil {
		m.log.Warn().Err(err).Int("sessions", len(targets)).Msg("signing sessions out failed")
		if isUnrecognized(err) {
			return nil, fmt.Errorf("%w (%v)", ErrSignOutAtAccountPage, err)
		}
		return nil, err
	}
	m.log.Info().Int("sessions", len(targets)).Msg("signed out other sessions")
	return m.Status(ctx)
}

func deleteDevices(ctx context.Context, client *matrix.Client, devices []string, password string) error {
	url := client.ClientURL("v3", "delete_devices")
	request := map[string]any{"devices": devices}

	err := client.Do(ctx, http.MethodPost, url, nil, request, nil)
	if !matrix.IsStatus(err, http.StatusUnauthorized) || matrix.IsErrCode(err, "M_UNKNOWN_TOKEN") {
		return uiaError(err, false)
	}
	challenge, _ := matrix.AsError(err)
	var session string
	if !challenge.Field("session", &session) {
		return fmt.Errorf("devicetrust: read the auth challenge: no session in %s", challenge.Body)
	}
	auth := passwordAuth(client.UserID(), password, session)
	if auth == nil {
		return ErrPasswordRequired
	}

	request["auth"] = auth
	err = client.Do(ctx, http.MethodPost, url, nil, request, nil)

	return uiaError(err, true)
}

func isUnrecognized(err error) bool {
	return matrix.IsStatus(err, http.StatusNotFound)
}

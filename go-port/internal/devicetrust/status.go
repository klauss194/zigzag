package devicetrust

import (
	"context"
	"fmt"

	"github.com/klauss/zigzag-go/internal/matrix"
)

type Device struct {
	DeviceID    string `json:"deviceId"`
	DisplayName string `json:"displayName"`
	Verified    bool   `json:"verified"`
	IsSelf      bool   `json:"isSelf"`
	LastSeenIP  string `json:"lastSeenIp"`
	LastSeenTS  int64  `json:"lastSeenTs"`

	SignOutURL string `json:"signOutUrl,omitempty"`
}

type Status struct {
	Enabled  bool     `json:"enabled"`
	IsAnchor bool     `json:"isAnchor"`
	Devices  []Device `json:"devices"`

	Delegated bool `json:"delegated,omitempty"`

	AccountURL string `json:"accountUrl,omitempty"`

	ResetURL string `json:"resetUrl,omitempty"`

	publishedKeys map[string]bool
}

func (m *Manager) Status(ctx context.Context) (*Status, error) {

	if err := m.ensureSeeds(ctx); err != nil {
		m.log.Warn().Err(err).Msg("stored seeds are still unconfirmed")
	}

	sessions, err := m.listSessions(ctx)
	if err != nil {
		return nil, err
	}
	trust, err := m.crypto.OwnTrust(ctx, true)
	if err != nil {
		return nil, fmt.Errorf("devicetrust: read cross-signing trust: %w", err)
	}
	published, err := m.publishedMasterKey(ctx)
	if err != nil {
		return nil, err
	}

	status := &Status{
		Enabled:       published != "",
		IsAnchor:      m.holdsPublishedAnchor(trust, published),
		Devices:       make([]Device, 0, len(sessions)),
		publishedKeys: make(map[string]bool, len(trust.Verified)),
	}
	for deviceID := range trust.Verified {
		status.publishedKeys[deviceID] = true
	}

	signaturesCount := trust.IdentityMasterKey == published
	if !signaturesCount {
		m.log.Warn().
			Str("identity_master_key", trust.IdentityMasterKey).
			Str("published_master_key", published).
			Msg("rust-sdk's identity of the account is not the published one; no device counts as verified")
	}
	for _, session := range sessions {
		status.Devices = append(status.Devices, Device{
			DeviceID:    session.DeviceID,
			DisplayName: session.DisplayName,
			IsSelf:      session.DeviceID == m.client.DeviceID(),
			LastSeenIP:  session.LastSeenIP,
			LastSeenTS:  session.LastSeenTS,
			Verified:    signaturesCount && trust.Verified[session.DeviceID],
		})
	}

	m.describeAccountPage(ctx, status)

	if status.IsAnchor {
		m.KeepSeeds(ctx)
	}

	m.log.Debug().
		Bool("enabled", status.Enabled).
		Bool("is_anchor", status.IsAnchor).
		Int("sessions", len(status.Devices)).
		Int("verified", status.verifiedCount()).
		Msg("device status")
	return status, nil
}

func (m *Manager) holdsPublishedAnchor(trust *matrix.OwnTrust, published string) bool {
	held := trust.HeldMasterKey
	if held != "" && trust.HoldsAllKeys {
		switch {
		case published == "":
			m.log.Warn().Str("held_master_key", held).Msg("this device holds cross-signing keys but the account publishes none")
		case published != held:
			m.log.Warn().
				Str("held_master_key", held).
				Str("published_master_key", published).
				Msg("the keys on this device are not the account's; trust was reset elsewhere, or they never went up")
		}
	}
	return heldKeysArePublished(trust, published)
}

func heldKeysArePublished(trust *matrix.OwnTrust, published string) bool {
	return trust != nil && trust.HoldsAllKeys && trust.HeldMasterKey != "" &&
		published != "" && trust.HeldMasterKey == published
}

func (s *Status) verifiedCount() int {
	count := 0
	for _, device := range s.Devices {
		if device.Verified {
			count++
		}
	}
	return count
}

func (s *Status) listsOther(deviceID string) bool {
	for _, device := range s.Devices {
		if device.DeviceID == deviceID {
			return !device.IsSelf
		}
	}
	return false
}

const maxVerifiedDevices = 3

func (s *Status) overVerifiedCap(deviceID string) bool {
	alreadyVerified := false
	for _, device := range s.Devices {
		if device.Verified && device.DeviceID == deviceID {
			alreadyVerified = true
		}
	}
	return s.verifiedCount() >= maxVerifiedDevices && !alreadyVerified
}

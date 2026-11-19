package devicetrust

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"time"

	jsonv2 "github.com/go-json-experiment/json"

	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/platform"
)

type Seeds struct {
	MasterKey      []byte
	SelfSigningKey []byte
	UserSigningKey []byte
}

type seedsJSON struct {
	MasterKey      string `json:"m.cross_signing.master"`
	SelfSigningKey string `json:"m.cross_signing.self_signing"`
	UserSigningKey string `json:"m.cross_signing.user_signing"`
}

func (s Seeds) MarshalJSON() ([]byte, error) {
	master, selfSigning, userSigning := s.encode(base64.RawURLEncoding)
	return jsonv2.Marshal(seedsJSON{MasterKey: master, SelfSigningKey: selfSigning, UserSigningKey: userSigning})
}

func (s *Seeds) UnmarshalJSON(data []byte) error {
	var wire seedsJSON
	if err := jsonv2.Unmarshal(data, &wire); err != nil {
		return err
	}
	decoded, err := decodeSeeds(base64.RawURLEncoding, wire.MasterKey, wire.SelfSigningKey, wire.UserSigningKey)
	if err != nil {
		return err
	}
	*s = decoded
	return nil
}

func (s Seeds) complete() bool {
	return len(s.MasterKey) > 0 && len(s.SelfSigningKey) > 0 && len(s.UserSigningKey) > 0
}

func (s Seeds) encode(enc *base64.Encoding) (master, selfSigning, userSigning string) {
	return enc.EncodeToString(s.MasterKey), enc.EncodeToString(s.SelfSigningKey), enc.EncodeToString(s.UserSigningKey)
}

func decodeSeeds(enc *base64.Encoding, master, selfSigning, userSigning string) (Seeds, error) {
	var seeds Seeds
	var err error
	if seeds.MasterKey, err = enc.DecodeString(master); err != nil {
		return Seeds{}, fmt.Errorf("master seed: %w", err)
	}
	if seeds.SelfSigningKey, err = enc.DecodeString(selfSigning); err != nil {
		return Seeds{}, fmt.Errorf("self-signing seed: %w", err)
	}
	if seeds.UserSigningKey, err = enc.DecodeString(userSigning); err != nil {
		return Seeds{}, fmt.Errorf("user-signing seed: %w", err)
	}
	return seeds, nil
}

func (s Seeds) toCore() matrix.CrossSigningSeeds {
	master, selfSigning, userSigning := s.encode(base64.RawStdEncoding)
	return matrix.CrossSigningSeeds{MasterKey: master, SelfSigningKey: selfSigning, UserSigningKey: userSigning}
}

func seedsFromCore(keys matrix.CrossSigningSeeds) (Seeds, error) {
	return decodeSeeds(base64.RawStdEncoding, keys.MasterKey, keys.SelfSigningKey, keys.UserSigningKey)
}

func (s Seeds) equal(other Seeds) bool {
	return string(s.MasterKey) == string(other.MasterKey) &&
		string(s.SelfSigningKey) == string(other.SelfSigningKey) &&
		string(s.UserSigningKey) == string(other.UserSigningKey)
}

type SeedStore interface {
	Load(userID string) (seeds Seeds, found bool, err error)

	Save(userID string, seeds Seeds) error

	Delete(userID string) error
}

type KeychainSeeds struct{}

var _ SeedStore = KeychainSeeds{}

func (store KeychainSeeds) Load(userID string) (Seeds, bool, error) {
	seeds, found, err := readSeeds(platform.AccountCrossSigning(userID))
	if err != nil || found {
		return seeds, found, err
	}

	seeds, found, err = readSeeds(platform.AccountCrossSigningLegacy)
	if err != nil || !found {
		return Seeds{}, false, err
	}
	if err := store.Save(userID, seeds); err != nil {
		return Seeds{}, false, fmt.Errorf("devicetrust: migrate legacy seeds: %w", err)
	}
	if err := platform.Delete(platform.AccountCrossSigningLegacy); err != nil {
		return Seeds{}, false, fmt.Errorf("devicetrust: remove legacy seeds: %w", err)
	}
	return seeds, true, nil
}

func (KeychainSeeds) Save(userID string, seeds Seeds) error {
	blob, err := jsonv2.Marshal(seeds)
	if err != nil {
		return fmt.Errorf("devicetrust: encode seeds: %w", err)
	}
	if err := platform.Set(platform.AccountCrossSigning(userID), string(blob)); err != nil {
		return fmt.Errorf("devicetrust: store seeds: %w", err)
	}
	return nil
}

func (KeychainSeeds) Delete(userID string) error {
	return platform.Delete(platform.AccountCrossSigning(userID))
}

func readSeeds(account string) (Seeds, bool, error) {
	blob, err := platform.Get(account)
	if errors.Is(err, platform.ErrNotFound) || (err == nil && blob == "") {
		return Seeds{}, false, nil
	}
	if err != nil {
		return Seeds{}, false, fmt.Errorf("devicetrust: read seeds: %w", err)
	}
	var seeds Seeds
	if err := jsonv2.Unmarshal([]byte(blob), &seeds); err != nil {
		return Seeds{}, false, fmt.Errorf("devicetrust: decode seeds: %w", err)
	}
	return seeds, true, nil
}

type seedState int

const (
	seedsAbsent seedState = iota

	seedsUnconfirmed

	seedsInMachine
)

func (s seedState) String() string {
	switch s {
	case seedsUnconfirmed:
		return "unconfirmed"
	case seedsInMachine:
		return "in-machine"
	default:
		return "absent"
	}
}

const restoreBudget = 5 * time.Second

func (m *Manager) RestoreSeeds(ctx context.Context) {
	m.seedsMu.Lock()
	defer m.seedsMu.Unlock()

	seeds, found, err := m.seeds.Load(m.client.UserID())
	if err != nil {
		m.log.Warn().Err(err).Msg("stored cross-signing seeds are unreadable")
		return
	}
	if !found {
		m.log.Debug().Msg("no cross-signing seeds stored for this account")
		return
	}
	m.pendingSeeds = seeds
	m.seedState = seedsUnconfirmed

	checkCtx, cancel := context.WithTimeout(ctx, restoreBudget)
	defer cancel()
	if err := m.confirmSeedsLocked(checkCtx); err != nil {
		m.log.Warn().Err(err).Msg("could not check the stored seeds against the account yet; will retry on first use")
	}
}

func (m *Manager) ensureSeeds(ctx context.Context) error {
	m.seedsMu.Lock()
	defer m.seedsMu.Unlock()
	if m.seedState != seedsUnconfirmed {
		return nil
	}
	return m.confirmSeedsLocked(ctx)
}

func (m *Manager) confirmSeedsLocked(ctx context.Context) error {
	if !m.pendingSeeds.complete() {
		m.discardSeedsLocked("the stored seeds are incomplete", nil)
		return nil
	}
	published, err := m.publishedMasterKey(ctx)
	if err != nil {
		return err
	}
	if published == "" {
		m.discardSeedsLocked("the account publishes no cross-signing keys", nil)
		return nil
	}

	if _, err := m.crypto.OwnTrust(ctx, true); err != nil {
		return fmt.Errorf("devicetrust: refresh the account's identity: %w", err)
	}
	result, reason, err := m.crypto.ImportCrossSigningKeys(ctx, m.pendingSeeds.toCore())
	if err != nil {
		return fmt.Errorf("devicetrust: import the stored seeds: %w", err)
	}
	switch result {
	case matrix.KeysNotPublished:

		m.discardSeedsLocked("the account's published identity is incomplete", nil)
		return nil
	case matrix.KeysRejected:
		m.log.Warn().Str("published_master_key", published).Str("reason", reason).Msg("trust was reset elsewhere")
		m.discardSeedsLocked("the stored seeds were superseded", errors.New(reason))
		return nil
	}

	m.pendingSeeds = Seeds{}
	m.seedState = seedsInMachine
	m.log.Info().Str("master_key", published).Msg("cross-signing seeds confirmed and restored; this device is the anchor")

	if err := m.crypto.SignOwnDevice(ctx); err != nil {
		m.log.Warn().Err(err).Msg("seeds restored, but this device could not sign itself")
	}
	return nil
}

func (m *Manager) discardSeedsLocked(why string, cause error) {
	m.log.Warn().Err(cause).Str("why", why).Msg("discarding stored cross-signing seeds")
	m.pendingSeeds = Seeds{}
	m.seedState = seedsAbsent
	if err := m.seeds.Delete(m.client.UserID()); err != nil {
		m.log.Warn().Err(err).Msg("could not delete the discarded seeds")
	}
}

func (m *Manager) KeepSeeds(ctx context.Context) {
	m.seedsMu.Lock()
	defer m.seedsMu.Unlock()
	m.keepSeedsLocked(ctx)
}

const keepSeedsBudget = 30 * time.Second

func (m *Manager) KeepSeedsLater() {
	m.goBackground(keepSeedsBudget, m.KeepSeeds)
}

func (m *Manager) keepSeedsLocked(ctx context.Context) {
	exported, err := m.crypto.ExportCrossSigningKeys(ctx)
	if err != nil {
		m.log.Warn().Err(err).Msg("could not read this device's cross-signing keys")
		return
	}
	if exported == nil || !exported.Complete() {
		return
	}
	seeds, err := seedsFromCore(*exported)
	if err != nil {
		m.log.Warn().Err(err).Msg("this device's cross-signing keys do not decode")
		return
	}

	if stored, found, err := m.seeds.Load(m.client.UserID()); err == nil && found && stored.equal(seeds) {
		m.pendingSeeds = Seeds{}
		m.seedState = seedsInMachine
		return
	}
	published, ok := m.holdsPublishedSeedsLocked(ctx)
	if !ok {

		return
	}
	m.pendingSeeds = Seeds{}
	m.seedState = seedsInMachine
	if err := m.seeds.Save(m.client.UserID(), seeds); err != nil {
		m.log.Warn().Err(err).Msg("could not keep this device's cross-signing keys")
		return
	}
	m.log.Info().Str("master_key", published).Msg("kept the account's cross-signing keys on this machine")
}

func (m *Manager) publishedMasterKey(ctx context.Context) (string, error) {
	userID := m.client.UserID()
	var response struct {
		MasterKeys map[string]struct {
			Keys map[string]string `json:"keys"`
		} `json:"master_keys"`
	}
	request := map[string]any{"device_keys": map[string][]string{userID: {}}}
	if err := m.client.Do(ctx, http.MethodPost, m.client.ClientURL("v3", "keys", "query"), nil, request, &response); err != nil {
		return "", fmt.Errorf("devicetrust: query the account's cross-signing keys: %w", err)
	}
	for _, key := range response.MasterKeys[userID].Keys {
		return key, nil
	}
	return "", nil
}

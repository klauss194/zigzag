package devicetrust

import (
	"context"
	"fmt"

	"github.com/rs/zerolog"
)

func (m *Manager) Bootstrap(ctx context.Context, password string) error {
	return m.establishAnchor(ctx, password, false)
}

func (m *Manager) Reset(ctx context.Context, password string) error {
	return m.establishAnchor(ctx, password, true)
}

func (m *Manager) establishAnchor(ctx context.Context, password string, overwrite bool) error {

	m.seedsMu.Lock()
	defer m.seedsMu.Unlock()

	log := m.log.With().Bool("overwrite", overwrite).Logger()
	log.Info().Msg("establishing this device as the anchor")

	page := m.accountPage(ctx)
	delegated := page != nil
	if delegated {
		password = ""
	}

	others, err := m.otherSessions(ctx)
	if err != nil {
		return err
	}
	if !delegated && len(others) > 0 && password == "" {
		log.Info().Int("other_sessions", len(others)).Msg("asking for the password before publishing anything")
		return ErrPasswordRequired
	}

	resuming := false
	if !overwrite {
		_, resuming = m.holdsPublishedSeedsLocked(ctx)
	}
	switch {
	case resuming:
		log.Info().Msg("this device already holds the keys the account publishes; resuming")
	default:
		if err := m.publishNewKeysLocked(ctx, log, password, overwrite); err != nil {
			return err
		}
	}

	if err := m.crypto.SignOwnDevice(ctx); err != nil {
		return fmt.Errorf("devicetrust: sign this device: %w", err)
	}
	m.log.Info().Str("device", m.client.DeviceID()).Msg("signed this device with the self-signing key")

	switch {
	case delegated:
		log.Info().Int("other_sessions", len(others)).Msg("other sessions stay signed in; the account page ends them")
	default:
		if err := m.signOutOthers(ctx, password); err != nil {
			if !isUnrecognized(err) {
				return fmt.Errorf("devicetrust: trust is set up, but signing out the other devices failed: %w", err)
			}
			log.Warn().Err(err).Msg("the server does not let clients end sessions; trust is set up and the other sessions stay")
		}
	}

	log.Info().Bool("resumed", resuming).Msg("cross-signing established; this device can now verify others")
	return nil
}

func (m *Manager) holdsPublishedSeedsLocked(ctx context.Context) (published string, ok bool) {
	trust, err := m.crypto.OwnTrust(ctx, false)
	if err != nil {
		m.log.Warn().Err(err).Msg("could not read this device's cross-signing state")
		return "", false
	}
	published, err = m.publishedMasterKey(ctx)
	if err != nil {
		m.log.Warn().Err(err).Msg("could not ask which cross-signing keys the account publishes")
		return "", false
	}
	return published, heldKeysArePublished(trust, published)
}

func (m *Manager) publishNewKeysLocked(ctx context.Context, log zerolog.Logger, password string, overwrite bool) error {

	if !overwrite {
		published, err := m.publishedMasterKey(ctx)
		if err != nil {
			return fmt.Errorf("devicetrust: check existing cross-signing keys: %w", err)
		}
		if published != "" {
			log.Warn().Str("published_master_key", published).Msg("refusing to overwrite the account's keys")
			return ErrAlreadyBootstrapped
		}
	}

	result, err := m.crypto.PublishCrossSigningKeys(ctx, password, overwrite)
	if err == nil && result.Published {
		m.publishedLocked(ctx, log)
		return nil
	}

	if _, ok := m.holdsPublishedSeedsLocked(ctx); ok {
		log.Warn().Err(err).Msg("the upload reported failure but the account publishes the new keys; keeping them")
		m.publishedLocked(ctx, log)
		return nil
	}
	if err != nil {
		log.Warn().Err(err).Bool("password_given", password != "").Msg("publishing cross-signing keys failed")
		return fmt.Errorf("devicetrust: publish cross-signing keys: %w", err)
	}
	if result.ApprovalURL != "" {
		approval := safeExternalURL(result.ApprovalURL)
		m.setResetURL(approval)
		log.Info().Str("approval_url", approval).Msg("the account page must approve replacing the keys; waiting for the user")
		return ErrResetNeedsApproval
	}
	log.Warn().Bool("password_given", password != "").Msg("publishing cross-signing keys was refused")
	if result.Challenge == nil {
		return fmt.Errorf("devicetrust: publishing cross-signing keys was refused without a reason")
	}

	if approval := approvalURL(result.Challenge.Body); approval != "" {
		m.setResetURL(approval)
		log.Info().Str("approval_url", approval).Msg("the account page must approve replacing the keys; waiting for the user")
		return ErrResetNeedsApproval
	}
	return uiaError(result.Challenge, password != "")
}

func (m *Manager) publishedLocked(ctx context.Context, log zerolog.Logger) {
	m.setResetURL("")
	m.keepSeedsLocked(ctx)
	m.pendingSeeds = Seeds{}
	m.seedState = seedsInMachine
	log.Info().Msg("cross-signing keys published")
}

package devicetrust

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/matrix"
)

type Crypto interface {
	OwnTrust(ctx context.Context, refresh bool) (*matrix.OwnTrust, error)
	ExportCrossSigningKeys(ctx context.Context) (*matrix.CrossSigningSeeds, error)
	ImportCrossSigningKeys(ctx context.Context, seeds matrix.CrossSigningSeeds) (matrix.KeyImportResult, string, error)
	SignOwnDevice(ctx context.Context) error
	PublishCrossSigningKeys(ctx context.Context, password string, reset bool) (*matrix.PublishResult, error)

	matrix.VerificationProtocol
}

var _ Crypto = (*matrix.Client)(nil)

type Config struct {
	Client *matrix.Client

	Crypto Crypto

	Seeds SeedStore

	Emit func(name string, data any)

	Logger zerolog.Logger
}

type Manager struct {
	client *matrix.Client
	crypto Crypto
	seeds  SeedStore
	log    zerolog.Logger

	verifier *verifier

	seedsMu      sync.Mutex
	seedState    seedState
	pendingSeeds Seeds

	pages accountPages

	lifetime       context.Context
	stopBackground context.CancelFunc
	background     sync.WaitGroup
}

var errMissingDependency = errors.New("devicetrust: a client and a seed store are required")

func New(ctx context.Context, cfg Config) (*Manager, error) {
	if cfg.Client == nil || cfg.Seeds == nil {
		return nil, errMissingDependency
	}
	crypto := cfg.Crypto
	if crypto == nil {
		crypto = cfg.Client
	}
	m := &Manager{
		client: cfg.Client,
		crypto: crypto,
		seeds:  cfg.Seeds,
		log:    cfg.Logger,
	}
	m.lifetime, m.stopBackground = context.WithCancel(context.WithoutCancel(ctx))

	verifier, err := newVerifier(ctx, cfg.Client.UserID(), crypto, cfg.Emit, cfg.Logger, m.ensureSeeds)
	if err != nil {
		m.log.Error().Err(err).Msg("device verification is unavailable this session")
	} else {
		m.verifier = verifier
	}
	return m, nil
}

func (m *Manager) StartVerification(ctx context.Context, deviceID string) (string, error) {
	if m.verifier == nil {
		return "", ErrUnavailable
	}
	log := m.log.With().Str("target", deviceID).Logger()

	status, err := m.Status(ctx)
	if err != nil {
		return "", err
	}
	if !status.IsAnchor {
		log.Warn().Msg("refusing to start a verification from a device that holds no seeds")
		return "", ErrNotAnchor
	}
	if !status.listsOther(deviceID) {
		log.Warn().Msg("refusing to verify a device that is not another session on this account")
		return "", ErrPeerUnknown
	}
	if status.overVerifiedCap(deviceID) {
		log.Warn().Int("verified", status.verifiedCount()).Msg("verified-device cap reached")
		return "", ErrTooManyVerifiedDevices
	}

	if !status.publishedKeys[deviceID] {
		log.Warn().Msg("the device to verify has no published keys")
		return "", fmt.Errorf("%w: %s published no device keys", ErrPeerKeysMissing, deviceID)
	}
	return m.verifier.start(ctx, deviceID)
}

func (m *Manager) ConfirmSAS(ctx context.Context, transactionID string) error {
	if m.verifier == nil {
		return ErrUnavailable
	}
	return m.verifier.confirm(ctx, transactionID)
}

func (m *Manager) CancelVerification(ctx context.Context, transactionID string) error {
	if m.verifier == nil {
		return ErrUnavailable
	}
	return m.verifier.cancel(ctx, transactionID)
}

func (m *Manager) Close() {
	if m == nil {
		return
	}
	if m.stopBackground != nil {
		m.stopBackground()
	}
	m.background.Wait()
	if m.verifier != nil {
		m.verifier.close()
	}
}

func (m *Manager) goBackground(budget time.Duration, work func(context.Context)) {
	m.background.Go(func() {
		ctx, cancel := context.WithTimeout(m.lifetime, budget)
		defer cancel()
		work(ctx)
	})
}

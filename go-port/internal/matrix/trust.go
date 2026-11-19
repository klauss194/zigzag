package matrix

import (
	"context"

	jsonv2 "github.com/go-json-experiment/json"

	"github.com/klauss/zigzag-go/internal/rustcore"
	"github.com/klauss/zigzag-go/internal/trace"
)

type OwnTrust struct {
	IdentityMasterKey string

	HeldMasterKey string

	HoldsAllKeys bool

	Verified map[string]bool
}

func (c *Client) OwnTrust(ctx context.Context, refresh bool) (*OwnTrust, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	own, err := await(ctx, func() (rustcore.OwnTrust, error) { return core.TrustOwn(refresh) })
	if err != nil {
		return nil, err
	}
	trust := &OwnTrust{
		IdentityMasterKey: deref(own.IdentityMasterKey),
		HeldMasterKey:     deref(own.HeldMasterKey),
		HoldsAllKeys:      own.HasMaster && own.HasSelfSigning && own.HasUserSigning,
		Verified:          make(map[string]bool, len(own.Devices)),
	}
	for _, device := range own.Devices {
		trust.Verified[device.DeviceId] = device.Verified
	}
	return trust, nil
}

type CrossSigningSeeds struct {
	MasterKey      string
	SelfSigningKey string
	UserSigningKey string
}

func (s CrossSigningSeeds) Complete() bool {
	return s.MasterKey != "" && s.SelfSigningKey != "" && s.UserSigningKey != ""
}

func (c *Client) ExportCrossSigningKeys(ctx context.Context) (*CrossSigningSeeds, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	keys, err := await(ctx, func() (*rustcore.CrossSigningKeys, error) { return core.TrustExportKeys() })
	if err != nil || keys == nil {
		return nil, err
	}
	return &CrossSigningSeeds{
		MasterKey:      deref(keys.MasterKey),
		SelfSigningKey: deref(keys.SelfSigningKey),
		UserSigningKey: deref(keys.UserSigningKey),
	}, nil
}

type KeyImportResult int

const (
	KeysImported KeyImportResult = iota

	KeysNotPublished

	KeysRejected
)

func (c *Client) ImportCrossSigningKeys(ctx context.Context, seeds CrossSigningSeeds) (result KeyImportResult, reason string, err error) {
	core, err := c.needCore()
	if err != nil {
		return KeysRejected, "", err
	}
	outcome, err := await(ctx, func() (rustcore.KeyImport, error) {
		return core.TrustImportKeys(rustcore.CrossSigningKeys{
			MasterKey:      optional(seeds.MasterKey),
			SelfSigningKey: optional(seeds.SelfSigningKey),
			UserSigningKey: optional(seeds.UserSigningKey),
		})
	})
	if err != nil {
		return KeysRejected, "", err
	}
	switch outcome := outcome.(type) {
	case rustcore.KeyImportImported:
		return KeysImported, "", nil
	case rustcore.KeyImportNotPublished:
		return KeysNotPublished, "", nil
	case rustcore.KeyImportRejected:
		return KeysRejected, outcome.Reason, nil
	}
	return KeysRejected, "unknown outcome", nil
}

func (c *Client) SignOwnDevice(ctx context.Context) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	_, err = await(ctx, func() (struct{}, error) { return struct{}{}, core.TrustSignOwnDevice() })
	return err
}

type PublishResult struct {
	Published bool

	Challenge *Error

	ApprovalURL string
}

func (c *Client) PublishCrossSigningKeys(ctx context.Context, password string, reset bool) (*PublishResult, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	outcome, err := await(ctx, func() (rustcore.KeysPublish, error) {
		return core.TrustPublishKeys(optional(password), reset)
	})
	if err != nil {
		return nil, err
	}
	switch outcome := outcome.(type) {
	case rustcore.KeysPublishPublished:
		return &PublishResult{Published: true}, nil
	case rustcore.KeysPublishAuthRequired:
		return &PublishResult{Challenge: newAPIError(401, []byte(outcome.Uiaa))}, nil
	case rustcore.KeysPublishApprovalRequired:
		return &PublishResult{ApprovalURL: outcome.Url}, nil
	}
	return nil, &Error{Message: "publishing cross-signing keys: unknown outcome"}
}

type SASEmoji struct {
	Symbol      string
	Description string
}

type VerificationEvents interface {
	VerificationRequested(flowID, sender, fromDevice string)

	VerificationReady(flowID, peerDevice string, weStarted, supportsSAS bool)

	VerificationSAS(flowID, peerDevice string, emoji []SASEmoji, decimals []int)

	VerificationDone(flowID, peerDevice string)

	VerificationCancelled(flowID, peerDevice, code, reason string, cancelledByUs bool)
}

type VerificationProtocol interface {
	ListenVerifications(events VerificationEvents) error
	RequestVerification(ctx context.Context, deviceID string) (string, error)
	AcceptVerification(ctx context.Context, flowID string) error
	StartSAS(ctx context.Context, flowID string) error
	ConfirmSAS(ctx context.Context, flowID string) error
	CancelVerification(ctx context.Context, flowID string) error
}

func (c *Client) ListenVerifications(events VerificationEvents) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	core.VerificationListen(verificationBridge{events})
	return nil
}

type verificationBridge struct{ events VerificationEvents }

type verificationPayload struct {
	FlowID        string `json:"flow_id"`
	Sender        string `json:"sender"`
	FromDevice    string `json:"from_device"`
	PeerDevice    string `json:"peer_device"`
	WeStarted     bool   `json:"we_started"`
	SupportsSAS   bool   `json:"supports_sas"`
	Code          string `json:"code"`
	Reason        string `json:"reason"`
	CancelledByUs bool   `json:"cancelled_by_us"`
	Emoji         []struct {
		Symbol      string `json:"symbol"`
		Description string `json:"description"`
	} `json:"emoji"`
	Decimals []int `json:"decimals"`
}

func decodeVerification(kind, payloadJSON string) (verificationPayload, bool) {
	var payload verificationPayload
	if err := jsonv2.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		log := trace.Log("trust")
		log.Warn().Err(err).Str("callback", kind).Msg("verification callback payload does not decode — dropped")
		return payload, false
	}
	return payload, true
}

func (b verificationBridge) OnRequest(payloadJSON string) {
	if p, ok := decodeVerification("request", payloadJSON); ok {
		b.events.VerificationRequested(p.FlowID, p.Sender, p.FromDevice)
	}
}

func (b verificationBridge) OnReady(payloadJSON string) {
	if p, ok := decodeVerification("ready", payloadJSON); ok {
		b.events.VerificationReady(p.FlowID, p.PeerDevice, p.WeStarted, p.SupportsSAS)
	}
}

func (b verificationBridge) OnSas(payloadJSON string) {
	p, ok := decodeVerification("sas", payloadJSON)
	if !ok {
		return
	}
	symbols := make([]SASEmoji, len(p.Emoji))
	for i, e := range p.Emoji {
		symbols[i] = SASEmoji{Symbol: e.Symbol, Description: e.Description}
	}
	b.events.VerificationSAS(p.FlowID, p.PeerDevice, symbols, p.Decimals)
}

func (b verificationBridge) OnDone(payloadJSON string) {
	if p, ok := decodeVerification("done", payloadJSON); ok {
		b.events.VerificationDone(p.FlowID, p.PeerDevice)
	}
}

func (b verificationBridge) OnCancelled(payloadJSON string) {
	if p, ok := decodeVerification("cancelled", payloadJSON); ok {
		b.events.VerificationCancelled(p.FlowID, p.PeerDevice, p.Code, p.Reason, p.CancelledByUs)
	}
}

func (c *Client) RequestVerification(ctx context.Context, deviceID string) (string, error) {
	core, err := c.needCore()
	if err != nil {
		return "", err
	}
	return await(ctx, func() (string, error) { return core.VerificationRequest(deviceID) })
}

func (c *Client) AcceptVerification(ctx context.Context, flowID string) error {
	return c.verificationStep(ctx, func(core *rustcore.Core) error { return core.VerificationAccept(flowID) })
}

func (c *Client) StartSAS(ctx context.Context, flowID string) error {
	return c.verificationStep(ctx, func(core *rustcore.Core) error { return core.VerificationStartSas(flowID) })
}

func (c *Client) ConfirmSAS(ctx context.Context, flowID string) error {
	return c.verificationStep(ctx, func(core *rustcore.Core) error { return core.VerificationConfirm(flowID) })
}

func (c *Client) CancelVerification(ctx context.Context, flowID string) error {
	return c.verificationStep(ctx, func(core *rustcore.Core) error { return core.VerificationCancel(flowID) })
}

func (c *Client) verificationStep(ctx context.Context, step func(*rustcore.Core) error) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	_, err = await(ctx, func() (struct{}, error) { return struct{}{}, step(core) })
	return err
}

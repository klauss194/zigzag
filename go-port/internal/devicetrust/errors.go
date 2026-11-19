package devicetrust

import "errors"

var (
	ErrPasswordRequired = errors.New("PasswordRequired: this needs your account password")

	ErrAlreadyBootstrapped = errors.New("AlreadyBootstrappedElsewhere: this account already has cross-signing keys")

	ErrTooManyVerifiedDevices = errors.New("MaxVerifiedDevicesReached: this account already has the maximum verified devices")

	ErrUnavailable = errors.New("DeviceSigningUnavailable: device security did not start on this device")

	ErrClosed = errors.New("DeviceSigningUnavailable: device verification has stopped for this session")

	ErrCannotSignOutSelf = errors.New("CannotSignOutSelf: this device cannot sign itself out here")

	ErrNotAnchor = errors.New("NotAVerifiedDevice: only the device holding the account's keys can verify another one")

	ErrPeerUnknown = errors.New("PeerDeviceUnknown: that device is not another session on this account")

	ErrPeerKeysMissing = errors.New("PeerDeviceKeysMissing: that device has not published its keys yet")

	ErrVerificationInProgress = errors.New("VerificationInProgress: a verification is already running")

	ErrSignOutAtAccountPage = errors.New("SignOutAtAccountPage: sessions on this account are signed out from its account page")

	ErrResetNeedsApproval = errors.New("ResetNeedsApproval: approve the reset on your account page, then press reset again")
)

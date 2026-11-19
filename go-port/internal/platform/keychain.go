package platform

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
)

const (
	AccountToken     = "access-token"
	AccountPickleKey = "crypto-pickle-key"

	AccountCrossSigningLegacy = "cross-signing-seeds"
)

func AccountCrossSigning(userID string) string {
	return userID + "|cross-signing-seeds"
}

var ErrNotFound = errors.New("platform: secret not found")

func NewPickleKey() ([]byte, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("platform: generate pickle key: %w", err)
	}
	return key, nil
}

func LoadOrCreatePickleKey() ([]byte, error) {
	if storedKeyBase64, err := Get(AccountPickleKey); err == nil {

		if decodedKey, decodeErr := base64.StdEncoding.DecodeString(storedKeyBase64); decodeErr == nil && len(decodedKey) == 32 {
			return decodedKey, nil
		}
	}
	return NewPickleKey()
}

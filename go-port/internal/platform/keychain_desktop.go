//go:build !android

package platform

import (
	"errors"
	"fmt"

	"github.com/zalando/go-keyring"
)

func Set(account, value string) error {
	return SetIn(ServiceName, account, value)
}

func Get(account string) (string, error) {
	return GetIn(ServiceName, account)
}

func Delete(account string) error {
	return DeleteIn(ServiceName, account)
}

func SetIn(service, account, value string) error {
	err := keyring.Set(service, account, value)
	if errors.Is(err, keyring.ErrSetDataTooBig) {
		return fmt.Errorf("platform: this keychain cannot hold a secret this long (Windows Credential Manager takes 2560 bytes): %w", err)
	}
	if err != nil {
		return fmt.Errorf("platform: keychain unavailable (no plaintext fallback by policy): %w", err)
	}
	return nil
}

func GetIn(service, account string) (string, error) {
	v, err := keyring.Get(service, account)
	if errors.Is(err, keyring.ErrNotFound) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("platform: keychain read: %w", err)
	}
	return v, nil
}

func DeleteIn(service, account string) error {
	err := keyring.Delete(service, account)
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return fmt.Errorf("platform: keychain delete: %w", err)
	}
	return nil
}

//go:build android

package platform

import (
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func androidKey(service, account string) string {
	return service + "|" + account
}

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
	if err := application.Android.SecureSet(androidKey(service, account), value); err != nil {
		return fmt.Errorf("platform: keychain unavailable (no plaintext fallback by policy): %w", err)
	}
	return nil
}

func GetIn(service, account string) (string, error) {
	value, found, err := application.Android.SecureGet(androidKey(service, account))
	if err != nil {
		return "", fmt.Errorf("platform: keychain unavailable: %w", err)
	}
	if !found {
		return "", ErrNotFound
	}
	return value, nil
}

func DeleteIn(service, account string) error {
	if err := application.Android.SecureDelete(androidKey(service, account)); err != nil {
		return fmt.Errorf("platform: keychain unavailable: %w", err)
	}
	return nil
}

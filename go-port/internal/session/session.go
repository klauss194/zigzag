package session

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
	"github.com/klauss/zigzag-go/internal/platform"
)

var ErrNoSession = errors.New("session: none stored")

type Session struct {
	HomeserverURL string `json:"homeserver"`
	UserID        string `json:"userId"`
	DeviceID      string `json:"deviceId"`

	StoreID string `json:"storeId,omitempty"`

	AccessToken string `json:"-"`
	PickleKey   []byte `json:"-"`
}

func Dir() (string, error) {
	dir, err := platform.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("session: config dir: %w", err)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("session: mkdir %s: %w", dir, err)
	}
	return dir, nil
}

func CryptoDBPath() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "crypto.db"), nil
}

func StoreDir(storeID string) (string, error) {
	if storeID == "" || storeID != filepath.Base(storeID) || storeID == "." || storeID == ".." {
		return "", fmt.Errorf("session: bad store id %q", storeID)
	}
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	path := filepath.Join(dir, "matrix", storeID)
	if err := os.MkdirAll(path, 0o700); err != nil {
		return "", fmt.Errorf("session: mkdir %s: %w", path, err)
	}
	return path, nil
}

func NewStoreID() (string, error) {
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("session: store id: %w", err)
	}
	return hex.EncodeToString(random), nil
}

func RemoveStore(storeID string) error {
	if storeID == "" {
		return nil
	}
	path, err := StoreDir(storeID)
	if err != nil {
		return err
	}
	return os.RemoveAll(path)
}

func (s *Session) StorePassphrase() string {
	return base64.StdEncoding.EncodeToString(s.PickleKey)
}

func metaPath() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "session.json"), nil
}

func readStored() (*Session, error) {
	path, err := metaPath()
	if err != nil {
		return nil, err
	}
	blob, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("session: read %s: %w", path, err)
	}
	var stored Session
	if err := jsonv2.Unmarshal(blob, &stored); err != nil {
		return nil, &corruptError{path: path, err: err}
	}
	return &stored, nil
}

type corruptError struct {
	path string
	err  error
}

func (e *corruptError) Error() string { return fmt.Sprintf("session: parse %s: %v", e.path, e.err) }
func (e *corruptError) Unwrap() error { return e.err }

func (s *Session) Save() error {
	if err := platform.Set(platform.AccountToken, s.AccessToken); err != nil {
		return err
	}
	if err := platform.Set(platform.AccountPickleKey, base64.StdEncoding.EncodeToString(s.PickleKey)); err != nil {
		return err
	}
	return s.writeMetadata()
}

const lastServerFile = "last-server"

func LastServer() string {
	dir, err := Dir()
	if err != nil {
		return ""
	}
	blob, err := os.ReadFile(filepath.Join(dir, lastServerFile))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(blob))
}

func RememberServer(typed string) error {
	dir, err := Dir()
	if err != nil {
		return err
	}
	return writeFileAtomically(filepath.Join(dir, lastServerFile), []byte(strings.TrimSpace(typed)))
}

func (s *Session) writeMetadata() error {
	path, err := metaPath()
	if err != nil {
		return err
	}
	blob, err := jsonv2.Marshal(s, jsontext.WithIndent("  "))
	if err != nil {
		return fmt.Errorf("session: marshal: %w", err)
	}
	if err := writeFileAtomically(path, blob); err != nil {
		return fmt.Errorf("session: write %s: %w", path, err)
	}
	return nil
}

func writeFileAtomically(path string, blob []byte) error {
	temp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if err := temp.Chmod(0o600); err != nil {
		temp.Close()
		return err
	}
	if _, err := temp.Write(blob); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(tempPath, path)
}

func Load() (*Session, error) {
	s, err := readStored()
	if err != nil {
		return nil, err
	}
	if s == nil {
		return nil, ErrNoSession
	}

	token, err := platform.Get(platform.AccountToken)
	if errors.Is(err, platform.ErrNotFound) {
		return nil, ErrNoSession
	}
	if err != nil {
		return nil, err
	}

	encodedKey, err := platform.Get(platform.AccountPickleKey)
	if errors.Is(err, platform.ErrNotFound) {
		return nil, ErrNoSession
	}
	if err != nil {
		return nil, err
	}
	pickleKey, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil {
		return nil, fmt.Errorf("session: pickle key is corrupt: %w", err)
	}

	s.AccessToken = token
	s.PickleKey = pickleKey
	return s, nil
}

func Clear() error {

	var firstErr error
	keep := func(err error) {
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}
	keep(platform.Delete(platform.AccountToken))
	keep(platform.Delete(platform.AccountPickleKey))

	keep(platform.Delete(platform.AccountCrossSigningLegacy))

	metaFile, err := metaPath()
	if err != nil {
		return err
	}
	dbFile, err := CryptoDBPath()
	if err != nil {
		return err
	}

	targets := []string{metaFile, dbFile, dbFile + "-wal", dbFile + "-shm"}

	for _, path := range targets {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			keep(fmt.Errorf("session: remove %s: %w", path, err))
		}
	}
	return firstErr
}

func Forget(storeID string) error {
	return errors.Join(Clear(), RemoveStore(storeID))
}

func PeekUserID() string {
	stored, err := readStored()
	if err != nil || stored == nil {
		return ""
	}
	return stored.UserID
}

func Peek() *Session {
	stored, err := readStored()
	if err != nil {
		return nil
	}
	return stored
}

func ResumableUserID() string {
	userID := PeekUserID()
	if userID == "" {
		return ""
	}
	for _, account := range []string{platform.AccountToken, platform.AccountPickleKey} {
		if _, err := platform.Get(account); errors.Is(err, platform.ErrNotFound) {
			return ""
		}
	}
	return userID
}

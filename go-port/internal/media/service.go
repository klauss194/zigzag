package media

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/trace"
)

const MaxUploadBytes int64 = 100 * 1024 * 1024

const MaxObjectBytes int64 = 512 * 1024 * 1024

const TransferTimeout = 5 * time.Minute

const UploadLimitTimeout = 15 * time.Second

const UploadTimeout = 15 * time.Minute

const cacheDirectoryName = "media"

var (
	ErrNoSession = errors.New("media: not logged in")

	ErrTooLarge = errors.New("media: too large")
)

type TooLargeError struct {
	Size  int64
	Limit int64

	refusal error
}

func (e *TooLargeError) Error() string {
	if e.Limit > 0 {
		return fmt.Sprintf("media: too large: %s, the server accepts up to %s", formatSize(e.Size), formatSize(e.Limit))
	}
	if e.refusal != nil {
		return fmt.Sprintf("media: too large: the server refused %s: %v", formatSize(e.Size), e.refusal)
	}
	return fmt.Sprintf("media: too large: %s", formatSize(e.Size))
}

func (e *TooLargeError) Unwrap() []error {
	if e.refusal != nil {
		return []error{ErrTooLarge, e.refusal}
	}
	return []error{ErrTooLarge}
}

type Service struct {
	cacheDirectory func() (string, error)
	logger         zerolog.Logger

	picks *pickRegistry

	drops *dropBox

	mutex   sync.Mutex
	current *session
}

type session struct {
	client *matrix.Client
	cache  *cache

	homeserver *homeserverReader

	limit *uploadLimit
}

type uploadLimit struct {
	mutex sync.Mutex
	bytes int64
}

func (l *uploadLimit) known() int64 {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	return l.bytes
}

func (l *uploadLimit) get(ctx context.Context, client *matrix.Client) (int64, error) {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	if l.bytes > 0 {
		return l.bytes, nil
	}
	uploadSize, err := client.MediaUploadSize(ctx)
	if err != nil {
		return 0, fmt.Errorf("media: the homeserver's upload limit: %w", err)
	}
	l.bytes = uploadSize
	if l.bytes <= 0 {

		l.bytes = MaxUploadBytes
	}
	return l.bytes, nil
}

func New(cacheDirectory func() (string, error)) *Service {
	return &Service{
		cacheDirectory: cacheDirectory,
		logger:         trace.Log("media"),
		picks:          newPickRegistry(),
		drops:          newDropBox(),
	}
}

func (s *Service) SessionStarted(userID string, client *matrix.Client) {
	s.picks.clear()
	s.drops.clear()
	if client == nil || client.AccessToken() == "" || userID == "" {
		s.replaceSession(nil)
		s.logger.Error().Msg("attachments are unavailable: the session has no access token")
		return
	}
	s.replaceSession(&session{
		client:     client,
		cache:      newCache(s.accountCacheDirectory(userID)),
		homeserver: newHomeserverReader(client),
		limit:      &uploadLimit{},
	})
}

func (s *Service) SessionEnded() {
	s.mutex.Lock()
	current := s.current
	s.current = nil
	s.mutex.Unlock()

	s.picks.clear()
	s.drops.clear()
	if current != nil {
		current.cache.close()
	}
}

func (s *Service) SignedOut(userID string) {
	if err := newCache(s.accountCacheDirectory(userID)).clear(); err != nil {
		s.logger.Warn().Err(err).Msg("could not clear the attachment cache at sign-out")
	}
}

func (s *Service) replaceSession(next *session) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.current = next
}

func (s *Service) session() (*session, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	if s.current == nil {
		return nil, ErrNoSession
	}
	return s.current, nil
}

func (s *Service) accountCacheDirectory(userID string) string {
	base, err := s.cacheDirectory()
	if err != nil {
		s.logger.Warn().Err(err).Msg("no cache directory: attachments are fetched on every view")
		return ""
	}
	digest := sha256.Sum256([]byte(userID))
	return filepath.Join(base, cacheDirectoryName, hex.EncodeToString(digest[:]))
}

func (s *Service) UploadLimit(ctx context.Context) (int64, error) {
	current, err := s.session()
	if err != nil {
		return 0, err
	}
	return current.limit.get(ctx, current.client)
}

type UploadRequest struct {
	Body io.Reader

	Size int64

	ContentType string
}

func (s *Service) Upload(ctx context.Context, request UploadRequest) (string, error) {
	current, err := s.session()
	if err != nil {
		return "", err
	}
	if request.Body == nil || request.Size <= 0 {
		return "", errors.New("media: an upload needs its bytes and their size")
	}
	if request.Size > MaxObjectBytes {
		return "", &TooLargeError{Size: request.Size, Limit: MaxObjectBytes}
	}

	limitCtx, cancel := context.WithTimeout(ctx, UploadLimitTimeout)
	limit, limitErr := current.limit.get(limitCtx, current.client)
	cancel()
	if limitErr == nil && request.Size > limit {
		return "", &TooLargeError{Size: request.Size, Limit: limit}
	}
	uri, err := current.homeserver.upload(ctx, request.Body, request.Size, uploadContentType(request.ContentType))
	if err != nil {
		var tooLarge *TooLargeError
		if errors.As(err, &tooLarge) && tooLarge.Limit == 0 {
			tooLarge.Limit = current.limit.known()
		}
		return "", err
	}

	if parsed, err := parseRef(uri); err != nil || parsed.scheme != schemeHomeserver {
		return "", fmt.Errorf("media: the homeserver answered %q, not an mxc:// URI", uri)
	}
	return uri, nil
}

func (s *Service) Download(ctx context.Context, ref string) ([]byte, error) {
	parsed, err := parseRef(ref)
	if err != nil {
		return nil, err
	}
	current, err := s.session()
	if err != nil {
		return nil, err
	}
	if data, ok := current.cache.load(parsed.raw); ok {
		return data, nil
	}

	var data []byte
	switch parsed.scheme {
	case schemeHomeserver:
		data, err = current.homeserver.download(ctx, parsed)
	default:

		return nil, fmt.Errorf("media: no download route for scheme %d", parsed.scheme)
	}
	if err != nil {
		return nil, err
	}

	if len(data) > 0 {
		if err := current.cache.store(parsed.raw, data); err != nil {
			s.logger.Debug().Err(err).Msg("could not cache a downloaded attachment")
		}
	}
	return data, nil
}

type SaveRequest struct {
	Data []byte

	Filename string
}

func (s *Service) Save(request SaveRequest) (string, error) {
	name, ok := safeBasename(request.Filename)
	if !ok {
		return "", fmt.Errorf("media: %q is not a usable file name", request.Filename)
	}
	directory, err := downloadDirectory()
	if err != nil {
		return "", err
	}
	return saveUnique(directory, name, request.Data)
}

func (s *Service) StagePick(path string) (Pick, error) {
	return s.picks.stage(path)
}

func (s *Service) ReleasePick(pickID uint64) {
	s.picks.release(pickID)
}

func (s *Service) RecordDrop(paths []string) {
	s.drops.put(paths)
}

func (s *Service) TakeDrop() DroppedFiles {
	dropped := DroppedFiles{Picks: []Pick{}, Skipped: []string{}}
	paths := s.drops.take()
	for index, path := range paths {
		if len(dropped.Picks) == MaxDroppedFiles {
			dropped.Skipped = append(dropped.Skipped,
				fmt.Sprintf("media: %d more files left out: up to %d at a time", len(paths)-index, MaxDroppedFiles))
			break
		}
		pick, err := s.picks.stage(path)
		if err != nil {
			dropped.Skipped = append(dropped.Skipped, err.Error())
			continue
		}
		dropped.Picks = append(dropped.Picks, pick)
	}
	return dropped
}

type PickReadRequest struct {
	PickID uint64
}

func (s *Service) ReadPick(request PickReadRequest) ([]byte, error) {
	picked, ok := s.picks.peek(request.PickID)
	if !ok {
		return nil, errPickGone(request.PickID)
	}
	data, err := readRegularFile(picked.path, MaxObjectBytes)
	if err != nil {

		return nil, err
	}
	s.picks.release(request.PickID)
	return data, nil
}

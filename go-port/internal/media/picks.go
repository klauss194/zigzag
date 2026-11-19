package media

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

type Pick struct {
	PickID   uint64 `json:"pickId"`
	Filename string `json:"filename"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
}

type pickedFile struct {
	path     string
	mimeType string
}

type pickRegistry struct {
	mutex  sync.Mutex
	lastID uint64
	staged map[uint64]pickedFile
}

func newPickRegistry() *pickRegistry {
	return &pickRegistry{staged: map[uint64]pickedFile{}}
}

func (r *pickRegistry) stage(path string) (Pick, error) {
	filename := filepath.Base(path)
	info, err := os.Stat(path)
	if err != nil {
		return Pick{}, fmt.Errorf("media: %s: %w", filename, withoutPath(err))
	}
	if !info.Mode().IsRegular() {
		return Pick{}, fmt.Errorf("media: %s is not a regular file", filename)
	}
	if info.Size() > MaxObjectBytes {
		return Pick{}, tooLarge(filename, info.Size(), MaxObjectBytes)
	}
	picked := pickedFile{path: path, mimeType: mimeTypeForName(filename)}

	r.mutex.Lock()
	defer r.mutex.Unlock()
	r.lastID++
	r.staged[r.lastID] = picked
	return Pick{PickID: r.lastID, Filename: filename, MimeType: picked.mimeType, Size: info.Size()}, nil
}

func (r *pickRegistry) peek(pickID uint64) (pickedFile, bool) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	picked, ok := r.staged[pickID]
	return picked, ok
}

func (r *pickRegistry) release(pickID uint64) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	delete(r.staged, pickID)
}

func (r *pickRegistry) clear() {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	clear(r.staged)
}

var ErrPickGone = errors.New("media: the chosen file is no longer staged — choose it again")

func errPickGone(pickID uint64) error {
	return fmt.Errorf("%w (pick %d)", ErrPickGone, pickID)
}

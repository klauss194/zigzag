package media

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const MaxCacheBytes int64 = 512 * 1024 * 1024

const evictTo = 0.8

const touchInterval = time.Hour

type cache struct {
	directory string

	maxBytes int64

	readLimit int64

	mutex sync.Mutex

	heldBytes int64
	measured  bool

	closed bool
}

func newCache(directory string) *cache {
	return &cache{directory: directory, maxBytes: MaxCacheBytes, readLimit: MaxObjectBytes}
}

func (c *cache) entryPath(ref string) string {
	digest := sha256.Sum256([]byte(ref))
	return filepath.Join(c.directory, hex.EncodeToString(digest[:]))
}

func (c *cache) load(ref string) ([]byte, bool) {
	if c.directory == "" {
		return nil, false
	}
	path := c.entryPath(ref)
	file, err := os.Open(path)
	if err != nil {
		return nil, false
	}
	defer file.Close()
	data, err := readLimited(file, c.readLimit)
	if err != nil {
		return nil, false
	}
	c.touch(path)
	return data, true
}

func (c *cache) touch(path string) {
	info, err := os.Stat(path)
	if err != nil || time.Since(info.ModTime()) < touchInterval {
		return
	}
	now := time.Now()
	_ = os.Chtimes(path, now, now)
}

func (c *cache) store(ref string, data []byte) error {
	if c.directory == "" {
		return nil
	}
	if int64(len(data)) > c.maxBytes {
		return nil
	}
	c.mutex.Lock()
	defer c.mutex.Unlock()
	if c.closed {
		return nil
	}
	if err := os.MkdirAll(c.directory, 0o700); err != nil {
		return err
	}
	entry := c.entryPath(ref)
	temporary, err := os.CreateTemp(c.directory, filepath.Base(entry)+".*.tmp")
	if err != nil {
		return err
	}
	_, writeErr := temporary.Write(data)
	closeErr := temporary.Close()
	if err := errors.Join(writeErr, closeErr); err != nil {
		_ = os.Remove(temporary.Name())
		return err
	}

	var replaced int64
	if info, err := os.Stat(entry); err == nil {
		replaced = info.Size()
	}
	if err := os.Rename(temporary.Name(), entry); err != nil {
		_ = os.Remove(temporary.Name())
		return err
	}

	if c.measured {
		c.heldBytes += int64(len(data)) - replaced
	} else {

		c.recount()
	}
	return c.evict()
}

func (c *cache) close() {
	c.mutex.Lock()
	c.closed = true
	c.mutex.Unlock()
}

func (c *cache) clear() error {
	if c.directory == "" {
		return nil
	}
	c.mutex.Lock()
	defer c.mutex.Unlock()
	c.heldBytes, c.measured = 0, true
	return os.RemoveAll(c.directory)
}

func (c *cache) recount() {
	c.measured = true
	c.heldBytes = 0
	for _, entry := range c.entries() {
		c.heldBytes += entry.size
	}
}

func (c *cache) evict() error {
	if c.heldBytes <= c.maxBytes {
		return nil
	}
	target := int64(float64(c.maxBytes) * evictTo)
	entries := c.entries()
	sort.Slice(entries, func(a, b int) bool { return entries[a].used.Before(entries[b].used) })

	var failed error
	for _, entry := range entries {
		if c.heldBytes <= target {
			break
		}
		if err := os.Remove(filepath.Join(c.directory, entry.name)); err != nil {
			failed = err
			continue
		}
		c.heldBytes -= entry.size
	}
	return failed
}

type cacheEntry struct {
	name string
	size int64
	used time.Time
}

func (c *cache) entries() []cacheEntry {
	listing, err := os.ReadDir(c.directory)
	if err != nil {
		return nil
	}
	entries := make([]cacheEntry, 0, len(listing))
	for _, item := range listing {
		info, err := item.Info()
		if err != nil || item.IsDir() {
			continue
		}
		entries = append(entries, cacheEntry{name: item.Name(), size: info.Size(), used: info.ModTime()})
	}
	return entries
}

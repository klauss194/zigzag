package media

import (
	"sync"
	"time"
)

const DropTimeout = 10 * time.Second

const MaxDroppedFiles = 10

type DroppedFiles struct {
	Picks []Pick `json:"picks"`

	Skipped []string `json:"skipped"`
}

type dropBox struct {
	mutex   sync.Mutex
	paths   []string
	dropped time.Time
	now     func() time.Time
}

func newDropBox() *dropBox {
	return &dropBox{now: time.Now}
}

func (b *dropBox) put(paths []string) {
	b.mutex.Lock()
	defer b.mutex.Unlock()
	b.paths = append([]string(nil), paths...)
	b.dropped = b.now()
}

func (b *dropBox) take() []string {
	b.mutex.Lock()
	defer b.mutex.Unlock()
	paths := b.paths
	b.paths = nil
	if b.now().Sub(b.dropped) > DropTimeout {
		return nil
	}
	return paths
}

func (b *dropBox) clear() {
	b.mutex.Lock()
	defer b.mutex.Unlock()
	b.paths = nil
}

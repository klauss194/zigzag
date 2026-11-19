package trace

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

type Level uint8

const (
	LevelDebug Level = iota
	LevelInfo
	LevelWarn
	LevelError
)

func (l Level) String() string {
	switch l {
	case LevelDebug:
		return "debug"
	case LevelInfo:
		return "info"
	case LevelWarn:
		return "warn"
	case LevelError:
		return "error"
	}
	return "?"
}

type Entry struct {
	Seq   uint64 `json:"seq"`
	Time  string `json:"time"`
	Level string `json:"level"`
	Area  string `json:"area"`
	Msg   string `json:"msg"`
}

const ringCapacity = 4000

const subBuffer = 512

const pinCapacity = 64

type Recorder struct {
	mu      sync.Mutex
	ring    []Entry
	next    int
	filled  bool
	seq     uint64
	dropped atomic.Uint64

	pinned []Entry

	subs   map[uint64]chan Entry
	nextID uint64
}

func New() *Recorder {
	return &Recorder{
		ring: make([]Entry, ringCapacity),
		subs: map[uint64]chan Entry{},
	}
}

var Default = New()

var mirrorTo io.Writer = stderrIfTraced()

func stderrIfTraced() io.Writer {
	if os.Getenv("ZIGZAG_TRACE") != "" {
		return os.Stderr
	}
	return nil
}

var mirrorMu sync.Mutex

func MirrorTo(w io.Writer) {
	mirrorMu.Lock()
	mirrorTo = w
	mirrorMu.Unlock()
}

func mirror(e Entry) {
	mirrorMu.Lock()
	if mirrorTo != nil {
		fmt.Fprintf(mirrorTo, "%s %-5s %-9s %s\n", e.Time, e.Level, e.Area, e.Msg)
	}
	mirrorMu.Unlock()
}

func (r *Recorder) Log(level Level, area, format string, args ...any) {
	r.record(level, area, fmt.Sprintf(format, args...), false)
}

func (r *Recorder) Pin(level Level, area, format string, args ...any) {
	r.record(level, area, fmt.Sprintf(format, args...), true)
}

func (r *Recorder) record(level Level, area, msg string, pin bool) {
	entry := Entry{
		Time:  time.Now().Format("15:04:05.000"),
		Level: level.String(),
		Area:  area,
		Msg:   msg,
	}

	r.mu.Lock()
	r.seq++
	entry.Seq = r.seq
	r.ring[r.next] = entry
	r.next++
	if r.next == len(r.ring) {
		r.next = 0
		r.filled = true
	}
	if pin {
		if len(r.pinned) == pinCapacity {
			r.pinned = r.pinned[1:]
		}
		r.pinned = append(r.pinned, entry)
	}

	targets := make([]chan Entry, 0, len(r.subs))
	for _, ch := range r.subs {
		targets = append(targets, ch)
	}
	r.mu.Unlock()

	for _, ch := range targets {
		select {
		case ch <- entry:
		default:
			r.dropped.Add(1)
		}
	}

	mirror(entry)
}

func (r *Recorder) Snapshot() []Entry {
	r.mu.Lock()
	defer r.mu.Unlock()

	var ringed []Entry
	if r.filled {
		ringed = append(ringed, r.ring[r.next:]...)
	}
	ringed = append(ringed, r.ring[:r.next]...)

	oldestInRing := uint64(0)
	if len(ringed) > 0 {
		oldestInRing = ringed[0].Seq
	}
	out := make([]Entry, 0, len(r.pinned)+len(ringed))
	for _, entry := range r.pinned {
		if entry.Seq < oldestInRing {
			out = append(out, entry)
		}
	}
	return append(out, ringed...)
}

func (r *Recorder) Subscribe() (<-chan Entry, func()) {
	ch := make(chan Entry, subBuffer)

	r.mu.Lock()
	r.nextID++
	id := r.nextID
	r.subs[id] = ch
	r.mu.Unlock()

	return ch, func() {
		r.mu.Lock()
		delete(r.subs, id)
		r.mu.Unlock()

	}
}

func (r *Recorder) Dropped() uint64 {
	return r.dropped.Load()
}

func Snapshot() []Entry                 { return Default.Snapshot() }
func Subscribe() (<-chan Entry, func()) { return Default.Subscribe() }

func Untrusted(text string) string {
	escaped := untrustedEscaper.Replace(text)

	const maxLen = 512
	if len(escaped) > maxLen {
		cut := maxLen
		for cut > 0 && !utf8.RuneStart(escaped[cut]) {
			cut--
		}
		return escaped[:cut] + "…"
	}
	return escaped
}

var untrustedEscaper = strings.NewReplacer(
	"\n", `\n`,
	"\r", `\r`,
	"\t", `\t`,
)

func Pos(pos string) string {
	const keep = 12
	if pos == "" {
		return "none"
	}
	if len(pos) > keep {
		return pos[:keep] + "…"
	}
	return pos
}

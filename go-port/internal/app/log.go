package app

import "sync"

const defaultLogBytes = 8 << 20

const entryOverheadBytes = 192

type batchLog struct {
	mu sync.Mutex

	entries []*RoomsPayload
	bytes   int

	maxBytes int

	head string

	evicted uint64
}

func newBatchLog() *batchLog { return &batchLog{maxBytes: defaultLogBytes} }

func (l *batchLog) append(payload *RoomsPayload) {
	size := payloadBytes(payload)

	l.mu.Lock()
	defer l.mu.Unlock()

	l.entries = append(l.entries, payload)
	l.bytes += size
	l.head = payload.To

	for l.bytes > l.maxBytes && len(l.entries) > 1 {
		l.bytes -= payloadBytes(l.entries[0])
		l.entries[0] = nil
		l.entries = l.entries[1:]
		l.evicted++
	}
}

func (l *batchLog) since(from string) (batches []*RoomsPayload, covered bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if from == l.head {
		return nil, true
	}

	for i, entry := range l.entries {
		if entry.From == from {
			return l.tailFrom(i), true
		}
	}

	for i := len(l.entries) - 1; i >= 0; i-- {
		if l.entries[i].From == "" {
			return l.tailFrom(i), true
		}
	}

	return nil, false
}

func (l *batchLog) tailFrom(i int) []*RoomsPayload {
	out := make([]*RoomsPayload, len(l.entries)-i)
	copy(out, l.entries[i:])
	return out
}

func (l *batchLog) reset(resumeFrom string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.entries = nil
	l.bytes = 0
	l.head = resumeFrom
	l.evicted = 0
}

func (l *batchLog) stats() (count int, bytes int, floor, head string, evicted uint64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.entries) > 0 {
		floor = l.entries[0].From
	}
	return len(l.entries), l.bytes, floor, l.head, l.evicted
}

func payloadBytes(payload *RoomsPayload) int {

	size := entryOverheadBytes + len(payload.From) + len(payload.To)
	size += len(payload.Body)
	for _, plaintext := range payload.Decrypted {
		size += len(plaintext)
	}
	return size
}

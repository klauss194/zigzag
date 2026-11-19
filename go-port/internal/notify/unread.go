package notify

import (
	"sort"

	"github.com/klauss/zigzag-go/internal/matrix/id"
)

const maxUnreadKept = 200

const recentEventsKept = 64

type UnreadEvent struct {
	ID        id.EventID `json:"id,omitzero"`
	TS        int64      `json:"ts"`
	Notify    bool       `json:"notify,omitzero"`
	Highlight bool       `json:"highlight,omitzero"`
}

type Unread struct {
	Events []UnreadEvent `json:"events,omitzero"`

	CutBeforeTS int64 `json:"cut_before_ts,omitzero"`
}

func (u *Unread) counts() (notifs, highlights int) {
	for _, unread := range u.Events {
		if unread.Notify {
			notifs++
		}
		if unread.Highlight {
			highlights++
		}
	}
	return notifs, highlights
}

func (u *Unread) isEmpty() bool { return len(u.Events) == 0 && u.CutBeforeTS == 0 }

func (u *Unread) has(eventID id.EventID) bool {
	if eventID == "" {
		return false
	}
	for _, unread := range u.Events {
		if unread.ID == eventID {
			return true
		}
	}
	return false
}

func (u *Unread) timestampOf(eventID id.EventID) (int64, bool) {
	for _, unread := range u.Events {
		if unread.ID == eventID && eventID != "" {
			return unread.TS, true
		}
	}
	return 0, false
}

func (u *Unread) add(unread UnreadEvent) {
	at := sort.Search(len(u.Events), func(i int) bool { return u.Events[i].TS > unread.TS })
	u.Events = append(u.Events, UnreadEvent{})
	copy(u.Events[at+1:], u.Events[at:])
	u.Events[at] = unread

	for len(u.Events) > maxUnreadKept {

		drop := 0
		for drop < len(u.Events) && u.Events[drop].Highlight {
			drop++
		}
		if drop == len(u.Events) {
			drop = 0
		}
		u.CutBeforeTS = max(u.CutBeforeTS, u.Events[drop].TS)
		u.Events = append(u.Events[:drop], u.Events[drop+1:]...)
	}
}

func (u *Unread) readUpTo(ts int64) bool {
	kept := u.Events[:0]
	for _, unread := range u.Events {
		if unread.TS > ts {
			kept = append(kept, unread)
		}
	}
	changed := len(kept) != len(u.Events)
	u.Events = kept
	if u.CutBeforeTS != 0 && u.CutBeforeTS <= ts {
		u.CutBeforeTS = 0
		changed = true
	}
	return changed
}

func (u *Unread) remove(eventID id.EventID) bool {
	for i, unread := range u.Events {
		if unread.ID == eventID && eventID != "" {
			u.Events = append(u.Events[:i], u.Events[i+1:]...)
			return true
		}
	}
	return false
}

func (u *Unread) clear() bool {
	had := !u.isEmpty()
	u.Events, u.CutBeforeTS = nil, 0
	return had
}

func (u Unread) clone() Unread {
	if u.Events != nil {
		u.Events = append([]UnreadEvent(nil), u.Events...)
	}
	return u
}

type KnownEvent struct {
	ID id.EventID `json:"id"`
	TS int64      `json:"ts"`
}

const receiptEventsKept = 32

func rememberReceiptEvent(known []KnownEvent, event KnownEvent) ([]KnownEvent, bool) {
	for _, have := range known {
		if have.ID == event.ID {
			return known, false
		}
	}

	start := max(0, len(known)+1-receiptEventsKept)
	return append(append([]KnownEvent(nil), known[start:]...), event), true
}

type seenEvent struct {
	ID     id.EventID
	TS     int64
	Sender id.UserID

	InThread bool
}

type recentEvents struct {
	events []seenEvent
	next   int
}

func (r *recentEvents) remember(event seenEvent) {
	if event.ID == "" {
		return
	}
	for _, seen := range r.events {
		if seen.ID == event.ID {
			return
		}
	}
	if len(r.events) < recentEventsKept {
		r.events = append(r.events, event)
		return
	}
	r.events[r.next] = event
	r.next = (r.next + 1) % recentEventsKept
}

func (r *recentEvents) newestTS() int64 {
	var newest int64
	for _, seen := range r.events {
		newest = max(newest, seen.TS)
	}
	return newest
}

func (r *recentEvents) newestMainTS() int64 {
	var newest int64
	for _, seen := range r.events {
		if !seen.InThread {
			newest = max(newest, seen.TS)
		}
	}
	return newest
}

func (r *recentEvents) find(eventID id.EventID) (seenEvent, bool) {
	for _, seen := range r.events {
		if seen.ID == eventID {
			return seen, true
		}
	}
	return seenEvent{}, false
}

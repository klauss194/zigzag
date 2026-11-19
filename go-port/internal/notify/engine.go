package notify

import (
	"context"
	"errors"
	"slices"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/matrix/event"
	"github.com/klauss/zigzag-go/internal/matrix/id"
	"github.com/klauss/zigzag-go/internal/matrix/syncwire"
)

const maxToastsPerBatch = 8

const (
	firstRetryDelay = 30 * time.Second
	maxRetryDelay   = time.Hour
	maxAttempts     = 6
)

type Engine struct {
	scorer scorer
	store  *Store
	logger zerolog.Logger
	now    func() time.Time

	mu           sync.Mutex
	rooms        map[id.RoomID]*roomState
	threads      map[id.RoomID]map[id.EventID]*ThreadRow
	pendingModes []ModeRow

	keptModes map[id.RoomID]Mode

	dndUntil int64

	toldInvites map[id.RoomID]struct{}

	synced bool

	rootChecks map[ThreadKey]*retry

	receiptLookups map[ReceiptLookup]*retry

	publishMu sync.Mutex

	seq uint64

	frontendNames atomic.Pointer[map[id.RoomID]string]
}

type roomState struct {
	Row

	name   string
	recent recentEvents
}

type retry struct {
	attempts  int
	notBefore time.Time
	inFlight  bool
}

func (r *retry) failed(now time.Time) (giveUp bool) {
	r.inFlight = false
	r.attempts++
	if r.attempts >= maxAttempts {
		return true
	}
	delay := firstRetryDelay << (r.attempts - 1)
	if delay > maxRetryDelay || delay <= 0 {
		delay = maxRetryDelay
	}
	r.notBefore = now.Add(delay)
	return false
}

func (r *retry) due(now time.Time) bool {
	if r.inFlight || now.Before(r.notBefore) {
		return false
	}
	r.inFlight = true
	return true
}

type ReceiptLookup struct {
	RoomID  id.RoomID
	EventID id.EventID

	ThreadID string
}

func New(ctx context.Context, me id.UserID, store *Store, logger zerolog.Logger) (*Engine, error) {
	scorer, err := newScorer(me)
	if err != nil {
		return nil, err
	}

	stored, err := store.LoadAll(ctx)
	if err != nil {
		return nil, err
	}
	dndUntil, err := store.DNDUntil(ctx)
	if err != nil {
		return nil, err
	}
	rooms := make(map[id.RoomID]*roomState, len(stored))
	keptModes := map[id.RoomID]Mode{}
	for roomID, row := range stored {
		if row.Left {
			if row.Mode != ModeAll {
				keptModes[roomID] = row.Mode
			}
			continue
		}
		state := &roomState{Row: row}

		for _, known := range row.ReceiptEvents {
			state.recent.remember(seenEvent{ID: known.ID, TS: known.TS})
		}
		rooms[roomID] = state
	}

	storedThreads, err := store.LoadThreads(ctx)
	if err != nil {
		return nil, err
	}
	threads := map[id.RoomID]map[id.EventID]*ThreadRow{}
	for key, row := range storedThreads {
		byRoot := threads[key.RoomID]
		if byRoot == nil {
			byRoot = map[id.EventID]*ThreadRow{}
			threads[key.RoomID] = byRoot
		}
		byRoot[key.RootID] = &row
	}

	return &Engine{
		scorer:         scorer,
		store:          store,
		logger:         logger,
		now:            time.Now,
		rooms:          rooms,
		keptModes:      keptModes,
		dndUntil:       dndUntil,
		toldInvites:    map[id.RoomID]struct{}{},
		threads:        threads,
		rootChecks:     map[ThreadKey]*retry{},
		receiptLookups: map[ReceiptLookup]*retry{},
	}, nil
}

func (e *Engine) stateFor(roomID id.RoomID) *roomState {
	state, ok := e.rooms[roomID]
	if !ok {
		state = &roomState{}

		if mode, kept := e.keptModes[roomID]; kept {
			state.Mode = mode
			delete(e.keptModes, roomID)
		}
		e.rooms[roomID] = state
	}
	return state
}

func (e *Engine) thread(key ThreadKey) (*ThreadRow, bool) {
	thread, ok := e.threads[key.RoomID][key.RootID]
	return thread, ok
}

func (e *Engine) threadFor(key ThreadKey, batch *foldBatch) *ThreadRow {
	if thread, ok := e.thread(key); ok {
		return thread
	}
	state := e.stateFor(key.RoomID)
	thread := &ThreadRow{LastSeenTS: state.ThreadsReadTS}

	if root, seen := state.recent.find(key.RootID); seen && root.Sender == e.scorer.me {
		thread.Participated = true
		thread.RootChecked = true
	}
	byRoot := e.threads[key.RoomID]
	if byRoot == nil {
		byRoot = map[id.EventID]*ThreadRow{}
		e.threads[key.RoomID] = byRoot
	}
	byRoot[key.RootID] = thread
	delete(batch.deleteThreads, key)
	batch.saveThread(key)
	return thread
}

func (e *Engine) roomCounts(roomID id.RoomID) RoomCount {
	count := RoomCount{RoomID: roomID}
	state, ok := e.rooms[roomID]
	if !ok {
		return count
	}
	count.NotificationCount, count.HighlightCount = state.Unread.counts()
	count.Uncounted = state.Unread.CutBeforeTS != 0
	for _, thread := range e.threads[roomID] {
		notifs, highlights := thread.Unread.counts()
		if thread.Participated {
			count.NotificationCount += notifs
			count.Uncounted = count.Uncounted || thread.Unread.CutBeforeTS != 0
		} else {
			count.NotificationCount += highlights
		}
		count.HighlightCount += highlights
	}
	return count
}

func (e *Engine) threadCount(key ThreadKey) ThreadCount {
	count := ThreadCount{RoomID: key.RoomID, RootID: key.RootID}
	if thread, ok := e.thread(key); ok {
		count.NotificationCount, count.HighlightCount = thread.Unread.counts()
		count.Uncounted = thread.Unread.CutBeforeTS != 0
		count.Participated = thread.Participated
		count.LastActivityTS = thread.LastActivityTS
	}
	return count
}

func (e *Engine) Fold(response *syncwire.Response, decryptedByEventID map[string][]byte) *Update {
	batch := newFoldBatch()

	e.mu.Lock()
	defer e.mu.Unlock()

	batch.modes, e.pendingModes = e.pendingModes, nil

	roomIDs := sortedRoomIDs(response.Rooms)
	for _, roomID := range roomIDs {
		room := response.Rooms[string(roomID)]

		if e.ownMembershipIn(room) == ownMembershipGone {
			e.forget(roomID, batch)
			continue
		}

		if room.Limited {
			if oldestID, _ := oldestEvent(room.Timeline); oldestID != "" {
				if _, seen := e.stateFor(roomID).recent.find(oldestID); seen {
					batch.oldestSeenBefore[roomID] = struct{}{}
				}
			}
		}

		e.remember(roomID, room)
	}

	e.foldOwnReceipts(response.Extensions.Receipts, batch)

	e.rescoreLateDecryptions(response, decryptedByEventID, batch)

	for _, roomID := range roomIDs {
		if _, gone := batch.forgotten[roomID]; gone {
			continue
		}
		room := response.Rooms[string(roomID)]
		if room.IsInvite() {
			e.scoreInvite(roomID, room, batch)
		}
		e.foldRoom(roomID, room, decryptedByEventID, batch)
	}
	e.synced = true

	batch.candidates = slices.DeleteFunc(batch.candidates, func(candidate toastCandidate) bool {
		return slices.Contains(batch.redacted, candidate.toast.EventID)
	})
	var folded, dropped int
	batch.toasts, folded, dropped = fitToasts(batch.candidates)
	if folded > 0 || dropped > 0 {
		e.logger.Info().
			Int("candidates", len(batch.candidates)).
			Int("folded", folded).
			Int("dropped", dropped).
			Int("cap", maxToastsPerBatch).
			Msg("toasts over the per-batch cap — folded per room")
	}

	return e.buildUpdate(batch)
}

func (e *Engine) rescoreLateDecryptions(response *syncwire.Response, decryptedByEventID map[string][]byte, batch *foldBatch) {
	if len(decryptedByEventID) == 0 {
		return
	}
	inThisBatch := map[string]struct{}{}
	for _, room := range response.Rooms {
		for _, raw := range room.Timeline {
			var stamp struct {
				ID string `json:"event_id"`
			}
			if jsonv2.Unmarshal(raw, &stamp) == nil {
				inThisBatch[stamp.ID] = struct{}{}
			}
		}
	}
	for eventID, plaintext := range decryptedByEventID {
		if _, fresh := inThisBatch[eventID]; fresh {
			continue
		}
		var opened event.Event
		if jsonv2.Unmarshal(plaintext, &opened) != nil {
			continue
		}
		if opened.ID == "" {
			opened.ID = id.EventID(eventID)
		}
		if opened.RoomID == "" {
			continue
		}
		if !e.rescoreIn(opened.RoomID, opened.ID, &opened, batch) {
			e.countLate(opened.RoomID, &opened, batch)
		}
	}
}

func (e *Engine) rescoreIn(roomID id.RoomID, eventID id.EventID, opened *event.Event, batch *foldBatch) bool {
	state, ok := e.rooms[roomID]
	if !ok {
		return false
	}
	if unread, found := findUnread(&state.Unread, eventID); found {
		if e.rescoreEntry(&state.Unread, unread, opened, state) {
			batch.saveRoom(roomID)
			batch.markDirty(roomID)
		}
		return true
	}
	for rootID, thread := range e.threads[roomID] {
		if unread, found := findUnread(&thread.Unread, eventID); found {
			if e.rescoreEntry(&thread.Unread, unread, opened, state) {
				key := ThreadKey{RoomID: roomID, RootID: rootID}
				batch.saveThread(key)
				batch.markThreadDirty(key)
				batch.markDirty(roomID)
			}
			return true
		}
	}
	return false
}

func (e *Engine) countLate(roomID id.RoomID, opened *event.Event, batch *foldBatch) {
	state, ok := e.rooms[roomID]
	if !ok || state.Mode == ModeMute || !e.scorer.marksUnread(opened) {
		return
	}
	actions := e.scorer.actions(opened, state.MemberCount)
	if !actions.Notify && !actions.Highlight {
		return
	}
	entry := UnreadEvent{ID: opened.ID, TS: opened.Timestamp, Notify: actions.Notify, Highlight: actions.Highlight}
	if rootID := threadRootOf(opened, opened); rootID != "" {
		key := ThreadKey{RoomID: roomID, RootID: rootID}
		readTo := state.ThreadsReadTS
		if thread, known := e.thread(key); known {
			readTo = thread.LastSeenTS
		}
		if entry.TS <= readTo {
			return
		}
		thread := e.threadFor(key, batch)
		thread.Unread.add(entry)
		batch.saveThread(key)
		batch.markThreadDirty(key)
		if thread.Participated || actions.Highlight {
			batch.markDirty(roomID)
		}
		return
	}
	if entry.TS <= state.LastSeenTS {
		return
	}
	state.Unread.add(entry)
	batch.saveRoom(roomID)
	batch.markDirty(roomID)
}

func (e *Engine) rescoreEntry(unread *Unread, entry UnreadEvent, opened *event.Event, state *roomState) bool {
	if !e.scorer.marksUnread(opened) {
		return unread.remove(entry.ID)
	}
	actions := e.scorer.actions(opened, state.MemberCount)
	if !actions.Notify && !actions.Highlight {
		return unread.remove(entry.ID)
	}
	if entry.Notify == actions.Notify && entry.Highlight == actions.Highlight {
		return false
	}
	unread.remove(entry.ID)
	entry.Notify, entry.Highlight = actions.Notify, actions.Highlight
	unread.add(entry)
	return true
}

func findUnread(unread *Unread, eventID id.EventID) (UnreadEvent, bool) {
	for _, entry := range unread.Events {
		if entry.ID == eventID && eventID != "" {
			return entry, true
		}
	}
	return UnreadEvent{}, false
}

func (e *Engine) remember(roomID id.RoomID, room syncwire.Room) {
	state := e.stateFor(roomID)
	for _, raw := range room.Timeline {
		var stamp struct {
			ID      id.EventID `json:"event_id"`
			TS      int64      `json:"origin_server_ts"`
			Sender  id.UserID  `json:"sender"`
			Content struct {
				RelatesTo struct {
					RelType string `json:"rel_type"`
				} `json:"m.relates_to"`
			} `json:"content"`
		}
		if jsonv2.Unmarshal(raw, &stamp) == nil {
			state.recent.remember(seenEvent{ID: stamp.ID, TS: stamp.TS, Sender: stamp.Sender,
				InThread: stamp.Content.RelatesTo.RelType == event.RelThread})
		}
	}
}

func (e *Engine) foldRoom(roomID id.RoomID, room syncwire.Room, decryptedByEventID map[string][]byte, batch *foldBatch) {
	state := e.stateFor(roomID)

	if room.JoinedCount > 0 {
		state.MemberCount = room.JoinedCount
	}
	if room.Name != "" {
		state.name = room.Name
	}

	if !state.GroupDM && (isGroupDM(room.RequiredState) || isGroupDM(room.Timeline)) {
		state.GroupDM = true
		batch.saveRoom(roomID)
	}

	if state.LastSeenTS == 0 || state.ThreadsReadTS == 0 {
		if joinedTS := e.ownJoinTS(room); joinedTS > 0 {
			if state.LastSeenTS == 0 {
				state.LastSeenTS = joinedTS
				e.logger.Debug().Str("room", roomID.String()).Int64("ts", joinedTS).Msg("read point set to the join")
			}
			if state.ThreadsReadTS == 0 {
				state.ThreadsReadTS = joinedTS
			}
			batch.saveRoom(roomID)
		}
	}

	if state.Mode == ModeMute {
		return
	}

	if _, seenBefore := batch.oldestSeenBefore[roomID]; room.Limited && !seenBefore {
		if oldestID, oldest := oldestEvent(room.Timeline); oldest > state.LastSeenTS &&
			oldest > state.Unread.CutBeforeTS && !state.Unread.has(oldestID) {
			state.Unread.CutBeforeTS = oldest
			batch.saveRoom(roomID)
			batch.markDirty(roomID)
		}
	}

	e.scoreTimeline(roomID, room, state, decryptedByEventID, batch)
}

const groupDMType = "chat.tryzigzag.group_dm"

func isGroupDM(events []jsontext.Value) bool {
	for _, raw := range events {
		var create struct {
			Type    string `json:"type"`
			Content struct {
				Type string `json:"type"`
			} `json:"content"`
		}
		if jsonv2.Unmarshal(raw, &create) == nil && create.Type == "m.room.create" && create.Content.Type == groupDMType {
			return true
		}
	}
	return false
}

type ownMembership int

const (
	ownMembershipUnchanged ownMembership = iota
	ownMembershipPresent
	ownMembershipGone
)

func (e *Engine) ownMembershipIn(room syncwire.Room) ownMembership {
	me := string(e.scorer.me)
	var newestTS int64 = -1
	verdict := ownMembershipUnchanged
	for _, events := range [][]jsontext.Value{room.RequiredState, room.Timeline} {
		for _, raw := range events {
			var member struct {
				Type     string `json:"type"`
				StateKey string `json:"state_key"`
				TS       int64  `json:"origin_server_ts"`
				Content  struct {
					Membership string `json:"membership"`
				} `json:"content"`
			}
			if jsonv2.Unmarshal(raw, &member) != nil || member.Type != "m.room.member" || member.StateKey != me {
				continue
			}
			if member.TS < newestTS {
				continue
			}
			newestTS = member.TS
			if member.Content.Membership == "leave" || member.Content.Membership == "ban" {
				verdict = ownMembershipGone
			} else {
				verdict = ownMembershipPresent
			}
		}
	}
	return verdict
}

func (e *Engine) forget(roomID id.RoomID, batch *foldBatch) {
	_, known := e.rooms[roomID]

	for rootID := range e.threads[roomID] {
		batch.forgottenThreads[ThreadKey{RoomID: roomID, RootID: rootID}] = struct{}{}
	}
	known = known || len(e.threads[roomID]) > 0

	if state, ok := e.rooms[roomID]; ok && state.Mode != ModeAll {
		e.keptModes[roomID] = state.Mode
	}
	delete(e.rooms, roomID)
	delete(e.threads, roomID)
	delete(e.toldInvites, roomID)
	for key := range e.rootChecks {
		if key.RoomID == roomID {
			delete(e.rootChecks, key)
		}
	}
	for lookup := range e.receiptLookups {
		if lookup.RoomID == roomID {
			delete(e.receiptLookups, lookup)
		}
	}
	batch.forgotten[roomID] = struct{}{}
	if known {
		batch.markDirty(roomID)
	}
	e.logger.Debug().Str("room", roomID.String()).Msg("left the room: its unread state is forgotten")
}

func (e *Engine) ForgetRoom(roomID id.RoomID) *Update {
	e.mu.Lock()
	defer e.mu.Unlock()
	_, known := e.rooms[roomID]
	if !known && len(e.threads[roomID]) == 0 {
		return nil
	}
	batch := newFoldBatch()
	e.forget(roomID, batch)
	return e.buildUpdate(batch)
}

func (e *Engine) foldOwnReceipts(receipts syncwire.ReceiptsExt, batch *foldBatch) {
	roomIDs := make([]string, 0, len(receipts.Rooms))
	for roomID := range receipts.Rooms {
		roomIDs = append(roomIDs, roomID)
	}
	sort.Strings(roomIDs)

	for _, rawID := range roomIDs {
		roomID := id.RoomID(rawID)
		if _, gone := batch.forgotten[roomID]; gone {
			continue
		}
		for _, receipt := range e.ownReceiptsIn(receipts.Rooms[rawID]) {
			lookup := ReceiptLookup{RoomID: roomID, EventID: receipt.eventID, ThreadID: receipt.threadID}
			if eventTS, found := e.eventTS(roomID, receipt.eventID); found {
				e.rememberReceiptEvent(roomID, KnownEvent{ID: receipt.eventID, TS: eventTS}, batch)
				e.moveReadPoint(lookup, eventTS, batch)
				continue
			}

			if receipt.receiptTS <= e.pointFor(lookup) {
				continue
			}
			if _, queued := e.receiptLookups[lookup]; !queued {
				e.receiptLookups[lookup] = &retry{}
			}
		}
	}
}

type ownReceipt struct {
	eventID   id.EventID
	receiptTS int64
	threadID  string
}

func (e *Engine) ownReceiptsIn(raw jsontext.Value) []ownReceipt {
	var receipt struct {
		Content map[string]map[string]map[string]struct {
			TS       int64  `json:"ts"`
			ThreadID string `json:"thread_id"`
		} `json:"content"`
	}
	if err := jsonv2.Unmarshal(raw, &receipt); err != nil {
		return nil
	}

	me := string(e.scorer.me)
	var own []ownReceipt
	eventIDs := make([]string, 0, len(receipt.Content))
	for eventID := range receipt.Content {
		eventIDs = append(eventIDs, eventID)
	}
	sort.Strings(eventIDs)
	for _, eventID := range eventIDs {
		byType := receipt.Content[eventID]
		for _, receiptType := range []event.ReceiptType{event.ReceiptTypeRead, event.ReceiptTypeReadPrivate} {
			entry, ok := byType[string(receiptType)][me]
			if !ok {
				continue
			}
			own = append(own, ownReceipt{eventID: id.EventID(eventID), receiptTS: entry.TS, threadID: entry.ThreadID})
		}
	}
	return own
}

func (e *Engine) eventTS(roomID id.RoomID, eventID id.EventID) (int64, bool) {
	state, ok := e.rooms[roomID]
	if !ok || eventID == "" {
		return 0, false
	}
	if seen, found := state.recent.find(eventID); found {
		return seen.TS, true
	}
	if ts, found := state.Unread.timestampOf(eventID); found {
		return ts, true
	}
	for _, thread := range e.threads[roomID] {
		if ts, found := thread.Unread.timestampOf(eventID); found {
			return ts, true
		}
	}
	return 0, false
}

func (e *Engine) rememberReceiptEvent(roomID id.RoomID, event KnownEvent, batch *foldBatch) {
	state := e.stateFor(roomID)
	var added bool
	if state.ReceiptEvents, added = rememberReceiptEvent(state.ReceiptEvents, event); added {
		batch.saveRoom(roomID)
	}
}

func (e *Engine) pointFor(lookup ReceiptLookup) int64 {
	state := e.stateFor(lookup.RoomID)
	switch lookup.ThreadID {
	case "":
		return min(state.LastSeenTS, state.ThreadsReadTS)
	case event.ReadReceiptThreadMain.String():
		return state.LastSeenTS
	default:
		if thread, ok := e.thread(ThreadKey{RoomID: lookup.RoomID, RootID: id.EventID(lookup.ThreadID)}); ok {
			return thread.LastSeenTS
		}
		return state.ThreadsReadTS
	}
}

func (e *Engine) moveReadPoint(lookup ReceiptLookup, eventTS int64, batch *foldBatch) {
	switch lookup.ThreadID {
	case "":

		e.readMain(lookup.RoomID, eventTS, batch)
		state := e.stateFor(lookup.RoomID)
		if eventTS > state.ThreadsReadTS {
			state.ThreadsReadTS = eventTS
			batch.saveRoom(lookup.RoomID)
		}
		for rootID, thread := range e.threads[lookup.RoomID] {
			e.readThread(ThreadKey{RoomID: lookup.RoomID, RootID: rootID}, thread, eventTS, batch)
		}
		e.pruneThreads(lookup.RoomID, batch)
	case event.ReadReceiptThreadMain.String():
		e.readMain(lookup.RoomID, eventTS, batch)
	default:
		key := ThreadKey{RoomID: lookup.RoomID, RootID: id.EventID(lookup.ThreadID)}
		e.readThread(key, e.threadFor(key, batch), eventTS, batch)
	}
}

func (e *Engine) readMain(roomID id.RoomID, ts int64, batch *foldBatch) {
	state := e.stateFor(roomID)
	if ts <= state.LastSeenTS {
		return
	}
	state.LastSeenTS = ts
	batch.saveRoom(roomID)
	if state.Unread.readUpTo(ts) {
		batch.markDirty(roomID)
	}
}

func (e *Engine) readThread(key ThreadKey, thread *ThreadRow, ts int64, batch *foldBatch) {
	if ts <= thread.LastSeenTS {
		return
	}
	thread.LastSeenTS = ts
	batch.saveThread(key)
	if thread.Unread.readUpTo(ts) {
		batch.markThreadDirty(key)
		batch.markDirty(key.RoomID)
	}
}

func (e *Engine) pruneThreads(roomID id.RoomID, batch *foldBatch) {
	state := e.stateFor(roomID)
	for rootID, thread := range e.threads[roomID] {
		if thread.Participated || !thread.Unread.isEmpty() ||
			thread.LastSeenTS > state.ThreadsReadTS || thread.LastActivityTS > state.ThreadsReadTS {
			continue
		}
		key := ThreadKey{RoomID: roomID, RootID: rootID}
		delete(e.threads[roomID], rootID)
		delete(e.rootChecks, key)
		delete(batch.saveThreads, key)
		batch.deleteThreads[key] = struct{}{}
	}
}

func (e *Engine) ownJoinTS(room syncwire.Room) int64 {
	me := string(e.scorer.me)
	var joinedTS, changedTS int64
	for _, events := range [][]jsontext.Value{room.RequiredState, room.Timeline} {
		for _, raw := range events {
			var member struct {
				Type     string `json:"type"`
				StateKey string `json:"state_key"`
				TS       int64  `json:"origin_server_ts"`
				Content  struct {
					Membership string `json:"membership"`
				} `json:"content"`
				Unsigned struct {
					PrevContent struct {
						Membership string `json:"membership"`
					} `json:"prev_content"`
				} `json:"unsigned"`
			}
			if jsonv2.Unmarshal(raw, &member) != nil {
				continue
			}
			if member.Type != "m.room.member" || member.StateKey != me || member.Content.Membership != "join" {
				continue
			}
			if member.Unsigned.PrevContent.Membership == "join" {
				changedTS = max(changedTS, member.TS)
			} else {
				joinedTS = max(joinedTS, member.TS)
			}
		}
	}
	if joinedTS > 0 {
		return joinedTS
	}
	return changedTS
}

func (e *Engine) scoreTimeline(roomID id.RoomID, room syncwire.Room, state *roomState, decryptedByEventID map[string][]byte, batch *foldBatch) {
	for _, raw := range liveSlice(room) {
		var envelope event.Event
		if err := jsonv2.Unmarshal(raw, &envelope); err != nil {
			continue
		}

		if envelope.Type == event.EventRedaction {
			e.unreadRedacted(roomID, redactedEventOf(&envelope), batch)
			continue
		}

		if envelope.Unsigned.RedactedBecause != nil {
			e.unreadRedacted(roomID, envelope.ID, batch)
			continue
		}
		evt := openedEvent(&envelope, decryptedByEventID)
		eventID, eventTS := envelope.ID, evt.Timestamp
		if eventTS == 0 {
			eventTS = envelope.Timestamp
		}

		if rootID := threadRootOf(&envelope, evt); rootID != "" {
			e.scoreThreadReply(ThreadKey{RoomID: roomID, RootID: rootID}, eventID, eventTS, evt, !room.Initial, state, batch)
			continue
		}

		if ownMessage(evt, e.scorer.me) {
			e.readMain(roomID, eventTS, batch)
			continue
		}
		if eventTS <= state.LastSeenTS {
			continue
		}
		if state.Unread.has(eventID) {

			if _, opened := decryptedByEventID[string(eventID)]; opened && e.rescoreIn(roomID, eventID, evt, batch) {
				batch.saveRoom(roomID)
			}
			continue
		}
		if !e.scorer.marksUnread(evt) {
			continue
		}

		actions := e.scorer.actions(evt, state.MemberCount)
		if !actions.Notify && !actions.Highlight {
			continue
		}
		state.Unread.add(UnreadEvent{ID: eventID, TS: eventTS, Notify: actions.Notify, Highlight: actions.Highlight})
		batch.saveRoom(roomID)
		batch.markDirty(roomID)

		fires := actions.Notify && (e.modeOf(state) != ModeMentions || actions.Highlight)

		if !fires || room.Initial {
			continue
		}
		e.addToast(roomID, "", evt, actions, state, batch)
	}
}

func (e *Engine) scoreThreadReply(key ThreadKey, eventID id.EventID, eventTS int64, evt *event.Event, toast bool, state *roomState, batch *foldBatch) {
	thread := e.threadFor(key, batch)

	if eventTS > thread.LastActivityTS {
		thread.LastActivityTS = eventTS
		batch.saveThread(key)
	}

	if evt.Sender == e.scorer.me {
		if !thread.Participated {
			thread.Participated = true
			batch.saveThread(key)
			if !thread.Unread.isEmpty() {
				batch.markDirty(key.RoomID)
			}
		}
		e.readThread(key, thread, eventTS, batch)
		return
	}

	if eventTS <= thread.LastSeenTS {
		return
	}
	if thread.Unread.has(eventID) {
		if evt.Type.Type != event.EventEncrypted.Type {
			e.rescoreIn(key.RoomID, eventID, evt, batch)
		}
		return
	}
	if !e.scorer.marksUnread(evt) {
		return
	}
	actions := e.scorer.actions(evt, state.MemberCount)
	if !actions.Notify && !actions.Highlight {
		return
	}
	thread.Unread.add(UnreadEvent{ID: eventID, TS: eventTS, Notify: actions.Notify, Highlight: actions.Highlight})

	fires := actions.Notify && (e.modeOf(state) != ModeMentions || actions.Highlight)
	batch.saveThread(key)
	batch.markThreadDirty(key)

	if !thread.Participated && !actions.Highlight {
		return
	}
	batch.markDirty(key.RoomID)
	if !fires || !toast {
		return
	}
	e.addToast(key.RoomID, key.RootID, evt, actions, state, batch)
}

func (e *Engine) unreadRedacted(roomID id.RoomID, redacted id.EventID, batch *foldBatch) {
	if redacted == "" {
		return
	}

	batch.redacted = append(batch.redacted, redacted)
	if state, ok := e.rooms[roomID]; ok && state.Unread.remove(redacted) {
		batch.saveRoom(roomID)
		batch.markDirty(roomID)
		return
	}
	for rootID, thread := range e.threads[roomID] {
		if thread.Unread.remove(redacted) {
			key := ThreadKey{RoomID: roomID, RootID: rootID}
			batch.saveThread(key)
			batch.markThreadDirty(key)
			batch.markDirty(roomID)
			return
		}
	}
}

func ownMessage(evt *event.Event, me id.UserID) bool {
	if evt.Sender != me || evt.StateKey != nil {
		return false
	}
	switch evt.Type.Type {
	case event.EventMessage.Type, event.EventEncrypted.Type, event.EventSticker.Type:
	default:
		return false
	}
	if relatesTo, ok := evt.Content.GetRaw()["m.relates_to"].(map[string]any); ok {
		if relType, _ := relatesTo["rel_type"].(string); relType == event.RelReplace || relType == event.RelAnnotation {
			return false
		}
	}
	return true
}

func (e *Engine) scoreInvite(roomID id.RoomID, room syncwire.Room, batch *foldBatch) {
	inviter, name, direct, group, ok := e.inviteOf(room)
	if !ok {
		return
	}
	if _, told := e.toldInvites[roomID]; told {
		return
	}
	e.toldInvites[roomID] = struct{}{}

	if !e.synced {
		return
	}
	now := e.now().UnixMilli()
	if now < e.dndUntil {
		return
	}

	body := "Invited you to a room"
	switch {
	case group && name != "":
		body = "Added you to " + name
	case group:
		body = "Added you to a group"
	case name != "":
		body = "Invited you to " + name
	case direct:
		body = "Invited you to a direct chat"
	}
	batch.candidates = append(batch.candidates, toastCandidate{
		toast: Toast{RoomID: roomID, SenderName: senderLabel(inviter), Body: body, Sound: true},
		ts:    now,
	})
}

func (e *Engine) inviteOf(room syncwire.Room) (inviter id.UserID, name string, direct, group, ok bool) {
	name = room.Name
	for _, raw := range *room.InviteState {
		var evt struct {
			Type     string    `json:"type"`
			StateKey *string   `json:"state_key"`
			Sender   id.UserID `json:"sender"`
			Content  struct {
				Membership string `json:"membership"`
				IsDirect   bool   `json:"is_direct"`
				Name       string `json:"name"`
				Type       string `json:"type"`
			} `json:"content"`
		}
		if jsonv2.Unmarshal(raw, &evt) != nil || evt.StateKey == nil {
			continue
		}
		switch {
		case evt.Type == "m.room.member" && *evt.StateKey == string(e.scorer.me):
			inviter, direct = evt.Sender, evt.Content.IsDirect
			ok = evt.Content.Membership == "invite"
		case evt.Type == "m.room.name" && name == "":
			name = evt.Content.Name
		case evt.Type == "m.room.create":
			group = evt.Content.Type == groupDMType
		}
	}
	return inviter, name, direct, group, ok
}

func redactedEventOf(redaction *event.Event) id.EventID {
	if redaction.Redacts != "" {
		return redaction.Redacts
	}
	redacts, _ := redaction.Content.GetRaw()["redacts"].(string)
	return id.EventID(redacts)
}

func (e *Engine) addToast(roomID id.RoomID, threadRoot id.EventID, evt *event.Event, actions pushActions, state *roomState, batch *foldBatch) {
	toast := e.makeToast(roomID, evt, actions, state)
	toast.ThreadRootID = threadRoot
	batch.candidates = append(batch.candidates, toastCandidate{toast: toast, ts: evt.Timestamp})
}

func (e *Engine) makeToast(roomID id.RoomID, evt *event.Event, actions pushActions, state *roomState) Toast {
	return Toast{
		RoomID:     roomID,
		EventID:    evt.ID,
		RoomName:   e.nameFor(roomID, state),
		SenderName: senderLabel(evt.Sender),
		Body:       toastBody(evt),
		Highlight:  actions.Highlight,
		Sound:      actions.PlaySound || state.GroupDM,
		roomUnread: e.roomCounts(roomID).NotificationCount,
	}
}

func (e *Engine) nameFor(roomID id.RoomID, state *roomState) string {
	if state.name != "" {
		return state.name
	}
	if names := e.frontendNames.Load(); names != nil {
		return (*names)[roomID]
	}
	return ""
}

func (e *Engine) SetRoomNames(names map[id.RoomID]string) {
	e.frontendNames.Store(&names)
}

func (e *Engine) SetMode(roomID id.RoomID, mode Mode) *Update {
	e.mu.Lock()
	defer e.mu.Unlock()

	state := e.stateFor(roomID)
	state.Mode = mode
	e.pendingModes = append(e.pendingModes, ModeRow{RoomID: roomID, Mode: mode.String()})

	if mode != ModeMute {
		return nil
	}

	batch := newFoldBatch()
	if state.Unread.clear() {
		batch.saveRoom(roomID)
		batch.markDirty(roomID)
	}
	for rootID, thread := range e.threads[roomID] {
		if thread.Unread.clear() {
			key := ThreadKey{RoomID: roomID, RootID: rootID}
			batch.saveThread(key)
			batch.markThreadDirty(key)
			batch.markDirty(roomID)
		}
	}
	return e.buildUpdate(batch)
}

func (e *Engine) modeOf(state *roomState) Mode {
	if state.Mode == ModeAll && e.now().UnixMilli() < e.dndUntil {
		return ModeMentions
	}
	return state.Mode
}

func (e *Engine) SetDND(untilMS int64) *Update {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.dndUntil = untilMS
	update := newUpdate()
	update.DNDUntil = &untilMS
	return update
}

func (e *Engine) LastSeenTS(roomID id.RoomID) int64 {
	e.mu.Lock()
	defer e.mu.Unlock()

	if state, ok := e.rooms[roomID]; ok {
		return state.LastSeenTS
	}
	return 0
}

func (e *Engine) MarkRead(roomID id.RoomID, eventTS int64) *Update {
	e.mu.Lock()
	defer e.mu.Unlock()

	if eventTS <= 0 {
		eventTS = e.newestKnownTS(roomID)
		if eventTS <= 0 {
			return nil
		}
	}
	batch := newFoldBatch()
	e.readMain(roomID, eventTS, batch)
	return e.buildUpdate(batch)
}

func (e *Engine) newestKnownTS(roomID id.RoomID) int64 {
	state, ok := e.rooms[roomID]
	if !ok {
		return 0
	}

	newest := max(state.recent.newestMainTS(), state.Unread.CutBeforeTS)
	for _, unread := range state.Unread.Events {
		newest = max(newest, unread.TS)
	}
	return newest
}

func (e *Engine) Snapshot() *Update {
	e.mu.Lock()
	defer e.mu.Unlock()

	update := newUpdate()

	dndUntil := e.dndUntil
	update.DNDUntil = &dndUntil
	for _, roomID := range sortedRoomIDs(e.rooms) {
		state := e.rooms[roomID]

		count := e.roomCounts(roomID)
		if count.NotificationCount != 0 || count.HighlightCount != 0 || count.Uncounted {
			update.Rooms = append(update.Rooms, count)
		}

		if state.Mode != ModeAll {
			update.Modes = append(update.Modes, ModeRow{RoomID: roomID, Mode: state.Mode.String()})
		}
	}
	for _, roomID := range sortedRoomIDs(e.keptModes) {
		update.Modes = append(update.Modes, ModeRow{RoomID: roomID, Mode: e.keptModes[roomID].String()})
	}

	for roomID, byRoot := range e.threads {
		for rootID, thread := range byRoot {
			if !thread.Unread.isEmpty() || thread.Participated {
				update.ThreadCounts = append(update.ThreadCounts, e.threadCount(ThreadKey{RoomID: roomID, RootID: rootID}))
			}
		}
	}
	sortThreadCounts(update.ThreadCounts)

	e.seq++
	update.Seq = e.seq
	return update
}

func (e *Engine) Publish(ctx context.Context, update *Update, emit func(*Update)) error {
	if update == nil {
		return nil
	}
	e.publishMu.Lock()
	defer e.publishMu.Unlock()

	e.mu.Lock()
	rooms := make(map[id.RoomID]Row, len(update.SaveRooms))
	for _, roomID := range update.SaveRooms {
		if state, ok := e.rooms[roomID]; ok {
			rooms[roomID] = state.Row.clone()
		}
	}
	threads := make(map[ThreadKey]ThreadRow, len(update.SaveThreads))
	for _, key := range update.SaveThreads {
		if thread, ok := e.thread(key); ok {
			row := *thread
			row.Unread = row.Unread.clone()
			threads[key] = row
		}
	}

	for _, key := range update.DeleteThreads {
		if thread, back := e.thread(key); back {
			row := *thread
			row.Unread = row.Unread.clone()
			threads[key] = row
		}
	}
	for _, roomID := range update.ForgetRooms {
		if state, back := e.rooms[roomID]; back {
			rooms[roomID] = state.Row.clone()
		}
		for rootID, thread := range e.threads[roomID] {
			row := *thread
			row.Unread = row.Unread.clone()
			threads[ThreadKey{RoomID: roomID, RootID: rootID}] = row
		}
	}
	for i := range update.Rooms {
		update.Rooms[i] = e.roomCounts(update.Rooms[i].RoomID)
	}
	for i := range update.ThreadCounts {
		update.ThreadCounts[i] = e.threadCount(ThreadKey{RoomID: update.ThreadCounts[i].RoomID, RootID: update.ThreadCounts[i].RootID})
	}
	e.seq++
	update.Seq = e.seq
	e.mu.Unlock()

	var saveErr error
	if e.store != nil {
		if len(update.ForgetRooms) > 0 {
			saveErr = errors.Join(saveErr, e.store.ForgetRooms(ctx, update.ForgetRooms))
		}
		if len(update.DeleteThreads) > 0 {
			saveErr = errors.Join(saveErr, e.store.DeleteThreads(ctx, update.DeleteThreads))
		}
		if len(rooms) > 0 {
			saveErr = errors.Join(saveErr, e.store.SaveRooms(ctx, rooms))
		}
		if len(threads) > 0 {
			saveErr = errors.Join(saveErr, e.store.SaveThreads(ctx, threads))
		}
	}
	if emit != nil && update.HasWireContent() {
		emit(update)
	}
	return saveErr
}

func (e *Engine) TakeRootChecks() []ThreadKey {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := e.now()
	var keys []ThreadKey
	for roomID, byRoot := range e.threads {
		for rootID, thread := range byRoot {
			if thread.Participated || thread.RootChecked {
				continue
			}
			key := ThreadKey{RoomID: roomID, RootID: rootID}
			pacing := e.rootChecks[key]
			if pacing == nil {
				pacing = &retry{}
				e.rootChecks[key] = pacing
			}
			if pacing.due(now) {
				keys = append(keys, key)
			}
		}
	}
	sortThreadKeys(keys)
	return keys
}

func (e *Engine) SetRootChecked(key ThreadKey, takingPart bool) *Update {
	e.mu.Lock()
	defer e.mu.Unlock()

	delete(e.rootChecks, key)
	thread, ok := e.thread(key)
	if !ok {
		return nil
	}
	batch := newFoldBatch()
	thread.RootChecked = true
	batch.saveThread(key)
	if takingPart && !thread.Participated {
		thread.Participated = true

		if !thread.Unread.isEmpty() {
			batch.markDirty(key.RoomID)
		}
	}
	return e.buildUpdate(batch)
}

func (e *Engine) RootCheckFailed(key ThreadKey, final bool) *Update {
	e.mu.Lock()
	defer e.mu.Unlock()

	pacing, ok := e.rootChecks[key]
	if !ok {
		return nil
	}
	if !final && !pacing.failed(e.now()) {
		return nil
	}
	delete(e.rootChecks, key)
	thread, ok := e.thread(key)
	if !ok {
		return nil
	}
	thread.RootChecked = true
	batch := newFoldBatch()
	batch.saveThread(key)
	return e.buildUpdate(batch)
}

func (e *Engine) TakeReceiptLookups() []ReceiptLookup {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := e.now()
	var lookups []ReceiptLookup
	for lookup, pacing := range e.receiptLookups {
		if pacing.due(now) {
			lookups = append(lookups, lookup)
		}
	}
	sort.Slice(lookups, func(i, j int) bool {
		if lookups[i].RoomID != lookups[j].RoomID {
			return lookups[i].RoomID < lookups[j].RoomID
		}
		if lookups[i].EventID != lookups[j].EventID {
			return lookups[i].EventID < lookups[j].EventID
		}
		return lookups[i].ThreadID < lookups[j].ThreadID
	})
	return lookups
}

func (e *Engine) ResolveReceipt(lookup ReceiptLookup, eventTS int64) *Update {
	e.mu.Lock()
	defer e.mu.Unlock()

	if _, asked := e.receiptLookups[lookup]; !asked {
		return nil
	}
	delete(e.receiptLookups, lookup)
	batch := newFoldBatch()
	e.rememberReceiptEvent(lookup.RoomID, KnownEvent{ID: lookup.EventID, TS: eventTS}, batch)
	e.stateFor(lookup.RoomID).recent.remember(seenEvent{ID: lookup.EventID, TS: eventTS})
	e.moveReadPoint(lookup, eventTS, batch)
	return e.buildUpdate(batch)
}

func (e *Engine) ReceiptLookupFailed(lookup ReceiptLookup, final bool) {
	e.mu.Lock()
	defer e.mu.Unlock()

	pacing, ok := e.receiptLookups[lookup]
	if !ok {
		return
	}
	if final || pacing.failed(e.now()) {
		delete(e.receiptLookups, lookup)
	}
}

type ServerThread struct {
	RootID       id.EventID
	Latest       *event.Event
	Participated bool
}

func (e *Engine) ThreadsFromServer(roomID id.RoomID, listed []ServerThread) *Update {
	e.mu.Lock()
	defer e.mu.Unlock()

	state, known := e.rooms[roomID]
	if !known {
		return nil
	}
	batch := newFoldBatch()
	for _, listedThread := range listed {
		latest := listedThread.Latest
		if latest == nil {
			continue
		}
		latestTS := latest.Timestamp
		key := ThreadKey{RoomID: roomID, RootID: listedThread.RootID}
		thread, known := e.thread(key)
		if !known {
			if !listedThread.Participated {
				continue
			}
			thread = e.threadFor(key, batch)

			readTo := latestTS
			if delivered := state.recent.newestTS(); delivered > 0 {
				readTo = min(readTo, delivered)
			}
			thread.LastSeenTS = max(readTo, thread.LastSeenTS)
		} else if e.missedReply(state, thread, latest) {
			thread.Unread.CutBeforeTS = latestTS
			batch.saveThread(key)
			if thread.Participated {
				batch.markDirty(roomID)
			}
		}
		if listedThread.Participated && !thread.Participated {
			thread.Participated = true
			thread.RootChecked = true
			batch.saveThread(key)
			if !thread.Unread.isEmpty() {
				batch.markDirty(roomID)
			}
		}
		if latestTS > thread.LastActivityTS {
			thread.LastActivityTS = latestTS
			batch.saveThread(key)
		}
	}
	return e.buildUpdate(batch)
}

func (e *Engine) missedReply(state *roomState, thread *ThreadRow, latest *event.Event) bool {
	if state.Mode == ModeMute || latest.Timestamp <= thread.LastSeenTS || latest.Timestamp <= thread.Unread.CutBeforeTS {
		return false
	}

	if _, delivered := state.recent.find(latest.ID); delivered || thread.Unread.has(latest.ID) {
		return false
	}
	if !e.scorer.marksUnread(latest) {
		return false
	}
	actions := e.scorer.actions(latest, state.MemberCount)
	return actions.Notify || actions.Highlight
}

func (e *Engine) ThreadRepliesFromGap(roomID id.RoomID, events []*event.Event) *Update {
	e.mu.Lock()
	defer e.mu.Unlock()

	state, known := e.rooms[roomID]
	if !known || state.ThreadsReadTS == 0 || state.Mode == ModeMute {
		return nil
	}
	batch := newFoldBatch()
	for _, evt := range events {
		if evt == nil {
			continue
		}
		rootID := threadRootOf(evt, evt)
		if rootID == "" {
			continue
		}
		key := ThreadKey{RoomID: roomID, RootID: rootID}
		if _, kept := e.thread(key); !kept && evt.Sender != e.scorer.me && evt.Timestamp <= state.ThreadsReadTS {
			continue
		}
		e.scoreThreadReply(key, evt.ID, evt.Timestamp, evt, false, state, batch)
	}
	return e.buildUpdate(batch)
}

type foldBatch struct {
	dirty map[id.RoomID]struct{}

	dirtyThreads map[ThreadKey]struct{}

	saveRooms     map[id.RoomID]struct{}
	saveThreads   map[ThreadKey]struct{}
	deleteThreads map[ThreadKey]struct{}
	forgotten     map[id.RoomID]struct{}

	forgottenThreads map[ThreadKey]struct{}

	toasts []Toast
	modes  []ModeRow

	candidates []toastCandidate

	redacted []id.EventID

	oldestSeenBefore map[id.RoomID]struct{}
}

func newFoldBatch() *foldBatch {
	return &foldBatch{
		dirty:            map[id.RoomID]struct{}{},
		dirtyThreads:     map[ThreadKey]struct{}{},
		saveRooms:        map[id.RoomID]struct{}{},
		saveThreads:      map[ThreadKey]struct{}{},
		deleteThreads:    map[ThreadKey]struct{}{},
		forgotten:        map[id.RoomID]struct{}{},
		forgottenThreads: map[ThreadKey]struct{}{},
		oldestSeenBefore: map[id.RoomID]struct{}{},
	}
}

func (b *foldBatch) markDirty(roomID id.RoomID)    { b.dirty[roomID] = struct{}{} }
func (b *foldBatch) markThreadDirty(key ThreadKey) { b.dirtyThreads[key] = struct{}{} }
func (b *foldBatch) saveRoom(roomID id.RoomID)     { b.saveRooms[roomID] = struct{}{} }
func (b *foldBatch) saveThread(key ThreadKey)      { b.saveThreads[key] = struct{}{} }

func (e *Engine) buildUpdate(batch *foldBatch) *Update {
	update := newUpdate()

	for _, roomID := range sortedRoomIDs(batch.dirty) {
		update.Rooms = append(update.Rooms, e.roomCounts(roomID))
	}
	update.Events = append(update.Events, batch.toasts...)
	update.Redacted = batch.redacted
	update.Modes = append(update.Modes, batch.modes...)

	threadKeys := map[ThreadKey]struct{}{}
	for key := range batch.dirtyThreads {
		threadKeys[key] = struct{}{}
	}
	for key := range batch.saveThreads {
		threadKeys[key] = struct{}{}
	}
	for key := range batch.deleteThreads {
		threadKeys[key] = struct{}{}
	}
	for key := range batch.forgottenThreads {
		threadKeys[key] = struct{}{}
	}
	for key := range threadKeys {

		update.ThreadCounts = append(update.ThreadCounts, e.threadCount(key))
	}
	sortThreadCounts(update.ThreadCounts)

	for _, roomID := range sortedRoomIDs(batch.saveRooms) {
		if _, gone := batch.forgotten[roomID]; !gone {
			update.SaveRooms = append(update.SaveRooms, roomID)
		}
	}
	for key := range batch.saveThreads {
		if _, gone := batch.forgotten[key.RoomID]; !gone {
			update.SaveThreads = append(update.SaveThreads, key)
		}
	}
	sortThreadKeys(update.SaveThreads)
	for key := range batch.deleteThreads {
		update.DeleteThreads = append(update.DeleteThreads, key)
	}
	sortThreadKeys(update.DeleteThreads)
	update.ForgetRooms = sortedRoomIDs(batch.forgotten)
	if len(update.ForgetRooms) == 0 {
		update.ForgetRooms = nil
	}

	if update.isEmpty() {
		return nil
	}
	return update
}

func sortThreadCounts(counts []ThreadCount) {
	sort.Slice(counts, func(i, j int) bool {
		if counts[i].RoomID != counts[j].RoomID {
			return counts[i].RoomID < counts[j].RoomID
		}
		return counts[i].RootID < counts[j].RootID
	})
}

func sortThreadKeys(keys []ThreadKey) {
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].RoomID != keys[j].RoomID {
			return keys[i].RoomID < keys[j].RoomID
		}
		return keys[i].RootID < keys[j].RootID
	})
}

func oldestEvent(timeline []jsontext.Value) (id.EventID, int64) {
	var oldestID id.EventID
	var oldest int64
	for _, raw := range timeline {
		var stamp struct {
			ID id.EventID `json:"event_id"`
			TS int64      `json:"origin_server_ts"`
		}
		if jsonv2.Unmarshal(raw, &stamp) != nil || stamp.TS == 0 {
			continue
		}
		if oldest == 0 || stamp.TS < oldest {
			oldestID, oldest = stamp.ID, stamp.TS
		}
	}
	return oldestID, oldest
}

func liveSlice(room syncwire.Room) []jsontext.Value {
	if room.Initial {
		return room.Timeline
	}
	live := room.NumLive
	if live <= 0 {
		return nil
	}
	if live > len(room.Timeline) {
		live = len(room.Timeline)
	}
	return room.Timeline[len(room.Timeline)-live:]
}

func openedEvent(envelope *event.Event, decryptedByEventID map[string][]byte) *event.Event {
	if envelope.Type.Type != event.EventEncrypted.Type {
		return envelope
	}
	plaintext, ok := decryptedByEventID[string(envelope.ID)]
	if !ok {
		return envelope
	}

	var opened event.Event
	if err := jsonv2.Unmarshal(plaintext, &opened); err != nil {
		return envelope
	}
	return &opened
}

func threadRootOf(envelope, opened *event.Event) id.EventID {
	if envelope.StateKey != nil {
		return ""
	}
	for _, candidate := range []*event.Event{envelope, opened} {
		if candidate == nil {
			continue
		}
		relatesTo, ok := candidate.Content.GetRaw()["m.relates_to"].(map[string]any)
		if !ok {
			continue
		}
		if relType, _ := relatesTo["rel_type"].(string); relType != event.RelThread {
			continue
		}
		if rootID, _ := relatesTo["event_id"].(string); rootID != "" {
			return id.EventID(rootID)
		}
	}
	return ""
}

func sortedRoomIDs[K ~string, V any](m map[K]V) []id.RoomID {
	ids := make([]id.RoomID, 0, len(m))
	for roomID := range m {
		ids = append(ids, id.RoomID(roomID))
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/matrix/event"
	"github.com/klauss/zigzag-go/internal/matrix/id"
	"github.com/klauss/zigzag-go/internal/matrix/syncwire"
	"github.com/klauss/zigzag-go/internal/notify"
)

func (a *App) foldNotify(graph *sessionGraph, response *syncwire.Response, decryptedByEventID map[string][]byte) {
	engine, store := graph.notifyEngine, graph.notifyStore
	a.stateMu.RLock()
	shell := a.notifyShell
	a.stateMu.RUnlock()

	if engine == nil {
		return
	}

	if counts := joinedCounts(response); len(counts) > 0 && store != nil {
		if err := store.SetMemberCounts(context.Background(), counts); err != nil {
			a.roomLogger.Warn().Err(err).Int("rooms", len(counts)).Msg("could not record member counts")
		}
	}

	update := engine.Fold(response, decryptedByEventID)

	a.checkThreadRoots(engine)
	a.lookUpReceipts(engine)
	if update == nil {
		return
	}

	a.publishNotify(engine, update)

	if shell != nil && len(update.Events) > 0 {
		shell.Enqueue(update.Events)
	}
	if shell != nil && len(update.Redacted) > 0 {
		shell.WithdrawEvents(update.Redacted)
	}

	a.roomLogger.Debug().
		Int("counts", len(update.Rooms)).
		Int("toasts", len(update.Events)).
		Int("modes", len(update.Modes)).
		Int("threads", len(update.ThreadCounts)).
		Msg("notify update")
}

func (a *App) publishNotify(engine *notify.Engine, update *notify.Update) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := engine.Publish(ctx, update, func(update *notify.Update) {
		a.EmitDirect(EventNotifyUpdate, update)

		a.showBadge(engine)
	}); err != nil {
		a.roomLogger.Warn().Err(err).
			Int("rooms", len(update.SaveRooms)).
			Int("threads", len(update.SaveThreads)).
			Msg("could not save unread state")
	}
}

func (a *App) stillCurrent(engine *notify.Engine) bool {
	current, _ := a.readNotify()
	return current == engine
}

func (a *App) checkThreadRoots(engine *notify.Engine) {
	keys := engine.TakeRootChecks()
	if len(keys) == 0 {
		return
	}
	matrixClient, err := a.readClient()
	if err != nil {
		for _, key := range keys {
			engine.RootCheckFailed(key, false)
		}
		return
	}
	go func() {
		for _, key := range keys {
			a.checkThreadRoot(matrixClient, engine, key)
		}
	}()
}

func (a *App) checkThreadRoot(matrixClient *matrix.Client, engine *notify.Engine, key notify.ThreadKey) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	root, err := matrixClient.GetEvent(ctx, string(key.RoomID), string(key.RootID))
	if !a.stillCurrent(engine) {
		return
	}
	var update *notify.Update
	switch {
	case matrix.IsErrCode(err, "M_NOT_FOUND") || matrix.IsErrCode(err, "M_FORBIDDEN"):

		update = engine.SetRootChecked(key, false)
	case err != nil:
		update = engine.RootCheckFailed(key, answerIsFinal(err))
		a.roomLogger.Debug().Err(err).Str("room", key.RoomID.String()).Str("thread", key.RootID.String()).
			Msg("thread root check failed")
	default:
		summary := root.GetThreadSummary()
		takingPart := string(root.Sender) == matrixClient.UserID() || (summary != nil && summary.CurrentUserParticipated)
		update = engine.SetRootChecked(key, takingPart)
		a.roomLogger.Debug().Str("room", key.RoomID.String()).Str("thread", key.RootID.String()).
			Bool("takingPart", takingPart).Msg("thread root checked")
	}
	a.publishNotify(engine, update)
}

func (a *App) lookUpReceipts(engine *notify.Engine) {
	lookups := engine.TakeReceiptLookups()
	if len(lookups) == 0 {
		return
	}
	matrixClient, err := a.readClient()
	if err != nil {
		for _, lookup := range lookups {
			engine.ReceiptLookupFailed(lookup, false)
		}
		return
	}
	go func() {
		for _, lookup := range lookups {
			a.lookUpReceipt(matrixClient, engine, lookup)
		}
	}()
}

func (a *App) lookUpReceipt(matrixClient *matrix.Client, engine *notify.Engine, lookup notify.ReceiptLookup) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	receipted, err := matrixClient.GetEvent(ctx, string(lookup.RoomID), string(lookup.EventID))
	if !a.stillCurrent(engine) {
		return
	}
	if err != nil {
		final := matrix.IsErrCode(err, "M_NOT_FOUND") || matrix.IsErrCode(err, "M_FORBIDDEN") || answerIsFinal(err)
		engine.ReceiptLookupFailed(lookup, final)
		a.roomLogger.Debug().Err(err).Str("room", lookup.RoomID.String()).Str("event", lookup.EventID.String()).
			Msg("receipt lookup failed")
		return
	}
	a.publishNotify(engine, engine.ResolveReceipt(lookup, receipted.Timestamp))
}

func answerIsFinal(err error) bool {
	if answered, ok := matrix.AsError(err); ok && answered.StatusCode != 0 {
		return answered.StatusCode == 400
	}
	return matrix.IsErrCode(err, "M_BAD_JSON") || matrix.IsErrCode(err, "M_NOT_JSON") || matrix.IsErrCode(err, "M_UNRECOGNIZED")
}

func (a *App) noteServerThreads(roomID id.RoomID, roots []*event.Event, me id.UserID) {
	engine, _ := a.readNotify()
	if engine == nil {
		return
	}

	threads := make([]notify.ServerThread, 0, len(roots))
	for _, root := range roots {
		summary := root.GetThreadSummary()
		if summary == nil || summary.LatestEvent == nil {
			continue
		}
		threads = append(threads, notify.ServerThread{
			RootID:       root.ID,
			Latest:       summary.LatestEvent,
			Participated: root.Sender == me || summary.CurrentUserParticipated,
		})
	}
	a.publishNotify(engine, engine.ThreadsFromServer(roomID, threads))
}

func (a *App) noteGapPage(roomID id.RoomID, events []*event.Event) {
	engine, _ := a.readNotify()
	if engine == nil {
		return
	}
	a.publishNotify(engine, engine.ThreadRepliesFromGap(roomID, events))
}

func (a *App) NotifyForgetRoom(roomID string) { a.forgetNotifyRoom(roomID) }

func (a *App) forgetNotifyRoom(roomID string) {
	engine, _ := a.readNotify()
	if engine == nil || roomID == "" {
		return
	}
	a.publishNotify(engine, engine.ForgetRoom(id.RoomID(roomID)))
}

func joinedCounts(response *syncwire.Response) map[id.RoomID]int {
	counts := map[id.RoomID]int{}
	for roomID, room := range response.Rooms {
		if room.JoinedCount > 0 {
			counts[id.RoomID(roomID)] = room.JoinedCount
		}
	}
	return counts
}

func seedMemberCounts(ctx context.Context, rooms []matrix.KnownRoom, store *notify.Store) (int, error) {
	known, err := store.LoadAll(ctx)
	if err != nil {
		return 0, err
	}
	missing := map[id.RoomID]int{}
	for _, room := range rooms {
		roomID := id.RoomID(room.RoomID)
		if room.Membership == "joined" && room.JoinedMembers > 0 && known[roomID].MemberCount == 0 {
			missing[roomID] = room.JoinedMembers
		}
	}
	if len(missing) == 0 {
		return 0, nil
	}
	return len(missing), store.SetMemberCounts(ctx, missing)
}

func (a *App) NotifySetMode(ctx context.Context, roomID, mode string) error {
	engine, store := a.readNotify()

	if engine == nil || store == nil {
		return ErrNoSession
	}

	parsed := notify.ParseMode(mode)
	if err := store.SetMode(ctx, id.RoomID(roomID), parsed); err != nil {
		return err
	}

	a.publishNotify(engine, engine.SetMode(id.RoomID(roomID), parsed))
	return nil
}

func (a *App) NotifySetDND(ctx context.Context, untilMS int64) error {
	if untilMS < 0 {
		return fmt.Errorf("zigzag: do-not-disturb cannot end at %d", untilMS)
	}

	engine, store := a.readNotify()

	if engine == nil || store == nil {
		return ErrNoSession
	}

	if err := store.SetDNDUntil(ctx, untilMS); err != nil {
		return err
	}
	a.publishNotify(engine, engine.SetDND(untilMS))
	return nil
}

func (a *App) NotifyOpenRoom(ctx context.Context, roomID string) int64 {
	engine, _ := a.readNotify()
	a.stateMu.RLock()
	shell := a.notifyShell
	a.stateMu.RUnlock()

	if shell != nil {
		shell.SetOpenRoom(id.RoomID(roomID))
	}
	if roomID == "" || engine == nil {
		return 0
	}
	return engine.LastSeenTS(id.RoomID(roomID))
}

func (a *App) NotifyRoomRead(ctx context.Context, roomID string, eventTS int64) {
	engine, _ := a.readNotify()

	if roomID == "" || engine == nil {
		return
	}
	a.publishNotify(engine, engine.MarkRead(id.RoomID(roomID), eventTS))
}

func (a *App) ReadMarkers(ctx context.Context, roomID string, eventID string) error {
	matrixClient, err := a.readClient()
	if err != nil {
		return err
	}
	if roomID == "" || eventID == "" {
		return errors.New("zigzag: a read marker needs a room and an event")
	}

	if strings.HasPrefix(eventID, "~") {
		return fmt.Errorf("zigzag: read marker for %s is not a sent event: %s", roomID, eventID)
	}

	if err := matrixClient.SendReceipt(ctx, roomID, string(event.ReceiptTypeReadPrivate),
		event.ReadReceiptThreadMain.String(), eventID); err != nil {
		a.roomLogger.Err(err).Str("room", roomID).Str("event", eventID).Msg("main timeline receipt write failed")
		return fmt.Errorf("zigzag: main timeline receipt in %s: %w", roomID, err)
	}
	if err := matrixClient.SetReadMarkers(ctx, roomID, matrix.ReadMarkers{FullyRead: eventID}); err != nil {
		a.roomLogger.Err(err).Str("room", roomID).Str("event", eventID).Msg("read marker write failed")
		return fmt.Errorf("zigzag: set read markers in %s: %w", roomID, err)
	}
	a.roomLogger.Debug().Str("room", roomID).Str("event", eventID).Msg("read marker written")
	return nil
}

func (a *App) SendThreadReceipt(ctx context.Context, roomID, threadRootID, eventID string) error {
	matrixClient, err := a.readClient()
	if err != nil {
		return err
	}
	if roomID == "" || threadRootID == "" || eventID == "" {
		return errors.New("zigzag: a thread receipt needs a room, a thread and an event")
	}
	if strings.HasPrefix(eventID, "~") {
		return fmt.Errorf("zigzag: thread receipt for %s is not a sent event: %s", roomID, eventID)
	}

	if err := matrixClient.SendReceipt(ctx, roomID, string(event.ReceiptTypeReadPrivate), threadRootID, eventID); err != nil {
		a.roomLogger.Err(err).Str("room", roomID).Str("thread", threadRootID).Str("event", eventID).Msg("thread receipt write failed")
		return fmt.Errorf("zigzag: thread receipt in %s: %w", roomID, err)
	}
	a.roomLogger.Debug().Str("room", roomID).Str("thread", threadRootID).Str("event", eventID).Msg("thread receipt written")
	return nil
}

func (a *App) NotifyRoomNames(names map[string]string) {
	engine, _ := a.readNotify()

	if engine == nil {
		return
	}

	byRoomID := make(map[id.RoomID]string, len(names))
	for roomID, name := range names {
		if name != "" {
			byRoomID[id.RoomID(roomID)] = name
		}
	}
	engine.SetRoomNames(byRoomID)
}

package notify

import (
	"maps"
	"runtime"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/klauss/zigzag-go/internal/matrix/id"
	"github.com/klauss/zigzag-go/internal/trace"
	"github.com/rs/zerolog"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type Notifier interface {
	SendNotification(options notifications.NotificationOptions) error
	RemoveDeliveredNotification(identifier string) error
}

const toastQueueDepth = 8

const soundCooldown = time.Second

const maxToastsPerRoom = maxToastsPerBatch

type roomPile struct {
	ids    []string
	shown  int
	closed bool
}

type shellWork struct {
	toasts  []Toast
	deleted []id.EventID
}

type Shell struct {
	notifier Notifier
	iconPath string
	logger   zerolog.Logger

	focused atomic.Bool

	toastFailed atomic.Bool

	mu sync.Mutex

	delivered map[id.RoomID]*roomPile
	queue     chan shellWork

	withdrawals chan id.RoomID

	activate func(id.RoomID, id.EventID)

	lastSound time.Time
	now       func() time.Time
	stop      chan struct{}
	stopOnce  sync.Once
	drained   chan struct{}
}

func NewShell(notifier Notifier, logger zerolog.Logger, iconPath string) *Shell {
	return &Shell{
		notifier:    notifier,
		iconPath:    iconPath,
		logger:      logger,
		delivered:   map[id.RoomID]*roomPile{},
		queue:       make(chan shellWork, toastQueueDepth),
		withdrawals: make(chan id.RoomID, toastQueueDepth),
		now:         time.Now,
		stop:        make(chan struct{}),
		drained:     make(chan struct{}),
	}
}

func (s *Shell) Start() { go s.run() }

func (s *Shell) Close() {
	s.stopOnce.Do(func() { close(s.stop) })
	<-s.drained
}

func (s *Shell) Enqueue(toasts []Toast) {
	if len(toasts) == 0 {
		return
	}
	select {
	case s.queue <- shellWork{toasts: toasts}:
	default:
		s.logger.Warn().
			Int("dropped", len(toasts)).
			Msg("toast queue full - the notification service is not keeping up")
	}
}

func (s *Shell) WithdrawEvents(eventIDs []id.EventID) {
	if len(eventIDs) == 0 {
		return
	}
	select {
	case s.queue <- shellWork{deleted: eventIDs}:
	default:
		s.logger.Warn().
			Int("dropped", len(eventIDs)).
			Msg("toast queue full - deleted messages' toasts stay up")
	}
}

func (s *Shell) SetFocused(focused bool) { s.focused.Store(focused) }

func (s *Shell) SetOpenRoom(roomID id.RoomID) {
	if roomID == "" {
		return
	}
	select {
	case s.withdrawals <- roomID:
	default:

		s.logger.Warn().Str("room", string(roomID)).Msg("withdraw dropped — queue full")
	}
}

func (s *Shell) HandleNotificationResponse(result notifications.NotificationResult) {
	if result.Error != nil {
		s.logger.Warn().Err(result.Error).Msg("notification response arrived with an error")
		return
	}
	roomID, _ := result.Response.UserInfo["roomId"].(string)
	if roomID == "" {
		return
	}
	threadID, _ := result.Response.UserInfo["threadId"].(string)
	if s.activate == nil {
		return
	}
	s.logger.Info().Str("room", roomID).Str("thread", threadID).Msg("notification clicked")
	s.activate(id.RoomID(roomID), id.EventID(threadID))
}

func (s *Shell) OnActivate(handler func(id.RoomID, id.EventID)) { s.activate = handler }

func (s *Shell) run() {
	defer close(s.drained)
	for {
		select {
		case <-s.stop:
			return
		default:
		}

		select {
		case <-s.stop:
			return
		case work := <-s.queue:
			if len(work.toasts) > 0 {
				s.present(work.toasts)
			}
			if len(work.deleted) > 0 {
				s.withdrawEvents(work.deleted)
			}
		case roomID := <-s.withdrawals:
			s.withdraw(roomID)
		}
	}
}

func (s *Shell) WithdrawAll() {
	s.mu.Lock()
	rooms := slices.Collect(maps.Keys(s.delivered))
	s.mu.Unlock()
	for _, roomID := range rooms {
		s.SetOpenRoom(roomID)
	}
}

func (s *Shell) withdraw(roomID id.RoomID) {
	s.mu.Lock()
	pile := s.delivered[roomID]
	delete(s.delivered, roomID)
	s.mu.Unlock()

	if pile == nil || len(pile.ids) == 0 {
		return
	}
	var withdrawn int
	for _, identifier := range pile.ids {
		if err := s.notifier.RemoveDeliveredNotification(identifier); err != nil {

			s.logger.Debug().Err(err).Str("id", identifier).Msg("withdraw failed")
			continue
		}
		withdrawn++
	}
	s.logger.Info().
		Int("withdrawn", withdrawn).
		Str("room", string(roomID)).
		Msg("toasts withdrawn — the room was opened")
}

func (s *Shell) withdrawEvents(eventIDs []id.EventID) {
	var withdrawn int
	for _, eventID := range eventIDs {
		identifier := string(eventID)
		if !s.forget(identifier) {
			continue
		}
		if err := s.notifier.RemoveDeliveredNotification(identifier); err != nil {
			s.logger.Debug().Err(err).Str("id", identifier).Msg("withdraw failed")
			continue
		}
		withdrawn++
	}
	if withdrawn > 0 {
		s.logger.Info().Int("withdrawn", withdrawn).Msg("toasts withdrawn — the message was deleted")
	}
}

func (s *Shell) forget(identifier string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, pile := range s.delivered {
		if i := slices.Index(pile.ids, identifier); i >= 0 {
			pile.ids = slices.Delete(pile.ids, i, i+1)
			return true
		}
	}
	return false
}

func (s *Shell) present(toasts []Toast) {
	var shown, suppressed, sounded, quieted, held int

	for _, toast := range toasts {
		if !s.shouldShow() {
			suppressed++
			continue
		}
		var ok bool
		if toast, ok = s.nextFor(toast); !ok {
			held++
			continue
		}
		if toast.Sound && !s.claimSound() {
			toast.Sound = false
			quieted++
		}
		if err := s.post(toast); err != nil {

			event := s.logger.Warn().Err(err).Str("room", string(toast.RoomID))
			if s.toastFailed.CompareAndSwap(false, true) {
				event = event.Bool(trace.PinField, true)
			}
			event.Msg("toast failed")
			continue
		}
		shown++
		if toast.Sound {
			sounded++
		}
	}
	if held > 0 {
		s.logger.Info().Int("held", held).Msg("toasts held — the room's last toast is up until it is opened")
	}

	if suppressed > 0 {
		s.logger.Info().Int("suppressed", suppressed).Msg("toasts suppressed — the window is focused")
	}

	if shown > 0 {
		s.logger.Info().Int("shown", shown).Int("sounded", sounded).Int("quieted", quieted).Msg("toasts shown")
	}
}

func (s *Shell) nextFor(toast Toast) (Toast, bool) {
	if toast.Highlight {
		return toast, true
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	pile := s.delivered[toast.RoomID]

	if pile != nil && toast.roomUnread > 0 && toast.roomUnread <= pile.shown {
		pile.shown = 0
		pile.closed = false
	}
	if pile == nil || pile.shown < maxToastsPerRoom {
		return toast, true
	}
	if pile.closed {
		return Toast{}, false
	}
	pile.closed = true
	unread := max(toast.roomUnread, pile.shown+1)
	return Toast{
		RoomID:   toast.RoomID,
		EventID:  toast.EventID,
		RoomName: toast.RoomName,
		Body:     summaryBody(unread),
		Sound:    toast.Sound,
		summary:  true,
	}, true
}

func (s *Shell) claimSound() bool {
	now := s.now()
	if !s.lastSound.IsZero() && now.Sub(s.lastSound) < soundCooldown {
		return false
	}
	s.lastSound = now
	return true
}

func (s *Shell) shouldShow() bool { return !s.focused.Load() }

var markupEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")

func bodyText(body string) string {
	if runtime.GOOS != "linux" {
		return body
	}
	return markupEscaper.Replace(body)
}

func (s *Shell) post(toast Toast) error {

	identifier := string(toast.EventID)
	if identifier == "" {
		identifier = string(toast.RoomID)
	}
	if identifier == "" {
		return nil
	}

	if toast.summary {
		identifier = "summary:" + identifier
	}

	options := notifications.NotificationOptions{
		ID:    identifier,
		Title: toast.Title(),
		Body:  bodyText(toast.Body),

		Data: map[string]any{"roomId": string(toast.RoomID)},
	}
	if toast.ThreadRootID != "" {
		options.Data["threadId"] = string(toast.ThreadRootID)
	}
	options.Attachments = iconAttachment(s.iconPath)

	if toast.Highlight {
		options.InterruptionLevel = notifications.InterruptionLevelTimeSensitive
	}

	if toast.Sound {
		options.Sound = audibleSound()
	} else {
		options.Sound = &notifications.NotificationSound{Silent: true}
	}

	if err := s.notifier.SendNotification(options); err != nil {
		return err
	}

	s.mu.Lock()
	pile := s.delivered[toast.RoomID]
	if pile == nil {
		pile = &roomPile{}
		s.delivered[toast.RoomID] = pile
	}
	pile.ids = append(pile.ids, identifier)
	pile.shown++
	s.mu.Unlock()
	return nil
}

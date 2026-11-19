package syncloop

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"runtime/debug"
	"sync"
	"sync/atomic"
	"time"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/matrix/syncwire"
	"github.com/klauss/zigzag-go/internal/rustcore"
	"github.com/klauss/zigzag-go/internal/trace"
)

const (
	defaultPollTimeout = 30 * time.Second

	networkTimeout = 30 * time.Second

	toDeviceLimit = 100
)

type Sink interface {
	EmitRooms(raw []byte, decrypted map[string][]byte, from, to string)

	EmitNotify(response *syncwire.Response, decrypted map[string][]byte)

	EmitNet(isReachable bool)

	EmitSessionExpired(isSoftExpiry bool)
}

type typingSink interface {
	EmitTyping(rooms map[string]jsontext.Value)
}

var ErrSessionExpired = errors.New("syncloop: session expired")

type RequiredState [2]string

type ListRequest struct {
	Ranges        [][2]int
	RequiredState []RequiredState
	TimelineLimit int
}

type RoomSubscription struct {
	RequiredState []RequiredState
	TimelineLimit int
}

var DefaultRequiredState = []RequiredState{
	{"m.room.encryption", ""},
	{"m.room.member", "*"},
	{"m.room.history_visibility", ""},
	{"m.room.power_levels", ""},
	{"m.room.create", ""},
	{"m.room.name", ""},
	{"m.room.avatar", ""},
	{"m.room.topic", ""},
	{"m.room.canonical_alias", ""},

	{"m.space.parent", "*"},

	{"chat.tryzigzag.project_color", ""},
	{"chat.tryzigzag.project_icon", ""},
	{"chat.tryzigzag.room_tags", ""},

	{"chat.tryzigzag.room.layout", ""},

	{"chat.tryzigzag.room.emoji", ""},

	{"chat.tryzigzag.room.place", ""},
}

func carriesNothing(from string, resp *syncwire.Response, decrypted map[string][]byte) bool {
	return resp.Pos != "" && resp.Pos == from && len(resp.Rooms) == 0 && len(decrypted) == 0
}

func frontendBody(raw []byte, resp *syncwire.Response, decrypted map[string][]byte) []byte {
	if len(resp.Rooms) > 0 || len(decrypted) > 0 {
		return raw
	}
	positionOnly, err := jsonv2.Marshal(struct {
		Pos string `json:"pos,omitempty"`
	}{Pos: resp.Pos})
	if err != nil {
		return raw
	}
	return positionOnly
}

type Loop struct {
	client *matrix.Client
	sink   Sink

	connID string
	lists  map[string]ListRequest
	order  []string

	sweep      chan struct{}
	windowMu   sync.Mutex
	fullWindow map[string]bool

	configureOnce sync.Once
	configureErr  error

	delivered atomic.Uint64
	swallowed atomic.Uint64

	log zerolog.Logger
}

func NewLoop(client *matrix.Client, sink Sink) *Loop {
	return &Loop{
		client: client,
		sink:   sink,
		connID: wireConnID("zigzag-go"),
		lists:  map[string]ListRequest{},
		sweep:  make(chan struct{}, 1),
		log:    trace.Log("sliding"),
	}
}

func (l *Loop) SetConnID(name string) { l.connID = wireConnID(name) }

func wireConnID(name string) string {
	id := name + "-2"
	if len(id) <= 16 {
		return id
	}
	sum := sha256.Sum256([]byte(id))
	return "zz-" + hex.EncodeToString(sum[:])[:13]
}

func (l *Loop) SetList(name string, req ListRequest) {
	if _, ok := l.lists[name]; !ok {
		l.order = append(l.order, name)
	}
	l.lists[name] = req
}

func (l *Loop) Configure(ctx context.Context) (string, error) {
	l.configureOnce.Do(func() {
		config := rustcore.SyncConfig{
			ConnId:           l.connID,
			ToDevice:         true,
			ToDeviceLimit:    ptr(uint32(toDeviceLimit)),
			E2ee:             true,
			Receipts:         true,
			Typing:           true,
			PollTimeoutMs:    uint64(defaultPollTimeout / time.Millisecond),
			NetworkTimeoutMs: uint64(networkTimeout / time.Millisecond),

			AccountData: true,
		}
		for _, name := range l.order {
			list := l.lists[name]
			config.Lists = append(config.Lists, rustcore.SyncListConfig{
				Name:          name,
				Ranges:        ranges(list.Ranges),
				RequiredState: pairs(list.RequiredState),
				TimelineLimit: uint32(list.TimelineLimit),
			})
		}
		l.configureErr = l.client.CoreCall(func(core *rustcore.Core) error {
			_, err := core.SyncConfigure(config)
			return err
		})
		if l.configureErr == nil {
			l.log.Info().
				Str("conn_id", l.connID).
				Str("pos", trace.Pos(l.Position())).
				Msg("connection configured")
		}
	})
	if l.configureErr != nil {
		return "", fmt.Errorf("syncloop: configure: %w", l.configureErr)
	}
	return l.Position(), nil
}

func (l *Loop) Position() string {
	pos := ""
	_ = l.client.CoreCall(func(core *rustcore.Core) error {
		if held := core.SyncPosition(); held != nil {
			pos = *held
		}
		return nil
	})
	return pos
}

func (l *Loop) HasPosition() bool {
	has := false
	_ = l.client.CoreCall(func(core *rustcore.Core) error {
		has = core.SyncHasPosition()
		return nil
	})
	return has
}

func (l *Loop) ResetPosition(reason string) {
	l.log.Warn().Str("reason", reason).Str("pos", trace.Pos(l.Position())).Msg("resetting the position")
	_ = l.client.CoreCall(func(core *rustcore.Core) error {
		core.SyncResetPosition()
		return nil
	})
}

func (l *Loop) SubscribeOnly(roomIDs []string, sub RoomSubscription, abortInFlight bool) error {
	return l.client.CoreCall(func(core *rustcore.Core) error {
		return core.SyncSubscribeRooms(roomIDs, pairs(sub.RequiredState), uint32(sub.TimelineLimit), abortInFlight)
	})
}

func (l *Loop) DeliveredBatches() uint64 { return l.delivered.Load() }

func (l *Loop) Run(ctx context.Context) error {
	if l.client.Core() == nil {
		return errors.New("syncloop: the client has no core")
	}
	if _, err := l.Configure(ctx); err != nil {
		return err
	}
	stop := context.AfterFunc(ctx, l.Stop)
	defer stop()

	l.sweepDeparted(ctx)
	sweepCtx, endSweeps := context.WithCancel(ctx)
	defer endSweeps()
	go func() {
		for {
			select {
			case <-sweepCtx.Done():
				return
			case <-l.sweep:
				l.sweepDeparted(sweepCtx)
			}
		}
	}()

	l.log.Info().Str("conn_id", l.connID).Str("pos", trace.Pos(l.Position())).Msg("run starting")
	err := l.client.CoreCall(func(core *rustcore.Core) error {
		return core.SyncRun(batchListener{l})
	})
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if err == nil {
		return nil
	}
	return l.classify(err)
}

func (l *Loop) Stop() {
	_ = l.client.CoreCall(func(core *rustcore.Core) error {
		core.SyncStop()
		return nil
	})
}

func (l *Loop) classify(err error) error {
	err = matrix.FromCore(err)
	matrixErr, ok := matrix.AsError(err)
	if !ok {
		return fmt.Errorf("syncloop: %w", err)
	}
	l.sink.EmitNet(matrixErr.Answered())
	if !matrixErr.Answered() {
		return fmt.Errorf("syncloop: transport: %w", err)
	}

	switch {
	case matrixErr.ErrCode == "M_UNKNOWN_TOKEN", matrixErr.ErrCode == "M_MISSING_TOKEN",
		matrixErr.ErrCode == "M_USER_DEACTIVATED", matrixErr.StatusCode == http.StatusUnauthorized:
		l.log.Err(err).Msg("access token rejected")
		l.sink.EmitSessionExpired(matrixErr.SoftLogout())
		return fmt.Errorf("%w: %w", ErrSessionExpired, err)
	}
	return fmt.Errorf("syncloop: %w", err)
}

func (l *Loop) ProbeHomeserver(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	err := matrix.FromCore(l.client.CoreCall(func(core *rustcore.Core) error {
		return core.SyncProbe(uint64(probeTimeout.Milliseconds()))
	}))
	if matrixErr, ok := matrix.AsError(err); ok && matrixErr.Answered() {
		return nil
	}
	return err
}

type batchListener struct{ loop *Loop }

func (b batchListener) OnBatch(batch rustcore.SyncBatch) {
	defer func() {
		if recovered := recover(); recovered != nil {
			b.loop.log.Error().
				Interface("panic", recovered).
				Str("stack", string(debug.Stack())).
				Msg("batch handling panicked")
		}
	}()
	b.loop.handle(batch)
}

func (l *Loop) handle(batch rustcore.SyncBatch) {

	l.sink.EmitNet(true)

	raw := []byte(batch.Body)
	var resp syncwire.Response
	if err := jsonv2.Unmarshal(raw, &resp); err != nil {
		l.log.Err(err).Int("bytes", len(raw)).Msg("batch body does not parse — not delivered")
		return
	}

	decrypted := make(map[string][]byte, len(batch.Decrypted))
	for eventID, plaintext := range batch.Decrypted {
		decrypted[eventID] = []byte(plaintext)
	}

	if len(resp.Extensions.Typing.Rooms) > 0 {
		if sink, ok := l.sink.(typingSink); ok {
			sink.EmitTyping(resp.Extensions.Typing.Rooms)
		}
	}

	if carriesNothing(batch.From, &resp, decrypted) {
		l.swallowed.Add(1)
		l.log.Debug().
			Str("pos", trace.Pos(batch.From)).
			Int("bytes", len(raw)).
			Uint64("swallowed_total", l.swallowed.Load()).
			Msg("· batch carried nothing — not handed over, not retained")
		return
	}

	l.sink.EmitRooms(frontendBody(raw, &resp, decrypted), decrypted, batch.From, batch.To)
	l.sink.EmitNotify(&resp, decrypted)
	l.delivered.Add(1)
	l.log.Debug().
		Str("from", trace.Pos(batch.From)).
		Str("to", trace.Pos(batch.To)).
		Int("rooms", len(resp.Rooms)).
		Int("bytes", len(raw)).
		Int("decrypted", len(decrypted)).
		Uint64("delivered_total", l.delivered.Load()).
		Msg("· batch handed to the frontend")

	if batch.From == "" && len(resp.Rooms) > 0 {
		listed := make(map[string]bool, len(resp.Rooms))
		for roomID := range resp.Rooms {
			listed[roomID] = true
		}
		l.windowMu.Lock()
		l.fullWindow = listed
		l.windowMu.Unlock()
	}
	select {
	case l.sweep <- struct{}{}:
	default:
	}
}

func (l *Loop) sweepDeparted(ctx context.Context) {
	l.windowMu.Lock()
	fullWindow := l.fullWindow
	l.fullWindow = nil
	l.windowMu.Unlock()
	dropped, err := l.client.ForgetDepartedRooms(ctx, fullWindow)
	if err != nil {
		l.log.Warn().Err(err).Msg("could not drop departed rooms from the core's store")
	}
	if len(dropped) > 0 {
		l.log.Info().Int("rooms", len(dropped)).Msg("departed rooms dropped from the core's store")
	}
}

func ranges(in [][2]int) []rustcore.SyncRange {
	out := make([]rustcore.SyncRange, 0, len(in))
	for _, r := range in {
		out = append(out, rustcore.SyncRange{Start: uint32(r[0]), End: uint32(r[1])})
	}
	return out
}

func pairs(in []RequiredState) []rustcore.StatePair {
	out := make([]rustcore.StatePair, 0, len(in))
	for _, p := range in {
		out = append(out, rustcore.StatePair{EventType: p[0], StateKey: p[1]})
	}
	return out
}

func ptr[T any](v T) *T { return &v }

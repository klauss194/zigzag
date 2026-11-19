package devicetrust

import (
	"context"
	"fmt"
	"runtime/debug"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/matrix"
)

type transaction struct {
	id string

	peer string

	startedHere bool

	target string
	opened time.Time
}

type verifier struct {
	crypto Crypto
	log    zerolog.Logger
	emit   func(name string, data any)

	ownUserID string

	prepare func(context.Context) error

	inbox *mailbox

	lifetime context.Context
	stop     context.CancelFunc
	stopped  chan struct{}

	executed atomic.Uint64

	transactions map[string]*transaction

	current string

	endedUnseen map[string]struct{}
}

const maxEndedUnseen = 64

var _ matrix.VerificationEvents = (*verifier)(nil)

func newVerifier(ctx context.Context, ownUserID string, crypto Crypto, emit func(string, any), log zerolog.Logger, prepare func(context.Context) error) (*verifier, error) {

	lifetime, stop := context.WithCancel(log.WithContext(context.WithoutCancel(ctx)))
	v := &verifier{
		crypto:       crypto,
		log:          log,
		emit:         emit,
		ownUserID:    ownUserID,
		prepare:      prepare,
		inbox:        newMailbox(),
		lifetime:     lifetime,
		stop:         stop,
		stopped:      make(chan struct{}),
		transactions: map[string]*transaction{},
		endedUnseen:  map[string]struct{}{},
	}
	if err := crypto.ListenVerifications(v); err != nil {
		stop()
		return nil, fmt.Errorf("devicetrust: listen for verifications: %w", err)
	}
	go v.run()
	log.Debug().Msg("verifier started")
	return v, nil
}

func (v *verifier) run() {
	defer close(v.stopped)
	for {
		select {
		case <-v.lifetime.Done():
			left := v.inbox.close()
			for _, j := range left {
				if j.abort != nil {
					j.abort(ErrClosed)
				}
			}
			v.log.Debug().Int("dropped_jobs", len(left)).Msg("verifier stopped")
			return
		case <-v.inbox.wake:
			for v.lifetime.Err() == nil {
				next, ok := v.inbox.pop()
				if !ok {
					break
				}
				v.execute(next)
			}
		}
	}
}

func (v *verifier) execute(j job) {
	started := time.Now()
	v.log.Trace().Str("job", j.name).Int("queued_behind", v.inbox.len()).Msg("verifier job")
	defer func() {
		v.executed.Add(1)
		if recovered := recover(); recovered != nil {
			v.log.Error().
				Str("job", j.name).
				Interface("panic", recovered).
				Str("stack", string(debug.Stack())).
				Msg("verifier job panicked")
			if j.abort != nil {
				j.abort(fmt.Errorf("devicetrust: %s panicked: %v", j.name, recovered))
			}
			return
		}
		v.log.Trace().Str("job", j.name).Dur("took", time.Since(started)).Msg("verifier job finished")
	}()
	j.run(j.ctx)
}

func (v *verifier) post(name string, run func(ctx context.Context)) {
	if !v.inbox.push(job{name: name, ctx: v.lifetime, run: run}) {
		v.log.Debug().Str("job", name).Msg("verifier stopped; dropping work")
	}
}

func call[T any](ctx context.Context, v *verifier, name string, fn func(ctx context.Context) (T, error)) (T, error) {
	type answer struct {
		value T
		err   error
	}
	answers := make(chan answer, 1)
	var once sync.Once
	reply := func(value T, err error) { once.Do(func() { answers <- answer{value, err} }) }

	jobCtx, cancelJob := context.WithCancel(v.log.WithContext(ctx))
	stopWithVerifier := context.AfterFunc(v.lifetime, cancelJob)
	cleanup := func() {
		stopWithVerifier()
		cancelJob()
	}

	var zero T
	queued := v.inbox.push(job{
		name: name,
		ctx:  jobCtx,
		run: func(ctx context.Context) {
			defer cleanup()
			value, err := fn(ctx)
			reply(value, err)
		},
		abort: func(err error) {
			cleanup()
			reply(zero, err)
		},
	})
	if !queued {
		cleanup()
		return zero, ErrClosed
	}

	select {
	case result := <-answers:
		return result.value, result.err
	case <-ctx.Done():
		return zero, ctx.Err()
	}
}

func (v *verifier) close() {
	v.stop()
	<-v.stopped
}

func (v *verifier) start(ctx context.Context, target string) (string, error) {
	return call(ctx, v, "start verification", func(ctx context.Context) (string, error) {
		if v.current != "" {
			v.log.Warn().Str("running", v.current).Str("target", target).Msg("refusing a second verification while one is running")
			return "", ErrVerificationInProgress
		}
		transactionID, err := v.crypto.RequestVerification(ctx, target)
		if err != nil {
			return "", fmt.Errorf("devicetrust: start verification: %w", err)
		}
		txn := v.track(transactionID, "", true)
		txn.target = target
		v.current = transactionID
		v.log.Info().Str("transaction", transactionID).Str("target", target).Msg("verification requested from this device")
		return transactionID, nil
	})
}

func (v *verifier) confirm(ctx context.Context, transactionID string) error {
	if transactionID == "" {
		return fmt.Errorf("devicetrust: no verification to confirm")
	}
	_, err := call(ctx, v, "confirm sas", func(ctx context.Context) (struct{}, error) {
		v.log.Info().Str("transaction", transactionID).Msg("the user confirmed the emoji match")
		return struct{}{}, v.crypto.ConfirmSAS(ctx, transactionID)
	})
	return err
}

func (v *verifier) cancel(ctx context.Context, transactionID string) error {
	_, err := call(ctx, v, "cancel verification", func(ctx context.Context) (struct{}, error) {
		target := transactionID
		if target == "" {
			target = v.current
		}
		if target == "" {
			return struct{}{}, nil
		}
		v.log.Info().Str("transaction", target).Msg("the user cancelled the verification")
		err := v.crypto.CancelVerification(ctx, target)

		v.forget(target)
		return struct{}{}, err
	})
	return err
}

func (v *verifier) track(transactionID, peer string, startedHere bool) *transaction {
	txn, ok := v.transactions[transactionID]
	if !ok {
		txn = &transaction{id: transactionID, startedHere: startedHere, opened: time.Now()}
		v.transactions[transactionID] = txn
	}
	if peer != "" {
		txn.peer = peer
	}
	return txn
}

func (v *verifier) forget(transactionID string) *transaction {
	txn := v.transactions[transactionID]
	delete(v.transactions, transactionID)
	if v.current == transactionID {
		v.current = ""
	}
	return txn
}

func (v *verifier) finish(transactionID, status string, logEvent *zerolog.Event) {
	peer := ""
	lasted := time.Duration(0)
	if txn := v.forget(transactionID); txn != nil {
		peer = txn.peer
		lasted = time.Since(txn.opened)
	}
	logEvent.Str("transaction", transactionID).Str("peer", peer).Str("status", status).Dur("lasted", lasted).Msg("verification ended")
	if v.emit != nil {
		v.emit(EventVerify, VerifyPayload{Status: status, DeviceID: peer})
	}
}

func (v *verifier) VerificationRequested(transactionID, from, fromDevice string) {
	v.post("on request", func(ctx context.Context) { v.onRequested(ctx, transactionID, from, fromDevice) })
}

func (v *verifier) VerificationReady(transactionID, otherDevice string, weStarted bool, supportsSAS bool) {
	v.post("on ready", func(ctx context.Context) { v.onReady(ctx, transactionID, otherDevice, weStarted, supportsSAS) })
}

func (v *verifier) VerificationSAS(transactionID, peer string, emoji []matrix.SASEmoji, decimals []int) {
	v.post("on sas", func(context.Context) { v.onShowSAS(transactionID, peer, emoji, decimals) })
}

func (v *verifier) VerificationDone(transactionID, _ string) {
	v.post("on done", func(context.Context) {
		if _, known := v.transactions[transactionID]; !known {
			v.log.Debug().Str("transaction", transactionID).Msg("a verification this device did not take part in ended")
			return
		}
		v.finish(transactionID, VerifyStatusVerified, v.log.Info())
	})
}

func (v *verifier) VerificationCancelled(transactionID, _ string, code, reason string, cancelledByUs bool) {
	v.post("on cancel", func(context.Context) {
		if _, known := v.transactions[transactionID]; !known {
			if len(v.endedUnseen) >= maxEndedUnseen {
				clear(v.endedUnseen)
			}
			v.endedUnseen[transactionID] = struct{}{}
			v.log.Debug().Str("transaction", transactionID).Str("code", code).Msg("a verification no longer (or not yet) on screen was cancelled")
			return
		}
		v.finish(transactionID, VerifyStatusError, v.log.Info().Str("code", code).Str("reason", reason).Bool("by_us", cancelledByUs))
	})
}

func (v *verifier) onRequested(ctx context.Context, transactionID, from, fromDevice string) {
	log := v.log.With().Str("transaction", transactionID).Str("peer", fromDevice).Logger()
	if from != v.ownUserID {
		log.Warn().Str("from", from).Msg("ignoring a verification request from another user")
		return
	}
	if _, ended := v.endedUnseen[transactionID]; ended {

		delete(v.endedUnseen, transactionID)
		log.Info().Msg("ignoring a verification request that was already cancelled")
		return
	}
	if v.current != "" && v.current != transactionID {

		log.Warn().Str("running", v.current).Msg("declining a verification request: another is in progress")
		if err := v.crypto.CancelVerification(ctx, transactionID); err != nil {
			log.Error().Err(err).Msg("could not decline the verification request")
		}
		return
	}
	v.track(transactionID, fromDevice, false)
	v.current = transactionID
	if v.prepare != nil {
		if err := v.prepare(ctx); err != nil {

			log.Warn().Err(err).Msg("could not confirm this device's seeds before accepting")
		}
	}
	log.Info().Msg("verification requested by another device; accepting")
	if err := v.crypto.AcceptVerification(ctx, transactionID); err != nil {
		log.Error().Err(err).Msg("could not accept verification")
	}
}

func (v *verifier) onReady(ctx context.Context, transactionID, peer string, weStarted, supportsSAS bool) {
	if _, known := v.transactions[transactionID]; !known {
		if weStarted {

			v.log.Info().Str("transaction", transactionID).Str("peer", peer).Msg("cancelling a verification this device sent but no longer runs")
			if err := v.crypto.CancelVerification(ctx, transactionID); err != nil {
				v.log.Warn().Err(err).Str("transaction", transactionID).Msg("could not cancel the orphaned verification")
			}
			return
		}
		v.log.Debug().Str("transaction", transactionID).Msg("ready for a verification this device is not running")
		return
	}
	txn := v.track(transactionID, peer, false)
	log := v.log.With().Str("transaction", transactionID).Str("peer", peer).Logger()
	log.Debug().Bool("started_here", txn.startedHere).Bool("supports_sas", supportsSAS).Msg("verification ready")
	if !txn.startedHere {
		return
	}
	if txn.target != "" && peer != txn.target {

		const reason = "answered by a device that was not asked"
		log.Warn().Str("target", txn.target).Msg("a device that was not asked answered the verification request")
		if err := v.crypto.CancelVerification(ctx, transactionID); err != nil {
			log.Error().Err(err).Msg("could not cancel a verification answered by the wrong device")
		}
		v.finish(transactionID, VerifyStatusError, log.Info().Str("reason", reason))
		return
	}
	if !supportsSAS {

		const reason = "this device only offers emoji verification"
		log.Warn().Msg("the other device does not support emoji verification")
		if err := v.crypto.CancelVerification(ctx, transactionID); err != nil {
			log.Error().Err(err).Msg("could not cancel a verification with no method in common")
		}
		v.finish(transactionID, VerifyStatusError, log.Info().Str("reason", reason))
		return
	}
	log.Info().Msg("starting emoji verification")
	if err := v.crypto.StartSAS(ctx, transactionID); err != nil {
		log.Error().Err(err).Msg("could not start emoji verification")
	}
}

func (v *verifier) onShowSAS(transactionID, peer string, emoji []matrix.SASEmoji, decimals []int) {
	if _, known := v.transactions[transactionID]; !known {
		v.log.Debug().Str("transaction", transactionID).Msg("emoji for a verification this device is not running")
		return
	}
	txn := v.track(transactionID, peer, false)
	v.current = transactionID
	payload := newSASPayload(transactionID, txn.peer, emoji, decimals)
	v.log.Info().
		Str("transaction", transactionID).
		Str("peer", txn.peer).
		Int("emoji", len(payload.Emoji)).
		Ints("decimals", decimals).
		Msg("showing emoji")
	if v.emit != nil {
		v.emit(EventSAS, payload)
	}
}

package app

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"go.mau.fi/util/dbutil"

	"github.com/klauss/zigzag-go/internal/devicetrust"
	"github.com/klauss/zigzag-go/internal/matrix"
	matrixid "github.com/klauss/zigzag-go/internal/matrix/id"
	"github.com/klauss/zigzag-go/internal/matrix/syncloop"
	"github.com/klauss/zigzag-go/internal/notify"
	"github.com/klauss/zigzag-go/internal/platform"
	"github.com/klauss/zigzag-go/internal/serversettings"
	"github.com/klauss/zigzag-go/internal/session"

	_ "github.com/klauss/zigzag-go/internal/sqlitedb"
	"github.com/klauss/zigzag-go/internal/trace"
)

func (a *App) Resume(ctx context.Context) error {
	storedSession, err := session.Load()
	if err == nil {
		err = a.adopt(ctx, storedSession, nil)
	}
	switch {
	case err == nil:
		return nil
	case errors.Is(err, session.ErrNoSession):

		if !wipeUnreadableSession || session.Peek() == nil {
			return nil
		}
	case !wipeUnreadableSession:
		return err
	}
	a.forgetUnreadableSession(err)
	return nil
}

var wipeUnreadableSession = runtime.GOOS == "android"

func (a *App) forgetUnreadableSession(cause error) {
	storeID := ""
	if stored := session.Peek(); stored != nil {
		storeID = stored.StoreID
	}
	a.bootLogger.Warn().Err(cause).Str("store_id", storeID).
		Msg("the saved session cannot be read; wiping it and opening the login page")
	serversettings.Clear()
	if err := session.Forget(storeID); err != nil {
		a.bootLogger.Warn().Err(err).Msg("wiping the unreadable session")
	}
}

var errNoServer = errors.New("no server to sign in to")

func (a *App) Login(ctx context.Context, homeserverAddress, username, password string) (*SessionInfo, error) {
	if strings.TrimSpace(homeserverAddress) == "" {
		return nil, errNoServer
	}
	return a.openSession(ctx, "login", homeserverAddress, func(store matrix.StoreConfig) (*matrix.Client, error) {
		return matrix.Login(ctx, store, homeserverAddress, username, password, devicetrust.DisplayName())
	})
}

func (a *App) Register(ctx context.Context, homeserver, username, password, token string) (*SessionInfo, error) {
	if strings.TrimSpace(homeserver) == "" {
		return nil, errNoServer
	}
	return a.openSession(ctx, "register", homeserver, func(store matrix.StoreConfig) (*matrix.Client, error) {
		return matrix.Register(ctx, store, homeserver, username, password, token, devicetrust.DisplayName())
	})
}

func (a *App) openSession(ctx context.Context, action, homeserver string, open func(matrix.StoreConfig) (*matrix.Client, error)) (*SessionInfo, error) {
	pickleKey, err := platform.LoadOrCreatePickleKey()
	if err != nil {
		return nil, err
	}
	storeID, err := session.NewStoreID()
	if err != nil {
		return nil, err
	}
	storeDir, err := session.StoreDir(storeID)
	if err != nil {
		return nil, err
	}
	newSession := &session.Session{PickleKey: pickleKey, StoreID: storeID}

	a.authLogger.Info().Str("homeserver", homeserver).Msg(action + ": resolving and authenticating")
	client, err := open(matrix.StoreConfig{Dir: storeDir, Passphrase: newSession.StorePassphrase()})
	if err != nil {
		a.authLogger.Err(err).Msg(action + " failed")
		if removeErr := session.RemoveStore(storeID); removeErr != nil {
			a.authLogger.Warn().Err(removeErr).Msg("removing the failed " + action + "'s store directory")
		}
		return nil, fmt.Errorf("%s: %w", action, err)
	}
	logged := client.Session()
	a.authLogger.Info().
		Str("by", action).
		Str("user_id", logged.UserID).
		Str("device_id", logged.DeviceID).
		Str("base_url", logged.HomeserverURL).
		Msg("logged in")

	newSession.HomeserverURL = logged.HomeserverURL
	newSession.UserID = logged.UserID
	newSession.DeviceID = logged.DeviceID
	newSession.AccessToken = logged.AccessToken

	if err := newSession.Save(); err != nil {
		a.abandonLogin(newSession, client)
		return nil, err
	}
	if err := session.RememberServer(homeserver); err != nil {
		a.authLogger.Warn().Err(err).Msg("could not remember the server for the next sign-in")
	}

	if err := a.adopt(ctx, newSession, client); err != nil {

		a.abandonLogin(newSession, client)
		return nil, err
	}
	return a.Session(), nil
}

func (a *App) abandonLogin(newSession *session.Session, client *matrix.Client) {
	client.Close()
	if err := logoutDevice(context.Background(), newSession, 10*time.Second); err != nil {
		a.authLogger.Warn().Err(err).Str("device_id", newSession.DeviceID).Msg("abandoned login: the device may remain on the account")
	}
	if err := session.Forget(newSession.StoreID); err != nil {
		a.authLogger.Warn().Err(err).Msg("abandoned login: clearing the saved session and its store directory")
	}
}

func matrixSession(stored *session.Session) matrix.Session {
	return matrix.Session{
		HomeserverURL: stored.HomeserverURL,
		UserID:        stored.UserID,
		DeviceID:      stored.DeviceID,
		AccessToken:   stored.AccessToken,
	}
}

func logoutDevice(ctx context.Context, stored *session.Session, timeout time.Duration) error {
	logoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return matrix.NewHTTPOnly(matrixSession(stored)).Logout(logoutCtx)
}

func (a *App) adopt(ctx context.Context, storedSession *session.Session, client *matrix.Client) error {
	a.bootLogger.Info().
		Str("user_id", storedSession.UserID).
		Str("homeserver", storedSession.HomeserverURL).
		Msg("adopting session")

	if err := a.Shutdown(); err != nil {
		a.bootLogger.Warn().Err(err).Msg("closing the previous session before adopting the next")
	}
	serversettings.Set(serversettings.FromSession(storedSession))

	storeDir, err := session.StoreDir(storedSession.StoreID)
	if err != nil {
		return err
	}
	if client == nil {

		client, err = matrix.Restore(ctx, matrix.StoreConfig{Dir: storeDir, Passphrase: storedSession.StorePassphrase()},
			matrixSession(storedSession))
		if err != nil {
			a.bootLogger.Err(err).Msg("restoring the session's store failed")
			return err
		}
	}
	built := false
	defer func() {
		if !built {
			client.Close()
		}
	}()

	database, err := openNotifyDatabase(filepath.Join(storeDir, "zigzag-notify.db"))
	if err != nil {
		return err
	}
	defer func() {
		if !built {
			_ = database.Close()
		}
	}()
	notifyStore, err := notify.NewStore(ctx, database)
	if err != nil {
		return err
	}

	if seeded, err := seedMemberCounts(ctx, client.KnownRooms(), notifyStore); err != nil {
		a.roomLogger.Warn().Err(err).Msg("could not seed notification member counts")
	} else if seeded > 0 {
		a.roomLogger.Info().Int("rooms", seeded).Msg("seeded notification member counts from rust-sdk's store")
	}
	notifyEngine, err := notify.New(ctx, matrixid.UserID(storedSession.UserID), notifyStore, trace.Log("notify"))
	if err != nil {
		return err
	}

	directWrites := newDirectWrites()
	joiner := newAutoJoiner(client, a.roomLogger)

	if err := client.ListenSendQueue(a.onSendQueueUpdate); err != nil {
		return err
	}

	sendResumer := newSendResumer(
		func() { a.enableSendQueues(client) },
		func(roomID string) { a.enableRoomSendQueue(client, roomID) },
		sendResumeDelay,
	)

	deviceTrust, err := devicetrust.New(ctx, devicetrust.Config{
		Client: client,
		Seeds:  devicetrust.KeychainSeeds{},

		Emit:   a.eventGate.EmitDirect,
		Logger: a.deviceLogger,
	})
	if err != nil {
		deviceTrust = nil
		a.deviceLogger.Error().Err(err).Msg("device security is unavailable this session")
	} else {

		deviceTrust.RestoreSeeds(ctx)
		deviceTrust.KeepSeedsLater()
		deviceTrust.SyncDisplayName()
	}

	syncLoop := syncloop.NewLoop(client, a)

	syncLoop.SetConnID(platform.AppID)
	syncLoop.SetList("all", syncloop.ListRequest{

		Ranges:        [][2]int{{0, 1_000_000}},
		RequiredState: syncloop.DefaultRequiredState,
		TimelineLimit: 20,
	})

	resumeFrom, err := syncLoop.Configure(context.WithoutCancel(ctx))
	if err != nil {
		return err
	}

	graph := &sessionGraph{
		session:      storedSession,
		client:       client,
		directWrites: directWrites,
		sendResumer:  sendResumer,
		joiner:       joiner,
		notifyStore:  notifyStore,
		notifyEngine: notifyEngine,
		database:     database,
		syncLoop:     syncLoop,
		supervisor:   syncloop.NewSupervisor(syncLoop, a.onSyncState),
		deviceTrust:  deviceTrust,
	}
	a.stateMu.Lock()
	a.graph = graph
	a.stateMu.Unlock()
	built = true

	a.showBadge(notifyEngine)

	a.eventGate.Reset(resumeFrom)

	a.bootLogger.Info().
		Bool("resuming", resumeFrom != "").
		Str("resume_from", shortPos(resumeFrom)).
		Str("store", storedSession.StoreID).
		Msg("session adopted")
	return nil
}

func openNotifyDatabase(path string) (*dbutil.Database, error) {
	database, err := dbutil.NewWithDialect(fmt.Sprintf("file:%s?_txlock=immediate", path), "sqlite3-fk-wal")
	if err != nil {
		return nil, fmt.Errorf("notify: open %s: %w", path, err)
	}
	return database, nil
}

func (a *App) StartSync() error {

	a.sessionEventsMu.Lock()
	defer a.sessionEventsMu.Unlock()

	a.stateMu.Lock()

	graph := a.graph
	if graph == nil || graph.supervisor == nil || graph.client == nil {
		a.stateMu.Unlock()
		return ErrNoSession
	}
	if graph.cancelSync != nil {
		a.stateMu.Unlock()
		return nil
	}

	syncCtx, cancel := context.WithCancel(context.Background())
	graph.cancelSync = cancel
	supervisor := graph.supervisor
	userID, client := graph.session.UserID, graph.client

	a.stateMu.Unlock()

	a.notify(func(listener Listener) { listener.SessionStarted(userID, client) })
	a.bootLogger.Info().Msg("starting sliding sync")
	supervisor.Start(syncCtx)
	return nil
}

func (a *App) NudgeSync() {
	if graph := a.readGraph(); graph != nil && graph.supervisor != nil {
		graph.supervisor.Notify()
	}
}

func (a *App) UIReady(frontendPos string) (*HydrateResult, error) {
	var syncLoop syncConnection
	if graph := a.readGraph(); graph != nil {
		syncLoop = graph.syncLoop
	}

	replayed, covered := a.eventGate.Open(frontendPos)

	engine, _ := a.readNotify()

	var notifySnapshot *notify.Update
	if engine != nil {
		notifySnapshot = engine.Snapshot()
	}

	if err := a.StartSync(); err != nil && !errors.Is(err, ErrNoSession) {
		return nil, err
	}

	a.NudgeSync()

	action := "replay"
	if !covered {
		action = "initial"

		if syncLoop != nil && syncLoop.HasPosition() {
			syncLoop.ResetPosition("batch log cannot reach the frontend's cursor")
		}
	}

	result := &HydrateResult{
		Action:   action,
		Replayed: replayed,
		Settled:  covered && frontendPos != "",
		Notify:   notifySnapshot,
	}

	streamPos := ""
	if syncLoop != nil {
		streamPos = syncLoop.Position()
	}
	a.hydrateLogger.Info().
		Str("pos_frontend", shortPos(frontendPos)).
		Str("pos_stream", shortPos(streamPos)).
		Int("replayed", replayed).
		Bool("covered", covered).
		Bool("settled", result.Settled).
		Str("action", action).
		Msg("ui ready")

	return result, nil
}

func (a *App) Shutdown() error {
	a.sessionEventsMu.Lock()
	defer a.sessionEventsMu.Unlock()

	a.stateMu.Lock()
	graph := a.graph
	if graph == nil {
		a.stateMu.Unlock()
		return nil
	}
	cancelSync := graph.cancelSync
	graph.cancelSync = nil
	a.stateMu.Unlock()

	if graph.sendResumer != nil {
		graph.sendResumer.stop()
	}
	if graph.supervisor != nil {
		graph.supervisor.Stop()
	}
	if cancelSync != nil {
		cancelSync()
	}

	if cancelSync != nil {
		a.notify(func(listener Listener) { listener.SessionEnded() })
	}

	if graph.directWrites != nil {
		graph.directWrites.close()
	}

	a.stateMu.Lock()
	if a.graph == graph {
		a.graph = nil
	}
	a.stateMu.Unlock()

	a.clearBadge()

	graph.deviceTrust.Close()

	var dbErr error
	if graph.database != nil {
		if err := graph.database.Close(); err != nil {
			a.bootLogger.Warn().Err(err).Msg("closing the notification store")
			dbErr = err
		}
	}

	if graph.client != nil {
		graph.client.Close()
	}

	if dbErr != nil {
		return fmt.Errorf("shutdown: database close: %w", dbErr)
	}

	return nil
}

func (a *App) Logout(ctx context.Context) error {
	var stored *session.Session
	var deviceTrust *devicetrust.Manager
	if graph := a.readGraph(); graph != nil {
		stored, deviceTrust = graph.session, graph.deviceTrust
	}

	if deviceTrust != nil {
		keepCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		deviceTrust.KeepSeeds(keepCtx)
		cancel()
	}

	if err := a.Shutdown(); err != nil {
		a.bootLogger.Warn().Err(err).Msg("shutdown during logout; clearing anyway")
	}
	serversettings.Clear()

	a.eventGate.Reset("")

	a.stateMu.RLock()
	shell := a.notifyShell
	a.stateMu.RUnlock()
	if shell != nil {
		shell.WithdrawAll()
	}

	if stored != nil {
		userID := stored.UserID
		a.notify(func(listener Listener) {
			if signOut, ok := listener.(SignOutListener); ok {
				signOut.SignedOut(userID)
			}
		})
	}

	if stored != nil {

		err := logoutDevice(ctx, stored, 5*time.Second)

		if err != nil {
			a.bootLogger.Warn().Err(err).Str("device_id", stored.DeviceID).Msg("server logout failed; the device may remain on the account")
		} else {
			a.bootLogger.Info().Str("device_id", stored.DeviceID).Msg("device logged out on the server")
		}

		if err := session.RemoveStore(stored.StoreID); err != nil {
			a.bootLogger.Warn().Err(err).Msg("removing the session's store directory")
		}
	}

	return session.Clear()
}

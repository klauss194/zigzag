package bridge

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/go-json-experiment/json/jsontext"
	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/klauss/zigzag-go/internal/trace"

	"github.com/klauss/zigzag-go/internal/app"
	"github.com/klauss/zigzag-go/internal/buildinfo"
	"github.com/klauss/zigzag-go/internal/devicetrust"
	"github.com/klauss/zigzag-go/internal/endpointspec"
	"github.com/klauss/zigzag-go/internal/matrix"
)

type Service struct {
	core *app.App

	modules []string
}

func New(core *app.App, modules []string) *Service {
	return &Service{core: core, modules: modules}
}

var errNotImplemented = errors.New("zigzag: not implemented yet")

var errStillLoggedIn = errors.New("zigzag: still logged in — call Logout first")

func (s *Service) ServiceStartup(ctx context.Context, opts application.ServiceOptions) error {
	if err := s.core.Resume(ctx); err != nil {
		return err
	}
	if err := s.core.StartSync(); err != nil && !errors.Is(err, app.ErrNoSession) {
		return err
	}
	return nil
}

func (s *Service) ServiceShutdown() error {
	s.core.CloseNotifier()
	return s.core.Shutdown()
}

func (s *Service) UIReady(pos string) (*app.HydrateResult, error) {
	return s.core.UIReady(pos)
}

func (s *Service) Login(ctx context.Context, homeserver, user, password string) (*app.SessionInfo, error) {

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	info, err := s.core.Login(ctx, homeserver, user, password)
	if err != nil {
		return nil, err
	}

	if err := s.core.StartSync(); err != nil {
		return nil, err
	}
	return info, nil
}

func (s *Service) Register(ctx context.Context, homeserver, user, password, token string) (*app.SessionInfo, error) {

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	info, err := s.core.Register(ctx, homeserver, user, password, token)
	if err != nil {
		return nil, err
	}
	if err := s.core.StartSync(); err != nil {
		return nil, err
	}
	return info, nil
}

func (s *Service) Logout(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return s.core.Logout(ctx)
}

func (s *Service) Timeline(ctx context.Context, roomID, from string, limit int, gapFill bool) (*app.TimelinePage, error) {

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	return s.core.Timeline(ctx, roomID, from, limit, gapFill)
}

func (s *Service) Threads(ctx context.Context, req app.ThreadsRequest) (*app.EventChunk, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	return s.core.Threads(ctx, req)
}

func (s *Service) Relations(ctx context.Context, req app.RelationsRequest) (*app.EventChunk, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	return s.core.Relations(ctx, req)
}

func (s *Service) Send(ctx context.Context, req app.SendRequest) (*app.SendReceipt, error) {
	return s.core.Send(ctx, req)
}

func (s *Service) UnsentMessages(ctx context.Context, roomID string) ([]app.UnsentMessage, error) {
	return s.core.UnsentMessages(ctx, roomID)
}

func (s *Service) RetrySend(ctx context.Context, roomID, txnID string) (*app.SendReceipt, error) {
	return s.core.RetrySend(ctx, roomID, txnID)
}

func (s *Service) DiscardSend(ctx context.Context, roomID, txnID string) (bool, error) {
	return s.core.DiscardSend(ctx, roomID, txnID)
}

func (s *Service) SendState(ctx context.Context, req app.SendStateRequest) (*app.SendReceipt, error) {
	return s.core.SendState(ctx, req)
}

func (s *Service) Redact(ctx context.Context, roomID, eventID string) (*app.SendReceipt, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.Redact(ctx, roomID, eventID)
}

func (s *Service) RoomMembers(ctx context.Context, roomID string) (*app.EventChunk, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.RoomMembers(ctx, roomID)
}

func (s *Service) SearchUsers(ctx context.Context, term string, limit int) (*endpointspec.UserDirectoryResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.core.SearchUsers(ctx, term, limit)
}

func (s *Service) InviteUser(ctx context.Context, roomID, userID, reason string) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.InviteUser(ctx, roomID, userID, reason)
}

func (s *Service) JoinRoom(ctx context.Context, roomIDOrAlias string) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.JoinRoom(ctx, roomIDOrAlias)
}

func (s *Service) CreateRoom(ctx context.Context, req app.CreateRoomRequest) (*app.CreateRoomResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	return s.core.CreateRoom(ctx, req)
}

func (s *Service) AccountDataGet(ctx context.Context, eventType string) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.AccountDataGet(ctx, eventType)
}

func (s *Service) AccountDataSet(ctx context.Context, eventType string, content jsontext.Value) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.AccountDataSet(ctx, eventType, content)
}

func (s *Service) LeaveRoom(ctx context.Context, roomID string, forget bool) (*app.LeaveRoomResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	return s.core.LeaveRoom(ctx, roomID, forget)
}

func (s *Service) PlanDisband(ctx context.Context, roomID string) (*app.DisbandPlan, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	return s.core.PlanDisband(ctx, roomID)
}

func (s *Service) DisbandRoom(ctx context.Context, roomID string, allowPartial bool) (*app.DisbandResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	return s.core.DisbandRoom(ctx, roomID, allowPartial)
}

func (s *Service) KickUser(ctx context.Context, roomID, userID, reason string) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.KickUser(ctx, roomID, userID, reason)
}

func (s *Service) BanUser(ctx context.Context, roomID, userID, reason string) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.BanUser(ctx, roomID, userID, reason)
}

func (s *Service) UnbanUser(ctx context.Context, roomID, userID string) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.UnbanUser(ctx, roomID, userID)
}

func (s *Service) RoomStateEvent(ctx context.Context, roomID, eventType, stateKey string) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return s.core.RoomStateEvent(ctx, roomID, eventType, stateKey)
}

func (s *Service) CreateServerInvite(ctx context.Context, expiresInDays int) (matrix.RegistrationToken, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.core.CreateServerInvite(ctx, expiresInDays)
}

func (s *Service) ListServerInvites(ctx context.Context) ([]matrix.RegistrationToken, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.core.ListServerInvites(ctx)
}

func (s *Service) RevokeServerInvite(ctx context.Context, code string) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return s.core.RevokeServerInvite(ctx, code)
}

func (s *Service) NotifySetMode(roomID, mode string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.core.NotifySetMode(ctx, roomID, mode)
}

func (s *Service) NotifySetDND(untilMS int64) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.core.NotifySetDND(ctx, untilMS)
}

func (s *Service) NotifyOpenRoom(roomID string) int64 {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.core.NotifyOpenRoom(ctx, roomID)
}

func (s *Service) NotifyRoomRead(roomID string, eventTS int64) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	s.core.NotifyRoomRead(ctx, roomID, eventTS)
}

func (s *Service) NotifyForgetRoom(roomID string) { s.core.NotifyForgetRoom(roomID) }

func (s *Service) WindowFocused() bool { return s.core.WindowFocused() }

func (s *Service) ReadMarkers(roomID, eventID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return s.core.ReadMarkers(ctx, roomID, eventID)
}

func (s *Service) SendThreadReceipt(roomID, threadRootID, eventID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return s.core.SendThreadReceipt(ctx, roomID, threadRootID, eventID)
}

func (s *Service) TypingNotice(roomID string, typing bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return s.core.TypingNotice(ctx, roomID, typing)
}

func (s *Service) SetPresence(state string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	return s.core.SetPresence(ctx, state)
}

func (s *Service) PresenceOf(userIDs []string) (map[string]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return s.core.PresenceOf(ctx, userIDs)
}

func (s *Service) NotifyRoomNames(names map[string]string) {
	s.core.NotifyRoomNames(names)
}

func (s *Service) DeviceStatus(ctx context.Context) (*devicetrust.Status, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.DeviceStatus(ctx)
}

func (s *Service) DeviceBootstrap(ctx context.Context, password string) error {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	return s.core.DeviceBootstrap(ctx, password)
}

func (s *Service) DeviceStartVerification(ctx context.Context, deviceID string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	return s.core.DeviceStartVerification(ctx, deviceID)
}

func (s *Service) DeviceConfirmSas(ctx context.Context, transactionID string) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	return s.core.DeviceConfirmSas(ctx, transactionID)
}

func (s *Service) DeviceCancelVerification(ctx context.Context, transactionID string) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	return s.core.DeviceCancelVerification(ctx, transactionID)
}

func (s *Service) DeviceSignOut(ctx context.Context, deviceIDs []string, password string) (*devicetrust.Status, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	return s.core.DeviceSignOut(ctx, deviceIDs, password)
}

func (s *Service) DeviceReset(ctx context.Context, password string) error {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	return s.core.DeviceReset(ctx, password)
}

func (s *Service) UserProfile(ctx context.Context, userID string) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return s.core.UserProfile(ctx, userID)
}

func (s *Service) SetMyProfileField(ctx context.Context, field string, value any) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return s.core.SetMyProfileField(ctx, field, value)
}

func (s *Service) Session() *app.SessionInfo {
	return s.core.Session()
}

func (s *Service) EnterApp() error {
	wails := application.Get()
	if wails == nil {
		return errNotImplemented
	}

	session := s.core.Session()
	if session == nil || session.UserID == "" {

		return app.ErrNoSession
	}

	if application.System.IsMobile() {
		window := theOnlyWindow(wails)
		if window == nil {
			return errNotImplemented
		}
		window.ExecJS("location.replace(" + jsString(mainURL(session.UserID)) + ")")
		return nil
	}

	UnbindTray()

	mainWindow := swapWindows(wails, func() application.Window {
		return OpenMainWindow(wails, session.UserID, s.core.SetWindowFocused)
	}, LoginWindowName)

	if err := BindTray(wails, mainWindow, s.core.SetWindowFocused); err != nil {
		trayLog := trace.Log("tray")
		trayLog.Warn().Err(err).Msg("close-to-tray unavailable; the window will close for real")
	}
	return nil
}

func (s *Service) ReturnToLogin() error {
	if s.core.Session() != nil {
		return errStillLoggedIn
	}

	wails := application.Get()
	if wails == nil {
		return errNotImplemented
	}

	if application.System.IsMobile() {
		window := theOnlyWindow(wails)
		if window == nil {
			return errNotImplemented
		}
		window.ExecJS("location.replace(" + jsString(loginURL()) + ")")
		return nil
	}

	UnbindTray()

	loginWindow := swapWindows(wails, func() application.Window {
		return OpenLoginWindow(wails)
	}, MainWindowName)

	if err := BindTray(wails, loginWindow, s.core.SetWindowFocused); err != nil {
		trayLog := trace.Log("tray")
		trayLog.Warn().Err(err).Msg("close-to-tray unavailable; the window will close for real")
	}
	return nil
}

func (s *Service) PickFolder(title, directory string) (string, error) {
	wails := application.Get()
	if wails == nil {
		return "", errNotImplemented
	}
	dialog := wails.Dialog.OpenFile().
		CanChooseFiles(false).
		CanChooseDirectories(true).
		CanCreateDirectories(true).
		SetTitle(title)
	if directory != "" {
		dialog.SetDirectory(directory)
	}
	if window := wails.Window.Current(); window != nil {
		dialog.AttachToWindow(window)
	}
	return dialog.PromptForSingleSelection()
}

func (s *Service) OpenExternalLink(link string) error {
	sanitized, err := application.ValidateAndSanitizeURL(link)
	if err != nil {
		return fmt.Errorf("bridge: will not open that link: %w", err)
	}
	parsed, err := url.Parse(sanitized)
	if err != nil {
		return fmt.Errorf("bridge: will not open that link: %w", err)
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https", "mailto":
	default:
		return fmt.Errorf("bridge: will not open a %q link", parsed.Scheme)
	}

	if application.System.IsMobile() {
		application.Mobile.OpenURL(sanitized)
		return nil
	}
	wails := application.Get()
	if wails == nil {
		return errNotImplemented
	}
	return wails.Browser.OpenURL(sanitized)
}

func (s *Service) Modules() []string {
	return s.modules
}

type BuildInfo struct {
	Version string `json:"version"`
	Flavor  string `json:"flavor"`
}

func (s *Service) Build() BuildInfo {
	return BuildInfo{Version: buildinfo.Version, Flavor: buildinfo.Flavor}
}

func (s *Service) TraceUI(level, area, msg string) {
	log := trace.Log("ui:" + area)

	switch level {
	case "error":
		log.Error().Msg(msg)
	case "warn":
		log.Warn().Msg(msg)
	case "debug":
		log.Debug().Msg(msg)
	default:
		log.Info().Msg(msg)
	}
}

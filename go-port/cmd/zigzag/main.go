package main

import (
	"fmt"
	"io/fs"
	"log"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/klauss/zigzag-go/frontend"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/services/dock"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"

	"github.com/klauss/zigzag-go/internal/trace"

	"github.com/klauss/zigzag-go/internal/app"
	"github.com/klauss/zigzag-go/internal/bridge"
	"github.com/klauss/zigzag-go/internal/devicetrust"
	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/media"
	"github.com/klauss/zigzag-go/internal/modules/debug"
	"github.com/klauss/zigzag-go/internal/notify"
	"github.com/klauss/zigzag-go/internal/pages"
	"github.com/klauss/zigzag-go/internal/platform"
	"github.com/klauss/zigzag-go/internal/serversettings"
	"github.com/klauss/zigzag-go/internal/session"
)

func init() {

	app.RegisterEvents()

	application.RegisterEvent[devicetrust.SASPayload](devicetrust.EventSAS)
	application.RegisterEvent[devicetrust.VerifyPayload](devicetrust.EventVerify)

	if debug.Enabled {
		debug.RegisterEvents()
	}
}

func main() {

	if runtime.GOOS == "linux" {
		os.Setenv("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1")
		os.Setenv("WEBKIT_DISABLE_COMPOSITING_MODE", "1")
	}

	if application.System.IsPlatform(application.PlatformAndroid) {
		androidLogger := trace.Log("platform")
		if dir, err := platform.UserDataDir(); err == nil {
			os.Setenv("HOME", dir)
			androidLogger.Info().Str("dir", dir).Msg("android: HOME")
		} else {
			androidLogger.Warn().Err(err).Msg("android: HOME not set, data dir unavailable")
		}
		if dir, err := platform.UserCacheDir(); err == nil {
			os.Setenv("TMPDIR", dir)
			androidLogger.Info().Str("dir", dir).Msg("android: TMPDIR")
		} else {
			androidLogger.Warn().Err(err).Msg("android: TMPDIR not set, cache dir unavailable")
		}
	}

	core := app.New()

	bootLogger := trace.Log("boot")
	if runtime, bundled := matrix.SQLiteVersion(); runtime == bundled {
		bootLogger.Info().Str("sqlite", runtime).Msg("rust-sdk runs on its own bundled SQLite")
	} else {
		bootLogger.Error().Str("runtime", runtime).Str("bundled", bundled).
			Msg("rust-sdk runs on ANOTHER SQLite than the one it bundles — a second C SQLite is linked")
	}

	wailsLogger := trace.Log("wails")

	notifyLogger := trace.Log("notify")

	var notificationService *notifications.NotificationService
	if reason := platform.NativeNotificationsUnavailable(); reason != "" {

		notifyLogger.Warn().Bool(trace.PinField, true).Msg("native notifications disabled: " + reason)
	} else {
		notificationService = notifications.New()
	}

	attachments := media.New(platform.UserCacheDir)
	core.AddListener(attachments)

	attachmentBridge := bridge.NewMedia(attachments)

	var enabledModules []string
	var moduleServices []application.Service
	if debug.Enabled {
		moduleServices = append(moduleServices, debug.Setup()...)
		enabledModules = append(enabledModules, debug.Name)
	}

	var services []application.Service
	if notificationService != nil {

		services = append(services, application.NewService(core.NewNotificationHost(notificationService)))
	}

	var dockService *dock.DockService
	if !application.System.IsMobile() {
		dockService = dock.New()
		services = append(services, application.NewService(core.NewBadgeHost(dockService)))
	}
	services = append(services,
		application.NewService(bridge.New(core, enabledModules)),
		application.NewServiceWithOptions(attachmentBridge,
			application.ServiceOptions{Route: bridge.MediaRoute}),
	)
	services = append(services, moduleServices...)

	var startPageMiddleware application.Middleware
	if application.System.IsMobile() {
		startPageMiddleware = bridge.NewStartPageMiddleware(session.ResumableUserID)
	}

	sourcePack, err := fs.ReadFile(frontend.SourcePack, "sourcepack/sourcepack.tar.gz")
	if err != nil {
		wailsLogger.Error().Err(err).Msg("no frontend source pack embedded")
	}
	appPages := pages.New(pages.Options{
		Pack: sourcePack,
		Next: application.AssetFileServerFS(frontend.Assets),
	})

	wails := application.New(application.Options{

		Name:        platform.AppID,
		Description: "Matrix client — Go/Wails port",

		Linux: application.LinuxOptions{
			ProgramName: platform.AppID,
		},

		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: platform.SingleInstanceID(),
			OnSecondInstanceLaunch: func(application.SecondInstanceData) {
				bridge.RestoreWindow()
			},
		},

		Services: services,
		Assets: application.AssetOptions{

			Handler:    appPages,
			Middleware: startPageMiddleware,
		},

		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},

		ErrorHandler: func(err error) {
			wailsLogger.Error().Err(err).Msg("wails reported an error")
		},

		PanicHandler: func(details *application.PanicDetails) {
			survived := strings.Contains(details.FullStackTrace, "(*BoundMethod).Call")
			reportPanic(details, survived)
			if !survived {
				os.Exit(1)
			}
		},
	})

	disarmCrashOutput := func() {}
	if crashDir, err := platform.CrashDir(); err == nil {
		crashLogger := trace.Log("crash")
		previous, err := platform.UnreportedCrashes(crashDir)
		for _, report := range previous {
			crashLogger.Warn().Str("what", report.What).Str("report", report.Path).Msg("previous run crashed")
		}
		if err != nil {
			crashLogger.Warn().Err(err).Msg("could not read or record earlier crash reports")
		}

		if disarm, err := platform.CaptureRuntimeCrashes(crashDir, time.Now()); err == nil {
			disarmCrashOutput = disarm
		} else {
			wailsLogger.Warn().Err(err).Msg("crashes outside Wails will not be written to disk")
		}
	}

	emitLogger := trace.Log("wire")
	core.AttachEmitter(func(name string, data ...any) {
		if cancelled := wails.Event.Emit(name, data...); cancelled {
			emitLogger.Warn().
				Str("event", name).
				Msg("event CANCELLED by wails — a hook, or the payload type does not match RegisterEvent")
		}
	})

	if notificationService != nil {

		core.AttachNotifier(notificationService)

		notificationService.OnNotificationResponse(func(result notifications.NotificationResult) {
			core.HandleNotificationResponse(result)
			bridge.RestoreWindow()
		})

	} else if application.System.IsMobile() {
		core.AttachNotifier(notify.PlatformNotifier())
	}
	if dockService != nil {
		core.AttachBadge(dockService)
	}

	if err := bridge.BindTray(wails, nil, core.SetWindowFocused); err != nil {
		trayLog := trace.Log("tray")
		trayLog.Warn().Err(err).Msg("close-to-tray unavailable; the window will close for real")
	}

	serversettings.UseStoredSession()

	var firstWindow application.Window

	if userID := session.ResumableUserID(); userID != "" {

		mainWindow := bridge.OpenMainWindow(wails, userID, core.SetWindowFocused)
		firstWindow = mainWindow

		if err := bridge.BindTray(wails, mainWindow, core.SetWindowFocused); err != nil {
			trayLog := trace.Log("tray")
			trayLog.Warn().Err(err).Msg("close-to-tray unavailable; the window will close for real")
		}
	} else {
		loginWindow := bridge.OpenLoginWindow(wails)
		firstWindow = loginWindow
		if err := bridge.BindTray(wails, loginWindow, core.SetWindowFocused); err != nil {
			trayLog := trace.Log("tray")
			trayLog.Warn().Err(err).Msg("close-to-tray unavailable; the window will close for real")
		}
	}

	if application.System.IsMobile() {
		bridge.BindLifecycle(wails, core.SetWindowFocused, core.NudgeSync)
	}

	if notificationService != nil {

		var askOnce sync.Once
		firstWindow.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
			askOnce.Do(func() {

				if !core.NotificationsStarted() {
					return
				}
				go func() {

					granted, err := notificationService.RequestNotificationAuthorization()
					switch {
					case err != nil:
						notifyLogger.Warn().Bool(trace.PinField, true).Err(err).Msg("could not request notification authorisation — toasts may be silently dropped")
					case !granted:
						notifyLogger.Warn().Bool(trace.PinField, true).Msg("notifications not authorised — every toast is dropped until Zigzag is allowed in System Settings → Notifications")
					default:
						notifyLogger.Info().Bool(trace.PinField, true).Msg("notifications authorised")
					}
				}()
			})
		})
	}

	if err := wails.Run(); err != nil {
		log.Fatal(err)
	}
	disarmCrashOutput()
}

func reportPanic(details *application.PanicDetails, survived bool) {
	logger := trace.Log("wails")
	logger.Error().Err(details.Error).Bool("app_continues", survived).Msg("panic")

	crashDir, err := platform.CrashDir()
	if err == nil {
		var path string
		path, err = platform.WritePanicReport(crashDir, details.Time, survived,
			details.Error, details.FullStackTrace, trace.Snapshot())
		if err == nil {
			logger.Error().Str("path", path).Msg("crash report written")
			fmt.Fprintln(os.Stderr, "zigzag: crash report written to", path)
			return
		}
	}
	logger.Error().Err(err).Msg("could not write the crash report")
	fmt.Fprintln(os.Stderr, "zigzag: could not write the crash report:", err)
}

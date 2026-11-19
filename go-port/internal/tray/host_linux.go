//go:build linux && !android

package tray

import (
	"fmt"
	"sync"

	"github.com/godbus/dbus/v5"
)

const statusNotifierWatcherName = "org.kde.StatusNotifierWatcher"

func watchTrayHost(onChange func(live bool)) (live bool, stop func(), err error) {
	conn, err := dbus.SessionBus()
	if err != nil {
		return false, nil, fmt.Errorf("session bus: %w", err)
	}

	matchOptions := []dbus.MatchOption{
		dbus.WithMatchObjectPath("/org/freedesktop/DBus"),
		dbus.WithMatchInterface("org.freedesktop.DBus"),
		dbus.WithMatchSender("org.freedesktop.DBus"),
		dbus.WithMatchMember("NameOwnerChanged"),
		dbus.WithMatchArg(0, statusNotifierWatcherName),
	}
	if err := conn.AddMatchSignal(matchOptions...); err != nil {
		return false, nil, fmt.Errorf("match NameOwnerChanged: %w", err)
	}

	signals := make(chan *dbus.Signal, 16)
	conn.Signal(signals)

	release := func() {
		conn.RemoveSignal(signals)

		_ = conn.RemoveMatchSignal(matchOptions...)
	}

	var hasOwner bool
	if err := conn.BusObject().Call("org.freedesktop.DBus.NameHasOwner", 0, statusNotifierWatcherName).Store(&hasOwner); err != nil {
		release()
		return false, nil, fmt.Errorf("NameHasOwner: %w", err)
	}

	done := make(chan struct{})
	go func() {
		current := hasOwner
		for {
			select {
			case <-done:
				return
			case signal, ok := <-signals:
				if !ok {
					return
				}

				if signal == nil || signal.Name != "org.freedesktop.DBus.NameOwnerChanged" || len(signal.Body) < 3 {
					continue
				}
				name, _ := signal.Body[0].(string)
				newOwner, _ := signal.Body[2].(string)
				if name != statusNotifierWatcherName {
					continue
				}
				next := newOwner != ""
				if next == current {
					continue
				}
				current = next
				onChange(current)
			}
		}
	}()

	var once sync.Once
	stop = func() {
		once.Do(func() {
			close(done)
			release()
		})
	}
	return hasOwner, stop, nil
}

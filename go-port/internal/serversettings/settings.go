package serversettings

import (
	"strings"
	"sync/atomic"

	matrixid "github.com/klauss/zigzag-go/internal/matrix/id"
	"github.com/klauss/zigzag-go/internal/session"
)

type Settings struct {
	ServerName string

	HomeserverURL string
}

func FromSession(stored *session.Session) Settings {
	return Settings{
		ServerName:    matrixid.UserID(stored.UserID).Server(),
		HomeserverURL: strings.TrimRight(stored.HomeserverURL, "/"),
	}
}

var current atomic.Pointer[Settings]

func Current() Settings {
	if settings := current.Load(); settings != nil {
		return *settings
	}
	return Settings{}
}

func Set(settings Settings) { current.Store(&settings) }

func Clear() { current.Store(nil) }

func UseStoredSession() {
	if stored := session.Peek(); stored != nil {
		Set(FromSession(stored))
	}
}

package matrix

import (
	"net/http"
	"time"
)

const (
	pingAfterIdle = 20 * time.Second

	pongDeadline = 10 * time.Second
)

func newTransport() *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.HTTP2 = &http.HTTP2Config{
		SendPingTimeout: pingAfterIdle,
		PingTimeout:     pongDeadline,
	}
	return transport
}

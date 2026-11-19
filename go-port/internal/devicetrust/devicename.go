package devicetrust

import (
	"context"
	"net/http"
	"os"
	"strings"
	"time"
)

const renameTimeout = 15 * time.Second

func DisplayName() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "Zigzag"
	}

	if dot := strings.IndexByte(hostname, '.'); dot > 0 {
		hostname = hostname[:dot]
	}
	hostname = strings.TrimSpace(hostname)
	if hostname == "" {
		return "Zigzag"
	}
	return "Zigzag on " + hostname
}

func (m *Manager) SyncDisplayName() {
	name := DisplayName()
	client := m.client
	if client.DeviceID() == "" {
		return
	}
	m.goBackground(renameTimeout, func(ctx context.Context) {
		url := client.ClientURL("v3", "devices", client.DeviceID())
		if err := client.Do(ctx, http.MethodPut, url, nil, map[string]string{"display_name": name}, nil); err != nil {

			if m.lifetime.Err() != nil {
				m.log.Debug().Err(err).Msg("rename dropped: the session ended")
				return
			}
			m.log.Warn().Err(err).Str("name", name).Msg("could not rename this session")
			return
		}
		m.log.Info().Str("name", name).Msg("session renamed")
	})
}

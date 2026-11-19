package notify

import (
	"encoding/json"

	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

type androidPayload struct {
	Title  string `json:"title"`
	Body   string `json:"body"`
	ID     string `json:"id,omitempty"`
	RoomID string `json:"roomId,omitempty"`

	Cancel bool `json:"cancel,omitempty"`
}

func buildAndroidPayload(options notifications.NotificationOptions) string {
	payload := androidPayload{
		Title: options.Title,
		Body:  options.Body,
		ID:    options.ID,
	}
	if roomID, ok := options.Data["roomId"].(string); ok {
		payload.RoomID = roomID
	}
	encoded, _ := json.Marshal(payload)
	return string(encoded)
}

func buildAndroidCancelPayload(identifier string) string {
	encoded, _ := json.Marshal(androidPayload{ID: identifier, Cancel: true})
	return string(encoded)
}

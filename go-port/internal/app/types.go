package app

import (
	"errors"

	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/notify"
)

type TimelinePage struct {
	Events []jsontext.Value `json:"events"`

	End string `json:"end,omitempty"`
}

var ErrNoSession = errors.New("zigzag: no session")

type SessionInfo struct {
	UserID     string `json:"userId"`
	DeviceID   string `json:"deviceId"`
	Homeserver string `json:"homeserver"`
}

type LeaveRoomResult struct {
	Left        bool     `json:"left"`
	Forgot      bool     `json:"forgot"`
	AlreadyLeft bool     `json:"alreadyLeft,omitempty"`
	Warnings    []string `json:"warnings,omitempty"`
}

type MemberActionFailure struct {
	Step   string `json:"step"`
	UserID string `json:"userId,omitempty"`
	Error  string `json:"error"`
}

type DisbandPlan struct {
	Verdict              string   `json:"verdict"`
	ActorIsCreator       bool     `json:"actorIsCreator"`
	ActorJoined          bool     `json:"actorJoined"`
	JoinRule             string   `json:"joinRule,omitempty"`
	RequiresJoinRuleLock bool     `json:"requiresJoinRuleLock,omitempty"`
	Kickable             []string `json:"kickable"`
	Blocked              []string `json:"blocked"`
	RemainingCreators    []string `json:"remainingCreators"`
}

type DisbandResult struct {
	Outcome   string                `json:"outcome"`
	Plan      *DisbandPlan          `json:"plan,omitempty"`
	Locked    bool                  `json:"locked,omitempty"`
	Kicked    []string              `json:"kicked"`
	Survivors []string              `json:"survivors"`
	Failures  []MemberActionFailure `json:"failures"`
	Left      bool                  `json:"left"`
	Forgot    bool                  `json:"forgot"`
	Warnings  []string              `json:"warnings,omitempty"`
}

type SendRequest struct {
	RoomID string `json:"roomId"`

	Type string `json:"type"`

	Content jsontext.Value `json:"content"`

	TxnID string `json:"txnId,omitempty"`

	Direct bool `json:"direct,omitempty"`
}

type SendStateRequest struct {
	RoomID string `json:"roomId"`

	Type string `json:"type"`

	StateKey string `json:"stateKey"`

	Content jsontext.Value `json:"content"`
}

type SendReceipt struct {
	TxnID string `json:"txnId"`

	EventID string `json:"eventId,omitempty"`

	State string `json:"state"`

	Error string `json:"error,omitempty"`
}

type UnsentMessage struct {
	RoomID string `json:"roomId"`
	TxnID  string `json:"txnId"`

	Kind string `json:"kind"`

	Type    string         `json:"type,omitempty"`
	Content jsontext.Value `json:"content,omitempty"`

	QueuedAt int64 `json:"queuedAt,omitzero"`

	Redacts string `json:"redacts,omitempty"`

	State string `json:"state"`

	Reason string `json:"reason,omitempty"`
	Error  string `json:"error,omitempty"`
}

type CreateRoomRequest struct {
	Body jsontext.Value `json:"body"`
}

type CreateRoomResult struct {
	RoomID string `json:"roomId"`
}

type EventChunk struct {
	Chunk []jsontext.Value `json:"chunk"`

	NextBatch string `json:"next_batch,omitempty"`

	PrevBatch string `json:"prev_batch,omitempty"`
}

type ThreadsRequest struct {
	RoomID string `json:"roomId"`

	Include string `json:"include,omitempty"`

	Limit int    `json:"limit,omitzero"`
	From  string `json:"from,omitempty"`
}

type RelationsRequest struct {
	RoomID  string `json:"roomId"`
	EventID string `json:"eventId"`

	RelType string `json:"relType,omitempty"`

	EventType string `json:"eventType,omitempty"`

	Recurse bool `json:"recurse,omitzero"`

	Dir string `json:"dir,omitempty"`

	Limit int    `json:"limit,omitzero"`
	From  string `json:"from,omitempty"`
}

type HydrateResult struct {
	Action string `json:"action"`

	Settled bool `json:"settled"`

	Replayed int `json:"replayed"`

	Notify *notify.Update `json:"notify,omitzero"`
}

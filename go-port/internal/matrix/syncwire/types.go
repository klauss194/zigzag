package syncwire

import (
	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
)

type Response struct {
	Pos   string                `json:"pos"`
	Lists map[string]ListResult `json:"lists"`

	Rooms map[string]Room `json:"rooms"`

	Extensions Extensions `json:"extensions"`
}

type ListResult struct {
	Count int  `json:"count"`
	Ops   []Op `json:"ops,omitempty"`
}

type OpKind string

const (
	OpSync       OpKind = "SYNC"
	OpInsert     OpKind = "INSERT"
	OpDelete     OpKind = "DELETE"
	OpInvalidate OpKind = "INVALIDATE"
	OpUnknown    OpKind = ""
)

type Op struct {
	Kind    OpKind   `json:"op"`
	Range   []int    `json:"range,omitempty"`
	Index   *int     `json:"index,omitzero"`
	RoomIDs []string `json:"room_ids,omitempty"`
	RoomID  string   `json:"room_id,omitempty"`
}

type Room struct {
	Name              string           `json:"name,omitempty"`
	Avatar            Avatar           `json:"avatar"`
	Timeline          []jsontext.Value `json:"timeline,omitempty"`
	RequiredState     []jsontext.Value `json:"required_state,omitempty"`
	BumpStamp         int64            `json:"bump_stamp,omitzero"`
	JoinedCount       int              `json:"joined_count,omitzero"`
	InvitedCount      int              `json:"invited_count,omitzero"`
	NotificationCount int              `json:"notification_count,omitzero"`
	HighlightCount    int              `json:"highlight_count,omitzero"`
	PrevBatch         string           `json:"prev_batch,omitempty"`

	Initial bool `json:"initial,omitzero"`

	Limited bool `json:"limited,omitzero"`

	NumLive int `json:"num_live,omitzero"`

	IsDM bool `json:"is_dm,omitzero"`

	Heroes []Hero `json:"heroes,omitzero"`

	InviteState *[]jsontext.Value `json:"invite_state,omitzero"`
}

func (r Room) IsInvite() bool { return r.InviteState != nil }

type Hero struct {
	UserID string `json:"user_id"`

	DisplayName string `json:"displayname,omitzero"`

	AvatarURL string `json:"avatar_url,omitzero"`
}

type AvatarState uint8

const (
	AvatarUnset AvatarState = iota
	AvatarCleared
	AvatarSet
)

type Avatar struct {
	State AvatarState
	URL   string
}

func (a *Avatar) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		a.State = AvatarCleared
		return nil
	}
	a.State = AvatarSet
	return jsonv2.Unmarshal(b, &a.URL)
}

type Extensions struct {
	ToDevice    ToDeviceExt    `json:"to_device"`
	E2EE        E2EEExt        `json:"e2ee"`
	Receipts    ReceiptsExt    `json:"receipts"`
	Typing      TypingExt      `json:"typing"`
	AccountData AccountDataExt `json:"account_data"`

	ThreadSubscriptions ThreadSubscriptionsExt `json:"io.element.msc4308.thread_subscriptions"`
}

type ThreadSubscriptionsExt struct {
	Subscribed   map[string]map[string]ThreadSubscriptionChange   `json:"subscribed,omitempty"`
	Unsubscribed map[string]map[string]ThreadUnsubscriptionChange `json:"unsubscribed,omitempty"`

	PrevBatch string `json:"prev_batch,omitempty"`
}

type ToDeviceExt struct {
	NextBatch string           `json:"next_batch"`
	Events    []jsontext.Value `json:"events,omitempty"`
}

type E2EEExt struct {
	DeviceLists DeviceLists `json:"device_lists"`

	OneTimeKeysCount map[string]*int `json:"device_one_time_keys_count,omitempty"`

	FallbackKeyTypes []string `json:"device_unused_fallback_key_types,omitempty"`
}

type ReceiptsExt struct {
	Rooms map[string]jsontext.Value `json:"rooms,omitempty"`
}

type TypingExt struct {
	Rooms map[string]jsontext.Value `json:"rooms,omitempty"`
}

type AccountDataExt struct {
	Global []jsontext.Value            `json:"global,omitempty"`
	Rooms  map[string][]jsontext.Value `json:"rooms,omitempty"`
}

type DeviceLists struct {
	Changed []string `json:"changed,omitempty"`
	Left    []string `json:"left,omitempty"`
}

type ThreadSubscriptionChange struct {
	Automatic bool  `json:"automatic"`
	BumpStamp int64 `json:"bump_stamp"`
}

type ThreadUnsubscriptionChange struct {
	BumpStamp int64 `json:"bump_stamp"`
}

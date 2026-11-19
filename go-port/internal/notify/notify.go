package notify

import "github.com/klauss/zigzag-go/internal/matrix/id"

type Mode uint8

const (
	ModeAll Mode = iota
	ModeMentions
	ModeMute
)

func (m Mode) String() string {
	switch m {
	case ModeMentions:
		return "mentions"
	case ModeMute:
		return "mute"
	default:
		return "all"
	}
}

func ParseMode(raw string) Mode {
	switch raw {
	case "mute":
		return ModeMute
	case "mentions":
		return ModeMentions
	default:
		return ModeAll
	}
}

type Update struct {
	Seq uint64 `json:"seq"`

	Rooms  []RoomCount `json:"rooms"`
	Events []Toast     `json:"events"`
	Modes  []ModeRow   `json:"modes"`

	ThreadCounts []ThreadCount `json:"threads"`

	DNDUntil *int64 `json:"dnd_until,omitempty"`

	Redacted []id.EventID `json:"-"`

	SaveRooms     []id.RoomID `json:"-"`
	SaveThreads   []ThreadKey `json:"-"`
	DeleteThreads []ThreadKey `json:"-"`
	ForgetRooms   []id.RoomID `json:"-"`
}

func (u *Update) isEmpty() bool {
	return len(u.Rooms) == 0 && len(u.Events) == 0 && len(u.Modes) == 0 && len(u.ThreadCounts) == 0 &&
		u.DNDUntil == nil && len(u.Redacted) == 0 && len(u.SaveRooms) == 0 && len(u.SaveThreads) == 0 && len(u.DeleteThreads) == 0 && len(u.ForgetRooms) == 0
}

func (u *Update) HasWireContent() bool {
	return len(u.Rooms) > 0 || len(u.Events) > 0 || len(u.Modes) > 0 || len(u.ThreadCounts) > 0 ||
		u.DNDUntil != nil
}

func newUpdate() *Update {
	return &Update{Rooms: []RoomCount{}, Events: []Toast{}, Modes: []ModeRow{}, ThreadCounts: []ThreadCount{}}
}

type RoomCount struct {
	RoomID            id.RoomID `json:"room_id"`
	NotificationCount int       `json:"notification_count"`
	HighlightCount    int       `json:"highlight_count"`
	Uncounted         bool      `json:"uncounted,omitempty"`
}

type ThreadCount struct {
	RoomID            id.RoomID  `json:"room_id"`
	RootID            id.EventID `json:"root_id"`
	NotificationCount int        `json:"notification_count"`
	HighlightCount    int        `json:"highlight_count"`
	Uncounted         bool       `json:"uncounted,omitempty"`
	Participated      bool       `json:"participated"`
	LastActivityTS    int64      `json:"last_activity_ts"`
}

type ModeRow struct {
	RoomID id.RoomID `json:"room_id"`
	Mode   string    `json:"mode"`
}

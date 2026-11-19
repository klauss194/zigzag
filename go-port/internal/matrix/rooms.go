package matrix

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"

	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/matrix/event"
	"github.com/klauss/zigzag-go/internal/rustcore"
)

var ErrNoCore = errors.New("matrix: this client has no core (HTTP only)")

func (c *Client) needCore() (*rustcore.Core, error) {
	if c.core == nil {
		return nil, ErrNoCore
	}
	if c.closed.Load() {
		return nil, ErrClosed
	}
	return c.core, nil
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

type Attachment struct {
	Filename string
	MimeType string
	Data     []byte
	Caption  string

	Width, Height uint32

	Thumbnail *Thumbnail
}

type Thumbnail struct {
	Data          []byte
	MimeType      string
	Width, Height uint32
}

func (c *Client) SendAttachment(ctx context.Context, roomID string, file Attachment) (string, error) {
	core, err := c.needCore()
	if err != nil {
		return "", err
	}
	size, thumbnail := attachmentExtras(file)
	return await(ctx, func() (string, error) {
		return core.SendAttachment(roomID, file.Filename, file.MimeType, file.Data, optional(file.Caption), size, thumbnail)
	})
}

func attachmentExtras(file Attachment) (*rustcore.AttachmentSize, *rustcore.AttachmentThumbnail) {
	var size *rustcore.AttachmentSize
	if file.Width > 0 && file.Height > 0 {
		size = &rustcore.AttachmentSize{Width: file.Width, Height: file.Height}
	}
	var thumbnail *rustcore.AttachmentThumbnail
	if file.Thumbnail != nil {
		thumbnail = &rustcore.AttachmentThumbnail{
			Data:     file.Thumbnail.Data,
			MimeType: file.Thumbnail.MimeType,
			Width:    file.Thumbnail.Width,
			Height:   file.Thumbnail.Height,
		}
	}
	return size, thumbnail
}

func (c *Client) DownloadMessageMedia(ctx context.Context, source []byte) ([]byte, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	return await(ctx, func() ([]byte, error) { return core.DownloadMedia(string(source)) })
}

func (c *Client) SendEvent(ctx context.Context, roomID, eventType string, content []byte, txnID string) (string, error) {
	if c.core == nil {

		if c.unencrypted == nil {
			return "", errNoSender
		}
		if err := c.unencrypted(ctx, roomID); err != nil {
			return "", err
		}
		if txnID == "" {
			txnID = newTxnID()
		}
		var resp struct {
			EventID string `json:"event_id"`
		}
		err := c.Do(ctx, http.MethodPut, c.ClientURL("v3", "rooms", roomID, "send", eventType, txnID), nil, jsontext.Value(content), &resp)
		return resp.EventID, err
	}
	core := c.core
	return await(ctx, func() (string, error) {
		return core.SendEvent(roomID, eventType, string(content), optional(txnID))
	})
}

func (c *Client) SetPlainSends(unencrypted func(ctx context.Context, roomID string) error) {
	c.unencrypted = unencrypted
}

func (c *Client) SendState(ctx context.Context, roomID, eventType, stateKey string, content []byte) (string, error) {
	if c.core == nil {
		return c.PutStateHTTP(ctx, roomID, eventType, stateKey, content)
	}
	core := c.core
	return await(ctx, func() (string, error) {
		return core.SendState(roomID, eventType, stateKey, string(content))
	})
}

func (c *Client) Redact(ctx context.Context, roomID, eventID, reason, txnID string) (string, error) {
	if c.core == nil {
		if txnID == "" {
			txnID = newTxnID()
		}
		body := map[string]any{}
		if reason != "" {
			body["reason"] = reason
		}
		var resp struct {
			EventID string `json:"event_id"`
		}
		err := c.Do(ctx, http.MethodPut, c.ClientURL("v3", "rooms", roomID, "redact", eventID, txnID), nil, body, &resp)
		return resp.EventID, err
	}
	core := c.core
	return await(ctx, func() (string, error) {
		return core.Redact(roomID, eventID, optional(reason), optional(txnID))
	})
}

func (c *Client) CreateRoom(ctx context.Context, body []byte) (string, error) {
	if c.core == nil {
		var resp struct {
			RoomID string `json:"room_id"`
		}
		err := c.Do(ctx, http.MethodPost, c.ClientURL("v3", "createRoom"), nil, jsontext.Value(body), &resp)
		return resp.RoomID, err
	}
	core := c.core
	return await(ctx, func() (string, error) { return core.CreateRoom(string(body)) })
}

func (c *Client) JoinRoom(ctx context.Context, idOrAlias string, via []string) (string, error) {
	if c.core == nil {
		var query url.Values
		for _, server := range via {
			if query == nil {
				query = url.Values{}
			}
			query.Add("server_name", server)
			query.Add("via", server)
		}
		var resp struct {
			RoomID string `json:"room_id"`
		}
		err := c.Do(ctx, http.MethodPost, c.ClientURL("v3", "join", idOrAlias), query, struct{}{}, &resp)
		return resp.RoomID, err
	}
	core := c.core
	return await(ctx, func() (string, error) { return core.JoinRoom(idOrAlias, via) })
}

const maxRoomTitleBytes = 1024

func (c *Client) RoomTitle(ctx context.Context, roomID string) string {
	for _, source := range []struct{ eventType, key string }{
		{"m.room.name", "name"},
		{"m.room.canonical_alias", "alias"},
	} {
		var content map[string]any
		if err := c.StateEvent(ctx, roomID, source.eventType, "", &content); err != nil {
			continue
		}
		if title, _ := content[source.key].(string); title != "" && len(title) <= maxRoomTitleBytes {
			return title
		}
	}
	return ""
}

type Membership uint8

const (
	MembershipInvite Membership = iota + 1
	MembershipKick
	MembershipBan
	MembershipUnban
)

func (c *Client) ChangeMembership(ctx context.Context, change Membership, roomID, userID, reason string) error {
	if c.core == nil {
		action := map[Membership]string{
			MembershipInvite: "invite", MembershipKick: "kick", MembershipBan: "ban", MembershipUnban: "unban",
		}[change]
		if action == "" {
			return errors.New("matrix: unknown membership change")
		}
		body := map[string]any{"user_id": userID}
		if reason != "" {
			body["reason"] = reason
		}
		return c.Do(ctx, http.MethodPost, c.ClientURL("v3", "rooms", roomID, action), nil, body, nil)
	}
	core := c.core
	_, err := await(ctx, func() (struct{}, error) {
		switch change {
		case MembershipInvite:
			return struct{}{}, core.Invite(roomID, userID, optional(reason))
		case MembershipKick:
			return struct{}{}, core.Kick(roomID, userID, optional(reason))
		case MembershipBan:
			return struct{}{}, core.Ban(roomID, userID, optional(reason))
		case MembershipUnban:
			return struct{}{}, core.Unban(roomID, userID, optional(reason))
		}
		return struct{}{}, errors.New("matrix: unknown membership change")
	})
	return err
}

func (c *Client) SendReceipt(ctx context.Context, roomID, receiptType, thread, eventID string) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	_, err = await(ctx, func() (struct{}, error) {
		return struct{}{}, core.SendReceipt(roomID, receiptType, optional(thread), eventID)
	})
	return err
}

type ReadMarkers struct {
	FullyRead   string
	Read        string
	ReadPrivate string
}

func (c *Client) SetReadMarkers(ctx context.Context, roomID string, markers ReadMarkers) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	_, err = await(ctx, func() (struct{}, error) {
		return struct{}{}, core.SetReadMarkers(roomID,
			optional(markers.FullyRead), optional(markers.Read), optional(markers.ReadPrivate))
	})
	return err
}

type EventPage struct {
	Events        []jsontext.Value
	End           string
	Start         string
	Undecryptable int
}

func eventPage(page rustcore.EventPage) *EventPage {
	events := make([]jsontext.Value, len(page.Events))
	for i, event := range page.Events {
		events[i] = jsontext.Value(event)
	}
	return &EventPage{
		Events:        events,
		End:           deref(page.End),
		Start:         deref(page.Start),
		Undecryptable: int(page.Undecryptable),
	}
}

func (c *Client) Messages(ctx context.Context, roomID, from string, limit int, backward bool) (*EventPage, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	page, err := await(ctx, func() (rustcore.EventPage, error) {
		return core.Messages(roomID, optional(from), uint32(max(limit, 0)), backward)
	})
	if err != nil {
		return nil, err
	}
	return eventPage(page), nil
}

func (c *Client) Threads(ctx context.Context, roomID string, participatedOnly bool, from string, limit int) (*EventPage, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	page, err := await(ctx, func() (rustcore.EventPage, error) {
		return core.Threads(roomID, participatedOnly, optional(from), uint32(max(limit, 0)))
	})
	if err != nil {
		return nil, err
	}
	return eventPage(page), nil
}

type RelationsQuery struct {
	RelType   string
	EventType string
	Recurse   bool
	Backward  bool
	From      string
	Limit     int
}

func (c *Client) Relations(ctx context.Context, roomID, eventID string, q RelationsQuery) (*EventPage, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	page, err := await(ctx, func() (rustcore.EventPage, error) {
		return core.Relations(roomID, eventID, optional(q.RelType), optional(q.EventType),
			q.Recurse, q.Backward, optional(q.From), uint32(max(q.Limit, 0)))
	})
	if err != nil {
		return nil, err
	}
	return eventPage(page), nil
}

func (c *Client) Event(ctx context.Context, roomID, eventID string) (jsontext.Value, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	event, err := await(ctx, func() (string, error) { return core.Event(roomID, eventID) })
	if err != nil {
		return nil, err
	}
	return jsontext.Value(event), nil
}

func (c *Client) AccountData(ctx context.Context, eventType string) (jsontext.Value, error) {
	if c.core == nil {
		var content jsontext.Value
		err := c.Do(ctx, http.MethodGet, c.ClientURL("v3", "user", c.session.UserID, "account_data", eventType), nil, nil, &content)
		if IsNotFound(err) {
			return nil, nil
		}
		return content, err
	}
	core := c.core
	content, err := await(ctx, func() (*string, error) { return core.AccountData(eventType) })
	if err != nil || content == nil {
		return nil, err
	}
	return jsontext.Value(*content), nil
}

func (c *Client) SetAccountData(ctx context.Context, eventType string, content []byte) error {
	if c.core == nil {
		return c.Do(ctx, http.MethodPut, c.ClientURL("v3", "user", c.session.UserID, "account_data", eventType), nil, jsontext.Value(content), nil)
	}
	core := c.core
	_, err := await(ctx, func() (struct{}, error) {
		return struct{}{}, core.SetAccountData(eventType, string(content))
	})
	return err
}

func (c *Client) GetEvent(ctx context.Context, roomID, eventID string) (*event.Event, error) {
	var raw []byte
	if c.core != nil {
		value, err := c.Event(ctx, roomID, eventID)
		if err != nil {
			return nil, err
		}
		raw = value
	} else {
		var value jsontext.Value
		if err := c.Do(ctx, "GET", c.ClientURL("v3", "rooms", roomID, "event", eventID), nil, nil, &value); err != nil {
			return nil, err
		}
		raw = value
	}
	var evt event.Event
	if err := evt.UnmarshalJSON(raw); err != nil {
		return nil, err
	}
	return &evt, nil
}

func newTxnID() string {
	random := make([]byte, 12)
	_, _ = rand.Read(random)
	return "zz-" + hex.EncodeToString(random)
}

type KnownRoom struct {
	RoomID         string
	RoomType       string
	Membership     string
	Creator        string
	JoinedMembers  int
	InvitedMembers int
}

func knownRoom(room rustcore.KnownRoom) KnownRoom {
	return KnownRoom{
		RoomID:         room.RoomId,
		RoomType:       deref(room.RoomType),
		Membership:     room.Membership,
		Creator:        deref(room.Creator),
		JoinedMembers:  int(room.JoinedMembers),
		InvitedMembers: int(room.InvitedMembers),
	}
}

func (c *Client) KnownRooms() []KnownRoom {
	var rooms []rustcore.KnownRoom
	if err := c.CoreCall(func(core *rustcore.Core) error {
		rooms = core.KnownRooms()
		return nil
	}); err != nil {
		return nil
	}
	out := make([]KnownRoom, 0, len(rooms))
	for _, room := range rooms {
		out = append(out, knownRoom(room))
	}
	return out
}

func (c *Client) ForgetDepartedRooms(ctx context.Context, fullWindow map[string]bool) ([]string, error) {
	var dropped []string
	var errs []error
	for _, room := range c.KnownRooms() {
		departed := room.Membership == "left" || room.Membership == "banned"
		unlisted := fullWindow != nil && !fullWindow[room.RoomID] && (room.Membership == "joined" || room.Membership == "invited")
		if !departed && !unlisted {
			continue
		}
		gone, err := c.forgetLocallyIf(ctx, room.RoomID, room.Membership)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		if gone {
			dropped = append(dropped, room.RoomID)
		}
	}
	return dropped, errors.Join(errs...)
}

func (c *Client) forgetLocallyIf(ctx context.Context, roomID, membership string) (bool, error) {
	core, err := c.needCore()
	if err != nil {
		return false, err
	}
	gone, err := await(ctx, func() (bool, error) { return core.ForgetRoomLocallyIf(roomID, membership) })
	if err != nil {
		return false, fmt.Errorf("matrix: drop %s from the core's store: %w", roomID, err)
	}
	return gone, nil
}

func (c *Client) forgetLocally(ctx context.Context, roomID string) error {
	core, err := c.needCore()
	if err != nil {
		return err
	}
	if _, err := await(ctx, func() (struct{}, error) { return struct{}{}, core.ForgetRoomLocally(roomID) }); err != nil {
		return fmt.Errorf("matrix: drop %s from the core's store: %w", roomID, err)
	}
	return nil
}

func (c *Client) RoomsJoinedWith(ctx context.Context, userID string) ([]KnownRoom, error) {
	core, err := c.needCore()
	if err != nil {
		return nil, err
	}
	rooms, err := await(ctx, func() ([]rustcore.KnownRoom, error) { return core.RoomsJoinedWith(userID) })
	if err != nil {
		return nil, err
	}
	out := make([]KnownRoom, 0, len(rooms))
	for _, room := range rooms {
		out = append(out, knownRoom(room))
	}
	return out, nil
}

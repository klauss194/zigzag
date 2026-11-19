package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/matrix"
	matrixid "github.com/klauss/zigzag-go/internal/matrix/id"
	"github.com/klauss/zigzag-go/internal/matrix/syncwire"
	"github.com/klauss/zigzag-go/internal/serversettings"
)

var ErrInviteNotTrusted = errors.New("invite left pending: inviter is not trusted")

const SystemAccountLocalpart = "welcome"

const DefaultSuperOwnerLocalpart = ""

const (
	EnvAcceptAllInvites = "ZIGZAG_ACCEPT_ALL_INVITES"
	EnvSuperOwner       = "ZIGZAG_SUPER_OWNER"
)

type invite struct {
	RoomID string

	Inviter string

	RoomCreator string
}

type autoJoiner struct {
	client *matrix.Client
	self   string
	log    zerolog.Logger

	server     string
	system     string
	superOwner string
	acceptAll  bool

	mu      sync.Mutex
	joining map[string]struct{}
}

func newAutoJoiner(client *matrix.Client, log zerolog.Logger) *autoJoiner {
	j := &autoJoiner{client: client, self: client.UserID(), log: log, joining: map[string]struct{}{}}
	j.server = serversettings.Current().ServerName
	if j.server != "" {
		j.system = "@" + SystemAccountLocalpart + ":" + j.server
		if DefaultSuperOwnerLocalpart != "" {
			j.superOwner = "@" + DefaultSuperOwnerLocalpart + ":" + j.server
		}
	}
	if owner := strings.TrimSpace(os.Getenv(EnvSuperOwner)); matrixid.UserID(owner).Server() != "" {
		j.superOwner = owner
	}
	j.acceptAll = os.Getenv(EnvAcceptAllInvites) == "1"
	return j
}

func (j *autoJoiner) afterBatch(response *syncwire.Response) {
	for roomID, room := range response.Rooms {
		if !room.IsInvite() || !j.strippedMembershipIs(room, "invite") {
			continue
		}
		pending := j.strippedInvite(roomID, room)
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
			defer cancel()
			if err := j.joinInvite(ctx, pending); err != nil {
				if errors.Is(err, ErrInviteNotTrusted) {
					j.log.Info().Str("room_id", pending.RoomID).Str("inviter", pending.Inviter).Msg("invite left pending")
				} else {
					j.log.Warn().Err(err).Str("room_id", pending.RoomID).Msg("auto-join failed")
				}
			}
		}()
	}
}

type strippedEvent struct {
	Type     string  `json:"type"`
	StateKey *string `json:"state_key"`
	Sender   string  `json:"sender"`
	Content  struct {
		Membership string `json:"membership"`
	} `json:"content"`
}

func (j *autoJoiner) strippedMembershipIs(room syncwire.Room, want string) bool {
	for _, raw := range *room.InviteState {
		var evt strippedEvent
		if jsonv2.Unmarshal(raw, &evt) != nil || evt.Type != "m.room.member" || evt.StateKey == nil || *evt.StateKey != j.self {
			continue
		}
		return evt.Content.Membership == want
	}
	return false
}

func (j *autoJoiner) strippedInvite(roomID string, room syncwire.Room) invite {
	pending := invite{RoomID: roomID}
	for _, raw := range *room.InviteState {
		var evt strippedEvent
		if jsonv2.Unmarshal(raw, &evt) != nil || evt.StateKey == nil {
			continue
		}
		switch evt.Type {
		case "m.room.member":
			if *evt.StateKey == j.self {
				pending.Inviter = evt.Sender
			}
		case "m.room.create":
			if *evt.StateKey == "" {
				pending.RoomCreator = evt.Sender
			}
		}
	}
	return pending
}

func (j *autoJoiner) joinInvite(ctx context.Context, pending invite) error {
	if pending.RoomID == "" {
		return errors.New("autojoin: no room id")
	}
	if !j.shouldAutoJoin(ctx, pending) {
		return fmt.Errorf("autojoin %s (inviter %q, room creator %q): %w", pending.RoomID, pending.Inviter, pending.RoomCreator, ErrInviteNotTrusted)
	}
	j.mu.Lock()
	if _, busy := j.joining[pending.RoomID]; busy {
		j.mu.Unlock()
		return nil
	}
	j.joining[pending.RoomID] = struct{}{}
	j.mu.Unlock()
	defer func() {
		j.mu.Lock()
		delete(j.joining, pending.RoomID)
		j.mu.Unlock()
	}()
	if _, err := j.client.JoinRoom(ctx, pending.RoomID, nil); err != nil {
		return fmt.Errorf("autojoin %s: %w", pending.RoomID, err)
	}
	j.log.Info().Str("room_id", pending.RoomID).Str("inviter", pending.Inviter).Msg("invite accepted")
	return nil
}

func (j *autoJoiner) shouldAutoJoin(ctx context.Context, pending invite) bool {
	if pending.RoomID == "" {
		return false
	}
	if j.acceptAll {
		return true
	}
	if pending.Inviter == "" {
		return false
	}
	if j.trustedCreator(pending.Inviter) {
		return true
	}
	if j.trustedCreator(pending.RoomCreator) && j.server != "" && matrixid.UserID(pending.Inviter).Server() == j.server {
		return true
	}
	return j.sharesTrustedRoom(ctx, pending.Inviter)
}

func (j *autoJoiner) trustedCreator(who string) bool {
	return who != "" && (who == j.system || who == j.superOwner)
}

func (j *autoJoiner) sharesTrustedRoom(ctx context.Context, other string) bool {
	shared, err := j.client.RoomsJoinedWith(ctx, other)
	if err != nil {
		return false
	}
	for _, room := range shared {
		if j.trustedCreator(room.Creator) {
			return true
		}
	}
	return false
}

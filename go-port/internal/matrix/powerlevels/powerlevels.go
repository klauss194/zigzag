package powerlevels

import (
	"fmt"
	"math"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
)

const (
	Moderator = 50
)

type Levels struct {
	Users        map[string]int `json:"users"`
	UsersDefault int            `json:"users_default"`
	Kick         *int           `json:"kick"`
	creators     map[string]struct{}
}

func New(createSender string, createContent, powerContent jsontext.Value) (*Levels, error) {
	var create struct {
		RoomVersion        string   `json:"room_version"`
		AdditionalCreators []string `json:"additional_creators"`
	}
	if err := jsonv2.Unmarshal(createContent, &create); err != nil {
		return nil, fmt.Errorf("parse m.room.create: %w", err)
	}
	creators := make(map[string]struct{})
	if privilegedCreators(create.RoomVersion) {
		creators[createSender] = struct{}{}
		for _, creator := range create.AdditionalCreators {
			creators[creator] = struct{}{}
		}
	}
	levels := &Levels{}
	if len(powerContent) > 0 {
		if err := jsonv2.Unmarshal(powerContent, levels); err != nil {
			return nil, fmt.Errorf("parse m.room.power_levels: %w", err)
		}
	}
	levels.creators = creators
	return levels, nil
}

func privilegedCreators(roomVersion string) bool {
	switch roomVersion {
	case "", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11":
		return false
	}
	return true
}

func (l *Levels) IsCreator(userID string) bool {
	_, ok := l.creators[userID]
	return ok
}

func (l *Levels) UserLevel(userID string) int {
	if l.IsCreator(userID) {
		return math.MaxInt
	}
	if level, ok := l.Users[userID]; ok {
		return level
	}
	return l.UsersDefault
}

func (l *Levels) KickLevel() int {
	if l.Kick != nil {
		return *l.Kick
	}
	return Moderator
}

func (l *Levels) CanKickUser(actor, target string) bool {
	if l.IsCreator(target) {
		return false
	}
	actorLevel := l.UserLevel(actor)
	return actorLevel >= l.KickLevel() && actorLevel > l.UserLevel(target)
}

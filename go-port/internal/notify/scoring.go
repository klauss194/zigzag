package notify

import (
	"fmt"
	"strings"

	jsonv2 "github.com/go-json-experiment/json"

	"github.com/klauss/zigzag-go/internal/matrix/event"
	"github.com/klauss/zigzag-go/internal/matrix/id"
	"github.com/klauss/zigzag-go/internal/rustcore"
)

type scorer struct {
	me id.UserID

	displayName string

	ruleset *rustcore.PushRules
}

type pushActions struct {
	Notify    bool
	Highlight bool
	PlaySound bool
}

func newScorer(me id.UserID) (scorer, error) {
	raw := fmt.Sprintf(defaultRulesTemplate, me.String(), localpart(me))

	var check map[string]any
	if err := jsonv2.Unmarshal([]byte(raw), &check); err != nil {
		return scorer{}, fmt.Errorf("baked push rules: %w", err)
	}
	ruleset, err := rustcore.NewPushRules(raw)
	if err != nil {
		return scorer{}, fmt.Errorf("baked push rules: %w", err)
	}
	return scorer{me: me, displayName: localpart(me), ruleset: ruleset}, nil
}

func (s scorer) marksUnread(evt *event.Event) bool {
	if evt.StateKey != nil {
		return false
	}

	if evt.Sender == s.me {
		return false
	}

	if evt.Unsigned.RedactedBecause != nil {
		return false
	}

	switch evt.Type.Type {
	case event.EventEncrypted.Type:

		if relatesTo, ok := evt.Content.GetRaw()["m.relates_to"].(map[string]any); ok {
			if relType, _ := relatesTo["rel_type"].(string); relType == event.RelReplace || relType == event.RelAnnotation {
				return false
			}
		}
		return true

	case event.EventSticker.Type,
		"m.poll.start",
		"m.poll.end",
		"org.matrix.msc3381.poll.start",
		"org.matrix.msc3381.poll.end":
		return true

	case event.EventMessage.Type:

		if relatesTo, ok := evt.Content.GetRaw()["m.relates_to"].(map[string]any); ok {
			if relType, ok := relatesTo["rel_type"].(string); ok && relType == event.RelReplace {
				return false
			}
		}
		return true

	default:

		return false
	}
}

func (s scorer) actions(evt *event.Event, memberCount int) pushActions {
	raw := evt.Raw
	if len(raw) == 0 {
		encoded, err := jsonv2.Marshal(evt)
		if err != nil {
			return pushActions{}
		}
		raw = encoded
	}
	roomID := string(evt.RoomID)
	if roomID == "" {

		roomID = placeholderRoomID
	}
	outcome, err := s.ruleset.Evaluate(string(raw), rustcore.PushRoom{
		RoomId:          roomID,
		MemberCount:     uint64(max(memberCount, 0)),
		UserId:          string(s.me),
		UserDisplayName: s.displayName,
	})
	if err != nil {
		return pushActions{}
	}
	return pushActions{Notify: outcome.Notify, Highlight: outcome.Highlight, PlaySound: outcome.Sound}
}

const placeholderRoomID = "!notify:localhost"

func localpart(user id.UserID) string {
	trimmed := strings.TrimPrefix(user.String(), "@")
	if colon := strings.IndexByte(trimmed, ':'); colon >= 0 {
		return trimmed[:colon]
	}
	return trimmed
}

const defaultRulesTemplate = `{
 "override":[
  {"rule_id":".m.rule.master","default":true,"enabled":false,"conditions":[],"actions":[]},
  {"rule_id":".m.rule.suppress_notices","default":true,"enabled":true,
   "conditions":[{"kind":"event_match","key":"content.msgtype","pattern":"m.notice"}],"actions":[]},
  {"rule_id":".m.rule.invite_for_me","default":true,"enabled":true,
   "conditions":[{"kind":"event_match","key":"type","pattern":"m.room.member"},
                 {"kind":"event_match","key":"content.membership","pattern":"invite"},
                 {"kind":"event_match","key":"state_key","pattern":%[1]q}],
   "actions":["notify",{"set_tweak":"sound","value":"default"}]},
  {"rule_id":".m.rule.member_event","default":true,"enabled":true,
   "conditions":[{"kind":"event_match","key":"type","pattern":"m.room.member"}],"actions":[]},
  {"rule_id":".m.rule.is_user_mention","default":true,"enabled":true,
   "conditions":[{"kind":"event_property_contains","key":"content.m\\.mentions.user_ids","value":%[1]q}],
   "actions":["notify",{"set_tweak":"highlight"},{"set_tweak":"sound","value":"default"}]},
  {"rule_id":".m.rule.contains_display_name","default":true,"enabled":true,
   "conditions":[{"kind":"contains_display_name"}],
   "actions":["notify",{"set_tweak":"highlight"},{"set_tweak":"sound","value":"default"}]},
  {"rule_id":".m.rule.tombstone","default":true,"enabled":true,
   "conditions":[{"kind":"event_match","key":"type","pattern":"m.room.tombstone"},
                 {"kind":"event_match","key":"state_key","pattern":""}],
   "actions":["notify",{"set_tweak":"highlight"}]},
  {"rule_id":".m.rule.reaction","default":true,"enabled":true,
   "conditions":[{"kind":"event_match","key":"type","pattern":"m.reaction"}],"actions":[]}
 ],
 "content":[
  {"rule_id":".m.rule.contains_user_name","default":true,"enabled":true,"pattern":%[2]q,
   "actions":["notify",{"set_tweak":"highlight"},{"set_tweak":"sound","value":"default"}]}
 ],
 "room":[],
 "sender":[],
 "underride":[
  {"rule_id":".m.rule.room_one_to_one","default":true,"enabled":true,
   "conditions":[{"kind":"room_member_count","is":"2"},
                 {"kind":"event_match","key":"type","pattern":"m.room.message"}],
   "actions":["notify",{"set_tweak":"sound","value":"default"}]},
  {"rule_id":".m.rule.encrypted_room_one_to_one","default":true,"enabled":true,
   "conditions":[{"kind":"room_member_count","is":"2"},
                 {"kind":"event_match","key":"type","pattern":"m.room.encrypted"}],
   "actions":["notify",{"set_tweak":"sound","value":"default"}]},
  {"rule_id":".m.rule.message","default":true,"enabled":true,
   "conditions":[{"kind":"event_match","key":"type","pattern":"m.room.message"}],"actions":["notify"]},
  {"rule_id":".m.rule.encrypted","default":true,"enabled":true,
   "conditions":[{"kind":"event_match","key":"type","pattern":"m.room.encrypted"}],"actions":["notify"]}
 ]}`

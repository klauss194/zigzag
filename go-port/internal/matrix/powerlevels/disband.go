package powerlevels

import (
	"errors"
	"fmt"
	"slices"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
)

type DisbandInput struct {
	CreateSender string
	Create       jsontext.Value

	PowerLevels jsontext.Value
	JoinRules   jsontext.Value

	Members map[string]string
}

type Plan struct {
	JoinRule             string
	RequiresJoinRuleLock bool

	ActorIsCreator bool
	ActorJoined    bool

	Kickable          []string
	Blocked           []string
	RemainingCreators []string

	Verdict string
}

func PlanDisband(in DisbandInput, actor string) (Plan, error) {
	if len(in.Create) == 0 {
		return Plan{}, errors.New("room state has no m.room.create event")
	}
	levels, err := New(in.CreateSender, in.Create, in.PowerLevels)
	if err != nil {
		return Plan{}, err
	}

	plan := Plan{
		Kickable:          []string{},
		Blocked:           []string{},
		RemainingCreators: []string{},
	}
	plan.ActorIsCreator = levels.IsCreator(actor)
	if len(in.JoinRules) > 0 {
		var joinRules struct {
			JoinRule string `json:"join_rule"`
		}
		if err := jsonv2.Unmarshal(in.JoinRules, &joinRules); err != nil {
			return Plan{}, fmt.Errorf("parse m.room.join_rules: %w", err)
		}
		plan.JoinRule = joinRules.JoinRule
	}
	plan.RequiresJoinRuleLock = plan.JoinRule != "invite"

	for userID, membership := range in.Members {
		active := membership == "join" || membership == "invite" || membership == "knock"
		if !active {
			continue
		}
		if userID == actor {
			plan.ActorJoined = membership == "join"
			continue
		}
		if levels.IsCreator(userID) {
			plan.RemainingCreators = append(plan.RemainingCreators, userID)
			continue
		}
		if levels.CanKickUser(actor, userID) {
			plan.Kickable = append(plan.Kickable, userID)
		} else {
			plan.Blocked = append(plan.Blocked, userID)
		}
	}
	slices.Sort(plan.Kickable)
	slices.Sort(plan.Blocked)
	slices.Sort(plan.RemainingCreators)

	switch {
	case !plan.ActorIsCreator || !plan.ActorJoined:
		plan.Verdict = "refused"
	case len(plan.Blocked) > 0 || len(plan.RemainingCreators) > 0:
		plan.Verdict = "partial"
	default:
		plan.Verdict = "full"
	}
	return plan, nil
}

func (p Plan) Survivors() []string {
	out := make([]string, 0, len(p.Kickable)+len(p.Blocked)+len(p.RemainingCreators))
	out = append(out, p.Kickable...)
	out = append(out, p.Blocked...)
	out = append(out, p.RemainingCreators...)
	slices.Sort(out)
	return slices.Compact(out)
}

package app

import (
	"context"
	"errors"
	"fmt"
	"time"

	jsonv2 "github.com/go-json-experiment/json"

	"github.com/klauss/zigzag-go/internal/matrix"
	"github.com/klauss/zigzag-go/internal/matrix/powerlevels"
)

const roomLifecycleRequestTimeout = 20 * time.Second

var ErrRoomLifecycleBusy = errors.New("zigzag: a room lifecycle operation is already running")

func (a *App) LeaveRoom(ctx context.Context, roomID string, forget bool) (*LeaveRoomResult, error) {
	if roomID == "" {
		return nil, errors.New("zigzag: leave needs a room id")
	}
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	finish, err := a.beginRoomLifecycle(roomID)
	if err != nil {
		return nil, err
	}
	defer finish()

	result, err := leaveRoomWithClient(ctx, matrixClient, roomID, forget)
	if err != nil {
		a.roomLogger.Err(err).Str("room_id", roomID).Msg("leave failed")
		return result, err
	}
	a.roomLogger.Info().
		Str("room_id", roomID).
		Bool("forgot", result.Forgot).
		Bool("already_left", result.AlreadyLeft).
		Msg("room left")
	a.notifyRoomLeft(roomID)
	a.forgetNotifyRoom(roomID)
	return result, nil
}

func (a *App) PlanDisband(ctx context.Context, roomID string) (*DisbandPlan, error) {
	if roomID == "" {
		return nil, errors.New("zigzag: disband plan needs a room id")
	}
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	plan, err := fetchDisbandPlan(ctx, matrixClient, roomID)
	if err != nil {
		return nil, fmt.Errorf("zigzag: plan disband %s: %w", roomID, err)
	}
	return disbandPlanOf(plan), nil
}

func (a *App) DisbandRoom(ctx context.Context, roomID string, allowPartial bool) (*DisbandResult, error) {
	if roomID == "" {
		return nil, errors.New("zigzag: disband needs a room id")
	}
	matrixClient, err := a.readClient()
	if err != nil {
		return nil, err
	}
	finish, err := a.beginRoomLifecycle(roomID)
	if err != nil {
		return nil, err
	}
	defer finish()

	rid := roomID
	plan, err := fetchDisbandPlan(ctx, matrixClient, rid)
	if err != nil {
		return nil, fmt.Errorf("zigzag: disband %s: %w", roomID, err)
	}
	result := &DisbandResult{
		Outcome:   "incomplete",
		Plan:      disbandPlanOf(plan),
		Kicked:    make([]string, 0, len(plan.Kickable)),
		Survivors: []string{},
		Failures:  []MemberActionFailure{},
	}

	if plan.Verdict == "refused" {
		result.Outcome = "refused"
		return result, nil
	}
	if plan.Verdict == "partial" && !allowPartial {
		result.Outcome = "confirmation-required"
		result.Survivors = plan.Survivors()
		return result, nil
	}

	if plan.RequiresJoinRuleLock {
		requestCtx, cancel := context.WithTimeout(ctx, roomLifecycleRequestTimeout)
		_, lockErr := matrixClient.SendState(
			requestCtx,
			rid,
			"m.room.join_rules",
			"",
			[]byte(`{"join_rule":"invite"}`),
		)
		cancel()
		if lockErr != nil {
			result.Failures = append(result.Failures, MemberActionFailure{
				Step:  "lock",
				Error: lockErr.Error(),
			})
			return result, nil
		}
		result.Locked = true
	}

	for _, userID := range plan.Kickable {
		requestCtx, cancel := context.WithTimeout(ctx, roomLifecycleRequestTimeout)
		kickErr := matrixClient.ChangeMembership(requestCtx, matrix.MembershipKick, rid, userID, "Room disbanded by a creator")
		cancel()
		if kickErr != nil {
			result.Failures = append(result.Failures, MemberActionFailure{
				Step:   "kick",
				UserID: userID,
				Error:  kickErr.Error(),
			})
			continue
		}
		result.Kicked = append(result.Kicked, userID)
	}

	verified, verifyErr := fetchDisbandPlan(ctx, matrixClient, rid)
	if verifyErr != nil {
		result.Failures = append(result.Failures, MemberActionFailure{
			Step:  "verify",
			Error: verifyErr.Error(),
		})
		return result, nil
	}
	result.Survivors = verified.Survivors()
	if len(result.Survivors) > 0 && !allowPartial {
		return result, nil
	}

	if len(verified.Kickable) > 0 {
		return result, nil
	}

	leaveResult, leaveErr := leaveRoomWithClient(ctx, matrixClient, rid, true)
	result.Left = leaveResult.Left
	result.Forgot = leaveResult.Forgot
	result.Warnings = append(result.Warnings, leaveResult.Warnings...)
	if leaveErr != nil {
		result.Failures = append(result.Failures, MemberActionFailure{
			Step:  "leave",
			Error: leaveErr.Error(),
		})
		return result, nil
	}

	if len(result.Survivors) > 0 {
		result.Outcome = "left-partial"
	} else {
		result.Outcome = "disbanded"
	}
	a.notifyRoomLeft(roomID)
	a.forgetNotifyRoom(roomID)
	a.roomLogger.Info().
		Str("room_id", roomID).
		Str("outcome", result.Outcome).
		Int("kicked", len(result.Kicked)).
		Int("survivors", len(result.Survivors)).
		Bool("forgot", result.Forgot).
		Msg("room lifecycle completed")
	return result, nil
}

func (a *App) beginRoomLifecycle(roomID string) (func(), error) {
	a.roomLifecycleMu.Lock()
	if a.roomLifecycleInFlight == nil {
		a.roomLifecycleInFlight = make(map[string]struct{})
	}
	if _, busy := a.roomLifecycleInFlight[roomID]; busy {
		a.roomLifecycleMu.Unlock()
		return nil, fmt.Errorf("%w: %s", ErrRoomLifecycleBusy, roomID)
	}
	a.roomLifecycleInFlight[roomID] = struct{}{}
	a.roomLifecycleMu.Unlock()

	return func() {
		a.roomLifecycleMu.Lock()
		delete(a.roomLifecycleInFlight, roomID)
		a.roomLifecycleMu.Unlock()
	}, nil
}

func leaveRoomWithClient(ctx context.Context, matrixClient *matrix.Client, roomID string, forget bool) (*LeaveRoomResult, error) {
	result := &LeaveRoomResult{}
	requestCtx, cancel := context.WithTimeout(ctx, roomLifecycleRequestTimeout)
	leaveErr := matrixClient.LeaveRoom(requestCtx, roomID, "")
	cancel()
	if leaveErr == nil {
		result.Left = true
	}

	if !forget {
		if leaveErr != nil {
			return result, fmt.Errorf("zigzag: leave %s: %w", roomID, leaveErr)
		}
		return result, nil
	}

	requestCtx, cancel = context.WithTimeout(ctx, roomLifecycleRequestTimeout)
	forgetErr := matrixClient.ForgetRoom(requestCtx, roomID)
	cancel()
	if forgetErr == nil || matrix.IsErrCode(forgetErr, "M_NOT_FOUND") {
		result.Forgot = true
		if leaveErr != nil {

			result.Left = true
			result.AlreadyLeft = true
			result.Warnings = append(result.Warnings, "leave returned an error, but forget confirmed that the account was no longer joined: "+leaveErr.Error())
		}
		return result, nil
	}

	if leaveErr != nil {
		return result, fmt.Errorf("zigzag: leave %s: %w (forget also failed: %v)", roomID, leaveErr, forgetErr)
	}
	result.Warnings = append(result.Warnings, "room was left, but forget failed: "+forgetErr.Error())
	return result, nil
}

func fetchDisbandPlan(ctx context.Context, matrixClient *matrix.Client, roomID string) (powerlevels.Plan, error) {
	requestCtx, cancel := context.WithTimeout(ctx, roomLifecycleRequestTimeout)
	state, err := matrixClient.RoomState(requestCtx, roomID)
	cancel()
	if err != nil {
		return powerlevels.Plan{}, err
	}
	return planDisbandFromState(indexState(state), matrixClient.UserID())
}

type roomState map[string]map[string]matrix.StateEntry

func indexState(events []matrix.StateEntry) roomState {
	state := roomState{}
	for _, evt := range events {
		if evt.StateKey == nil {
			continue
		}
		if state[evt.Type] == nil {
			state[evt.Type] = map[string]matrix.StateEntry{}
		}
		state[evt.Type][*evt.StateKey] = evt
	}
	return state
}

func planDisbandFromState(state roomState, actor string) (powerlevels.Plan, error) {
	members := make(map[string]string, len(state["m.room.member"]))
	for userID, memberEvent := range state["m.room.member"] {
		var membership struct {
			Membership string `json:"membership"`
		}
		if err := jsonv2.Unmarshal(memberEvent.Content, &membership); err != nil {
			return powerlevels.Plan{}, fmt.Errorf("parse membership for %s: %w", userID, err)
		}
		members[userID] = membership.Membership
	}
	createEvent := state["m.room.create"][""]
	return powerlevels.PlanDisband(powerlevels.DisbandInput{
		CreateSender: createEvent.Sender,
		Create:       createEvent.Content,
		PowerLevels:  state["m.room.power_levels"][""].Content,
		JoinRules:    state["m.room.join_rules"][""].Content,
		Members:      members,
	}, actor)
}

func disbandPlanOf(plan powerlevels.Plan) *DisbandPlan {
	return &DisbandPlan{
		Verdict:              plan.Verdict,
		ActorIsCreator:       plan.ActorIsCreator,
		ActorJoined:          plan.ActorJoined,
		JoinRule:             plan.JoinRule,
		RequiresJoinRuleLock: plan.RequiresJoinRuleLock,
		Kickable:             plan.Kickable,
		Blocked:              plan.Blocked,
		RemainingCreators:    plan.RemainingCreators,
	}
}

package app

import (
	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/matrix/syncloop"
	"github.com/klauss/zigzag-go/internal/matrix/syncwire"
)

func (a *App) Emit(name string, data any) {
	a.eventGate.Emit(name, data)
}

func (a *App) EmitDirect(name string, data any) {
	a.eventGate.EmitDirect(name, data)
}

func (a *App) emitRoomsPayload(payload *RoomsPayload, rawByteCount int) {
	a.eventGate.retain(payload)

	outcome := "retained"
	if a.eventGate.Emit(EventRooms, payload) {
		outcome = "delivered"
	}
	a.hydrateLogger.Info().
		Str("from", shortPos(payload.From)).
		Str("to", shortPos(payload.To)).
		Bool("initial", payload.From == "").
		Int("bytes", rawByteCount).
		Int("decrypted", len(payload.Decrypted)).
		Str("outcome", outcome).
		Msg("batch")
}

func (a *App) EmitRooms(rawBatch []byte, decryptedByEventID map[string][]byte, from, to string) {

	payload := &RoomsPayload{
		From:      from,
		To:        to,
		Body:      jsontext.Value(rawBatch),
		Decrypted: make(map[string]jsontext.Value, len(decryptedByEventID)),
	}
	for eventID, plaintextJSON := range decryptedByEventID {
		payload.Decrypted[eventID] = jsontext.Value(plaintextJSON)
	}
	a.emitRoomsPayload(payload, len(rawBatch))

}

func (a *App) EmitNotify(response *syncwire.Response, decryptedByEventID map[string][]byte) {
	graph := a.readGraph()

	a.notify(func(listener Listener) {
		if batches, ok := listener.(BatchListener); ok {
			batches.BatchReceived(response)
		}
	})
	a.roomArrivals.saw(response.Rooms)
	if graph == nil {
		return
	}
	if graph.joiner != nil {
		graph.joiner.afterBatch(response)
	}
	a.foldNotify(graph, response, decryptedByEventID)
}

func (a *App) EmitNet(isReachable bool) {
	verdict := NetDown
	if isReachable {
		verdict = NetUp
	}
	a.Emit(EventNet, verdict)
}

func (a *App) EmitSessionExpired(isSoftExpiry bool) {
	verdict := SessionExpired
	if isSoftExpiry {
		verdict = SessionExpiredSoft
	}
	a.Emit(EventSession, verdict)
}

func (a *App) onSyncState(newState syncloop.State, cause error) {
	if sendResumer := a.readSendResumer(); sendResumer != nil {
		sendResumer.syncState(newState == syncloop.StateRunning)
	}
	payload := &SyncState{State: newState.String()}
	if cause != nil {
		payload.Error = cause.Error()
	}
	a.Emit(EventSyncState, payload)
}

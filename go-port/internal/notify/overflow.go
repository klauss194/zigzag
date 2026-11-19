package notify

import (
	"cmp"
	"fmt"
	"slices"

	"github.com/klauss/zigzag-go/internal/matrix/id"
)

type toastCandidate struct {
	toast Toast
	ts    int64
}

func fitToasts(candidates []toastCandidate) (toasts []Toast, folded, dropped int) {
	if len(candidates) <= maxToastsPerBatch {
		for _, candidate := range candidates {
			toasts = append(toasts, candidate.toast)
		}
		return toasts, 0, 0
	}

	var kept []toastCandidate
	var roomOrder []id.RoomID
	byRoom := map[id.RoomID][]toastCandidate{}
	for _, candidate := range candidates {
		if candidate.toast.Highlight {
			kept = append(kept, candidate)
			continue
		}
		roomID := candidate.toast.RoomID
		if _, seen := byRoom[roomID]; !seen {
			roomOrder = append(roomOrder, roomID)
		}
		byRoom[roomID] = append(byRoom[roomID], candidate)
	}
	for _, roomID := range roomOrder {
		group := byRoom[roomID]
		if len(group) == 1 {
			kept = append(kept, group[0])
			continue
		}
		kept = append(kept, summaryToast(group))
		folded += len(group)
	}

	if len(kept) > maxToastsPerBatch {
		slices.SortStableFunc(kept, func(a, b toastCandidate) int {
			if a.toast.Highlight != b.toast.Highlight {
				if a.toast.Highlight {
					return -1
				}
				return 1
			}
			return cmp.Compare(b.ts, a.ts)
		})
		dropped = len(kept) - maxToastsPerBatch
		kept = kept[:maxToastsPerBatch]
	}

	slices.SortStableFunc(kept, func(a, b toastCandidate) int { return cmp.Compare(a.ts, b.ts) })
	for _, candidate := range kept {
		toasts = append(toasts, candidate.toast)
	}
	return toasts, folded, dropped
}

func summaryToast(group []toastCandidate) toastCandidate {
	newest := slices.MaxFunc(group, func(a, b toastCandidate) int { return cmp.Compare(a.ts, b.ts) })

	sound := false
	threadRoot := newest.toast.ThreadRootID
	for _, candidate := range group {
		sound = sound || candidate.toast.Sound

		if candidate.toast.ThreadRootID != threadRoot {
			threadRoot = ""
		}
	}

	return toastCandidate{
		toast: Toast{
			RoomID:       newest.toast.RoomID,
			EventID:      newest.toast.EventID,
			RoomName:     newest.toast.RoomName,
			Body:         summaryBody(len(group)),
			ThreadRootID: threadRoot,
			Sound:        sound,
			roomUnread:   newest.toast.roomUnread,
			summary:      true,
		},
		ts: newest.ts,
	}
}

func summaryBody(count int) string { return fmt.Sprintf("%d new messages", count) }

package devicetrust

import "github.com/klauss/zigzag-go/internal/matrix"

const (
	EventSAS = "device:sas"

	EventVerify = "device:verify"
)

const (
	VerifyStatusVerified = "verified"
	VerifyStatusError    = "error"
)

type SASEmoji struct {
	Symbol string `json:"symbol"`
	Name   string `json:"name"`
}

type SASPeer struct {
	DeviceID string `json:"deviceId"`
}

type SASPayload struct {
	TransactionID string     `json:"transactionId"`
	Peer          SASPeer    `json:"peer"`
	Emoji         []SASEmoji `json:"emoji"`
	Decimals      []int      `json:"decimals"`
}

type VerifyPayload struct {
	Status   string `json:"status"`
	DeviceID string `json:"deviceId"`
}

func newSASPayload(transactionID, peer string, emoji []matrix.SASEmoji, decimals []int) SASPayload {
	payload := SASPayload{
		TransactionID: transactionID,
		Peer:          SASPeer{DeviceID: peer},
		Emoji:         make([]SASEmoji, 0, len(emoji)),
		Decimals:      decimals,
	}
	for _, symbol := range emoji {
		payload.Emoji = append(payload.Emoji, SASEmoji{Symbol: symbol.Symbol, Name: symbol.Description})
	}
	return payload
}

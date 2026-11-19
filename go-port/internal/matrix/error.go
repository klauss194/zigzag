package matrix

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net/http"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"

	"github.com/klauss/zigzag-go/internal/rustcore"
)

type Error struct {
	StatusCode int

	ErrCode string

	Message string

	Body []byte

	Transport bool

	Header http.Header

	Cause error
}

func (e *Error) Unwrap() error { return e.Cause }

func (e *Error) Error() string {
	switch {
	case e.Transport:
		return "matrix: transport: " + e.Message
	case e.ErrCode != "":
		return fmt.Sprintf("%s (HTTP %d): %s", e.ErrCode, e.StatusCode, e.Message)
	case e.StatusCode != 0:
		return fmt.Sprintf("HTTP %d: %s", e.StatusCode, e.Message)
	}
	return "matrix: " + e.Message
}

func (e *Error) Answered() bool { return !e.Transport && e.StatusCode != 0 }

func (e *Error) SoftLogout() bool {
	var body struct {
		SoftLogout bool `json:"soft_logout"`
	}
	_ = jsonv2.Unmarshal(e.Body, &body)
	return body.SoftLogout
}

func (e *Error) RetryAfterMs() int64 {
	var body struct {
		RetryAfterMs int64 `json:"retry_after_ms"`
	}
	_ = jsonv2.Unmarshal(e.Body, &body)
	return body.RetryAfterMs
}

func (e *Error) Field(name string, out any) bool {
	var body map[string]jsontext.Value
	if jsonv2.Unmarshal(e.Body, &body) != nil {
		return false
	}
	raw, ok := body[name]
	if !ok {
		return false
	}
	return jsonv2.Unmarshal(raw, out) == nil
}

func AsError(err error) (*Error, bool) {
	var matrixErr *Error
	if errors.As(err, &matrixErr) {
		return matrixErr, true
	}
	return nil, false
}

func IsErrCode(err error, errcode string) bool {
	e, ok := AsError(err)
	return ok && e.ErrCode == errcode
}

func IsStatus(err error, status int) bool {
	e, ok := AsError(err)
	return ok && e.StatusCode == status
}

func IsNotFound(err error) bool {
	return IsErrCode(err, "M_NOT_FOUND") || IsStatus(err, http.StatusNotFound)
}

func IsForbidden(err error) bool {
	return IsErrCode(err, "M_FORBIDDEN") || IsStatus(err, http.StatusForbidden)
}

func IsAuthRejected(err error) bool {
	e, ok := AsError(err)
	if !ok || !e.Answered() {
		return false
	}
	return e.StatusCode == http.StatusUnauthorized || e.ErrCode == "M_UNKNOWN_TOKEN" || e.ErrCode == "M_MISSING_TOKEN"
}

func IsTransient(err error) bool {
	e, ok := AsError(err)
	return ok && e.Answered() && (e.StatusCode == http.StatusTooManyRequests || e.StatusCode >= 500)
}

func IsTLSFailure(err error) bool {
	e, ok := AsError(err)
	if !ok || !e.Transport {
		return false
	}
	var verify *tls.CertificateVerificationError
	var record tls.RecordHeaderError
	var unknownAuthority x509.UnknownAuthorityError
	var hostname x509.HostnameError
	var invalid x509.CertificateInvalidError
	return errors.As(err, &verify) || errors.As(err, &record) || errors.As(err, &unknownAuthority) ||
		errors.As(err, &hostname) || errors.As(err, &invalid)
}

func newAPIError(status int, body []byte) *Error {
	var head struct {
		ErrCode string `json:"errcode"`
		Error   string `json:"error"`
	}
	if jsonv2.Unmarshal(body, &head) != nil {
		body = []byte("{}")
	}
	message := head.Error
	if message == "" {
		message = http.StatusText(status)
	}
	return &Error{StatusCode: status, ErrCode: head.ErrCode, Message: message, Body: body}
}

func FromCore(err error) error {
	if err == nil {
		return nil
	}
	var api *rustcore.CoreErrorApi
	if errors.As(err, &api) {
		return newAPIError(int(api.Status), []byte(api.Body))
	}
	var transport *rustcore.CoreErrorTransport
	if errors.As(err, &transport) {
		return &Error{Transport: true, Message: transport.Message}
	}
	var generic *rustcore.CoreErrorGeneric
	if errors.As(err, &generic) {
		return fmt.Errorf("matrix: %s", generic.Message)
	}
	return err
}

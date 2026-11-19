package devicetrust

import (
	"fmt"
	"net/http"

	"github.com/klauss/zigzag-go/internal/matrix"
)

func passwordAuth(userID, password, session string) map[string]any {
	if password == "" {
		return nil
	}
	return map[string]any{
		"type":     "m.login.password",
		"session":  session,
		"user":     userID,
		"password": password,
	}
}

func uiaError(err error, passwordGiven bool) error {
	if !matrix.IsStatus(err, http.StatusUnauthorized) {
		return err
	}

	if matrix.IsErrCode(err, "M_UNKNOWN_TOKEN") {
		return fmt.Errorf("NotLoggedIn: %w", err)
	}
	if !passwordGiven {
		return ErrPasswordRequired
	}
	return fmt.Errorf("that password was not accepted: %w", err)
}

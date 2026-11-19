package endpointspec

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/klauss/zigzag-go/internal/matrix"
)

type Profile map[string]any

type ProfileRequest struct {
	UserID string
}

var getProfile = Endpoint[ProfileRequest, Profile]{
	Name:   "profile/get",
	Method: http.MethodGet,
	Path: func(req ProfileRequest) []string {
		return []string{"v3", "profile", req.UserID}
	},
}

type ProfileFieldRequest struct {
	UserID string
	Field  string
	Value  any
}

var putProfileField = Endpoint[ProfileFieldRequest, NoContent]{
	Name:   "profile/set-field",
	Method: http.MethodPut,
	Path: func(req ProfileFieldRequest) []string {
		return []string{"v3", "profile", req.UserID, req.Field}
	},
	Body: func(req ProfileFieldRequest) any {
		return map[string]any{req.Field: req.Value}
	},
}

var deleteProfileField = Endpoint[ProfileFieldRequest, NoContent]{
	Name:   "profile/delete-field",
	Method: http.MethodDelete,
	Path: func(req ProfileFieldRequest) []string {
		return []string{"v3", "profile", req.UserID, req.Field}
	},
}

func FetchProfile(ctx context.Context, client *matrix.Client, userID string) (Profile, error) {
	if userID == "" {
		return nil, errors.New("endpointspec: profile read needs a user id")
	}
	profile, err := getProfile.Do(ctx, client, ProfileRequest{UserID: userID})
	if err != nil {
		return nil, err
	}
	if profile == nil || *profile == nil {
		return Profile{}, nil
	}
	return *profile, nil
}

var getProfileField = Endpoint[ProfileFieldRequest, Profile]{
	Name:   "profile/get-field",
	Method: http.MethodGet,
	Path: func(req ProfileFieldRequest) []string {
		return []string{"v3", "profile", req.UserID, req.Field}
	},
}

func FetchProfileField(ctx context.Context, client *matrix.Client, userID, field string) (Profile, error) {
	if userID == "" || field == "" {
		return nil, errors.New("endpointspec: a profile field read needs a user and a field")
	}
	if !ValidProfileFieldName(field) {
		return nil, errInvalidField(field)
	}
	profile, err := getProfileField.Do(ctx, client, ProfileFieldRequest{UserID: userID, Field: field})
	if err != nil {
		return nil, err
	}
	if profile == nil || *profile == nil {
		return Profile{}, nil
	}
	return *profile, nil
}

func SetProfileField(ctx context.Context, client *matrix.Client, field string, value any) error {
	if client == nil {
		return ErrNoClient
	}
	if !ValidProfileFieldName(field) {
		return errInvalidField(field)
	}

	req := ProfileFieldRequest{UserID: client.UserID(), Field: field, Value: value}
	if req.UserID == "" {
		return errors.New("endpointspec: profile write needs a logged-in user")
	}

	endpoint := putProfileField
	if value == nil {
		endpoint = deleteProfileField
	}
	_, err := endpoint.Do(ctx, client, req)
	return err
}

func ValidProfileFieldName(field string) bool {
	if len(field) == 0 || len(field) > 255 {
		return false
	}
	if field[0] < 'a' || field[0] > 'z' {
		return false
	}
	for i := 1; i < len(field); i++ {
		c := field[i]
		switch {
		case c >= 'a' && c <= 'z',
			c >= '0' && c <= '9',
			c == '_', c == '.', c == '-':
		default:
			return false
		}
	}
	return true
}

func errInvalidField(field string) error {
	return fmt.Errorf("endpointspec: %q is not a valid profile field name", field)
}

package media

import (
	"errors"
	"strings"
)

type scheme int

const (
	schemeHomeserver scheme = iota
)

const maxServerNameLength = 255

var (
	ErrBadRef = errors.New("media: malformed content ref")

	ErrRetiredMedia = errors.New("media: this attachment is no longer available (its r2:// storage was retired on 2026-10-05)")
)

type contentRef struct {
	scheme scheme

	raw string

	server string

	mediaID string
}

func parseRef(ref string) (contentRef, error) {
	if strings.HasPrefix(ref, "r2://") {
		return contentRef{}, ErrRetiredMedia
	}
	if rest, ok := strings.CutPrefix(ref, "mxc://"); ok {
		server, mediaID, found := strings.Cut(rest, "/")
		if !found || !validServerName(server) || !validMediaID(mediaID) {
			return contentRef{}, ErrBadRef
		}
		return contentRef{scheme: schemeHomeserver, raw: ref, server: server, mediaID: mediaID}, nil
	}
	return contentRef{}, ErrBadRef
}

func validServerName(server string) bool {
	if server == "" || len(server) > maxServerNameLength {
		return false
	}
	for index := 0; index < len(server); index++ {
		character := server[index]
		switch {
		case isAlphanumeric(character):
		case character == '.', character == '-', character == ':', character == '[', character == ']':
		default:
			return false
		}
	}
	return true
}

func validMediaID(mediaID string) bool {
	if mediaID == "" {
		return false
	}
	for index := 0; index < len(mediaID); index++ {
		character := mediaID[index]
		if !isAlphanumeric(character) && character != '_' && character != '-' {
			return false
		}
	}
	return true
}

func isAlphanumeric(character byte) bool {
	return character >= 'A' && character <= 'Z' ||
		character >= 'a' && character <= 'z' ||
		character >= '0' && character <= '9'
}

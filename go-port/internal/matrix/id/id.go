package id

type RoomID string

type EventID string

type UserID string

func (r RoomID) String() string  { return string(r) }
func (e EventID) String() string { return string(e) }
func (u UserID) String() string  { return string(u) }

func (u UserID) Localpart() string {
	s := string(u)
	if len(s) > 0 && s[0] == '@' {
		s = s[1:]
	}
	for i := 0; i < len(s); i++ {
		if s[i] == ':' {
			return s[:i]
		}
	}
	return s
}

func (u UserID) Server() string {
	s := string(u)
	if len(s) == 0 || s[0] != '@' {
		return ""
	}
	for i := 1; i < len(s); i++ {
		if s[i] == ':' {
			return s[i+1:]
		}
	}
	return ""
}

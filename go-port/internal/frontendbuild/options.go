package frontendbuild

import (
	"fmt"
	"time"
)

type Mode int

const (
	Release Mode = iota

	Dev
)

func (m Mode) String() string {
	switch m {
	case Release:
		return "release"
	case Dev:
		return "dev"
	default:
		return fmt.Sprintf("Mode(%d)", int(m))
	}
}

func ParseMode(s string) (Mode, error) {
	switch s {
	case "release":
		return Release, nil
	case "dev":
		return Dev, nil
	default:
		return 0, fmt.Errorf("frontendbuild: unknown mode %q (release or dev)", s)
	}
}

func (m Mode) MarshalText() ([]byte, error) {
	return []byte(m.String()), nil
}

func (m *Mode) UnmarshalText(text []byte) error {
	mode, err := ParseMode(string(text))
	if err != nil {
		return err
	}
	*m = mode
	return nil
}

type Page struct {
	Name string

	Entry string

	Template string

	Module string
}

var Pages = []Page{
	{Name: "index", Entry: "src/index.js", Template: "src/index.html"},
	{Name: "login", Entry: "src/login.js", Template: "src/login.html"},
	{Name: "debug", Entry: "src/debug/debug.js", Template: "src/debug/debug.html", Module: "debug"},
}

type Options struct {
	Root string

	OutDir string
	Mode   Mode

	Modules []string

	Manifest []string

	Pages []string

	Sources *Sources

	Define map[string]string
}

type Diag struct {
	File    string
	Line    int
	Column  int
	Text    string
	Warning bool
}

func (d Diag) String() string {
	switch {
	case d.File == "":
		return d.Text
	case d.Line == 0:
		return fmt.Sprintf("%s: %s", d.File, d.Text)
	default:
		return fmt.Sprintf("%s:%d:%d: %s", d.File, d.Line, d.Column, d.Text)
	}
}

type Result struct {
	Files map[string][]byte

	Metafiles []string

	Diags []Diag
	Took  time.Duration
}

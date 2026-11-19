package trace

import (
	"slices"
	"strings"

	jsonv2 "github.com/go-json-experiment/json"
	"github.com/go-json-experiment/json/jsontext"
	"github.com/rs/zerolog"
)

const (
	fieldLevel     = "level"
	fieldTime      = "time"
	fieldMessage   = "message"
	fieldArea      = "area"
	fieldComponent = "component"
)

const PinField = "pin"

type Writer struct {
	rec *Recorder
}

func NewWriter(rec *Recorder) Writer {
	if rec == nil {
		rec = Default
	}
	return Writer{rec: rec}
}

func (w Writer) Write(p []byte) (int, error) {
	return w.WriteLevel(zerolog.InfoLevel, p)
}

func (w Writer) WriteLevel(level zerolog.Level, p []byte) (int, error) {
	var fields map[string]jsontext.Value
	if err := jsonv2.Unmarshal(p, &fields); err != nil {
		w.rec.Log(mapLevel(level), "sdk", "%s", Untrusted(strings.TrimRight(string(p), "\n")))
		return len(p), nil
	}

	area := firstString(fields, fieldArea, fieldComponent)
	if area == "" {

		area = "sdk"
	}

	if decode(fields[PinField]) == "true" {
		w.rec.Pin(mapLevel(level), area, "%s", message(fields))
	} else {
		w.rec.Log(mapLevel(level), area, "%s", message(fields))
	}
	return len(p), nil
}

func message(fields map[string]jsontext.Value) string {
	var b strings.Builder
	b.WriteString(Untrusted(decode(fields[fieldMessage])))

	keys := make([]string, 0, len(fields))
	for k := range fields {
		switch k {
		case fieldLevel, fieldTime, fieldMessage, fieldArea, fieldComponent, PinField:
			continue
		}
		keys = append(keys, k)
	}
	slices.Sort(keys)

	for _, k := range keys {
		if b.Len() > 0 {
			b.WriteByte(' ')
		}
		b.WriteString(Untrusted(k))
		b.WriteByte('=')
		b.WriteString(Untrusted(decode(fields[k])))
	}
	return b.String()
}

func decode(raw jsontext.Value) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := jsonv2.Unmarshal(raw, &s); err == nil {
		return s
	}
	return string(raw)
}

func firstString(fields map[string]jsontext.Value, keys ...string) string {
	for _, k := range keys {
		if v := decode(fields[k]); v != "" {
			return v
		}
	}
	return ""
}

func mapLevel(l zerolog.Level) Level {
	switch l {
	case zerolog.TraceLevel, zerolog.DebugLevel:
		return LevelDebug
	case zerolog.WarnLevel:
		return LevelWarn
	case zerolog.ErrorLevel, zerolog.FatalLevel, zerolog.PanicLevel:
		return LevelError
	default:

		return LevelInfo
	}
}

func Root(rec *Recorder) zerolog.Logger {
	return zerolog.New(NewWriter(rec))
}

func Component(root zerolog.Logger, area string) zerolog.Logger {
	return root.With().Str(fieldArea, area).Logger()
}

var processRoot = Root(Default)

func Log(area string) zerolog.Logger { return Component(processRoot, area) }

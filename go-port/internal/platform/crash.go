package platform

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"sort"
	"strings"
	"time"

	"github.com/klauss/zigzag-go/internal/trace"
)

const crashTraceLines = 200

const crashFileTime = "2006-01-02T15-04-05.000000000"

func CrashDir() (string, error) {
	data, err := UserDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(data, "crashes"), nil
}

func WritePanicReport(dir string, at time.Time, survived bool, panicErr error, stack string, recent []trace.Entry) (string, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}

	var report strings.Builder
	fmt.Fprintf(&report, "%s panic at %s\n", AppID, at.Format(time.RFC3339Nano))
	if survived {
		report.WriteString(survivedLine + ": the call from the page failed instead.\n")
	} else {
		report.WriteString("The app closed.\n")
	}
	fmt.Fprintf(&report, "\nerror: %v\n\nstack:\n%s\n", panicErr, stack)

	if len(recent) > crashTraceLines {
		recent = recent[len(recent)-crashTraceLines:]
	}
	fmt.Fprintf(&report, "\nthe last %d trace lines before it:\n", len(recent))
	for _, entry := range recent {
		fmt.Fprintf(&report, "%s %s %s %s\n", entry.Time, entry.Level, entry.Area, entry.Msg)
	}

	path := filepath.Join(dir, "panic-"+at.Format(crashFileTime)+".txt")
	return path, os.WriteFile(path, []byte(report.String()), 0o600)
}

func CaptureRuntimeCrashes(dir string, startedAt time.Time) (func(), error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	sweepEmptyRuntimeReports(dir)

	path := filepath.Join(dir, "runtime-"+startedAt.Format(crashFileTime)+".txt")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, err
	}

	defer file.Close()
	if err := debug.SetCrashOutput(file, debug.CrashOptions{}); err != nil {
		_ = os.Remove(path)
		return nil, err
	}

	return func() {

		_ = debug.SetCrashOutput(nil, debug.CrashOptions{})
		if info, err := os.Stat(path); err == nil && info.Size() == 0 {
			_ = os.Remove(path)
		}
	}, nil
}

const reportedList = "reported.txt"

const survivedLine = "The app kept running"

type CrashReport struct {
	Path string

	What string
}

func UnreportedCrashes(dir string) ([]CrashReport, error) {
	reported := map[string]bool{}
	if data, err := os.ReadFile(filepath.Join(dir, reportedList)); err == nil {
		for name := range strings.SplitSeq(string(data), "\n") {
			if name = strings.TrimSpace(name); name != "" {
				reported[name] = true
			}
		}
	} else if !os.IsNotExist(err) {
		return nil, err
	}

	var found []CrashReport
	var names []string
	for _, pattern := range []string{"runtime-*.txt", "panic-*.txt"} {
		matches, _ := filepath.Glob(filepath.Join(dir, pattern))
		for _, path := range matches {
			name := filepath.Base(path)
			if reported[name] {
				continue
			}
			what, closed := crashHeadline(path, strings.HasPrefix(name, "panic-"))
			if !closed {
				continue
			}
			found = append(found, CrashReport{Path: path, What: what})
			names = append(names, name)
		}
	}
	if len(found) == 0 {
		return nil, nil
	}

	order := func(path string) string {
		base := filepath.Base(path)
		return base[strings.IndexByte(base, '-')+1:]
	}
	sort.Slice(found, func(i, j int) bool { return order(found[i].Path) < order(found[j].Path) })

	list, err := os.OpenFile(filepath.Join(dir, reportedList), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return found, err
	}
	defer list.Close()
	_, err = list.WriteString(strings.Join(names, "\n") + "\n")
	return found, err
}

func crashHeadline(path string, isPanicReport bool) (what string, closed bool) {
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return "", false
	}
	lines := strings.Split(strings.ReplaceAll(string(data), "\r\n", "\n"), "\n")
	if isPanicReport {
		for _, line := range lines {
			if strings.HasPrefix(line, survivedLine) {
				return "", false
			}
			if what, found := strings.CutPrefix(line, "error: "); found {
				return what, true
			}
		}
		return "unknown panic", true
	}
	for _, line := range lines {
		if strings.HasPrefix(line, "panic: ") || strings.HasPrefix(line, "fatal error: ") {
			return line, true
		}
	}
	return strings.TrimSpace(lines[0]), true
}

func sweepEmptyRuntimeReports(dir string) {
	leftovers, _ := filepath.Glob(filepath.Join(dir, "runtime-*.txt"))
	for _, path := range leftovers {
		if info, err := os.Stat(path); err == nil && info.Size() == 0 {
			_ = os.Remove(path)
		}
	}
}

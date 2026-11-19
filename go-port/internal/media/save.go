package media

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"unicode/utf8"
)

const nameMax = 255

const maxCopies = 100

func safeBasename(name string) (string, bool) {
	if cut := strings.LastIndexAny(name, `/\`); cut >= 0 {
		name = name[cut+1:]
	}
	name = strings.Map(func(r rune) rune {
		if isBidiControl(r) {
			return -1
		}
		return r
	}, name)
	name = strings.Trim(name, " \t\r\n")

	if name == "" || name == "." || name == ".." || len(name) > nameMax {
		return "", false
	}
	for index := 0; index < len(name); index++ {
		if name[index] < 0x20 || name[index] == 0x7f {
			return "", false
		}
	}
	if runtime.GOOS == "windows" && !validWindowsName(name) {
		return "", false
	}
	return name, true
}

func isBidiControl(r rune) bool {
	return r == 0x200E || r == 0x200F || r == 0x061C ||
		(r >= 0x202A && r <= 0x202E) || (r >= 0x2066 && r <= 0x2069)
}

func validWindowsName(name string) bool {
	if name == "" || strings.ContainsAny(name, `<>:"|?*/\`) {
		return false
	}
	if last := name[len(name)-1]; last == '.' || last == ' ' {
		return false
	}
	stem, _, _ := strings.Cut(name, ".")
	for _, reserved := range []string{"CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"} {
		if strings.EqualFold(stem, reserved) {
			return false
		}
	}

	if len(stem) > 3 && (strings.EqualFold(stem[:3], "COM") || strings.EqualFold(stem[:3], "LPT")) {
		switch suffix := stem[3:]; suffix {
		case "1", "2", "3", "4", "5", "6", "7", "8", "9", "\u00b9", "\u00b2", "\u00b3":
			return false
		}
	}
	return true
}

func saveUnique(directory, name string, data []byte) (string, error) {
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", fmt.Errorf("media: create the download directory: %w", err)
	}
	for copyNumber := 0; copyNumber < maxCopies; copyNumber++ {
		written := numberedName(name, copyNumber)
		path := filepath.Join(directory, written)
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o666)
		if os.IsExist(err) {
			continue
		}
		if err != nil {
			return "", fmt.Errorf("media: save %s: %w", filepath.Base(path), withoutPath(err))
		}
		_, writeErr := file.Write(data)
		closeErr := file.Close()
		if writeErr != nil || closeErr != nil {

			_ = os.Remove(path)
			return "", fmt.Errorf("media: save %s: %w", filepath.Base(path), withoutPath(firstError(writeErr, closeErr)))
		}
		return publishDownload(path, written)
	}
	return "", fmt.Errorf("media: %q already has %d copies in the download directory", name, maxCopies)
}

func numberedName(name string, copyNumber int) string {
	if copyNumber == 0 {
		return name
	}
	extension := filepath.Ext(name)
	stem := strings.TrimSuffix(name, extension)
	if stem == "" {

		stem, extension = name, ""
	}
	suffix := fmt.Sprintf(" (%d)%s", copyNumber, extension)
	for len(stem)+len(suffix) > nameMax && stem != "" {
		_, lastRuneSize := utf8.DecodeLastRuneInString(stem)
		stem = stem[:len(stem)-lastRuneSize]
	}
	return stem + suffix
}

func firstError(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}

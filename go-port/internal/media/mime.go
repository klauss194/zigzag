package media

import (
	"path/filepath"
	"strings"
)

var mimeTypeByExtension = map[string]string{
	"jpg":  "image/jpeg",
	"jpeg": "image/jpeg",
	"png":  "image/png",
	"gif":  "image/gif",
	"webp": "image/webp",
	"svg":  "image/svg+xml",
	"mp4":  "video/mp4",
	"m4v":  "video/mp4",
	"webm": "video/webm",
	"mkv":  "video/x-matroska",

	"mov":  "video/quicktime",
	"avi":  "video/x-msvideo",
	"3gp":  "video/3gpp",
	"mp3":  "audio/mpeg",
	"ogg":  "audio/ogg",
	"opus": "audio/opus",
	"wav":  "audio/wav",
	"flac": "audio/flac",
	"m4a":  "audio/mp4",
	"pdf":  "application/pdf",
	"txt":  "text/plain",
	"md":   "text/markdown",
	"zip":  "application/zip",
}

func mimeTypeForName(name string) string {
	extension := strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
	if mimeType, ok := mimeTypeByExtension[extension]; ok {
		return mimeType
	}
	return "application/octet-stream"
}

func RenderableContentType(mimeType string) string {
	const generic = "application/octet-stream"

	base, _, _ := strings.Cut(mimeType, ";")
	base = strings.ToLower(strings.TrimSpace(base))
	kind, subtype, ok := strings.Cut(base, "/")
	if !ok || subtype == "" || !isSimpleToken(kind) || !isSimpleToken(subtype) {
		return generic
	}
	switch kind {
	case "image":

		if subtype == "svg+xml" {
			return generic
		}
		return base
	case "video", "audio":
		return base
	}
	if base == "application/pdf" {
		return base
	}
	return generic
}

func uploadContentType(mimeType string) string {
	base, _, _ := strings.Cut(mimeType, ";")
	base = strings.ToLower(strings.TrimSpace(base))
	kind, subtype, ok := strings.Cut(base, "/")
	if !ok || !isSimpleToken(kind) || !isSimpleToken(subtype) {
		return "application/octet-stream"
	}
	return base
}

func isSimpleToken(part string) bool {
	if part == "" {
		return false
	}
	for index := 0; index < len(part); index++ {
		character := part[index]
		switch {
		case isAlphanumeric(character):
		case character == '.', character == '-', character == '+':
		default:
			return false
		}
	}
	return true
}

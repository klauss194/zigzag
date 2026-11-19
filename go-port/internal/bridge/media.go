package bridge

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/klauss/zigzag-go/internal/app"
	"github.com/klauss/zigzag-go/internal/media"
)

type Media struct {
	media *media.Service

	dialogOpen atomic.Bool

	loopback loopback
}

var _ app.Listener = (*media.Service)(nil)

var errDialogOpen = errors.New("zigzag: a file dialog is already open")

func NewMedia(service *media.Service) *Media {
	return &Media{media: service}
}

const MediaRoute = "/media/"

const MediaMarkerHeader = "X-Zigzag-Media"

const (
	refParameter  = "ref"
	typeParameter = "type"
	pickParameter = "pick"
)

func (m *Media) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		http.Error(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if strings.HasSuffix(request.URL.Path, endpointPath) {
		writer.Header().Set(MediaMarkerHeader, "1")
		writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
		writer.Header().Set("Cache-Control", "no-store")
		_, _ = io.WriteString(writer, m.endpoint())
		return
	}

	query := request.URL.Query()
	data, err := m.bytesFor(request.Context(), query)
	if err != nil {
		http.Error(writer, err.Error(), mediaStatus(err))
		return
	}

	header := writer.Header()

	header.Set(MediaMarkerHeader, "1")
	header.Set("Content-Type", media.RenderableContentType(query.Get(typeParameter)))
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", "default-src 'none'; sandbox")

	header.Set("Cache-Control", "private, max-age=31536000, immutable")

	http.ServeContent(writer, request, "", time.Time{}, bytes.NewReader(data))
}

func (m *Media) bytesFor(ctx context.Context, query url.Values) ([]byte, error) {
	if raw := query.Get(pickParameter); raw != "" {
		pickID, err := strconv.ParseUint(raw, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("%w: %q is not a pick id", media.ErrBadRef, raw)
		}
		return m.media.ReadPick(media.PickReadRequest{PickID: pickID})
	}
	ctx, cancel := context.WithTimeout(ctx, media.TransferTimeout)
	defer cancel()
	return m.media.Download(ctx, query.Get(refParameter))
}

func mediaStatus(err error) int {
	switch {
	case errors.Is(err, media.ErrRetiredMedia):

		return http.StatusGone
	case errors.Is(err, media.ErrBadRef):
		return http.StatusBadRequest
	case errors.Is(err, media.ErrPickGone):

		return http.StatusNotFound
	case errors.Is(err, media.ErrNoSession):
		return http.StatusUnauthorized
	case errors.Is(err, media.ErrTooLarge):
		return http.StatusRequestEntityTooLarge
	default:

		return http.StatusBadGateway
	}
}

func (m *Media) UploadLimit(ctx context.Context) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, media.UploadLimitTimeout)
	defer cancel()
	return m.media.UploadLimit(ctx)
}

func (m *Media) Pick() (media.Pick, error) {
	wails := application.Get()
	if wails == nil {
		return media.Pick{}, errNotImplemented
	}
	if !m.dialogOpen.CompareAndSwap(false, true) {
		return media.Pick{}, errDialogOpen
	}
	defer m.dialogOpen.Store(false)

	dialog := wails.Dialog.OpenFile().
		SetTitle("Attach a file").
		CanChooseFiles(true).
		CanChooseDirectories(false)
	if window := wails.Window.Current(); window != nil {
		dialog.AttachToWindow(window)
	}
	path, err := dialog.PromptForSingleSelection()
	if err != nil || path == "" {
		return media.Pick{}, err
	}
	return m.media.StagePick(path)
}

func (m *Media) ReleasePick(pickID uint64) {
	m.media.ReleasePick(pickID)
}

func (m *Media) DroppedFiles() media.DroppedFiles {
	return m.media.TakeDrop()
}

func (m *Media) ServiceStartup(context.Context, application.ServiceOptions) error {
	application.OnNativeFileDrop(m.media.RecordDrop)
	return m.listen()
}

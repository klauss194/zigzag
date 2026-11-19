package bridge

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/klauss/zigzag-go/internal/trace"

	"github.com/klauss/zigzag-go/internal/media"
)

var mediaLog = trace.Log("media")

const mediaKeyParam = "k"

const saveFilenameParam = "filename"

const uploadParam = "upload"

const thumbnailParam = "thumbnail"

const (
	thumbnailWidthHeader    = "X-Zigzag-Thumbnail-Width"
	thumbnailHeightHeader   = "X-Zigzag-Thumbnail-Height"
	thumbnailBlurhashHeader = "X-Zigzag-Blurhash"
)

const thumbnailTimeout = 2 * time.Minute

const endpointPath = "endpoint"

type loopback struct {
	baseURL string
	key     string
}

func (m *Media) listen() error {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("bridge: media loopback listen: %w", err)
	}
	keyBytes := make([]byte, 32)
	if _, err := rand.Read(keyBytes); err != nil {
		_ = listener.Close()
		return fmt.Errorf("bridge: media loopback key: %w", err)
	}
	m.loopback.key = hex.EncodeToString(keyBytes)

	m.loopback.baseURL = fmt.Sprintf("http://%s%sbytes?%s=%s",
		listener.Addr().String(), MediaRoute, mediaKeyParam, m.loopback.key)

	server := &http.Server{Handler: http.HandlerFunc(m.serveLoopback), ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = server.Serve(listener) }()
	mediaLog.Info().Str("address", listener.Addr().String()).Msg("media server listening")
	return nil
}

func (m *Media) endpoint() string {
	return m.loopback.baseURL
}

func (m *Media) serveLoopback(writer http.ResponseWriter, request *http.Request) {
	started := time.Now()

	header := writer.Header()
	header.Add("Vary", "Origin")
	if origin := request.Header.Get("Origin"); origin != "" {
		if isAppOrigin(origin) {
			header.Set("Access-Control-Allow-Origin", origin)
			header.Set("Access-Control-Expose-Headers", MediaMarkerHeader)
		} else {
			mediaLog.Warn().Str("origin", origin).Msg("media request from a foreign origin: no CORS")
		}
	}
	key := request.URL.Query().Get(mediaKeyParam)
	if subtle.ConstantTimeCompare([]byte(key), []byte(m.loopback.key)) != 1 {
		mediaLog.Warn().
			Str("path", request.URL.Path).Bool("key_present", key != "").
			Msg("media request refused: wrong key")
		http.NotFound(writer, request)
		return
	}

	if request.Method == http.MethodPost {

		if origin := request.Header.Get("Origin"); !isAppOrigin(origin) {
			mediaLog.Warn().Str("origin", origin).Msg("media write refused: not the app's page")
			http.Error(writer, "forbidden", http.StatusForbidden)
			return
		}
		if request.URL.Query().Get(uploadParam) != "" {
			m.serveUpload(writer, request)
			return
		}
		if request.URL.Query().Get(thumbnailParam) != "" {
			m.serveThumbnail(writer, request)
			return
		}
		m.serveSave(writer, request)
		return
	}

	counted := &countingWriter{ResponseWriter: writer, status: http.StatusOK}
	m.ServeHTTP(counted, request)
	query := request.URL.Query()
	mediaLog.Debug().
		Str("method", request.Method).
		Str("ref", query.Get(refParameter)).
		Str("pick", query.Get(pickParameter)).
		Str("asked_type", query.Get(typeParameter)).
		Str("served_type", counted.Header().Get("Content-Type")).
		Str("range", request.Header.Get("Range")).
		Int("status", counted.status).
		Int("bytes", counted.written).
		Dur("took", time.Since(started)).
		Msg("media served")
}

func (m *Media) serveSave(writer http.ResponseWriter, request *http.Request) {
	started := time.Now()
	data, err := io.ReadAll(http.MaxBytesReader(writer, request.Body, media.MaxObjectBytes))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			mediaLog.Warn().Int64("limit", tooLarge.Limit).Msg("save refused: attachment too large")
			http.Error(writer, "attachment too large", http.StatusRequestEntityTooLarge)
			return
		}
		mediaLog.Warn().Err(err).Msg("save refused: the body could not be read")
		http.Error(writer, "the attachment could not be read", http.StatusBadRequest)
		return
	}

	path, err := m.media.Save(media.SaveRequest{Data: data, Filename: request.URL.Query().Get(saveFilenameParam)})
	if err != nil {
		mediaLog.Warn().Err(err).Int("bytes", len(data)).Msg("save failed")
		http.Error(writer, err.Error(), http.StatusInternalServerError)
		return
	}

	header := writer.Header()
	header.Set(MediaMarkerHeader, "1")
	header.Set("Content-Type", "text/plain; charset=utf-8")
	header.Set("Cache-Control", "no-store")
	_, _ = io.WriteString(writer, path)
	mediaLog.Info().Int("bytes", len(data)).Dur("took", time.Since(started)).Msg("attachment saved")
}

func (m *Media) serveUpload(writer http.ResponseWriter, request *http.Request) {
	started := time.Now()
	header := writer.Header()
	header.Set(MediaMarkerHeader, "1")
	header.Set("Cache-Control", "no-store")
	size := request.ContentLength
	if size <= 0 {

		writeUploadError(writer, request, http.StatusLengthRequired, "an upload needs its length", 0)
		return
	}

	ctx, cancel := context.WithTimeout(request.Context(), media.UploadTimeout)
	defer cancel()
	uri, err := m.media.Upload(ctx, media.UploadRequest{
		Body:        request.Body,
		Size:        size,
		ContentType: request.URL.Query().Get(typeParameter),
	})
	if err != nil {
		var tooLarge *media.TooLargeError
		if errors.As(err, &tooLarge) {
			mediaLog.Warn().Int64("bytes", size).Int64("limit", tooLarge.Limit).Msg("upload refused: over the homeserver's limit")
			writeUploadError(writer, request, http.StatusRequestEntityTooLarge, err.Error(), tooLarge.Limit)
			return
		}
		mediaLog.Warn().Err(err).Int64("bytes", size).Dur("took", time.Since(started)).Msg("upload failed")
		writeUploadError(writer, request, mediaStatus(err), err.Error(), 0)
		return
	}

	header.Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(map[string]string{"content_uri": uri})
	mediaLog.Info().Int64("bytes", size).Dur("took", time.Since(started)).Msg("attachment uploaded")
}

func (m *Media) serveThumbnail(writer http.ResponseWriter, request *http.Request) {
	started := time.Now()
	header := writer.Header()
	header.Set(MediaMarkerHeader, "1")
	header.Set("Cache-Control", "no-store")
	if header.Get("Access-Control-Allow-Origin") != "" {
		header.Set("Access-Control-Expose-Headers", strings.Join([]string{
			MediaMarkerHeader, thumbnailWidthHeader, thumbnailHeightHeader, thumbnailBlurhashHeader,
		}, ", "))
	}
	if request.ContentLength <= 0 {
		http.Error(writer, "a picture needs its length", http.StatusLengthRequired)
		return
	}

	ctx, cancel := context.WithTimeout(request.Context(), thumbnailTimeout)
	defer cancel()
	thumbnail, err := media.MakeThumbnailFrom(ctx, request.Body, request.ContentLength)
	switch {
	case err == nil && thumbnail == nil:
		mediaLog.Debug().Dur("took", time.Since(started)).Msg("no thumbnail: the picture fits the box")
		writer.WriteHeader(http.StatusNoContent)
		return
	case errors.Is(err, media.ErrImageTooLarge) && request.ContentLength > media.MaxUploadBytes:
		mediaLog.Debug().Msg("no thumbnail: over the input cap")
		writeUploadError(writer, request, http.StatusRequestEntityTooLarge, err.Error(), media.MaxUploadBytes)
		return
	case errors.Is(err, media.ErrNoThumbnail):

		reason := media.ErrNoThumbnail
		var refusal *media.ThumbnailError
		if errors.As(err, &refusal) {
			reason = refusal.Reason
		}
		mediaLog.Debug().Str("reason", reason.Error()).Dur("took", time.Since(started)).Msg("no thumbnail")
		writer.WriteHeader(http.StatusNoContent)
		return
	case errors.Is(err, media.ErrThumbnailBusy), errors.Is(err, context.DeadlineExceeded) && request.Context().Err() == nil:
		mediaLog.Warn().Err(err).Msg("no thumbnail: too many pictures waiting")
		http.Error(writer, err.Error(), http.StatusServiceUnavailable)
		return
	case err != nil:
		if request.Context().Err() != nil {

			mediaLog.Debug().Dur("took", time.Since(started)).Msg("thumbnail cancelled")
			return
		}
		mediaLog.Warn().Err(err).Dur("took", time.Since(started)).Msg("thumbnail failed")
		http.Error(writer, err.Error(), http.StatusBadRequest)
		return
	}

	header.Set("Content-Type", thumbnail.MimeType)
	header.Set(thumbnailWidthHeader, strconv.Itoa(thumbnail.Width))
	header.Set(thumbnailHeightHeader, strconv.Itoa(thumbnail.Height))
	header.Set(thumbnailBlurhashHeader, thumbnail.Blurhash)
	_, _ = writer.Write(thumbnail.Data)
	mediaLog.Info().Int("w", thumbnail.Width).Int("h", thumbnail.Height).Int("bytes", thumbnail.Size).
		Dur("took", time.Since(started)).Msg("thumbnail made")
}

func writeUploadError(writer http.ResponseWriter, request *http.Request, status int, reason string, limit int64) {
	if request.ContentLength > 0 {
		_, _ = io.Copy(io.Discard, io.LimitReader(request.Body, request.ContentLength))
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	answer := map[string]any{"error": reason}
	if limit > 0 {
		answer["limit"] = limit
	}
	_ = json.NewEncoder(writer).Encode(answer)
}

func isAppOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Path != "" || parsed.User != nil {
		return false
	}
	switch parsed.Scheme {
	case "wails":
		return parsed.Hostname() == "localhost"
	case "http", "https":
		return parsed.Hostname() == "wails.localhost"
	}
	return false
}

type countingWriter struct {
	http.ResponseWriter
	status  int
	written int
}

func (c *countingWriter) WriteHeader(status int) {
	c.status = status
	c.ResponseWriter.WriteHeader(status)
}

func (c *countingWriter) Write(data []byte) (int, error) {
	written, err := c.ResponseWriter.Write(data)
	c.written += written
	return written, err
}

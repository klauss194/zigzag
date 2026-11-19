package media

import (
	"context"
	"fmt"
	"io"

	"github.com/klauss/zigzag-go/internal/matrix"
)

type homeserverReader struct {
	client *matrix.Client
}

func newHomeserverReader(client *matrix.Client) *homeserverReader {
	return &homeserverReader{client: client}
}

func (r *homeserverReader) download(ctx context.Context, ref contentRef) ([]byte, error) {
	body, err := r.client.DownloadMedia(ctx, ref.server, ref.mediaID)
	if err != nil {
		return nil, fmt.Errorf("media: download %s: %w", ref.raw, err)
	}
	defer body.Close()
	data, err := readLimited(body, MaxObjectBytes)
	if err != nil {
		return nil, fmt.Errorf("media: download %s: %w", ref.raw, err)
	}
	return data, nil
}

func (r *homeserverReader) upload(ctx context.Context, body io.Reader, size int64, contentType string) (string, error) {
	uri, err := r.client.Upload(ctx, body, size, contentType)
	if err != nil {
		if matrix.ErrTooLarge(err) {
			return "", &TooLargeError{Size: size, refusal: err}
		}
		return "", fmt.Errorf("media: upload: %w", err)
	}
	return uri, nil
}

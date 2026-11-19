package media

import (
	"context"
	"errors"
	"fmt"
	"io"
)

const (
	thumbnailWorkers = 2

	thumbnailQueueLength = 16
)

var ErrThumbnailBusy = errors.New("media: too many pictures waiting for a thumbnail")

type thumbnailQueue struct {
	places  chan struct{}
	workers chan struct{}
}

func newThumbnailQueue(workers, length int) *thumbnailQueue {
	return &thumbnailQueue{places: make(chan struct{}, length), workers: make(chan struct{}, workers)}
}

var defaultThumbnailQueue = newThumbnailQueue(thumbnailWorkers, thumbnailQueueLength)

func MakeThumbnailFrom(ctx context.Context, body io.Reader, size int64) (*Thumbnail, error) {
	return defaultThumbnailQueue.make(ctx, defaultThumbnailLimits, body, size)
}

func (q *thumbnailQueue) make(ctx context.Context, limits thumbnailLimits, body io.Reader, size int64) (*Thumbnail, error) {
	if size <= 0 {
		return nil, &ThumbnailError{Reason: ErrBadImage, Err: errors.New("no bytes")}
	}
	if size > int64(limits.maxBytes) {
		return nil, &ThumbnailError{Reason: ErrImageTooLarge, Err: fmt.Errorf("%d bytes, over %d", size, limits.maxBytes)}
	}
	select {
	case q.places <- struct{}{}:
	default:
		return nil, ErrThumbnailBusy
	}
	defer func() { <-q.places }()
	select {
	case q.workers <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	defer func() { <-q.workers }()

	data := make([]byte, size)
	if _, err := io.ReadFull(body, data); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("media: reading the picture: %w", err)
	}
	return limits.makeThumbnail(ctx, data)
}

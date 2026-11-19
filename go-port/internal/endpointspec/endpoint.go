package endpointspec

import (
	"context"
	"errors"

	"github.com/klauss/zigzag-go/internal/matrix"
)

var ErrNoClient = errors.New("endpointspec: no matrix client")

type NoContent struct{}

type Endpoint[Req any, Resp any] struct {
	Name string

	Method string

	Path func(Req) []string

	Body func(Req) any
}

func (e Endpoint[Req, Resp]) Do(ctx context.Context, client *matrix.Client, req Req) (*Resp, error) {
	if client == nil {
		return nil, ErrNoClient
	}
	if e.Path == nil {
		return nil, errors.New("endpointspec: " + e.Name + ": endpoint has no path")
	}

	endpointURL := client.ClientURL(e.Path(req)...)

	var body any
	if e.Body != nil {
		body = e.Body(req)
	}

	var resp Resp

	var target any = &resp
	if _, skipParsing := target.(*NoContent); skipParsing {
		target = nil
	}

	if err := client.Do(ctx, e.Method, endpointURL, nil, body, target); err != nil {
		return nil, err
	}
	return &resp, nil
}

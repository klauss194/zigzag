package media

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
	"runtime"

	"golang.org/x/sync/semaphore"
)

const (
	ThumbnailMaxWidth  = 800
	ThumbnailMaxHeight = 600
)

const thumbnailJPEGQuality = 80

const (
	maxThumbnailSourcePixels = 120_000_000

	maxThumbnailSourceSide = 1<<16 - 1

	maxThumbnailDecodeBytes = 192 << 20

	thumbnailDecodeBudget = 128 << 20

	thumbnailWorkingBytes = 12 << 20

	maxThumbnailJPEGScans = 100

	thumbnailCollectAbove = 16 << 20
)

var (
	ErrNoThumbnail = errors.New("media: no thumbnail")

	ErrUnsupportedImage = errors.New("media: not a picture this device can shrink")

	ErrImageTooLarge = errors.New("media: picture too large to shrink")

	ErrBadImage = errors.New("media: picture could not be read")
)

type ThumbnailError struct {
	Reason error

	Err error
}

func (e *ThumbnailError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%v: %v", e.Reason, e.Err)
	}
	return e.Reason.Error()
}

func (e *ThumbnailError) Unwrap() []error {
	if e.Err != nil {
		return []error{ErrNoThumbnail, e.Reason, e.Err}
	}
	return []error{ErrNoThumbnail, e.Reason}
}

type Thumbnail struct {
	Data []byte

	MimeType string
	Width    int
	Height   int

	Size int

	Blurhash string
}

var thumbnailDecodes = semaphore.NewWeighted(thumbnailDecodeBudget)

type thumbnailLimits struct {
	box         image.Point
	maxBytes    int
	maxPixels   int
	maxSide     int
	maxDecode   int
	maxJPEGScan int

	decodes *semaphore.Weighted
	budget  int64
}

var defaultThumbnailLimits = thumbnailLimits{
	box: image.Pt(ThumbnailMaxWidth, ThumbnailMaxHeight),

	maxBytes:    int(MaxUploadBytes),
	maxPixels:   maxThumbnailSourcePixels,
	maxSide:     maxThumbnailSourceSide,
	maxDecode:   maxThumbnailDecodeBytes,
	maxJPEGScan: maxThumbnailJPEGScans,
	decodes:     thumbnailDecodes,
	budget:      thumbnailDecodeBudget,
}

func (l thumbnailLimits) makeThumbnail(ctx context.Context, data []byte) (*Thumbnail, error) {
	if len(data) == 0 {
		return nil, &ThumbnailError{Reason: ErrBadImage, Err: errors.New("no bytes")}
	}
	if len(data) > l.maxBytes {
		return nil, &ThumbnailError{Reason: ErrImageTooLarge, Err: fmt.Errorf("%d bytes, over %d", len(data), l.maxBytes)}
	}
	header, err := readPictureHeader(data)
	if err != nil {
		return nil, err
	}
	if err := l.affordable(header); err != nil {
		return nil, err
	}

	seenWidth, seenHeight := header.width, header.height
	if turnsOnItsSide(header.orientation) {
		seenWidth, seenHeight = seenHeight, seenWidth
	}
	width, height, shrink := fitInBox(seenWidth, seenHeight, l.box.X, l.box.Y)
	if !shrink {
		return nil, nil
	}

	small, err := l.decodeAndShrink(ctx, header, data, width, height)
	if err != nil {
		return nil, err
	}
	seen := orient(small, header.orientation)
	thumbnail, err := encodeThumbnail(seen)
	if err != nil {
		return nil, err
	}
	thumbnail.Blurhash = thumbnailBlurhash(seen)
	return thumbnail, nil
}

func (l thumbnailLimits) decodeAndShrink(ctx context.Context, header pictureHeader, data []byte, width, height int) (*image.RGBA, error) {

	cost := int64(header.decodeBytes())
	weight := min(cost+thumbnailWorkingBytes, l.budget)
	if err := l.decodes.Acquire(ctx, weight); err != nil {
		return nil, err
	}
	defer l.decodes.Release(weight)

	picture, err := decodePicture(header, data)
	if err != nil {
		return nil, &ThumbnailError{Reason: ErrBadImage, Err: err}
	}

	if turnsOnItsSide(header.orientation) {
		width, height = height, width
	}
	small := scaleArea(picture, image.Rect(0, 0, header.width, header.height), width, height)
	if cost >= thumbnailCollectAbove {

		runtime.GC()
	}
	return small, nil
}

func (l thumbnailLimits) affordable(header pictureHeader) error {
	tooLarge := func(format string, args ...any) error {
		return &ThumbnailError{Reason: ErrImageTooLarge, Err: fmt.Errorf(format, args...)}
	}
	if header.width <= 0 || header.height <= 0 {
		return &ThumbnailError{Reason: ErrBadImage, Err: fmt.Errorf("%dx%d", header.width, header.height)}
	}

	if header.width > l.maxSide || header.height > l.maxSide {
		return tooLarge("%dx%d, a side over %d", header.width, header.height, l.maxSide)
	}
	pixels := header.width * header.height
	if pixels > l.maxPixels {
		return tooLarge("%dx%d, over %d pixels", header.width, header.height, l.maxPixels)
	}
	if cost := header.decodeBytes(); cost > float64(l.maxDecode) {
		return tooLarge("%dx%d %s would take %.0f MiB to decode, over %d", header.width, header.height,
			header.format, cost/(1<<20), l.maxDecode>>20)
	}
	if header.scans > l.maxJPEGScan {
		return tooLarge("%d scans, over %d", header.scans, l.maxJPEGScan)
	}
	return nil
}

func fitInBox(width, height, boxWidth, boxHeight int) (int, int, bool) {
	if width <= boxWidth && height <= boxHeight {
		return width, height, false
	}

	if width*boxHeight >= height*boxWidth {
		return boxWidth, max(1, (height*boxWidth+width/2)/width), true
	}
	return max(1, (width*boxHeight+height/2)/height), boxHeight, true
}

func decodePicture(header pictureHeader, data []byte) (picture image.Image, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			picture, err = nil, fmt.Errorf("%s decoder: %v", header.format, recovered)
		}
	}()
	return header.decode(bytes.NewReader(data))
}

func scaleArea(source image.Image, canvas image.Rectangle, width, height int) *image.RGBA {
	sourceWidth, sourceHeight := canvas.Dx(), canvas.Dy()
	columns := areaSpans(sourceWidth, width)
	rows := areaSpans(sourceHeight, height)
	covered := canvas.In(source.Bounds())

	row := image.NewRGBA(image.Rect(0, 0, sourceWidth, 1))
	line := make([]float32, width*4)
	sums := make([]float32, width*height*4)
	for y := range sourceHeight {
		if !covered {

			clear(row.Pix)
		}
		draw.Draw(row, row.Rect, source, image.Pt(canvas.Min.X, canvas.Min.Y+y), draw.Src)
		clear(line)
		for x, span := range columns {
			pixel := row.Pix[x*4 : x*4+4 : x*4+4]
			r, g, b, a := float32(pixel[0]), float32(pixel[1]), float32(pixel[2]), float32(pixel[3])
			at := span.first * 4
			line[at] += span.weight * r
			line[at+1] += span.weight * g
			line[at+2] += span.weight * b
			line[at+3] += span.weight * a
			if span.rest > 0 {
				line[at+4] += span.rest * r
				line[at+5] += span.rest * g
				line[at+6] += span.rest * b
				line[at+7] += span.rest * a
			}
		}
		span := rows[y]
		into := sums[span.first*width*4 : (span.first+1)*width*4]
		for i, value := range line {
			into[i] += span.weight * value
		}
		if span.rest > 0 {
			into = sums[(span.first+1)*width*4 : (span.first+2)*width*4]
			for i, value := range line {
				into[i] += span.rest * value
			}
		}
	}

	out := image.NewRGBA(image.Rect(0, 0, width, height))
	for i, value := range sums {
		out.Pix[i] = uint8(min(value+0.5, 255))
	}
	return out
}

type areaSpan struct {
	first        int
	weight, rest float32
}

func areaSpans(n, m int) []areaSpan {
	spans := make([]areaSpan, n)
	for i := range spans {
		start, end := i*m, (i+1)*m
		first := start / n
		boundary := (first + 1) * n
		if end <= boundary {
			spans[i] = areaSpan{first: first, weight: float32(m) / float32(n)}
			continue
		}
		spans[i] = areaSpan{
			first:  first,
			weight: float32(boundary-start) / float32(n),
			rest:   float32(end-boundary) / float32(n),
		}
	}
	return spans
}

func turnsOnItsSide(orientation int) bool {
	return orientation >= 5 && orientation <= 8
}

func orient(stored *image.RGBA, orientation int) *image.RGBA {
	if orientation < 2 || orientation > 8 {
		return stored
	}
	width, height := stored.Rect.Dx(), stored.Rect.Dy()
	seenWidth, seenHeight := width, height
	if turnsOnItsSide(orientation) {
		seenWidth, seenHeight = height, width
	}
	seen := image.NewRGBA(image.Rect(0, 0, seenWidth, seenHeight))
	for y := range seenHeight {
		for x := range seenWidth {
			var fromX, fromY int
			switch orientation {
			case 2:
				fromX, fromY = width-1-x, y
			case 3:
				fromX, fromY = width-1-x, height-1-y
			case 4:
				fromX, fromY = x, height-1-y
			case 5:
				fromX, fromY = y, x
			case 6:
				fromX, fromY = y, height-1-x
			case 7:
				fromX, fromY = width-1-y, height-1-x
			case 8:
				fromX, fromY = width-1-y, x
			}
			to, from := seen.PixOffset(x, y), stored.PixOffset(fromX, fromY)
			copy(seen.Pix[to:to+4], stored.Pix[from:from+4])
		}
	}
	return seen
}

func encodeThumbnail(picture *image.RGBA) (*Thumbnail, error) {
	var out bytes.Buffer
	mimeType := "image/jpeg"
	var err error
	if picture.Opaque() {
		err = jpeg.Encode(&out, picture, &jpeg.Options{Quality: thumbnailJPEGQuality})
	} else {
		mimeType = "image/png"
		err = png.Encode(&out, picture)
	}
	if err != nil {
		return nil, &ThumbnailError{Reason: ErrBadImage, Err: fmt.Errorf("encoding the thumbnail: %w", err)}
	}
	return &Thumbnail{
		Data:     out.Bytes(),
		MimeType: mimeType,
		Width:    picture.Rect.Dx(),
		Height:   picture.Rect.Dy(),
		Size:     out.Len(),
	}, nil
}

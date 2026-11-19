package media

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"

	"golang.org/x/image/riff"
	"golang.org/x/image/vp8"
	"golang.org/x/image/vp8l"
	"golang.org/x/image/webp"
)

type pictureHeader struct {
	format string

	width, height int

	orientation int

	costPerPixel float64

	scans  int
	decode func(io.Reader) (image.Image, error)
}

func (h pictureHeader) decodeBytes() float64 {
	return float64(h.width) * float64(h.height) * h.costPerPixel
}

func readPictureHeader(data []byte) (pictureHeader, error) {
	switch {
	case bytes.HasPrefix(data, []byte{0xFF, 0xD8, 0xFF}):
		return readJPEGHeader(data)
	case bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")):
		return readPNGHeader(data)
	case bytes.HasPrefix(data, []byte("GIF87a")), bytes.HasPrefix(data, []byte("GIF89a")):
		return readGIFHeader(data)
	case len(data) >= 12 && bytes.HasPrefix(data, []byte("RIFF")) && string(data[8:12]) == "WEBP":
		return readWebPHeader(data)
	}

	return pictureHeader{}, &ThumbnailError{Reason: ErrUnsupportedImage}
}

const (
	jpegSOF0 = 0xC0
	jpegSOF1 = 0xC1
	jpegSOF2 = 0xC2
	jpegSOS  = 0xDA
	jpegEOI  = 0xD9
	jpegAPP0 = 0xE0
	jpegAPP1 = 0xE1
	jpegAPPE = 0xEE
)

func readJPEGHeader(data []byte) (pictureHeader, error) {
	config, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil {

		var unsupported jpeg.UnsupportedError
		if errors.As(err, &unsupported) {
			return pictureHeader{}, &ThumbnailError{Reason: ErrUnsupportedImage, Err: err}
		}
		return pictureHeader{}, &ThumbnailError{Reason: ErrBadImage, Err: err}
	}
	header := pictureHeader{
		format:      "jpeg",
		width:       config.Width,
		height:      config.Height,
		orientation: 1,
		decode:      jpeg.Decode,
	}

	var (
		frame          []byte
		progressive    bool
		jfif           bool
		adobeTransform = -1
	)
	walkJPEGSegments(data, func(marker byte, payload []byte) {
		switch marker {
		case jpegSOF0, jpegSOF1, jpegSOF2:
			if frame == nil {
				frame, progressive = payload, marker == jpegSOF2
			}
		case jpegSOS:
			header.scans++
		case jpegAPP0:
			jfif = jfif || bytes.HasPrefix(payload, []byte("JFIF\x00"))
		case jpegAPP1:
			if header.orientation == 1 && bytes.HasPrefix(payload, []byte("Exif\x00\x00")) {
				header.orientation = exifOrientation(payload[6:])
			}
		case jpegAPPE:
			if len(payload) >= 12 && bytes.HasPrefix(payload, []byte("Adobe")) {
				adobeTransform = int(payload[11])
			}
		}
	})

	if len(frame) < 6 || len(frame) < 6+3*int(frame[5]) {
		return pictureHeader{}, &ThumbnailError{Reason: ErrBadImage, Err: errors.New("jpeg: no frame header")}
	}

	components := frame[6 : 6+3*int(frame[5])]
	hmax, vmax := 1, 1
	for i := 0; i < len(components); i += 3 {
		hmax = max(hmax, int(components[i+1]>>4))
		vmax = max(vmax, int(components[i+1]&0x0F))
	}
	samples := 0.0
	for i := 0; i < len(components); i += 3 {
		samples += float64(int(components[i+1]>>4)*int(components[i+1]&0x0F)) / float64(hmax*vmax)
	}
	header.costPerPixel = samples
	if progressive {
		header.costPerPixel += 4 * samples
	}

	componentCount := len(components) / 3
	rgb := componentCount == 3 && !jfif &&
		(adobeTransform == 0 || (components[0] == 'R' && components[3] == 'G' && components[6] == 'B'))
	if componentCount == 4 || rgb {
		header.costPerPixel += 4
	}
	return header, nil
}

func walkJPEGSegments(data []byte, visit func(marker byte, payload []byte)) {
	at := 2
	for at < len(data) {
		next := bytes.IndexByte(data[at:], 0xFF)
		if next < 0 || at+next+1 >= len(data) {
			return
		}
		at += next + 1
		marker := data[at]
		at++
		switch {
		case marker == 0xFF:

			at--
			continue
		case marker == 0x00, marker == 0x01, marker == 0xD8, marker >= 0xD0 && marker <= 0xD7:

			continue
		case marker == jpegEOI:
			return
		}
		if at+2 > len(data) {
			return
		}
		length := int(binary.BigEndian.Uint16(data[at:]))
		if length < 2 || at+length > len(data) {
			return
		}
		visit(marker, data[at+2:at+length])
		at += length
	}
}

func exifOrientation(tiff []byte) int {
	if len(tiff) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	if order.Uint16(tiff[2:]) != 42 {
		return 1
	}
	ifd := int64(order.Uint32(tiff[4:]))
	if ifd+2 > int64(len(tiff)) {
		return 1
	}
	count := int(order.Uint16(tiff[ifd:]))
	for i := range count {
		entry := ifd + 2 + int64(i)*12
		if entry+12 > int64(len(tiff)) {
			return 1
		}
		const orientationTag, typeShort = 0x0112, 3
		if order.Uint16(tiff[entry:]) != orientationTag {
			continue
		}
		if order.Uint16(tiff[entry+2:]) != typeShort || order.Uint32(tiff[entry+4:]) < 1 {
			return 1
		}

		if value := int(order.Uint16(tiff[entry+8:])); value >= 1 && value <= 8 {
			return value
		}
		return 1
	}
	return 1
}

func readPNGHeader(data []byte) (pictureHeader, error) {
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		var unsupported png.UnsupportedError
		if errors.As(err, &unsupported) {
			return pictureHeader{}, &ThumbnailError{Reason: ErrUnsupportedImage, Err: err}
		}
		return pictureHeader{}, &ThumbnailError{Reason: ErrBadImage, Err: err}
	}
	header := pictureHeader{
		format:       "png",
		width:        config.Width,
		height:       config.Height,
		orientation:  1,
		costPerPixel: bytesPerPixel(config.ColorModel),
		decode:       png.Decode,
	}

	const interlaceOffset = 8 + 8 + 12
	if len(data) > interlaceOffset && data[interlaceOffset] == 1 {
		header.costPerPixel *= 2
	}
	return header, nil
}

func bytesPerPixel(model color.Model) float64 {
	if _, paletted := model.(color.Palette); paletted {
		return 1
	}
	switch model {
	case color.GrayModel, color.AlphaModel:
		return 1
	case color.Gray16Model, color.Alpha16Model:
		return 2
	case color.RGBAModel, color.NRGBAModel:
		return 4
	}
	return 8
}

func readGIFHeader(data []byte) (pictureHeader, error) {

	config, err := gif.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return pictureHeader{}, &ThumbnailError{Reason: ErrBadImage, Err: err}
	}
	return pictureHeader{
		format:      "gif",
		width:       config.Width,
		height:      config.Height,
		orientation: 1,

		costPerPixel: 2,
		decode:       gif.Decode,
	}, nil
}

func readWebPHeader(data []byte) (pictureHeader, error) {
	bad := func(err error) (pictureHeader, error) {
		return pictureHeader{}, &ThumbnailError{Reason: ErrBadImage, Err: err}
	}
	formType, chunks, err := riff.NewReader(bytes.NewReader(data))
	if err != nil {
		return bad(err)
	}
	if formType != (riff.FourCC{'W', 'E', 'B', 'P'}) {
		return bad(errors.New("webp: not a WEBP form"))
	}
	header := pictureHeader{format: "webp", orientation: 1, decode: webp.Decode}
	var canvas *image.Point
	for {
		id, length, chunk, err := chunks.Next()
		if err == io.EOF {
			return bad(errors.New("webp: no image chunk"))
		}
		if err != nil {
			return bad(err)
		}
		switch string(id[:]) {
		case "VP8X":
			const animated = 1 << 1
			var fields [10]byte
			if length != 10 {
				return bad(errors.New("webp: a VP8X chunk of the wrong size"))
			}
			if _, err := io.ReadFull(chunk, fields[:]); err != nil {
				return bad(err)
			}
			if fields[0]&animated != 0 {
				return pictureHeader{}, &ThumbnailError{Reason: ErrUnsupportedImage, Err: errors.New("webp: animated")}
			}

			canvas = &image.Point{
				X: (int(fields[4]) | int(fields[5])<<8 | int(fields[6])<<16) + 1,
				Y: (int(fields[7]) | int(fields[8])<<8 | int(fields[9])<<16) + 1,
			}
		case "ANIM", "ANMF":
			return pictureHeader{}, &ThumbnailError{Reason: ErrUnsupportedImage, Err: errors.New("webp: animated")}
		case "VP8 ":
			decoder := vp8.NewDecoder()
			decoder.Init(chunk, int(length))
			frame, err := decoder.DecodeFrameHeader()
			if err != nil {
				return bad(err)
			}

			header.width, header.height, header.costPerPixel = frame.Width, frame.Height, 3
			return checkCanvas(header, canvas)
		case "VP8L":
			config, err := vp8l.DecodeConfig(chunk)
			if err != nil {
				return bad(err)
			}

			header.width, header.height, header.costPerPixel = config.Width, config.Height, 8
			return checkCanvas(header, canvas)
		}
	}
}

func checkCanvas(header pictureHeader, canvas *image.Point) (pictureHeader, error) {
	if canvas != nil && (canvas.X != header.width || canvas.Y != header.height) {
		return pictureHeader{}, &ThumbnailError{Reason: ErrBadImage,
			Err: fmt.Errorf("webp: a %dx%d canvas around a %dx%d frame", canvas.X, canvas.Y, header.width, header.height)}
	}
	return header, nil
}

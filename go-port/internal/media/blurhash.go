package media

import (
	"image"
	"math"
	"strings"
)

const blurhashSide = 32

const blurhashComponents = 4

const base83Digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"

func thumbnailBlurhash(picture *image.RGBA) string {
	width, height := picture.Rect.Dx(), picture.Rect.Dy()
	if width <= 0 || height <= 0 {
		return ""
	}
	cx, cy := blurhashComponents, blurhashComponents-1
	if height > width {
		cx, cy = cy, cx
	}
	small := picture
	if smallWidth, smallHeight, shrink := fitInBox(width, height, blurhashSide, blurhashSide); shrink {
		small = scaleArea(picture, picture.Rect, smallWidth, smallHeight)
	}
	return encodeBlurhash(small, cx, cy)
}

func encodeBlurhash(picture *image.RGBA, cx, cy int) string {
	width, height := picture.Rect.Dx(), picture.Rect.Dy()

	linear := make([][3]float64, width*height)
	for y := range height {
		row := picture.Pix[y*picture.Stride:]
		for x := range width {
			pixel := row[x*4:]
			linear[y*width+x] = [3]float64{toLinear(pixel[0]), toLinear(pixel[1]), toLinear(pixel[2])}
		}
	}

	terms := make([][3]float64, 0, cx*cy)
	columnCosines := make([]float64, width)
	for j := range cy {
		for i := range cx {
			for x := range width {
				columnCosines[x] = math.Cos(math.Pi * float64(i) * float64(x) / float64(width))
			}
			var sum [3]float64
			for y := range height {
				rowCosine := math.Cos(math.Pi * float64(j) * float64(y) / float64(height))
				for x := range width {
					weight := rowCosine * columnCosines[x]
					value := linear[y*width+x]
					sum[0] += weight * value[0]
					sum[1] += weight * value[1]
					sum[2] += weight * value[2]
				}
			}
			scale := 1 / float64(width*height)
			if i != 0 || j != 0 {
				scale *= 2
			}
			terms = append(terms, [3]float64{sum[0] * scale, sum[1] * scale, sum[2] * scale})
		}
	}

	var hash strings.Builder
	writeBase83(&hash, (cx-1)+(cy-1)*9, 1)

	largest := 0.0
	for _, term := range terms[1:] {
		largest = max(largest, math.Abs(term[0]), math.Abs(term[1]), math.Abs(term[2]))
	}
	scale := 1.0
	if len(terms) > 1 {
		step := clampInt(int(math.Floor(largest*166-0.5)), 0, 82)
		scale = float64(step+1) / 166
		writeBase83(&hash, step, 1)
	} else {
		writeBase83(&hash, 0, 1)
	}

	mean := terms[0]
	writeBase83(&hash, toSRGB(mean[0])<<16|toSRGB(mean[1])<<8|toSRGB(mean[2]), 4)
	for _, term := range terms[1:] {
		red, green, blue := quantiseTerm(term[0]/scale), quantiseTerm(term[1]/scale), quantiseTerm(term[2]/scale)
		writeBase83(&hash, red*19*19+green*19+blue, 2)
	}
	return hash.String()
}

func quantiseTerm(value float64) int {
	companded := math.Copysign(math.Sqrt(math.Abs(value)), value)
	return clampInt(int(math.Floor(companded*9+9.5)), 0, 18)
}

func writeBase83(out *strings.Builder, value, digits int) {
	divisor := 1
	for range digits - 1 {
		divisor *= 83
	}
	for range digits {
		out.WriteByte(base83Digits[(value/divisor)%83])
		divisor /= 83
	}
}

func toLinear(channel uint8) float64 {
	value := float64(channel) / 255
	if value <= 0.04045 {
		return value / 12.92
	}
	return math.Pow((value+0.055)/1.055, 2.4)
}

func toSRGB(value float64) int {
	value = math.Max(0, math.Min(1, value))
	if value <= 0.0031308 {
		return int(value*12.92*255 + 0.5)
	}
	return int((1.055*math.Pow(value, 1/2.4)-0.055)*255 + 0.5)
}

func clampInt(value, low, high int) int {
	return max(low, min(high, value))
}

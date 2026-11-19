package frontend

import "embed"

//go:embed all:dist
var Assets embed.FS

//go:embed all:sourcepack
var SourcePack embed.FS

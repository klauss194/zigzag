//go:build android

package rustcore

// #cgo android,arm64 LDFLAGS: -L${SRCDIR}/../../rustcore/lib/aarch64-linux-android -lzigzag_rustcore
// #cgo android,amd64 LDFLAGS: -L${SRCDIR}/../../rustcore/lib/x86_64-linux-android -lzigzag_rustcore
import "C"

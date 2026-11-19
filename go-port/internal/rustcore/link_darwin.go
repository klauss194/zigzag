package rustcore

// #cgo darwin,arm64 LDFLAGS: ${SRCDIR}/../../rustcore/lib/aarch64-apple-darwin/libzigzag_rustcore.a
// #cgo darwin,amd64 LDFLAGS: ${SRCDIR}/../../rustcore/lib/x86_64-apple-darwin/libzigzag_rustcore.a
// #cgo darwin LDFLAGS: -framework Security -framework CoreFoundation -liconv -lc -lm
import "C"

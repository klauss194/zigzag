//go:build linux && !android

package rustcore

// #cgo linux LDFLAGS: ${SRCDIR}/../../rustcore/lib/libzigzag_rustcore.a -lgcc_s -lutil -lrt -lpthread -lm -ldl
import "C"

package rustcore

// #cgo windows,amd64 LDFLAGS: ${SRCDIR}/../../rustcore/lib/x86_64-pc-windows-gnullvm/libzigzag_rustcore.a
// #cgo windows,arm64 LDFLAGS: ${SRCDIR}/../../rustcore/lib/aarch64-pc-windows-gnullvm/libzigzag_rustcore.a
// #cgo windows LDFLAGS: -lbcrypt -ladvapi32 -lkernel32 -lntdll -luserenv -lws2_32 -ldbghelp -lunwind
import "C"

package rustcore

// #include <zigzag_rustcore.h>
import "C"

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"reflect"
	"runtime"
	"runtime/cgo"
	"sync"
	"sync/atomic"
	"unsafe"
)

type GoRustBuffer struct {
	inner C.RustBuffer
}

type RustBufferI interface {
	AsReader() *bytes.Reader
	Free()
	ToGoBytes() []byte
	Data() unsafe.Pointer
	Len() uint64
	Capacity() uint64
}

type ExternalCRustBuffer interface {
	Data() unsafe.Pointer
	Len() uint64
	Capacity() uint64
}

func RustBufferFromC(b C.RustBuffer) ExternalCRustBuffer {
	return GoRustBuffer{
		inner: b,
	}
}

func CFromRustBuffer(b ExternalCRustBuffer) C.RustBuffer {
	return C.RustBuffer{
		capacity: C.uint64_t(b.Capacity()),
		len:      C.uint64_t(b.Len()),
		data:     (*C.uchar)(b.Data()),
	}
}

func RustBufferFromExternal(b ExternalCRustBuffer) GoRustBuffer {
	return GoRustBuffer{
		inner: C.RustBuffer{
			capacity: C.uint64_t(b.Capacity()),
			len:      C.uint64_t(b.Len()),
			data:     (*C.uchar)(b.Data()),
		},
	}
}

func (cb GoRustBuffer) Capacity() uint64 {
	return uint64(cb.inner.capacity)
}

func (cb GoRustBuffer) Len() uint64 {
	return uint64(cb.inner.len)
}

func (cb GoRustBuffer) Data() unsafe.Pointer {
	return unsafe.Pointer(cb.inner.data)
}

func (cb GoRustBuffer) AsReader() *bytes.Reader {
	b := unsafe.Slice((*byte)(cb.inner.data), C.uint64_t(cb.inner.len))
	return bytes.NewReader(b)
}

func (cb GoRustBuffer) Free() {
	rustCall(func(status *C.RustCallStatus) bool {
		C.ffi_zigzag_rustcore_rustbuffer_free(cb.inner, status)
		return false
	})
}

func (cb GoRustBuffer) ToGoBytes() []byte {
	return C.GoBytes(unsafe.Pointer(cb.inner.data), C.int(cb.inner.len))
}

func stringToRustBuffer(str string) C.RustBuffer {
	return bytesToRustBuffer([]byte(str))
}

func bytesToRustBuffer(b []byte) C.RustBuffer {
	if len(b) == 0 {
		return C.RustBuffer{}
	}

	foreign := C.ForeignBytes{
		len:  C.int(len(b)),
		data: (*C.uchar)(unsafe.Pointer(&b[0])),
	}

	return rustCall(func(status *C.RustCallStatus) C.RustBuffer {
		return C.ffi_zigzag_rustcore_rustbuffer_from_bytes(foreign, status)
	})
}

type BufLifter[GoType any] interface {
	Lift(value RustBufferI) GoType
}

type BufLowerer[GoType any] interface {
	Lower(value GoType) C.RustBuffer
}

type BufReader[GoType any] interface {
	Read(reader io.Reader) GoType
}

type BufWriter[GoType any] interface {
	Write(writer io.Writer, value GoType)
}

func LowerIntoRustBuffer[GoType any](bufWriter BufWriter[GoType], value GoType) C.RustBuffer {

	var buffer bytes.Buffer
	bufWriter.Write(&buffer, value)

	bytes, err := io.ReadAll(&buffer)
	if err != nil {
		panic(fmt.Errorf("reading written data: %w", err))
	}
	return bytesToRustBuffer(bytes)
}

func LiftFromRustBuffer[GoType any](bufReader BufReader[GoType], rbuf RustBufferI) GoType {
	defer rbuf.Free()
	reader := rbuf.AsReader()
	item := bufReader.Read(reader)
	if reader.Len() > 0 {

		leftover, _ := io.ReadAll(reader)
		panic(fmt.Errorf("Junk remaining in buffer after lifting: %s", string(leftover)))
	}
	return item
}

func rustCallWithError[E any, U any](converter BufReader[E], callback func(*C.RustCallStatus) U) (U, E) {
	var status C.RustCallStatus
	returnValue := callback(&status)
	err := checkCallStatus(converter, status)
	return returnValue, err
}

func checkCallStatus[E any](converter BufReader[E], status C.RustCallStatus) E {
	switch status.code {
	case 0:
		var zero E
		return zero
	case 1:
		return LiftFromRustBuffer(converter, GoRustBuffer{inner: status.errorBuf})
	case 2:

		if status.errorBuf.len > 0 {
			panic(fmt.Errorf("%s", FfiConverterStringINSTANCE.Lift(GoRustBuffer{inner: status.errorBuf})))
		} else {
			panic(fmt.Errorf("Rust panicked while handling Rust panic"))
		}
	default:
		panic(fmt.Errorf("unknown status code: %d", status.code))
	}
}

func checkCallStatusUnknown(status C.RustCallStatus) error {
	switch status.code {
	case 0:
		return nil
	case 1:
		panic(fmt.Errorf("function not returning an error returned an error"))
	case 2:

		if status.errorBuf.len > 0 {
			panic(fmt.Errorf("%s", FfiConverterStringINSTANCE.Lift(GoRustBuffer{
				inner: status.errorBuf,
			})))
		} else {
			panic(fmt.Errorf("Rust panicked while handling Rust panic"))
		}
	default:
		return fmt.Errorf("unknown status code: %d", status.code)
	}
}

func rustCall[U any](callback func(*C.RustCallStatus) U) U {
	returnValue, err := rustCallWithError[error](nil, callback)
	if err != nil {
		panic(err)
	}
	return returnValue
}

type NativeError interface {
	AsError() error
}

func writeInt8(writer io.Writer, value int8) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func writeUint8(writer io.Writer, value uint8) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func writeInt16(writer io.Writer, value int16) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func writeUint16(writer io.Writer, value uint16) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func writeInt32(writer io.Writer, value int32) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func writeUint32(writer io.Writer, value uint32) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func writeInt64(writer io.Writer, value int64) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func writeUint64(writer io.Writer, value uint64) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func writeFloat32(writer io.Writer, value float32) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func writeFloat64(writer io.Writer, value float64) {
	if err := binary.Write(writer, binary.BigEndian, value); err != nil {
		panic(err)
	}
}

func readInt8(reader io.Reader) int8 {
	var result int8
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func readUint8(reader io.Reader) uint8 {
	var result uint8
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func readInt16(reader io.Reader) int16 {
	var result int16
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func readUint16(reader io.Reader) uint16 {
	var result uint16
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func readInt32(reader io.Reader) int32 {
	var result int32
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func readUint32(reader io.Reader) uint32 {
	var result uint32
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func readInt64(reader io.Reader) int64 {
	var result int64
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func readUint64(reader io.Reader) uint64 {
	var result uint64
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func readFloat32(reader io.Reader) float32 {
	var result float32
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func readFloat64(reader io.Reader) float64 {
	var result float64
	if err := binary.Read(reader, binary.BigEndian, &result); err != nil {
		panic(err)
	}
	return result
}

func init() {

	FfiConverterCallbackInterfaceSendQueueListenerINSTANCE.register()
	FfiConverterCallbackInterfaceSyncListenerINSTANCE.register()
	FfiConverterCallbackInterfaceVerificationListenerINSTANCE.register()
	uniffiCheckChecksums()
}

func uniffiCheckChecksums() {

	bindingsContractVersion := 30

	scaffoldingContractVersion := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint32_t {
		return C.ffi_zigzag_rustcore_uniffi_contract_version()
	})
	if bindingsContractVersion != int(scaffoldingContractVersion) {

		panic("zigzag_rustcore: UniFFI contract version mismatch")
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_func_core_sqlite_version()
		})
		if checksum != 18443 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_func_core_sqlite_version: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_func_core_version()
		})
		if checksum != 63210 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_func_core_version: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_func_enable_tracing()
		})
		if checksum != 6030 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_func_enable_tracing: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_func_login_password()
		})
		if checksum != 28588 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_func_login_password: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_func_register_with_token()
		})
		if checksum != 46423 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_func_register_with_token: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_func_restore_session()
		})
		if checksum != 13616 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_func_restore_session: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_func_ffi_selftest_send_queue_payloads()
		})
		if checksum != 46136 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_func_ffi_selftest_send_queue_payloads: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_func_ffi_selftest_verification()
		})
		if checksum != 16610 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_func_ffi_selftest_verification: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_logout()
		})
		if checksum != 29153 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_logout: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_release()
		})
		if checksum != 64722 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_release: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_session()
		})
		if checksum != 15333 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_session: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_account_data()
		})
		if checksum != 49260 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_account_data: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_ban()
		})
		if checksum != 14264 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_ban: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_create_room()
		})
		if checksum != 16979 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_create_room: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_download_media()
		})
		if checksum != 62772 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_download_media: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_event()
		})
		if checksum != 56635 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_event: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_forget_room_locally()
		})
		if checksum != 55328 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_forget_room_locally: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_forget_room_locally_if()
		})
		if checksum != 23650 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_forget_room_locally_if: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_get_presence()
		})
		if checksum != 44812 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_get_presence: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_invite()
		})
		if checksum != 21499 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_invite: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_join_room()
		})
		if checksum != 5781 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_join_room: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_kick()
		})
		if checksum != 32279 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_kick: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_known_rooms()
		})
		if checksum != 14556 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_known_rooms: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_messages()
		})
		if checksum != 27292 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_messages: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_redact()
		})
		if checksum != 47815 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_redact: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_relations()
		})
		if checksum != 27034 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_relations: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_rooms_joined_with()
		})
		if checksum != 39689 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_rooms_joined_with: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_attachment()
		})
		if checksum != 3975 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_attachment: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_event()
		})
		if checksum != 19430 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_event: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_receipt()
		})
		if checksum != 43428 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_receipt: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_state()
		})
		if checksum != 9868 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_state: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_set_account_data()
		})
		if checksum != 3883 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_set_account_data: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_set_presence()
		})
		if checksum != 54996 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_set_presence: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_set_read_markers()
		})
		if checksum != 62071 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_set_read_markers: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_threads()
		})
		if checksum != 47676 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_threads: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_typing_notice()
		})
		if checksum != 4922 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_typing_notice: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_unban()
		})
		if checksum != 47230 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_unban: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_abort()
		})
		if checksum != 42765 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_abort: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_edit()
		})
		if checksum != 49485 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_edit: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_is_enabled()
		})
		if checksum != 51653 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_is_enabled: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_listen()
		})
		if checksum != 41848 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_listen: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_pending()
		})
		if checksum != 58117 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_pending: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_report_upload_progress()
		})
		if checksum != 4396 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_report_upload_progress: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_respawn()
		})
		if checksum != 16081 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_respawn: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_room_is_enabled()
		})
		if checksum != 49785 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_room_is_enabled: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_room_set_enabled()
		})
		if checksum != 16968 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_room_set_enabled: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_send()
		})
		if checksum != 38046 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_send: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_send_attachment()
		})
		if checksum != 60599 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_send_attachment: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_set_enabled()
		})
		if checksum != 8985 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_set_enabled: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_send_queue_unwedge()
		})
		if checksum != 10889 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_send_queue_unwedge: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_sync_configure()
		})
		if checksum != 36220 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_sync_configure: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_sync_has_position()
		})
		if checksum != 55003 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_sync_has_position: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_sync_position()
		})
		if checksum != 9602 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_sync_position: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_sync_probe()
		})
		if checksum != 30781 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_sync_probe: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_sync_reset_position()
		})
		if checksum != 54904 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_sync_reset_position: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_sync_run()
		})
		if checksum != 33106 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_sync_run: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_sync_stop()
		})
		if checksum != 19481 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_sync_stop: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_sync_subscribe_rooms()
		})
		if checksum != 34090 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_sync_subscribe_rooms: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_trust_export_keys()
		})
		if checksum != 49085 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_trust_export_keys: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_trust_import_keys()
		})
		if checksum != 39197 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_trust_import_keys: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_trust_own()
		})
		if checksum != 25188 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_trust_own: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_trust_publish_keys()
		})
		if checksum != 7679 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_trust_publish_keys: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_trust_sign_own_device()
		})
		if checksum != 57322 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_trust_sign_own_device: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_verification_accept()
		})
		if checksum != 18168 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_verification_accept: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_verification_cancel()
		})
		if checksum != 35467 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_verification_cancel: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_verification_confirm()
		})
		if checksum != 61439 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_verification_confirm: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_verification_listen()
		})
		if checksum != 58117 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_verification_listen: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_verification_request()
		})
		if checksum != 35215 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_verification_request: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_core_verification_start_sas()
		})
		if checksum != 30849 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_core_verification_start_sas: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_release_wait()
		})
		if checksum != 42027 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_release_wait: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_pushrules_evaluate()
		})
		if checksum != 7088 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_pushrules_evaluate: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_constructor_pushrules_new()
		})
		if checksum != 57523 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_constructor_pushrules_new: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_sendqueuelistener_on_update()
		})
		if checksum != 4116 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_sendqueuelistener_on_update: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_synclistener_on_batch()
		})
		if checksum != 61700 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_synclistener_on_batch: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_request()
		})
		if checksum != 62205 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_request: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_ready()
		})
		if checksum != 54207 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_ready: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_sas()
		})
		if checksum != 62101 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_sas: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_done()
		})
		if checksum != 18604 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_done: UniFFI API checksum mismatch")
		}
	}
	{
		checksum := rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint16_t {
			return C.uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_cancelled()
		})
		if checksum != 2644 {

			panic("zigzag_rustcore: uniffi_zigzag_rustcore_checksum_method_verificationlistener_on_cancelled: UniFFI API checksum mismatch")
		}
	}
}

type FfiConverterUint16 struct{}

var FfiConverterUint16INSTANCE = FfiConverterUint16{}

func (FfiConverterUint16) Lower(value uint16) C.uint16_t {
	return C.uint16_t(value)
}

func (FfiConverterUint16) Write(writer io.Writer, value uint16) {
	writeUint16(writer, value)
}

func (FfiConverterUint16) Lift(value C.uint16_t) uint16 {
	return uint16(value)
}

func (FfiConverterUint16) Read(reader io.Reader) uint16 {
	return readUint16(reader)
}

type FfiDestroyerUint16 struct{}

func (FfiDestroyerUint16) Destroy(_ uint16) {}

type FfiConverterUint32 struct{}

var FfiConverterUint32INSTANCE = FfiConverterUint32{}

func (FfiConverterUint32) Lower(value uint32) C.uint32_t {
	return C.uint32_t(value)
}

func (FfiConverterUint32) Write(writer io.Writer, value uint32) {
	writeUint32(writer, value)
}

func (FfiConverterUint32) Lift(value C.uint32_t) uint32 {
	return uint32(value)
}

func (FfiConverterUint32) Read(reader io.Reader) uint32 {
	return readUint32(reader)
}

type FfiDestroyerUint32 struct{}

func (FfiDestroyerUint32) Destroy(_ uint32) {}

type FfiConverterUint64 struct{}

var FfiConverterUint64INSTANCE = FfiConverterUint64{}

func (FfiConverterUint64) Lower(value uint64) C.uint64_t {
	return C.uint64_t(value)
}

func (FfiConverterUint64) Write(writer io.Writer, value uint64) {
	writeUint64(writer, value)
}

func (FfiConverterUint64) Lift(value C.uint64_t) uint64 {
	return uint64(value)
}

func (FfiConverterUint64) Read(reader io.Reader) uint64 {
	return readUint64(reader)
}

type FfiDestroyerUint64 struct{}

func (FfiDestroyerUint64) Destroy(_ uint64) {}

type FfiConverterBool struct{}

var FfiConverterBoolINSTANCE = FfiConverterBool{}

func (FfiConverterBool) Lower(value bool) C.int8_t {
	if value {
		return C.int8_t(1)
	}
	return C.int8_t(0)
}

func (FfiConverterBool) Write(writer io.Writer, value bool) {
	if value {
		writeInt8(writer, 1)
	} else {
		writeInt8(writer, 0)
	}
}

func (FfiConverterBool) Lift(value C.int8_t) bool {
	return value != 0
}

func (FfiConverterBool) Read(reader io.Reader) bool {
	return readInt8(reader) != 0
}

type FfiDestroyerBool struct{}

func (FfiDestroyerBool) Destroy(_ bool) {}

type FfiConverterString struct{}

var FfiConverterStringINSTANCE = FfiConverterString{}

func (FfiConverterString) Lift(rb RustBufferI) string {
	defer rb.Free()
	reader := rb.AsReader()
	b, err := io.ReadAll(reader)
	if err != nil {
		panic(fmt.Errorf("reading reader: %w", err))
	}
	return string(b)
}

func (FfiConverterString) Read(reader io.Reader) string {
	length := readInt32(reader)
	buffer := make([]byte, length)
	read_length, err := reader.Read(buffer)
	if err != nil && err != io.EOF {
		panic(err)
	}
	if read_length != int(length) {
		panic(fmt.Errorf("bad read length when reading string, expected %d, read %d", length, read_length))
	}
	return string(buffer)
}

func (FfiConverterString) Lower(value string) C.RustBuffer {
	return stringToRustBuffer(value)
}

func (c FfiConverterString) LowerExternal(value string) ExternalCRustBuffer {
	return RustBufferFromC(stringToRustBuffer(value))
}

func (FfiConverterString) Write(writer io.Writer, value string) {
	if len(value) > math.MaxInt32 {
		panic("String is too large to fit into Int32")
	}

	writeInt32(writer, int32(len(value)))
	write_length, err := io.WriteString(writer, value)
	if err != nil {
		panic(err)
	}
	if write_length != len(value) {
		panic(fmt.Errorf("bad write length when writing string, expected %d, written %d", len(value), write_length))
	}
}

type FfiDestroyerString struct{}

func (FfiDestroyerString) Destroy(_ string) {}

type FfiConverterBytes struct{}

var FfiConverterBytesINSTANCE = FfiConverterBytes{}

func (c FfiConverterBytes) Lower(value []byte) C.RustBuffer {
	return LowerIntoRustBuffer[[]byte](c, value)
}

func (c FfiConverterBytes) LowerExternal(value []byte) ExternalCRustBuffer {
	return RustBufferFromC(c.Lower(value))
}

func (c FfiConverterBytes) Write(writer io.Writer, value []byte) {
	if len(value) > math.MaxInt32 {
		panic("[]byte is too large to fit into Int32")
	}

	writeInt32(writer, int32(len(value)))
	write_length, err := writer.Write(value)
	if err != nil {
		panic(err)
	}
	if write_length != len(value) {
		panic(fmt.Errorf("bad write length when writing []byte, expected %d, written %d", len(value), write_length))
	}
}

func (c FfiConverterBytes) Lift(rb RustBufferI) []byte {
	return LiftFromRustBuffer[[]byte](c, rb)
}

func (c FfiConverterBytes) Read(reader io.Reader) []byte {
	length := readInt32(reader)
	buffer := make([]byte, length)
	read_length, err := reader.Read(buffer)
	if err != nil && err != io.EOF {
		panic(err)
	}
	if read_length != int(length) {
		panic(fmt.Errorf("bad read length when reading []byte, expected %d, read %d", length, read_length))
	}
	return buffer
}

type FfiDestroyerBytes struct{}

func (FfiDestroyerBytes) Destroy(_ []byte) {}

type FfiObject struct {
	handle        C.uint64_t
	callCounter   atomic.Int64
	cloneFunction func(C.uint64_t, *C.RustCallStatus) C.uint64_t
	freeFunction  func(C.uint64_t, *C.RustCallStatus)
	destroyed     atomic.Bool
}

func newFfiObject(
	handle C.uint64_t,
	cloneFunction func(C.uint64_t, *C.RustCallStatus) C.uint64_t,
	freeFunction func(C.uint64_t, *C.RustCallStatus),
) FfiObject {
	return FfiObject{
		handle:        handle,
		cloneFunction: cloneFunction,
		freeFunction:  freeFunction,
	}
}

func (ffiObject *FfiObject) incrementPointer(debugName string) C.uint64_t {
	for {
		counter := ffiObject.callCounter.Load()
		if counter <= -1 {
			panic(fmt.Errorf("%v object has already been destroyed", debugName))
		}
		if counter == math.MaxInt64 {
			panic(fmt.Errorf("%v object call counter would overflow", debugName))
		}
		if ffiObject.callCounter.CompareAndSwap(counter, counter+1) {
			break
		}
	}

	return rustCall(func(status *C.RustCallStatus) C.uint64_t {
		return ffiObject.cloneFunction(ffiObject.handle, status)
	})
}

func (ffiObject *FfiObject) decrementPointer() {
	if ffiObject.callCounter.Add(-1) == -1 {
		ffiObject.freeRustArcPtr()
	}
}

func (ffiObject *FfiObject) destroy() {
	if ffiObject.destroyed.CompareAndSwap(false, true) {
		if ffiObject.callCounter.Add(-1) == -1 {
			ffiObject.freeRustArcPtr()
		}
	}
}

func (ffiObject *FfiObject) freeRustArcPtr() {
	if ffiObject.handle == 0 {
		return
	}
	rustCall(func(status *C.RustCallStatus) int32 {
		ffiObject.freeFunction(ffiObject.handle, status)
		return 0
	})
}

type CoreInterface interface {
	Logout() error
	Release() *Release
	Session() *SessionData
	AccountData(eventType string) (*string, error)
	Ban(roomId string, userId string, reason *string) error
	CreateRoom(bodyJson string) (string, error)
	DownloadMedia(sourceJson string) ([]byte, error)
	Event(roomId string, eventId string) (string, error)
	ForgetRoomLocally(roomId string) error
	ForgetRoomLocallyIf(roomId string, membership string) (bool, error)
	GetPresence(userId string) (string, error)
	Invite(roomId string, userId string, reason *string) error
	JoinRoom(idOrAlias string, via []string) (string, error)
	Kick(roomId string, userId string, reason *string) error
	KnownRooms() []KnownRoom
	Messages(roomId string, from *string, limitEvents uint32, backward bool) (EventPage, error)
	Redact(roomId string, eventId string, reason *string, txnId *string) (string, error)
	Relations(roomId string, eventId string, relType *string, eventType *string, recurse bool, backward bool, from *string, limitEvents uint32) (EventPage, error)
	RoomsJoinedWith(userId string) ([]KnownRoom, error)
	SendAttachment(roomId string, filename string, mimeType string, data []byte, caption *string, imageSize *AttachmentSize, thumbnail *AttachmentThumbnail) (string, error)
	SendEvent(roomId string, eventType string, contentJson string, txnId *string) (string, error)
	SendReceipt(roomId string, receiptType string, thread *string, eventId string) error
	SendState(roomId string, eventType string, stateKey string, contentJson string) (string, error)
	SetAccountData(eventType string, contentJson string) error
	SetPresence(state string, statusMsg *string) error
	SetReadMarkers(roomId string, fullyRead *string, read *string, readPrivate *string) error
	Threads(roomId string, participatedOnly bool, from *string, limitRoots uint32) (EventPage, error)
	TypingNotice(roomId string, typing bool) error
	Unban(roomId string, userId string, reason *string) error
	SendQueueAbort(roomId string, transactionId string) (bool, error)
	SendQueueEdit(roomId string, transactionId string, eventType string, contentJson string) (bool, error)
	SendQueueIsEnabled() bool
	SendQueueListen(listener SendQueueListener)
	SendQueuePending(roomId *string) (string, error)
	SendQueueReportUploadProgress(enabled bool)
	SendQueueRespawn()
	SendQueueRoomIsEnabled(roomId string) (bool, error)
	SendQueueRoomSetEnabled(roomId string, enabled bool) error
	SendQueueSend(roomId string, eventType string, contentJson string) (string, error)
	SendQueueSendAttachment(roomId string, filename string, mimeType string, data []byte, caption *string, imageSize *AttachmentSize, thumbnail *AttachmentThumbnail) (string, error)
	SendQueueSetEnabled(enabled bool)
	SendQueueUnwedge(roomId string, transactionId string) error
	SyncConfigure(config SyncConfig) (*string, error)
	SyncHasPosition() bool
	SyncPosition() *string
	SyncProbe(timeoutMs uint64) error
	SyncResetPosition()
	SyncRun(listener SyncListener) error
	SyncStop()
	SyncSubscribeRooms(roomIds []string, requiredState []StatePair, timelineLimit uint32, cancelInFlight bool) error
	TrustExportKeys() (*CrossSigningKeys, error)
	TrustImportKeys(keys CrossSigningKeys) (KeyImport, error)
	TrustOwn(refresh bool) (OwnTrust, error)
	TrustPublishKeys(password *string, reset bool) (KeysPublish, error)
	TrustSignOwnDevice() error
	VerificationAccept(flowId string) error
	VerificationCancel(flowId string) error
	VerificationConfirm(flowId string) error
	VerificationListen(listener VerificationListener)
	VerificationRequest(deviceId string) (string, error)
	VerificationStartSas(flowId string) error
}
type Core struct {
	ffiObject FfiObject
}

func (_self *Core) Logout() error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_logout(
			_pointer),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) Release() *Release {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	return FfiConverterReleaseINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) C.uint64_t {
		return C.uniffi_zigzag_rustcore_fn_method_core_release(
			_pointer, _uniffiStatus)
	}))
}

func (_self *Core) Session() *SessionData {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	return FfiConverterOptionalSessionDataINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) RustBufferI {
		return GoRustBuffer{
			inner: C.uniffi_zigzag_rustcore_fn_method_core_session(
				_pointer, _uniffiStatus),
		}
	}))
}

func (_self *Core) AccountData(eventType string) (*string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) *string {
			return FfiConverterOptionalStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_account_data(
			_pointer, FfiConverterStringINSTANCE.Lower(eventType)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) Ban(roomId string, userId string, reason *string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_ban(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(userId), FfiConverterOptionalStringINSTANCE.Lower(reason)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) CreateRoom(bodyJson string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_create_room(
			_pointer, FfiConverterStringINSTANCE.Lower(bodyJson)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) DownloadMedia(sourceJson string) ([]byte, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) []byte {
			return FfiConverterBytesINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_download_media(
			_pointer, FfiConverterStringINSTANCE.Lower(sourceJson)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) Event(roomId string, eventId string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_event(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(eventId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) ForgetRoomLocally(roomId string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_forget_room_locally(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) ForgetRoomLocallyIf(roomId string, membership string) (bool, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) C.int8_t {
			res := C.ffi_zigzag_rustcore_rust_future_complete_i8(handle, status)
			return res
		},

		func(ffi C.int8_t) bool {
			return FfiConverterBoolINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_forget_room_locally_if(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(membership)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_i8(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_i8(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) GetPresence(userId string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_get_presence(
			_pointer, FfiConverterStringINSTANCE.Lower(userId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) Invite(roomId string, userId string, reason *string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_invite(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(userId), FfiConverterOptionalStringINSTANCE.Lower(reason)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) JoinRoom(idOrAlias string, via []string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_join_room(
			_pointer, FfiConverterStringINSTANCE.Lower(idOrAlias), FfiConverterSequenceStringINSTANCE.Lower(via)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) Kick(roomId string, userId string, reason *string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_kick(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(userId), FfiConverterOptionalStringINSTANCE.Lower(reason)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) KnownRooms() []KnownRoom {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	return FfiConverterSequenceKnownRoomINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) RustBufferI {
		return GoRustBuffer{
			inner: C.uniffi_zigzag_rustcore_fn_method_core_known_rooms(
				_pointer, _uniffiStatus),
		}
	}))
}

func (_self *Core) Messages(roomId string, from *string, limitEvents uint32, backward bool) (EventPage, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) EventPage {
			return FfiConverterEventPageINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_messages(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterOptionalStringINSTANCE.Lower(from), FfiConverterUint32INSTANCE.Lower(limitEvents), FfiConverterBoolINSTANCE.Lower(backward)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) Redact(roomId string, eventId string, reason *string, txnId *string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_redact(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(eventId), FfiConverterOptionalStringINSTANCE.Lower(reason), FfiConverterOptionalStringINSTANCE.Lower(txnId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) Relations(roomId string, eventId string, relType *string, eventType *string, recurse bool, backward bool, from *string, limitEvents uint32) (EventPage, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) EventPage {
			return FfiConverterEventPageINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_relations(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(eventId), FfiConverterOptionalStringINSTANCE.Lower(relType), FfiConverterOptionalStringINSTANCE.Lower(eventType), FfiConverterBoolINSTANCE.Lower(recurse), FfiConverterBoolINSTANCE.Lower(backward), FfiConverterOptionalStringINSTANCE.Lower(from), FfiConverterUint32INSTANCE.Lower(limitEvents)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) RoomsJoinedWith(userId string) ([]KnownRoom, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) []KnownRoom {
			return FfiConverterSequenceKnownRoomINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_rooms_joined_with(
			_pointer, FfiConverterStringINSTANCE.Lower(userId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SendAttachment(roomId string, filename string, mimeType string, data []byte, caption *string, imageSize *AttachmentSize, thumbnail *AttachmentThumbnail) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_send_attachment(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(filename), FfiConverterStringINSTANCE.Lower(mimeType), FfiConverterBytesINSTANCE.Lower(data), FfiConverterOptionalStringINSTANCE.Lower(caption), FfiConverterOptionalAttachmentSizeINSTANCE.Lower(imageSize), FfiConverterOptionalAttachmentThumbnailINSTANCE.Lower(thumbnail)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SendEvent(roomId string, eventType string, contentJson string, txnId *string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_send_event(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(eventType), FfiConverterStringINSTANCE.Lower(contentJson), FfiConverterOptionalStringINSTANCE.Lower(txnId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SendReceipt(roomId string, receiptType string, thread *string, eventId string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_send_receipt(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(receiptType), FfiConverterOptionalStringINSTANCE.Lower(thread), FfiConverterStringINSTANCE.Lower(eventId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) SendState(roomId string, eventType string, stateKey string, contentJson string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_send_state(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(eventType), FfiConverterStringINSTANCE.Lower(stateKey), FfiConverterStringINSTANCE.Lower(contentJson)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SetAccountData(eventType string, contentJson string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_set_account_data(
			_pointer, FfiConverterStringINSTANCE.Lower(eventType), FfiConverterStringINSTANCE.Lower(contentJson)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) SetPresence(state string, statusMsg *string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_set_presence(
			_pointer, FfiConverterStringINSTANCE.Lower(state), FfiConverterOptionalStringINSTANCE.Lower(statusMsg)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) SetReadMarkers(roomId string, fullyRead *string, read *string, readPrivate *string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_set_read_markers(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterOptionalStringINSTANCE.Lower(fullyRead), FfiConverterOptionalStringINSTANCE.Lower(read), FfiConverterOptionalStringINSTANCE.Lower(readPrivate)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) Threads(roomId string, participatedOnly bool, from *string, limitRoots uint32) (EventPage, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) EventPage {
			return FfiConverterEventPageINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_threads(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterBoolINSTANCE.Lower(participatedOnly), FfiConverterOptionalStringINSTANCE.Lower(from), FfiConverterUint32INSTANCE.Lower(limitRoots)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) TypingNotice(roomId string, typing bool) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_typing_notice(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterBoolINSTANCE.Lower(typing)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) Unban(roomId string, userId string, reason *string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_unban(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(userId), FfiConverterOptionalStringINSTANCE.Lower(reason)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) SendQueueAbort(roomId string, transactionId string) (bool, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) C.int8_t {
			res := C.ffi_zigzag_rustcore_rust_future_complete_i8(handle, status)
			return res
		},

		func(ffi C.int8_t) bool {
			return FfiConverterBoolINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_abort(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(transactionId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_i8(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_i8(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SendQueueEdit(roomId string, transactionId string, eventType string, contentJson string) (bool, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) C.int8_t {
			res := C.ffi_zigzag_rustcore_rust_future_complete_i8(handle, status)
			return res
		},

		func(ffi C.int8_t) bool {
			return FfiConverterBoolINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_edit(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(transactionId), FfiConverterStringINSTANCE.Lower(eventType), FfiConverterStringINSTANCE.Lower(contentJson)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_i8(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_i8(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SendQueueIsEnabled() bool {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	return FfiConverterBoolINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) C.int8_t {
		return C.uniffi_zigzag_rustcore_fn_method_core_send_queue_is_enabled(
			_pointer, _uniffiStatus)
	}))
}

func (_self *Core) SendQueueListen(listener SendQueueListener) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	rustCall(func(_uniffiStatus *C.RustCallStatus) bool {
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_listen(
			_pointer, FfiConverterCallbackInterfaceSendQueueListenerINSTANCE.Lower(listener), _uniffiStatus)
		return false
	})
}

func (_self *Core) SendQueuePending(roomId *string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_pending(
			_pointer, FfiConverterOptionalStringINSTANCE.Lower(roomId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SendQueueReportUploadProgress(enabled bool) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	rustCall(func(_uniffiStatus *C.RustCallStatus) bool {
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_report_upload_progress(
			_pointer, FfiConverterBoolINSTANCE.Lower(enabled), _uniffiStatus)
		return false
	})
}

func (_self *Core) SendQueueRespawn() {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	uniffiRustCallAsync[error](
		nil,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_respawn(
			_pointer),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

}

func (_self *Core) SendQueueRoomIsEnabled(roomId string) (bool, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) C.int8_t {
			res := C.ffi_zigzag_rustcore_rust_future_complete_i8(handle, status)
			return res
		},

		func(ffi C.int8_t) bool {
			return FfiConverterBoolINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_room_is_enabled(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_i8(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_i8(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SendQueueRoomSetEnabled(roomId string, enabled bool) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_room_set_enabled(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterBoolINSTANCE.Lower(enabled)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) SendQueueSend(roomId string, eventType string, contentJson string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_send(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(eventType), FfiConverterStringINSTANCE.Lower(contentJson)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SendQueueSendAttachment(roomId string, filename string, mimeType string, data []byte, caption *string, imageSize *AttachmentSize, thumbnail *AttachmentThumbnail) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_send_attachment(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(filename), FfiConverterStringINSTANCE.Lower(mimeType), FfiConverterBytesINSTANCE.Lower(data), FfiConverterOptionalStringINSTANCE.Lower(caption), FfiConverterOptionalAttachmentSizeINSTANCE.Lower(imageSize), FfiConverterOptionalAttachmentThumbnailINSTANCE.Lower(thumbnail)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SendQueueSetEnabled(enabled bool) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	uniffiRustCallAsync[error](
		nil,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_set_enabled(
			_pointer, FfiConverterBoolINSTANCE.Lower(enabled)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

}

func (_self *Core) SendQueueUnwedge(roomId string, transactionId string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_send_queue_unwedge(
			_pointer, FfiConverterStringINSTANCE.Lower(roomId), FfiConverterStringINSTANCE.Lower(transactionId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) SyncConfigure(config SyncConfig) (*string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) *string {
			return FfiConverterOptionalStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_sync_configure(
			_pointer, FfiConverterSyncConfigINSTANCE.Lower(config)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) SyncHasPosition() bool {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	return FfiConverterBoolINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) C.int8_t {
		return C.uniffi_zigzag_rustcore_fn_method_core_sync_has_position(
			_pointer, _uniffiStatus)
	}))
}

func (_self *Core) SyncPosition() *string {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	return FfiConverterOptionalStringINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) RustBufferI {
		return GoRustBuffer{
			inner: C.uniffi_zigzag_rustcore_fn_method_core_sync_position(
				_pointer, _uniffiStatus),
		}
	}))
}

func (_self *Core) SyncProbe(timeoutMs uint64) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_sync_probe(
			_pointer, FfiConverterUint64INSTANCE.Lower(timeoutMs)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) SyncResetPosition() {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	rustCall(func(_uniffiStatus *C.RustCallStatus) bool {
		C.uniffi_zigzag_rustcore_fn_method_core_sync_reset_position(
			_pointer, _uniffiStatus)
		return false
	})
}

func (_self *Core) SyncRun(listener SyncListener) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_sync_run(
			_pointer, FfiConverterCallbackInterfaceSyncListenerINSTANCE.Lower(listener)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) SyncStop() {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	rustCall(func(_uniffiStatus *C.RustCallStatus) bool {
		C.uniffi_zigzag_rustcore_fn_method_core_sync_stop(
			_pointer, _uniffiStatus)
		return false
	})
}

func (_self *Core) SyncSubscribeRooms(roomIds []string, requiredState []StatePair, timelineLimit uint32, cancelInFlight bool) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, _uniffiErr := rustCallWithError[*CoreError](FfiConverterCoreError{}, func(_uniffiStatus *C.RustCallStatus) bool {
		C.uniffi_zigzag_rustcore_fn_method_core_sync_subscribe_rooms(
			_pointer, FfiConverterSequenceStringINSTANCE.Lower(roomIds), FfiConverterSequenceStatePairINSTANCE.Lower(requiredState), FfiConverterUint32INSTANCE.Lower(timelineLimit), FfiConverterBoolINSTANCE.Lower(cancelInFlight), _uniffiStatus)
		return false
	})
	return _uniffiErr.AsError()
}

func (_self *Core) TrustExportKeys() (*CrossSigningKeys, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) *CrossSigningKeys {
			return FfiConverterOptionalCrossSigningKeysINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_trust_export_keys(
			_pointer),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) TrustImportKeys(keys CrossSigningKeys) (KeyImport, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) KeyImport {
			return FfiConverterKeyImportINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_trust_import_keys(
			_pointer, FfiConverterCrossSigningKeysINSTANCE.Lower(keys)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) TrustOwn(refresh bool) (OwnTrust, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) OwnTrust {
			return FfiConverterOwnTrustINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_trust_own(
			_pointer, FfiConverterBoolINSTANCE.Lower(refresh)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) TrustPublishKeys(password *string, reset bool) (KeysPublish, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) KeysPublish {
			return FfiConverterKeysPublishINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_trust_publish_keys(
			_pointer, FfiConverterOptionalStringINSTANCE.Lower(password), FfiConverterBoolINSTANCE.Lower(reset)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) TrustSignOwnDevice() error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_trust_sign_own_device(
			_pointer),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) VerificationAccept(flowId string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_verification_accept(
			_pointer, FfiConverterStringINSTANCE.Lower(flowId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) VerificationCancel(flowId string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_verification_cancel(
			_pointer, FfiConverterStringINSTANCE.Lower(flowId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) VerificationConfirm(flowId string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_verification_confirm(
			_pointer, FfiConverterStringINSTANCE.Lower(flowId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}

func (_self *Core) VerificationListen(listener VerificationListener) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	rustCall(func(_uniffiStatus *C.RustCallStatus) bool {
		C.uniffi_zigzag_rustcore_fn_method_core_verification_listen(
			_pointer, FfiConverterCallbackInterfaceVerificationListenerINSTANCE.Lower(listener), _uniffiStatus)
		return false
	})
}

func (_self *Core) VerificationRequest(deviceId string) (string, error) {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) RustBufferI {
			res := C.ffi_zigzag_rustcore_rust_future_complete_rust_buffer(handle, status)
			return GoRustBuffer{
				inner: res,
			}
		},

		func(ffi RustBufferI) string {
			return FfiConverterStringINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_core_verification_request(
			_pointer, FfiConverterStringINSTANCE.Lower(deviceId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_rust_buffer(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_rust_buffer(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func (_self *Core) VerificationStartSas(flowId string) error {
	_pointer := _self.ffiObject.incrementPointer("*Core")
	defer _self.ffiObject.decrementPointer()
	_, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) struct{} {
			C.ffi_zigzag_rustcore_rust_future_complete_void(handle, status)
			return struct{}{}
		},

		func(_ struct{}) struct{} { return struct{}{} },
		C.uniffi_zigzag_rustcore_fn_method_core_verification_start_sas(
			_pointer, FfiConverterStringINSTANCE.Lower(flowId)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_void(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_void(handle)
		},
	)

	if err == nil {
		return nil
	}

	return err
}
func (object *Core) Destroy() {
	runtime.SetFinalizer(object, nil)
	object.ffiObject.destroy()
}

type FfiConverterCore struct{}

var FfiConverterCoreINSTANCE = FfiConverterCore{}

func (c FfiConverterCore) Lift(handle C.uint64_t) *Core {
	result := &Core{
		newFfiObject(
			handle,
			func(handle C.uint64_t, status *C.RustCallStatus) C.uint64_t {
				return C.uniffi_zigzag_rustcore_fn_clone_core(handle, status)
			},
			func(handle C.uint64_t, status *C.RustCallStatus) {
				C.uniffi_zigzag_rustcore_fn_free_core(handle, status)
			},
		),
	}
	runtime.SetFinalizer(result, (*Core).Destroy)
	return result
}

func (c FfiConverterCore) Read(reader io.Reader) *Core {
	return c.Lift(C.uint64_t(readUint64(reader)))
}

func (c FfiConverterCore) Lower(value *Core) C.uint64_t {

	handle := value.ffiObject.incrementPointer("*Core")
	defer value.ffiObject.decrementPointer()
	return handle
}

func (c FfiConverterCore) Write(writer io.Writer, value *Core) {
	writeUint64(writer, uint64(c.Lower(value)))
}

func LiftFromExternalCore(handle uint64) *Core {
	return FfiConverterCoreINSTANCE.Lift(C.uint64_t(handle))
}

func LowerToExternalCore(value *Core) uint64 {
	return uint64(FfiConverterCoreINSTANCE.Lower(value))
}

type FfiDestroyerCore struct{}

func (_ FfiDestroyerCore) Destroy(value *Core) {
	value.Destroy()
}

type PushRulesInterface interface {
	Evaluate(eventJson string, room PushRoom) (PushOutcome, error)
}
type PushRules struct {
	ffiObject FfiObject
}

func NewPushRules(rulesetJson string) (*PushRules, error) {
	_uniffiRV, _uniffiErr := rustCallWithError[*CoreError](FfiConverterCoreError{}, func(_uniffiStatus *C.RustCallStatus) C.uint64_t {
		return C.uniffi_zigzag_rustcore_fn_constructor_pushrules_new(FfiConverterStringINSTANCE.Lower(rulesetJson), _uniffiStatus)
	})
	if _uniffiErr != nil {
		var _uniffiDefaultValue *PushRules
		return _uniffiDefaultValue, _uniffiErr
	} else {
		return FfiConverterPushRulesINSTANCE.Lift(_uniffiRV), nil
	}
}

func (_self *PushRules) Evaluate(eventJson string, room PushRoom) (PushOutcome, error) {
	_pointer := _self.ffiObject.incrementPointer("*PushRules")
	defer _self.ffiObject.decrementPointer()
	_uniffiRV, _uniffiErr := rustCallWithError[*CoreError](FfiConverterCoreError{}, func(_uniffiStatus *C.RustCallStatus) RustBufferI {
		return GoRustBuffer{
			inner: C.uniffi_zigzag_rustcore_fn_method_pushrules_evaluate(
				_pointer, FfiConverterStringINSTANCE.Lower(eventJson), FfiConverterPushRoomINSTANCE.Lower(room), _uniffiStatus),
		}
	})
	if _uniffiErr != nil {
		var _uniffiDefaultValue PushOutcome
		return _uniffiDefaultValue, _uniffiErr
	} else {
		return FfiConverterPushOutcomeINSTANCE.Lift(_uniffiRV), nil
	}
}
func (object *PushRules) Destroy() {
	runtime.SetFinalizer(object, nil)
	object.ffiObject.destroy()
}

type FfiConverterPushRules struct{}

var FfiConverterPushRulesINSTANCE = FfiConverterPushRules{}

func (c FfiConverterPushRules) Lift(handle C.uint64_t) *PushRules {
	result := &PushRules{
		newFfiObject(
			handle,
			func(handle C.uint64_t, status *C.RustCallStatus) C.uint64_t {
				return C.uniffi_zigzag_rustcore_fn_clone_pushrules(handle, status)
			},
			func(handle C.uint64_t, status *C.RustCallStatus) {
				C.uniffi_zigzag_rustcore_fn_free_pushrules(handle, status)
			},
		),
	}
	runtime.SetFinalizer(result, (*PushRules).Destroy)
	return result
}

func (c FfiConverterPushRules) Read(reader io.Reader) *PushRules {
	return c.Lift(C.uint64_t(readUint64(reader)))
}

func (c FfiConverterPushRules) Lower(value *PushRules) C.uint64_t {

	handle := value.ffiObject.incrementPointer("*PushRules")
	defer value.ffiObject.decrementPointer()
	return handle
}

func (c FfiConverterPushRules) Write(writer io.Writer, value *PushRules) {
	writeUint64(writer, uint64(c.Lower(value)))
}

func LiftFromExternalPushRules(handle uint64) *PushRules {
	return FfiConverterPushRulesINSTANCE.Lift(C.uint64_t(handle))
}

func LowerToExternalPushRules(value *PushRules) uint64 {
	return uint64(FfiConverterPushRulesINSTANCE.Lower(value))
}

type FfiDestroyerPushRules struct{}

func (_ FfiDestroyerPushRules) Destroy(value *PushRules) {
	value.Destroy()
}

type ReleaseInterface interface {
	Wait(timeoutMs uint64) bool
}
type Release struct {
	ffiObject FfiObject
}

func (_self *Release) Wait(timeoutMs uint64) bool {
	_pointer := _self.ffiObject.incrementPointer("*Release")
	defer _self.ffiObject.decrementPointer()
	res, _ := uniffiRustCallAsync[error](
		nil,

		func(handle C.uint64_t, status *C.RustCallStatus) C.int8_t {
			res := C.ffi_zigzag_rustcore_rust_future_complete_i8(handle, status)
			return res
		},

		func(ffi C.int8_t) bool {
			return FfiConverterBoolINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_method_release_wait(
			_pointer, FfiConverterUint64INSTANCE.Lower(timeoutMs)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_i8(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_i8(handle)
		},
	)

	return res
}
func (object *Release) Destroy() {
	runtime.SetFinalizer(object, nil)
	object.ffiObject.destroy()
}

type FfiConverterRelease struct{}

var FfiConverterReleaseINSTANCE = FfiConverterRelease{}

func (c FfiConverterRelease) Lift(handle C.uint64_t) *Release {
	result := &Release{
		newFfiObject(
			handle,
			func(handle C.uint64_t, status *C.RustCallStatus) C.uint64_t {
				return C.uniffi_zigzag_rustcore_fn_clone_release(handle, status)
			},
			func(handle C.uint64_t, status *C.RustCallStatus) {
				C.uniffi_zigzag_rustcore_fn_free_release(handle, status)
			},
		),
	}
	runtime.SetFinalizer(result, (*Release).Destroy)
	return result
}

func (c FfiConverterRelease) Read(reader io.Reader) *Release {
	return c.Lift(C.uint64_t(readUint64(reader)))
}

func (c FfiConverterRelease) Lower(value *Release) C.uint64_t {

	handle := value.ffiObject.incrementPointer("*Release")
	defer value.ffiObject.decrementPointer()
	return handle
}

func (c FfiConverterRelease) Write(writer io.Writer, value *Release) {
	writeUint64(writer, uint64(c.Lower(value)))
}

func LiftFromExternalRelease(handle uint64) *Release {
	return FfiConverterReleaseINSTANCE.Lift(C.uint64_t(handle))
}

func LowerToExternalRelease(value *Release) uint64 {
	return uint64(FfiConverterReleaseINSTANCE.Lower(value))
}

type FfiDestroyerRelease struct{}

func (_ FfiDestroyerRelease) Destroy(value *Release) {
	value.Destroy()
}

type AttachmentSize struct {
	Width  uint32
	Height uint32
}

func (r *AttachmentSize) Destroy() {
	FfiDestroyerUint32{}.Destroy(r.Width)
	FfiDestroyerUint32{}.Destroy(r.Height)
}

type FfiConverterAttachmentSize struct{}

var FfiConverterAttachmentSizeINSTANCE = FfiConverterAttachmentSize{}

func (c FfiConverterAttachmentSize) Lift(rb RustBufferI) AttachmentSize {
	return LiftFromRustBuffer[AttachmentSize](c, rb)
}

func (c FfiConverterAttachmentSize) Read(reader io.Reader) AttachmentSize {
	return AttachmentSize{
		FfiConverterUint32INSTANCE.Read(reader),
		FfiConverterUint32INSTANCE.Read(reader),
	}
}

func (c FfiConverterAttachmentSize) Lower(value AttachmentSize) C.RustBuffer {
	return LowerIntoRustBuffer[AttachmentSize](c, value)
}

func (c FfiConverterAttachmentSize) LowerExternal(value AttachmentSize) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[AttachmentSize](c, value))
}

func (c FfiConverterAttachmentSize) Write(writer io.Writer, value AttachmentSize) {
	FfiConverterUint32INSTANCE.Write(writer, value.Width)
	FfiConverterUint32INSTANCE.Write(writer, value.Height)
}

type FfiDestroyerAttachmentSize struct{}

func (_ FfiDestroyerAttachmentSize) Destroy(value AttachmentSize) {
	value.Destroy()
}

type AttachmentThumbnail struct {
	Data     []byte
	MimeType string
	Width    uint32
	Height   uint32
}

func (r *AttachmentThumbnail) Destroy() {
	FfiDestroyerBytes{}.Destroy(r.Data)
	FfiDestroyerString{}.Destroy(r.MimeType)
	FfiDestroyerUint32{}.Destroy(r.Width)
	FfiDestroyerUint32{}.Destroy(r.Height)
}

type FfiConverterAttachmentThumbnail struct{}

var FfiConverterAttachmentThumbnailINSTANCE = FfiConverterAttachmentThumbnail{}

func (c FfiConverterAttachmentThumbnail) Lift(rb RustBufferI) AttachmentThumbnail {
	return LiftFromRustBuffer[AttachmentThumbnail](c, rb)
}

func (c FfiConverterAttachmentThumbnail) Read(reader io.Reader) AttachmentThumbnail {
	return AttachmentThumbnail{
		FfiConverterBytesINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterUint32INSTANCE.Read(reader),
		FfiConverterUint32INSTANCE.Read(reader),
	}
}

func (c FfiConverterAttachmentThumbnail) Lower(value AttachmentThumbnail) C.RustBuffer {
	return LowerIntoRustBuffer[AttachmentThumbnail](c, value)
}

func (c FfiConverterAttachmentThumbnail) LowerExternal(value AttachmentThumbnail) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[AttachmentThumbnail](c, value))
}

func (c FfiConverterAttachmentThumbnail) Write(writer io.Writer, value AttachmentThumbnail) {
	FfiConverterBytesINSTANCE.Write(writer, value.Data)
	FfiConverterStringINSTANCE.Write(writer, value.MimeType)
	FfiConverterUint32INSTANCE.Write(writer, value.Width)
	FfiConverterUint32INSTANCE.Write(writer, value.Height)
}

type FfiDestroyerAttachmentThumbnail struct{}

func (_ FfiDestroyerAttachmentThumbnail) Destroy(value AttachmentThumbnail) {
	value.Destroy()
}

type CrossSigningKeys struct {
	MasterKey      *string
	SelfSigningKey *string
	UserSigningKey *string
}

func (r *CrossSigningKeys) Destroy() {
	FfiDestroyerOptionalString{}.Destroy(r.MasterKey)
	FfiDestroyerOptionalString{}.Destroy(r.SelfSigningKey)
	FfiDestroyerOptionalString{}.Destroy(r.UserSigningKey)
}

type FfiConverterCrossSigningKeys struct{}

var FfiConverterCrossSigningKeysINSTANCE = FfiConverterCrossSigningKeys{}

func (c FfiConverterCrossSigningKeys) Lift(rb RustBufferI) CrossSigningKeys {
	return LiftFromRustBuffer[CrossSigningKeys](c, rb)
}

func (c FfiConverterCrossSigningKeys) Read(reader io.Reader) CrossSigningKeys {
	return CrossSigningKeys{
		FfiConverterOptionalStringINSTANCE.Read(reader),
		FfiConverterOptionalStringINSTANCE.Read(reader),
		FfiConverterOptionalStringINSTANCE.Read(reader),
	}
}

func (c FfiConverterCrossSigningKeys) Lower(value CrossSigningKeys) C.RustBuffer {
	return LowerIntoRustBuffer[CrossSigningKeys](c, value)
}

func (c FfiConverterCrossSigningKeys) LowerExternal(value CrossSigningKeys) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[CrossSigningKeys](c, value))
}

func (c FfiConverterCrossSigningKeys) Write(writer io.Writer, value CrossSigningKeys) {
	FfiConverterOptionalStringINSTANCE.Write(writer, value.MasterKey)
	FfiConverterOptionalStringINSTANCE.Write(writer, value.SelfSigningKey)
	FfiConverterOptionalStringINSTANCE.Write(writer, value.UserSigningKey)
}

type FfiDestroyerCrossSigningKeys struct{}

func (_ FfiDestroyerCrossSigningKeys) Destroy(value CrossSigningKeys) {
	value.Destroy()
}

type EventPage struct {
	Events        []string
	End           *string
	Start         *string
	Undecryptable uint32
}

func (r *EventPage) Destroy() {
	FfiDestroyerSequenceString{}.Destroy(r.Events)
	FfiDestroyerOptionalString{}.Destroy(r.End)
	FfiDestroyerOptionalString{}.Destroy(r.Start)
	FfiDestroyerUint32{}.Destroy(r.Undecryptable)
}

type FfiConverterEventPage struct{}

var FfiConverterEventPageINSTANCE = FfiConverterEventPage{}

func (c FfiConverterEventPage) Lift(rb RustBufferI) EventPage {
	return LiftFromRustBuffer[EventPage](c, rb)
}

func (c FfiConverterEventPage) Read(reader io.Reader) EventPage {
	return EventPage{
		FfiConverterSequenceStringINSTANCE.Read(reader),
		FfiConverterOptionalStringINSTANCE.Read(reader),
		FfiConverterOptionalStringINSTANCE.Read(reader),
		FfiConverterUint32INSTANCE.Read(reader),
	}
}

func (c FfiConverterEventPage) Lower(value EventPage) C.RustBuffer {
	return LowerIntoRustBuffer[EventPage](c, value)
}

func (c FfiConverterEventPage) LowerExternal(value EventPage) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[EventPage](c, value))
}

func (c FfiConverterEventPage) Write(writer io.Writer, value EventPage) {
	FfiConverterSequenceStringINSTANCE.Write(writer, value.Events)
	FfiConverterOptionalStringINSTANCE.Write(writer, value.End)
	FfiConverterOptionalStringINSTANCE.Write(writer, value.Start)
	FfiConverterUint32INSTANCE.Write(writer, value.Undecryptable)
}

type FfiDestroyerEventPage struct{}

func (_ FfiDestroyerEventPage) Destroy(value EventPage) {
	value.Destroy()
}

type KnownRoom struct {
	RoomId         string
	RoomType       *string
	Membership     string
	Creator        *string
	JoinedMembers  uint64
	InvitedMembers uint64
}

func (r *KnownRoom) Destroy() {
	FfiDestroyerString{}.Destroy(r.RoomId)
	FfiDestroyerOptionalString{}.Destroy(r.RoomType)
	FfiDestroyerString{}.Destroy(r.Membership)
	FfiDestroyerOptionalString{}.Destroy(r.Creator)
	FfiDestroyerUint64{}.Destroy(r.JoinedMembers)
	FfiDestroyerUint64{}.Destroy(r.InvitedMembers)
}

type FfiConverterKnownRoom struct{}

var FfiConverterKnownRoomINSTANCE = FfiConverterKnownRoom{}

func (c FfiConverterKnownRoom) Lift(rb RustBufferI) KnownRoom {
	return LiftFromRustBuffer[KnownRoom](c, rb)
}

func (c FfiConverterKnownRoom) Read(reader io.Reader) KnownRoom {
	return KnownRoom{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterOptionalStringINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterOptionalStringINSTANCE.Read(reader),
		FfiConverterUint64INSTANCE.Read(reader),
		FfiConverterUint64INSTANCE.Read(reader),
	}
}

func (c FfiConverterKnownRoom) Lower(value KnownRoom) C.RustBuffer {
	return LowerIntoRustBuffer[KnownRoom](c, value)
}

func (c FfiConverterKnownRoom) LowerExternal(value KnownRoom) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[KnownRoom](c, value))
}

func (c FfiConverterKnownRoom) Write(writer io.Writer, value KnownRoom) {
	FfiConverterStringINSTANCE.Write(writer, value.RoomId)
	FfiConverterOptionalStringINSTANCE.Write(writer, value.RoomType)
	FfiConverterStringINSTANCE.Write(writer, value.Membership)
	FfiConverterOptionalStringINSTANCE.Write(writer, value.Creator)
	FfiConverterUint64INSTANCE.Write(writer, value.JoinedMembers)
	FfiConverterUint64INSTANCE.Write(writer, value.InvitedMembers)
}

type FfiDestroyerKnownRoom struct{}

func (_ FfiDestroyerKnownRoom) Destroy(value KnownRoom) {
	value.Destroy()
}

type OwnDevice struct {
	DeviceId string
	Verified bool
}

func (r *OwnDevice) Destroy() {
	FfiDestroyerString{}.Destroy(r.DeviceId)
	FfiDestroyerBool{}.Destroy(r.Verified)
}

type FfiConverterOwnDevice struct{}

var FfiConverterOwnDeviceINSTANCE = FfiConverterOwnDevice{}

func (c FfiConverterOwnDevice) Lift(rb RustBufferI) OwnDevice {
	return LiftFromRustBuffer[OwnDevice](c, rb)
}

func (c FfiConverterOwnDevice) Read(reader io.Reader) OwnDevice {
	return OwnDevice{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
	}
}

func (c FfiConverterOwnDevice) Lower(value OwnDevice) C.RustBuffer {
	return LowerIntoRustBuffer[OwnDevice](c, value)
}

func (c FfiConverterOwnDevice) LowerExternal(value OwnDevice) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[OwnDevice](c, value))
}

func (c FfiConverterOwnDevice) Write(writer io.Writer, value OwnDevice) {
	FfiConverterStringINSTANCE.Write(writer, value.DeviceId)
	FfiConverterBoolINSTANCE.Write(writer, value.Verified)
}

type FfiDestroyerOwnDevice struct{}

func (_ FfiDestroyerOwnDevice) Destroy(value OwnDevice) {
	value.Destroy()
}

type OwnTrust struct {
	IdentityMasterKey *string
	HeldMasterKey     *string
	HasMaster         bool
	HasSelfSigning    bool
	HasUserSigning    bool
	Devices           []OwnDevice
}

func (r *OwnTrust) Destroy() {
	FfiDestroyerOptionalString{}.Destroy(r.IdentityMasterKey)
	FfiDestroyerOptionalString{}.Destroy(r.HeldMasterKey)
	FfiDestroyerBool{}.Destroy(r.HasMaster)
	FfiDestroyerBool{}.Destroy(r.HasSelfSigning)
	FfiDestroyerBool{}.Destroy(r.HasUserSigning)
	FfiDestroyerSequenceOwnDevice{}.Destroy(r.Devices)
}

type FfiConverterOwnTrust struct{}

var FfiConverterOwnTrustINSTANCE = FfiConverterOwnTrust{}

func (c FfiConverterOwnTrust) Lift(rb RustBufferI) OwnTrust {
	return LiftFromRustBuffer[OwnTrust](c, rb)
}

func (c FfiConverterOwnTrust) Read(reader io.Reader) OwnTrust {
	return OwnTrust{
		FfiConverterOptionalStringINSTANCE.Read(reader),
		FfiConverterOptionalStringINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterSequenceOwnDeviceINSTANCE.Read(reader),
	}
}

func (c FfiConverterOwnTrust) Lower(value OwnTrust) C.RustBuffer {
	return LowerIntoRustBuffer[OwnTrust](c, value)
}

func (c FfiConverterOwnTrust) LowerExternal(value OwnTrust) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[OwnTrust](c, value))
}

func (c FfiConverterOwnTrust) Write(writer io.Writer, value OwnTrust) {
	FfiConverterOptionalStringINSTANCE.Write(writer, value.IdentityMasterKey)
	FfiConverterOptionalStringINSTANCE.Write(writer, value.HeldMasterKey)
	FfiConverterBoolINSTANCE.Write(writer, value.HasMaster)
	FfiConverterBoolINSTANCE.Write(writer, value.HasSelfSigning)
	FfiConverterBoolINSTANCE.Write(writer, value.HasUserSigning)
	FfiConverterSequenceOwnDeviceINSTANCE.Write(writer, value.Devices)
}

type FfiDestroyerOwnTrust struct{}

func (_ FfiDestroyerOwnTrust) Destroy(value OwnTrust) {
	value.Destroy()
}

type PushOutcome struct {
	Notify    bool
	Highlight bool
	Sound     bool
}

func (r *PushOutcome) Destroy() {
	FfiDestroyerBool{}.Destroy(r.Notify)
	FfiDestroyerBool{}.Destroy(r.Highlight)
	FfiDestroyerBool{}.Destroy(r.Sound)
}

type FfiConverterPushOutcome struct{}

var FfiConverterPushOutcomeINSTANCE = FfiConverterPushOutcome{}

func (c FfiConverterPushOutcome) Lift(rb RustBufferI) PushOutcome {
	return LiftFromRustBuffer[PushOutcome](c, rb)
}

func (c FfiConverterPushOutcome) Read(reader io.Reader) PushOutcome {
	return PushOutcome{
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
	}
}

func (c FfiConverterPushOutcome) Lower(value PushOutcome) C.RustBuffer {
	return LowerIntoRustBuffer[PushOutcome](c, value)
}

func (c FfiConverterPushOutcome) LowerExternal(value PushOutcome) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[PushOutcome](c, value))
}

func (c FfiConverterPushOutcome) Write(writer io.Writer, value PushOutcome) {
	FfiConverterBoolINSTANCE.Write(writer, value.Notify)
	FfiConverterBoolINSTANCE.Write(writer, value.Highlight)
	FfiConverterBoolINSTANCE.Write(writer, value.Sound)
}

type FfiDestroyerPushOutcome struct{}

func (_ FfiDestroyerPushOutcome) Destroy(value PushOutcome) {
	value.Destroy()
}

type PushRoom struct {
	RoomId          string
	MemberCount     uint64
	UserId          string
	UserDisplayName string
}

func (r *PushRoom) Destroy() {
	FfiDestroyerString{}.Destroy(r.RoomId)
	FfiDestroyerUint64{}.Destroy(r.MemberCount)
	FfiDestroyerString{}.Destroy(r.UserId)
	FfiDestroyerString{}.Destroy(r.UserDisplayName)
}

type FfiConverterPushRoom struct{}

var FfiConverterPushRoomINSTANCE = FfiConverterPushRoom{}

func (c FfiConverterPushRoom) Lift(rb RustBufferI) PushRoom {
	return LiftFromRustBuffer[PushRoom](c, rb)
}

func (c FfiConverterPushRoom) Read(reader io.Reader) PushRoom {
	return PushRoom{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterUint64INSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
	}
}

func (c FfiConverterPushRoom) Lower(value PushRoom) C.RustBuffer {
	return LowerIntoRustBuffer[PushRoom](c, value)
}

func (c FfiConverterPushRoom) LowerExternal(value PushRoom) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[PushRoom](c, value))
}

func (c FfiConverterPushRoom) Write(writer io.Writer, value PushRoom) {
	FfiConverterStringINSTANCE.Write(writer, value.RoomId)
	FfiConverterUint64INSTANCE.Write(writer, value.MemberCount)
	FfiConverterStringINSTANCE.Write(writer, value.UserId)
	FfiConverterStringINSTANCE.Write(writer, value.UserDisplayName)
}

type FfiDestroyerPushRoom struct{}

func (_ FfiDestroyerPushRoom) Destroy(value PushRoom) {
	value.Destroy()
}

type SessionData struct {
	HomeserverUrl string
	UserId        string
	DeviceId      string
	AccessToken   string
}

func (r *SessionData) Destroy() {
	FfiDestroyerString{}.Destroy(r.HomeserverUrl)
	FfiDestroyerString{}.Destroy(r.UserId)
	FfiDestroyerString{}.Destroy(r.DeviceId)
	FfiDestroyerString{}.Destroy(r.AccessToken)
}

type FfiConverterSessionData struct{}

var FfiConverterSessionDataINSTANCE = FfiConverterSessionData{}

func (c FfiConverterSessionData) Lift(rb RustBufferI) SessionData {
	return LiftFromRustBuffer[SessionData](c, rb)
}

func (c FfiConverterSessionData) Read(reader io.Reader) SessionData {
	return SessionData{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
	}
}

func (c FfiConverterSessionData) Lower(value SessionData) C.RustBuffer {
	return LowerIntoRustBuffer[SessionData](c, value)
}

func (c FfiConverterSessionData) LowerExternal(value SessionData) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[SessionData](c, value))
}

func (c FfiConverterSessionData) Write(writer io.Writer, value SessionData) {
	FfiConverterStringINSTANCE.Write(writer, value.HomeserverUrl)
	FfiConverterStringINSTANCE.Write(writer, value.UserId)
	FfiConverterStringINSTANCE.Write(writer, value.DeviceId)
	FfiConverterStringINSTANCE.Write(writer, value.AccessToken)
}

type FfiDestroyerSessionData struct{}

func (_ FfiDestroyerSessionData) Destroy(value SessionData) {
	value.Destroy()
}

type SqliteVersion struct {
	Runtime string
	Bundled string
}

func (r *SqliteVersion) Destroy() {
	FfiDestroyerString{}.Destroy(r.Runtime)
	FfiDestroyerString{}.Destroy(r.Bundled)
}

type FfiConverterSqliteVersion struct{}

var FfiConverterSqliteVersionINSTANCE = FfiConverterSqliteVersion{}

func (c FfiConverterSqliteVersion) Lift(rb RustBufferI) SqliteVersion {
	return LiftFromRustBuffer[SqliteVersion](c, rb)
}

func (c FfiConverterSqliteVersion) Read(reader io.Reader) SqliteVersion {
	return SqliteVersion{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
	}
}

func (c FfiConverterSqliteVersion) Lower(value SqliteVersion) C.RustBuffer {
	return LowerIntoRustBuffer[SqliteVersion](c, value)
}

func (c FfiConverterSqliteVersion) LowerExternal(value SqliteVersion) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[SqliteVersion](c, value))
}

func (c FfiConverterSqliteVersion) Write(writer io.Writer, value SqliteVersion) {
	FfiConverterStringINSTANCE.Write(writer, value.Runtime)
	FfiConverterStringINSTANCE.Write(writer, value.Bundled)
}

type FfiDestroyerSqliteVersion struct{}

func (_ FfiDestroyerSqliteVersion) Destroy(value SqliteVersion) {
	value.Destroy()
}

type StatePair struct {
	EventType string
	StateKey  string
}

func (r *StatePair) Destroy() {
	FfiDestroyerString{}.Destroy(r.EventType)
	FfiDestroyerString{}.Destroy(r.StateKey)
}

type FfiConverterStatePair struct{}

var FfiConverterStatePairINSTANCE = FfiConverterStatePair{}

func (c FfiConverterStatePair) Lift(rb RustBufferI) StatePair {
	return LiftFromRustBuffer[StatePair](c, rb)
}

func (c FfiConverterStatePair) Read(reader io.Reader) StatePair {
	return StatePair{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
	}
}

func (c FfiConverterStatePair) Lower(value StatePair) C.RustBuffer {
	return LowerIntoRustBuffer[StatePair](c, value)
}

func (c FfiConverterStatePair) LowerExternal(value StatePair) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[StatePair](c, value))
}

func (c FfiConverterStatePair) Write(writer io.Writer, value StatePair) {
	FfiConverterStringINSTANCE.Write(writer, value.EventType)
	FfiConverterStringINSTANCE.Write(writer, value.StateKey)
}

type FfiDestroyerStatePair struct{}

func (_ FfiDestroyerStatePair) Destroy(value StatePair) {
	value.Destroy()
}

type StoreConfig struct {
	Path       string
	Passphrase *string
}

func (r *StoreConfig) Destroy() {
	FfiDestroyerString{}.Destroy(r.Path)
	FfiDestroyerOptionalString{}.Destroy(r.Passphrase)
}

type FfiConverterStoreConfig struct{}

var FfiConverterStoreConfigINSTANCE = FfiConverterStoreConfig{}

func (c FfiConverterStoreConfig) Lift(rb RustBufferI) StoreConfig {
	return LiftFromRustBuffer[StoreConfig](c, rb)
}

func (c FfiConverterStoreConfig) Read(reader io.Reader) StoreConfig {
	return StoreConfig{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterOptionalStringINSTANCE.Read(reader),
	}
}

func (c FfiConverterStoreConfig) Lower(value StoreConfig) C.RustBuffer {
	return LowerIntoRustBuffer[StoreConfig](c, value)
}

func (c FfiConverterStoreConfig) LowerExternal(value StoreConfig) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[StoreConfig](c, value))
}

func (c FfiConverterStoreConfig) Write(writer io.Writer, value StoreConfig) {
	FfiConverterStringINSTANCE.Write(writer, value.Path)
	FfiConverterOptionalStringINSTANCE.Write(writer, value.Passphrase)
}

type FfiDestroyerStoreConfig struct{}

func (_ FfiDestroyerStoreConfig) Destroy(value StoreConfig) {
	value.Destroy()
}

type SyncBatch struct {
	From      string
	To        string
	Body      string
	Decrypted map[string]string
}

func (r *SyncBatch) Destroy() {
	FfiDestroyerString{}.Destroy(r.From)
	FfiDestroyerString{}.Destroy(r.To)
	FfiDestroyerString{}.Destroy(r.Body)
	FfiDestroyerMapStringString{}.Destroy(r.Decrypted)
}

type FfiConverterSyncBatch struct{}

var FfiConverterSyncBatchINSTANCE = FfiConverterSyncBatch{}

func (c FfiConverterSyncBatch) Lift(rb RustBufferI) SyncBatch {
	return LiftFromRustBuffer[SyncBatch](c, rb)
}

func (c FfiConverterSyncBatch) Read(reader io.Reader) SyncBatch {
	return SyncBatch{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterMapStringStringINSTANCE.Read(reader),
	}
}

func (c FfiConverterSyncBatch) Lower(value SyncBatch) C.RustBuffer {
	return LowerIntoRustBuffer[SyncBatch](c, value)
}

func (c FfiConverterSyncBatch) LowerExternal(value SyncBatch) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[SyncBatch](c, value))
}

func (c FfiConverterSyncBatch) Write(writer io.Writer, value SyncBatch) {
	FfiConverterStringINSTANCE.Write(writer, value.From)
	FfiConverterStringINSTANCE.Write(writer, value.To)
	FfiConverterStringINSTANCE.Write(writer, value.Body)
	FfiConverterMapStringStringINSTANCE.Write(writer, value.Decrypted)
}

type FfiDestroyerSyncBatch struct{}

func (_ FfiDestroyerSyncBatch) Destroy(value SyncBatch) {
	value.Destroy()
}

type SyncConfig struct {
	ConnId           string
	Lists            []SyncListConfig
	ToDevice         bool
	ToDeviceLimit    *uint32
	E2ee             bool
	Receipts         bool
	AccountData      bool
	Typing           bool
	PollTimeoutMs    uint64
	NetworkTimeoutMs uint64
}

func (r *SyncConfig) Destroy() {
	FfiDestroyerString{}.Destroy(r.ConnId)
	FfiDestroyerSequenceSyncListConfig{}.Destroy(r.Lists)
	FfiDestroyerBool{}.Destroy(r.ToDevice)
	FfiDestroyerOptionalUint32{}.Destroy(r.ToDeviceLimit)
	FfiDestroyerBool{}.Destroy(r.E2ee)
	FfiDestroyerBool{}.Destroy(r.Receipts)
	FfiDestroyerBool{}.Destroy(r.AccountData)
	FfiDestroyerBool{}.Destroy(r.Typing)
	FfiDestroyerUint64{}.Destroy(r.PollTimeoutMs)
	FfiDestroyerUint64{}.Destroy(r.NetworkTimeoutMs)
}

type FfiConverterSyncConfig struct{}

var FfiConverterSyncConfigINSTANCE = FfiConverterSyncConfig{}

func (c FfiConverterSyncConfig) Lift(rb RustBufferI) SyncConfig {
	return LiftFromRustBuffer[SyncConfig](c, rb)
}

func (c FfiConverterSyncConfig) Read(reader io.Reader) SyncConfig {
	return SyncConfig{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterSequenceSyncListConfigINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterOptionalUint32INSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterBoolINSTANCE.Read(reader),
		FfiConverterUint64INSTANCE.Read(reader),
		FfiConverterUint64INSTANCE.Read(reader),
	}
}

func (c FfiConverterSyncConfig) Lower(value SyncConfig) C.RustBuffer {
	return LowerIntoRustBuffer[SyncConfig](c, value)
}

func (c FfiConverterSyncConfig) LowerExternal(value SyncConfig) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[SyncConfig](c, value))
}

func (c FfiConverterSyncConfig) Write(writer io.Writer, value SyncConfig) {
	FfiConverterStringINSTANCE.Write(writer, value.ConnId)
	FfiConverterSequenceSyncListConfigINSTANCE.Write(writer, value.Lists)
	FfiConverterBoolINSTANCE.Write(writer, value.ToDevice)
	FfiConverterOptionalUint32INSTANCE.Write(writer, value.ToDeviceLimit)
	FfiConverterBoolINSTANCE.Write(writer, value.E2ee)
	FfiConverterBoolINSTANCE.Write(writer, value.Receipts)
	FfiConverterBoolINSTANCE.Write(writer, value.AccountData)
	FfiConverterBoolINSTANCE.Write(writer, value.Typing)
	FfiConverterUint64INSTANCE.Write(writer, value.PollTimeoutMs)
	FfiConverterUint64INSTANCE.Write(writer, value.NetworkTimeoutMs)
}

type FfiDestroyerSyncConfig struct{}

func (_ FfiDestroyerSyncConfig) Destroy(value SyncConfig) {
	value.Destroy()
}

type SyncListConfig struct {
	Name          string
	Ranges        []SyncRange
	RequiredState []StatePair
	TimelineLimit uint32
}

func (r *SyncListConfig) Destroy() {
	FfiDestroyerString{}.Destroy(r.Name)
	FfiDestroyerSequenceSyncRange{}.Destroy(r.Ranges)
	FfiDestroyerSequenceStatePair{}.Destroy(r.RequiredState)
	FfiDestroyerUint32{}.Destroy(r.TimelineLimit)
}

type FfiConverterSyncListConfig struct{}

var FfiConverterSyncListConfigINSTANCE = FfiConverterSyncListConfig{}

func (c FfiConverterSyncListConfig) Lift(rb RustBufferI) SyncListConfig {
	return LiftFromRustBuffer[SyncListConfig](c, rb)
}

func (c FfiConverterSyncListConfig) Read(reader io.Reader) SyncListConfig {
	return SyncListConfig{
		FfiConverterStringINSTANCE.Read(reader),
		FfiConverterSequenceSyncRangeINSTANCE.Read(reader),
		FfiConverterSequenceStatePairINSTANCE.Read(reader),
		FfiConverterUint32INSTANCE.Read(reader),
	}
}

func (c FfiConverterSyncListConfig) Lower(value SyncListConfig) C.RustBuffer {
	return LowerIntoRustBuffer[SyncListConfig](c, value)
}

func (c FfiConverterSyncListConfig) LowerExternal(value SyncListConfig) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[SyncListConfig](c, value))
}

func (c FfiConverterSyncListConfig) Write(writer io.Writer, value SyncListConfig) {
	FfiConverterStringINSTANCE.Write(writer, value.Name)
	FfiConverterSequenceSyncRangeINSTANCE.Write(writer, value.Ranges)
	FfiConverterSequenceStatePairINSTANCE.Write(writer, value.RequiredState)
	FfiConverterUint32INSTANCE.Write(writer, value.TimelineLimit)
}

type FfiDestroyerSyncListConfig struct{}

func (_ FfiDestroyerSyncListConfig) Destroy(value SyncListConfig) {
	value.Destroy()
}

type SyncRange struct {
	Start uint32
	End   uint32
}

func (r *SyncRange) Destroy() {
	FfiDestroyerUint32{}.Destroy(r.Start)
	FfiDestroyerUint32{}.Destroy(r.End)
}

type FfiConverterSyncRange struct{}

var FfiConverterSyncRangeINSTANCE = FfiConverterSyncRange{}

func (c FfiConverterSyncRange) Lift(rb RustBufferI) SyncRange {
	return LiftFromRustBuffer[SyncRange](c, rb)
}

func (c FfiConverterSyncRange) Read(reader io.Reader) SyncRange {
	return SyncRange{
		FfiConverterUint32INSTANCE.Read(reader),
		FfiConverterUint32INSTANCE.Read(reader),
	}
}

func (c FfiConverterSyncRange) Lower(value SyncRange) C.RustBuffer {
	return LowerIntoRustBuffer[SyncRange](c, value)
}

func (c FfiConverterSyncRange) LowerExternal(value SyncRange) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[SyncRange](c, value))
}

func (c FfiConverterSyncRange) Write(writer io.Writer, value SyncRange) {
	FfiConverterUint32INSTANCE.Write(writer, value.Start)
	FfiConverterUint32INSTANCE.Write(writer, value.End)
}

type FfiDestroyerSyncRange struct{}

func (_ FfiDestroyerSyncRange) Destroy(value SyncRange) {
	value.Destroy()
}

type CoreError struct {
	err error
}

func (err *CoreError) AsError() error {
	if err == nil {
		return nil
	} else {
		return err
	}
}

func (err CoreError) Error() string {
	return fmt.Sprintf("CoreError: %s", err.err.Error())
}

func (err CoreError) Unwrap() error {
	return err.err
}

var ErrCoreErrorApi = fmt.Errorf("CoreErrorApi")
var ErrCoreErrorTransport = fmt.Errorf("CoreErrorTransport")
var ErrCoreErrorGeneric = fmt.Errorf("CoreErrorGeneric")

type CoreErrorApi struct {
	Status uint16
	Body   string
}

func NewCoreErrorApi(
	status uint16,
	body string,
) *CoreError {
	return &CoreError{err: &CoreErrorApi{
		Status: status,
		Body:   body}}
}

func (e CoreErrorApi) destroy() {
	FfiDestroyerUint16{}.Destroy(e.Status)
	FfiDestroyerString{}.Destroy(e.Body)
}

func (err CoreErrorApi) Error() string {
	return fmt.Sprint("Api",
		": ",

		"Status=",
		err.Status,
		", ",
		"Body=",
		err.Body,
	)
}

func (self CoreErrorApi) Is(target error) bool {
	return target == ErrCoreErrorApi
}

type CoreErrorTransport struct {
	Message string
}

func NewCoreErrorTransport(
	message string,
) *CoreError {
	return &CoreError{err: &CoreErrorTransport{
		Message: message}}
}

func (e CoreErrorTransport) destroy() {
	FfiDestroyerString{}.Destroy(e.Message)
}

func (err CoreErrorTransport) Error() string {
	return fmt.Sprint("Transport",
		": ",

		"Message=",
		err.Message,
	)
}

func (self CoreErrorTransport) Is(target error) bool {
	return target == ErrCoreErrorTransport
}

type CoreErrorGeneric struct {
	Message string
}

func NewCoreErrorGeneric(
	message string,
) *CoreError {
	return &CoreError{err: &CoreErrorGeneric{
		Message: message}}
}

func (e CoreErrorGeneric) destroy() {
	FfiDestroyerString{}.Destroy(e.Message)
}

func (err CoreErrorGeneric) Error() string {
	return fmt.Sprint("Generic",
		": ",

		"Message=",
		err.Message,
	)
}

func (self CoreErrorGeneric) Is(target error) bool {
	return target == ErrCoreErrorGeneric
}

type FfiConverterCoreError struct{}

var FfiConverterCoreErrorINSTANCE = FfiConverterCoreError{}

func (c FfiConverterCoreError) Lift(eb RustBufferI) *CoreError {
	return LiftFromRustBuffer[*CoreError](c, eb)
}

func (c FfiConverterCoreError) Lower(value *CoreError) C.RustBuffer {
	return LowerIntoRustBuffer[*CoreError](c, value)
}

func (c FfiConverterCoreError) LowerExternal(value *CoreError) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[*CoreError](c, value))
}

func (c FfiConverterCoreError) Read(reader io.Reader) *CoreError {
	errorID := readUint32(reader)

	switch errorID {
	case 1:
		return &CoreError{&CoreErrorApi{
			Status: FfiConverterUint16INSTANCE.Read(reader),
			Body:   FfiConverterStringINSTANCE.Read(reader),
		}}
	case 2:
		return &CoreError{&CoreErrorTransport{
			Message: FfiConverterStringINSTANCE.Read(reader),
		}}
	case 3:
		return &CoreError{&CoreErrorGeneric{
			Message: FfiConverterStringINSTANCE.Read(reader),
		}}
	default:
		panic(fmt.Sprintf("Unknown error code %d in FfiConverterCoreError.Read()", errorID))
	}
}

func (c FfiConverterCoreError) Write(writer io.Writer, value *CoreError) {
	switch variantValue := value.err.(type) {
	case *CoreErrorApi:
		writeInt32(writer, 1)
		FfiConverterUint16INSTANCE.Write(writer, variantValue.Status)
		FfiConverterStringINSTANCE.Write(writer, variantValue.Body)
	case *CoreErrorTransport:
		writeInt32(writer, 2)
		FfiConverterStringINSTANCE.Write(writer, variantValue.Message)
	case *CoreErrorGeneric:
		writeInt32(writer, 3)
		FfiConverterStringINSTANCE.Write(writer, variantValue.Message)
	default:
		_ = variantValue
		panic(fmt.Sprintf("invalid error value `%v` in FfiConverterCoreError.Write", value))
	}
}

type FfiDestroyerCoreError struct{}

func (_ FfiDestroyerCoreError) Destroy(value *CoreError) {
	switch variantValue := value.err.(type) {
	case CoreErrorApi:
		variantValue.destroy()
	case CoreErrorTransport:
		variantValue.destroy()
	case CoreErrorGeneric:
		variantValue.destroy()
	default:
		_ = variantValue
		panic(fmt.Sprintf("invalid error value `%v` in FfiDestroyerCoreError.Destroy", value))
	}
}

type KeyImport interface {
	Destroy()
}
type KeyImportImported struct {
	HasMaster      bool
	HasSelfSigning bool
	HasUserSigning bool
}

func (e KeyImportImported) Destroy() {
	FfiDestroyerBool{}.Destroy(e.HasMaster)
	FfiDestroyerBool{}.Destroy(e.HasSelfSigning)
	FfiDestroyerBool{}.Destroy(e.HasUserSigning)
}

type KeyImportNotPublished struct {
}

func (e KeyImportNotPublished) Destroy() {
}

type KeyImportRejected struct {
	Reason string
}

func (e KeyImportRejected) Destroy() {
	FfiDestroyerString{}.Destroy(e.Reason)
}

type FfiConverterKeyImport struct{}

var FfiConverterKeyImportINSTANCE = FfiConverterKeyImport{}

func (c FfiConverterKeyImport) Lift(rb RustBufferI) KeyImport {
	return LiftFromRustBuffer[KeyImport](c, rb)
}

func (c FfiConverterKeyImport) Lower(value KeyImport) C.RustBuffer {
	return LowerIntoRustBuffer[KeyImport](c, value)
}

func (c FfiConverterKeyImport) LowerExternal(value KeyImport) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[KeyImport](c, value))
}
func (FfiConverterKeyImport) Read(reader io.Reader) KeyImport {
	id := readInt32(reader)
	switch id {
	case 1:
		return KeyImportImported{
			FfiConverterBoolINSTANCE.Read(reader),
			FfiConverterBoolINSTANCE.Read(reader),
			FfiConverterBoolINSTANCE.Read(reader),
		}
	case 2:
		return KeyImportNotPublished{}
	case 3:
		return KeyImportRejected{
			FfiConverterStringINSTANCE.Read(reader),
		}
	default:
		panic(fmt.Sprintf("invalid enum value %v in FfiConverterKeyImport.Read()", id))
	}
}

func (FfiConverterKeyImport) Write(writer io.Writer, value KeyImport) {
	switch variant_value := value.(type) {
	case KeyImportImported:
		writeInt32(writer, 1)
		FfiConverterBoolINSTANCE.Write(writer, variant_value.HasMaster)
		FfiConverterBoolINSTANCE.Write(writer, variant_value.HasSelfSigning)
		FfiConverterBoolINSTANCE.Write(writer, variant_value.HasUserSigning)
	case KeyImportNotPublished:
		writeInt32(writer, 2)
	case KeyImportRejected:
		writeInt32(writer, 3)
		FfiConverterStringINSTANCE.Write(writer, variant_value.Reason)
	default:
		_ = variant_value
		panic(fmt.Sprintf("invalid enum value `%v` in FfiConverterKeyImport.Write", value))
	}
}

type FfiDestroyerKeyImport struct{}

func (_ FfiDestroyerKeyImport) Destroy(value KeyImport) {
	value.Destroy()
}

type KeysPublish interface {
	Destroy()
}
type KeysPublishPublished struct {
}

func (e KeysPublishPublished) Destroy() {
}

type KeysPublishAuthRequired struct {
	Uiaa string
}

func (e KeysPublishAuthRequired) Destroy() {
	FfiDestroyerString{}.Destroy(e.Uiaa)
}

type KeysPublishApprovalRequired struct {
	Url string
}

func (e KeysPublishApprovalRequired) Destroy() {
	FfiDestroyerString{}.Destroy(e.Url)
}

type FfiConverterKeysPublish struct{}

var FfiConverterKeysPublishINSTANCE = FfiConverterKeysPublish{}

func (c FfiConverterKeysPublish) Lift(rb RustBufferI) KeysPublish {
	return LiftFromRustBuffer[KeysPublish](c, rb)
}

func (c FfiConverterKeysPublish) Lower(value KeysPublish) C.RustBuffer {
	return LowerIntoRustBuffer[KeysPublish](c, value)
}

func (c FfiConverterKeysPublish) LowerExternal(value KeysPublish) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[KeysPublish](c, value))
}
func (FfiConverterKeysPublish) Read(reader io.Reader) KeysPublish {
	id := readInt32(reader)
	switch id {
	case 1:
		return KeysPublishPublished{}
	case 2:
		return KeysPublishAuthRequired{
			FfiConverterStringINSTANCE.Read(reader),
		}
	case 3:
		return KeysPublishApprovalRequired{
			FfiConverterStringINSTANCE.Read(reader),
		}
	default:
		panic(fmt.Sprintf("invalid enum value %v in FfiConverterKeysPublish.Read()", id))
	}
}

func (FfiConverterKeysPublish) Write(writer io.Writer, value KeysPublish) {
	switch variant_value := value.(type) {
	case KeysPublishPublished:
		writeInt32(writer, 1)
	case KeysPublishAuthRequired:
		writeInt32(writer, 2)
		FfiConverterStringINSTANCE.Write(writer, variant_value.Uiaa)
	case KeysPublishApprovalRequired:
		writeInt32(writer, 3)
		FfiConverterStringINSTANCE.Write(writer, variant_value.Url)
	default:
		_ = variant_value
		panic(fmt.Sprintf("invalid enum value `%v` in FfiConverterKeysPublish.Write", value))
	}
}

type FfiDestroyerKeysPublish struct{}

func (_ FfiDestroyerKeysPublish) Destroy(value KeysPublish) {
	value.Destroy()
}

type SendQueueListener interface {
	OnUpdate(payloadJson string)
}

type FfiConverterCallbackInterfaceSendQueueListener struct {
	handleMap *concurrentHandleMap[SendQueueListener]
}

var FfiConverterCallbackInterfaceSendQueueListenerINSTANCE = FfiConverterCallbackInterfaceSendQueueListener{
	handleMap: newConcurrentHandleMap[SendQueueListener](),
}

func (c FfiConverterCallbackInterfaceSendQueueListener) Lift(handle uint64) SendQueueListener {
	val, ok := c.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}
	return val
}

func (c FfiConverterCallbackInterfaceSendQueueListener) Read(reader io.Reader) SendQueueListener {
	return c.Lift(readUint64(reader))
}

func (c FfiConverterCallbackInterfaceSendQueueListener) Lower(value SendQueueListener) C.uint64_t {
	return C.uint64_t(c.handleMap.insert(value))
}

func (c FfiConverterCallbackInterfaceSendQueueListener) Write(writer io.Writer, value SendQueueListener) {
	writeUint64(writer, uint64(c.Lower(value)))
}

func LiftFromExternalCallbackInterfaceSendQueueListener(handle uint64) SendQueueListener {
	return FfiConverterCallbackInterfaceSendQueueListenerINSTANCE.Lift(handle)
}

func LowerToExternalCallbackInterfaceSendQueueListener(value SendQueueListener) uint64 {
	return uint64(FfiConverterCallbackInterfaceSendQueueListenerINSTANCE.Lower(value))
}

type FfiDestroyerCallbackInterfaceSendQueueListener struct{}

func (FfiDestroyerCallbackInterfaceSendQueueListener) Destroy(value SendQueueListener) {}

type uniffiCallbackResult C.int8_t

const (
	uniffiIdxCallbackFree               uniffiCallbackResult = 0
	uniffiCallbackResultSuccess         uniffiCallbackResult = 0
	uniffiCallbackResultError           uniffiCallbackResult = 1
	uniffiCallbackUnexpectedResultError uniffiCallbackResult = 2
	uniffiCallbackCancelled             uniffiCallbackResult = 3
)

type concurrentHandleMap[T any] struct {
	handles       map[uint64]T
	currentHandle uint64
	lock          sync.RWMutex
}

func newConcurrentHandleMap[T any]() *concurrentHandleMap[T] {
	return &concurrentHandleMap[T]{
		handles:       map[uint64]T{},
		currentHandle: 1,
	}
}

func (cm *concurrentHandleMap[T]) insert(obj T) uint64 {
	cm.lock.Lock()
	defer cm.lock.Unlock()

	handle := cm.currentHandle
	cm.currentHandle = cm.currentHandle + 2
	cm.handles[handle] = obj
	return handle
}

func (cm *concurrentHandleMap[T]) remove(handle uint64) {
	cm.lock.Lock()
	defer cm.lock.Unlock()

	delete(cm.handles, handle)
}

func (cm *concurrentHandleMap[T]) tryGet(handle uint64) (T, bool) {
	cm.lock.RLock()
	defer cm.lock.RUnlock()

	val, ok := cm.handles[handle]
	return val, ok
}

//export zigzag_rustcore_send_queue_cgo_dispatchCallbackInterfaceSendQueueListenerMethod0
func zigzag_rustcore_send_queue_cgo_dispatchCallbackInterfaceSendQueueListenerMethod0(uniffiHandle C.uint64_t, payloadJson C.RustBuffer, uniffiOutReturn *C.void, callStatus *C.RustCallStatus) {
	handle := uint64(uniffiHandle)
	uniffiObj, ok := FfiConverterCallbackInterfaceSendQueueListenerINSTANCE.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}

	uniffiObj.OnUpdate(
		FfiConverterStringINSTANCE.Lift(GoRustBuffer{
			inner: payloadJson,
		}),
	)

}

var UniffiVTableCallbackInterfaceSendQueueListenerINSTANCE = C.UniffiVTableCallbackInterfaceSendQueueListener{
	uniffiFree:  (C.UniffiCallbackInterfaceFree)(C.zigzag_rustcore_send_queue_cgo_dispatchCallbackInterfaceSendQueueListenerFree),
	uniffiClone: (C.UniffiCallbackInterfaceClone)(C.zigzag_rustcore_send_queue_cgo_dispatchCallbackInterfaceSendQueueListenerClone),
	onUpdate:    (C.UniffiCallbackInterfaceSendQueueListenerMethod0)(C.zigzag_rustcore_send_queue_cgo_dispatchCallbackInterfaceSendQueueListenerMethod0),
}

//export zigzag_rustcore_send_queue_cgo_dispatchCallbackInterfaceSendQueueListenerFree
func zigzag_rustcore_send_queue_cgo_dispatchCallbackInterfaceSendQueueListenerFree(handle C.uint64_t) {
	FfiConverterCallbackInterfaceSendQueueListenerINSTANCE.handleMap.remove(uint64(handle))
}

//export zigzag_rustcore_send_queue_cgo_dispatchCallbackInterfaceSendQueueListenerClone
func zigzag_rustcore_send_queue_cgo_dispatchCallbackInterfaceSendQueueListenerClone(handle C.uint64_t) C.uint64_t {
	val, ok := FfiConverterCallbackInterfaceSendQueueListenerINSTANCE.handleMap.tryGet(uint64(handle))
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}
	return C.uint64_t(FfiConverterCallbackInterfaceSendQueueListenerINSTANCE.handleMap.insert(val))
}

func (c FfiConverterCallbackInterfaceSendQueueListener) register() {
	C.uniffi_zigzag_rustcore_fn_init_callback_vtable_sendqueuelistener(&UniffiVTableCallbackInterfaceSendQueueListenerINSTANCE)
}

type SyncListener interface {
	OnBatch(batch SyncBatch)
}

type FfiConverterCallbackInterfaceSyncListener struct {
	handleMap *concurrentHandleMap[SyncListener]
}

var FfiConverterCallbackInterfaceSyncListenerINSTANCE = FfiConverterCallbackInterfaceSyncListener{
	handleMap: newConcurrentHandleMap[SyncListener](),
}

func (c FfiConverterCallbackInterfaceSyncListener) Lift(handle uint64) SyncListener {
	val, ok := c.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}
	return val
}

func (c FfiConverterCallbackInterfaceSyncListener) Read(reader io.Reader) SyncListener {
	return c.Lift(readUint64(reader))
}

func (c FfiConverterCallbackInterfaceSyncListener) Lower(value SyncListener) C.uint64_t {
	return C.uint64_t(c.handleMap.insert(value))
}

func (c FfiConverterCallbackInterfaceSyncListener) Write(writer io.Writer, value SyncListener) {
	writeUint64(writer, uint64(c.Lower(value)))
}

func LiftFromExternalCallbackInterfaceSyncListener(handle uint64) SyncListener {
	return FfiConverterCallbackInterfaceSyncListenerINSTANCE.Lift(handle)
}

func LowerToExternalCallbackInterfaceSyncListener(value SyncListener) uint64 {
	return uint64(FfiConverterCallbackInterfaceSyncListenerINSTANCE.Lower(value))
}

type FfiDestroyerCallbackInterfaceSyncListener struct{}

func (FfiDestroyerCallbackInterfaceSyncListener) Destroy(value SyncListener) {}

//export zigzag_rustcore_sync_cgo_dispatchCallbackInterfaceSyncListenerMethod0
func zigzag_rustcore_sync_cgo_dispatchCallbackInterfaceSyncListenerMethod0(uniffiHandle C.uint64_t, batch C.RustBuffer, uniffiOutReturn *C.void, callStatus *C.RustCallStatus) {
	handle := uint64(uniffiHandle)
	uniffiObj, ok := FfiConverterCallbackInterfaceSyncListenerINSTANCE.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}

	uniffiObj.OnBatch(
		FfiConverterSyncBatchINSTANCE.Lift(GoRustBuffer{
			inner: batch,
		}),
	)

}

var UniffiVTableCallbackInterfaceSyncListenerINSTANCE = C.UniffiVTableCallbackInterfaceSyncListener{
	uniffiFree:  (C.UniffiCallbackInterfaceFree)(C.zigzag_rustcore_sync_cgo_dispatchCallbackInterfaceSyncListenerFree),
	uniffiClone: (C.UniffiCallbackInterfaceClone)(C.zigzag_rustcore_sync_cgo_dispatchCallbackInterfaceSyncListenerClone),
	onBatch:     (C.UniffiCallbackInterfaceSyncListenerMethod0)(C.zigzag_rustcore_sync_cgo_dispatchCallbackInterfaceSyncListenerMethod0),
}

//export zigzag_rustcore_sync_cgo_dispatchCallbackInterfaceSyncListenerFree
func zigzag_rustcore_sync_cgo_dispatchCallbackInterfaceSyncListenerFree(handle C.uint64_t) {
	FfiConverterCallbackInterfaceSyncListenerINSTANCE.handleMap.remove(uint64(handle))
}

//export zigzag_rustcore_sync_cgo_dispatchCallbackInterfaceSyncListenerClone
func zigzag_rustcore_sync_cgo_dispatchCallbackInterfaceSyncListenerClone(handle C.uint64_t) C.uint64_t {
	val, ok := FfiConverterCallbackInterfaceSyncListenerINSTANCE.handleMap.tryGet(uint64(handle))
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}
	return C.uint64_t(FfiConverterCallbackInterfaceSyncListenerINSTANCE.handleMap.insert(val))
}

func (c FfiConverterCallbackInterfaceSyncListener) register() {
	C.uniffi_zigzag_rustcore_fn_init_callback_vtable_synclistener(&UniffiVTableCallbackInterfaceSyncListenerINSTANCE)
}

type VerificationListener interface {
	OnRequest(payloadJson string)

	OnReady(payloadJson string)

	OnSas(payloadJson string)

	OnDone(payloadJson string)

	OnCancelled(payloadJson string)
}

type FfiConverterCallbackInterfaceVerificationListener struct {
	handleMap *concurrentHandleMap[VerificationListener]
}

var FfiConverterCallbackInterfaceVerificationListenerINSTANCE = FfiConverterCallbackInterfaceVerificationListener{
	handleMap: newConcurrentHandleMap[VerificationListener](),
}

func (c FfiConverterCallbackInterfaceVerificationListener) Lift(handle uint64) VerificationListener {
	val, ok := c.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}
	return val
}

func (c FfiConverterCallbackInterfaceVerificationListener) Read(reader io.Reader) VerificationListener {
	return c.Lift(readUint64(reader))
}

func (c FfiConverterCallbackInterfaceVerificationListener) Lower(value VerificationListener) C.uint64_t {
	return C.uint64_t(c.handleMap.insert(value))
}

func (c FfiConverterCallbackInterfaceVerificationListener) Write(writer io.Writer, value VerificationListener) {
	writeUint64(writer, uint64(c.Lower(value)))
}

func LiftFromExternalCallbackInterfaceVerificationListener(handle uint64) VerificationListener {
	return FfiConverterCallbackInterfaceVerificationListenerINSTANCE.Lift(handle)
}

func LowerToExternalCallbackInterfaceVerificationListener(value VerificationListener) uint64 {
	return uint64(FfiConverterCallbackInterfaceVerificationListenerINSTANCE.Lower(value))
}

type FfiDestroyerCallbackInterfaceVerificationListener struct{}

func (FfiDestroyerCallbackInterfaceVerificationListener) Destroy(value VerificationListener) {}

//export zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod0
func zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod0(uniffiHandle C.uint64_t, payloadJson C.RustBuffer, uniffiOutReturn *C.void, callStatus *C.RustCallStatus) {
	handle := uint64(uniffiHandle)
	uniffiObj, ok := FfiConverterCallbackInterfaceVerificationListenerINSTANCE.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}

	uniffiObj.OnRequest(
		FfiConverterStringINSTANCE.Lift(GoRustBuffer{
			inner: payloadJson,
		}),
	)

}

//export zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod1
func zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod1(uniffiHandle C.uint64_t, payloadJson C.RustBuffer, uniffiOutReturn *C.void, callStatus *C.RustCallStatus) {
	handle := uint64(uniffiHandle)
	uniffiObj, ok := FfiConverterCallbackInterfaceVerificationListenerINSTANCE.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}

	uniffiObj.OnReady(
		FfiConverterStringINSTANCE.Lift(GoRustBuffer{
			inner: payloadJson,
		}),
	)

}

//export zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod2
func zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod2(uniffiHandle C.uint64_t, payloadJson C.RustBuffer, uniffiOutReturn *C.void, callStatus *C.RustCallStatus) {
	handle := uint64(uniffiHandle)
	uniffiObj, ok := FfiConverterCallbackInterfaceVerificationListenerINSTANCE.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}

	uniffiObj.OnSas(
		FfiConverterStringINSTANCE.Lift(GoRustBuffer{
			inner: payloadJson,
		}),
	)

}

//export zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod3
func zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod3(uniffiHandle C.uint64_t, payloadJson C.RustBuffer, uniffiOutReturn *C.void, callStatus *C.RustCallStatus) {
	handle := uint64(uniffiHandle)
	uniffiObj, ok := FfiConverterCallbackInterfaceVerificationListenerINSTANCE.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}

	uniffiObj.OnDone(
		FfiConverterStringINSTANCE.Lift(GoRustBuffer{
			inner: payloadJson,
		}),
	)

}

//export zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod4
func zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod4(uniffiHandle C.uint64_t, payloadJson C.RustBuffer, uniffiOutReturn *C.void, callStatus *C.RustCallStatus) {
	handle := uint64(uniffiHandle)
	uniffiObj, ok := FfiConverterCallbackInterfaceVerificationListenerINSTANCE.handleMap.tryGet(handle)
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}

	uniffiObj.OnCancelled(
		FfiConverterStringINSTANCE.Lift(GoRustBuffer{
			inner: payloadJson,
		}),
	)

}

var UniffiVTableCallbackInterfaceVerificationListenerINSTANCE = C.UniffiVTableCallbackInterfaceVerificationListener{
	uniffiFree:  (C.UniffiCallbackInterfaceFree)(C.zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerFree),
	uniffiClone: (C.UniffiCallbackInterfaceClone)(C.zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerClone),
	onRequest:   (C.UniffiCallbackInterfaceVerificationListenerMethod0)(C.zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod0),
	onReady:     (C.UniffiCallbackInterfaceVerificationListenerMethod1)(C.zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod1),
	onSas:       (C.UniffiCallbackInterfaceVerificationListenerMethod2)(C.zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod2),
	onDone:      (C.UniffiCallbackInterfaceVerificationListenerMethod3)(C.zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod3),
	onCancelled: (C.UniffiCallbackInterfaceVerificationListenerMethod4)(C.zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerMethod4),
}

//export zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerFree
func zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerFree(handle C.uint64_t) {
	FfiConverterCallbackInterfaceVerificationListenerINSTANCE.handleMap.remove(uint64(handle))
}

//export zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerClone
func zigzag_rustcore_trust_cgo_dispatchCallbackInterfaceVerificationListenerClone(handle C.uint64_t) C.uint64_t {
	val, ok := FfiConverterCallbackInterfaceVerificationListenerINSTANCE.handleMap.tryGet(uint64(handle))
	if !ok {
		panic(fmt.Errorf("no callback in handle map: %d", handle))
	}
	return C.uint64_t(FfiConverterCallbackInterfaceVerificationListenerINSTANCE.handleMap.insert(val))
}

func (c FfiConverterCallbackInterfaceVerificationListener) register() {
	C.uniffi_zigzag_rustcore_fn_init_callback_vtable_verificationlistener(&UniffiVTableCallbackInterfaceVerificationListenerINSTANCE)
}

type FfiConverterOptionalUint32 struct{}

var FfiConverterOptionalUint32INSTANCE = FfiConverterOptionalUint32{}

func (c FfiConverterOptionalUint32) Lift(rb RustBufferI) *uint32 {
	return LiftFromRustBuffer[*uint32](c, rb)
}

func (_ FfiConverterOptionalUint32) Read(reader io.Reader) *uint32 {
	if readInt8(reader) == 0 {
		return nil
	}
	temp := FfiConverterUint32INSTANCE.Read(reader)
	return &temp
}

func (c FfiConverterOptionalUint32) Lower(value *uint32) C.RustBuffer {
	return LowerIntoRustBuffer[*uint32](c, value)
}

func (c FfiConverterOptionalUint32) LowerExternal(value *uint32) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[*uint32](c, value))
}

func (_ FfiConverterOptionalUint32) Write(writer io.Writer, value *uint32) {
	if value == nil {
		writeInt8(writer, 0)
	} else {
		writeInt8(writer, 1)
		FfiConverterUint32INSTANCE.Write(writer, *value)
	}
}

type FfiDestroyerOptionalUint32 struct{}

func (_ FfiDestroyerOptionalUint32) Destroy(value *uint32) {
	if value != nil {
		FfiDestroyerUint32{}.Destroy(*value)
	}
}

type FfiConverterOptionalString struct{}

var FfiConverterOptionalStringINSTANCE = FfiConverterOptionalString{}

func (c FfiConverterOptionalString) Lift(rb RustBufferI) *string {
	return LiftFromRustBuffer[*string](c, rb)
}

func (_ FfiConverterOptionalString) Read(reader io.Reader) *string {
	if readInt8(reader) == 0 {
		return nil
	}
	temp := FfiConverterStringINSTANCE.Read(reader)
	return &temp
}

func (c FfiConverterOptionalString) Lower(value *string) C.RustBuffer {
	return LowerIntoRustBuffer[*string](c, value)
}

func (c FfiConverterOptionalString) LowerExternal(value *string) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[*string](c, value))
}

func (_ FfiConverterOptionalString) Write(writer io.Writer, value *string) {
	if value == nil {
		writeInt8(writer, 0)
	} else {
		writeInt8(writer, 1)
		FfiConverterStringINSTANCE.Write(writer, *value)
	}
}

type FfiDestroyerOptionalString struct{}

func (_ FfiDestroyerOptionalString) Destroy(value *string) {
	if value != nil {
		FfiDestroyerString{}.Destroy(*value)
	}
}

type FfiConverterOptionalAttachmentSize struct{}

var FfiConverterOptionalAttachmentSizeINSTANCE = FfiConverterOptionalAttachmentSize{}

func (c FfiConverterOptionalAttachmentSize) Lift(rb RustBufferI) *AttachmentSize {
	return LiftFromRustBuffer[*AttachmentSize](c, rb)
}

func (_ FfiConverterOptionalAttachmentSize) Read(reader io.Reader) *AttachmentSize {
	if readInt8(reader) == 0 {
		return nil
	}
	temp := FfiConverterAttachmentSizeINSTANCE.Read(reader)
	return &temp
}

func (c FfiConverterOptionalAttachmentSize) Lower(value *AttachmentSize) C.RustBuffer {
	return LowerIntoRustBuffer[*AttachmentSize](c, value)
}

func (c FfiConverterOptionalAttachmentSize) LowerExternal(value *AttachmentSize) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[*AttachmentSize](c, value))
}

func (_ FfiConverterOptionalAttachmentSize) Write(writer io.Writer, value *AttachmentSize) {
	if value == nil {
		writeInt8(writer, 0)
	} else {
		writeInt8(writer, 1)
		FfiConverterAttachmentSizeINSTANCE.Write(writer, *value)
	}
}

type FfiDestroyerOptionalAttachmentSize struct{}

func (_ FfiDestroyerOptionalAttachmentSize) Destroy(value *AttachmentSize) {
	if value != nil {
		FfiDestroyerAttachmentSize{}.Destroy(*value)
	}
}

type FfiConverterOptionalAttachmentThumbnail struct{}

var FfiConverterOptionalAttachmentThumbnailINSTANCE = FfiConverterOptionalAttachmentThumbnail{}

func (c FfiConverterOptionalAttachmentThumbnail) Lift(rb RustBufferI) *AttachmentThumbnail {
	return LiftFromRustBuffer[*AttachmentThumbnail](c, rb)
}

func (_ FfiConverterOptionalAttachmentThumbnail) Read(reader io.Reader) *AttachmentThumbnail {
	if readInt8(reader) == 0 {
		return nil
	}
	temp := FfiConverterAttachmentThumbnailINSTANCE.Read(reader)
	return &temp
}

func (c FfiConverterOptionalAttachmentThumbnail) Lower(value *AttachmentThumbnail) C.RustBuffer {
	return LowerIntoRustBuffer[*AttachmentThumbnail](c, value)
}

func (c FfiConverterOptionalAttachmentThumbnail) LowerExternal(value *AttachmentThumbnail) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[*AttachmentThumbnail](c, value))
}

func (_ FfiConverterOptionalAttachmentThumbnail) Write(writer io.Writer, value *AttachmentThumbnail) {
	if value == nil {
		writeInt8(writer, 0)
	} else {
		writeInt8(writer, 1)
		FfiConverterAttachmentThumbnailINSTANCE.Write(writer, *value)
	}
}

type FfiDestroyerOptionalAttachmentThumbnail struct{}

func (_ FfiDestroyerOptionalAttachmentThumbnail) Destroy(value *AttachmentThumbnail) {
	if value != nil {
		FfiDestroyerAttachmentThumbnail{}.Destroy(*value)
	}
}

type FfiConverterOptionalCrossSigningKeys struct{}

var FfiConverterOptionalCrossSigningKeysINSTANCE = FfiConverterOptionalCrossSigningKeys{}

func (c FfiConverterOptionalCrossSigningKeys) Lift(rb RustBufferI) *CrossSigningKeys {
	return LiftFromRustBuffer[*CrossSigningKeys](c, rb)
}

func (_ FfiConverterOptionalCrossSigningKeys) Read(reader io.Reader) *CrossSigningKeys {
	if readInt8(reader) == 0 {
		return nil
	}
	temp := FfiConverterCrossSigningKeysINSTANCE.Read(reader)
	return &temp
}

func (c FfiConverterOptionalCrossSigningKeys) Lower(value *CrossSigningKeys) C.RustBuffer {
	return LowerIntoRustBuffer[*CrossSigningKeys](c, value)
}

func (c FfiConverterOptionalCrossSigningKeys) LowerExternal(value *CrossSigningKeys) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[*CrossSigningKeys](c, value))
}

func (_ FfiConverterOptionalCrossSigningKeys) Write(writer io.Writer, value *CrossSigningKeys) {
	if value == nil {
		writeInt8(writer, 0)
	} else {
		writeInt8(writer, 1)
		FfiConverterCrossSigningKeysINSTANCE.Write(writer, *value)
	}
}

type FfiDestroyerOptionalCrossSigningKeys struct{}

func (_ FfiDestroyerOptionalCrossSigningKeys) Destroy(value *CrossSigningKeys) {
	if value != nil {
		FfiDestroyerCrossSigningKeys{}.Destroy(*value)
	}
}

type FfiConverterOptionalSessionData struct{}

var FfiConverterOptionalSessionDataINSTANCE = FfiConverterOptionalSessionData{}

func (c FfiConverterOptionalSessionData) Lift(rb RustBufferI) *SessionData {
	return LiftFromRustBuffer[*SessionData](c, rb)
}

func (_ FfiConverterOptionalSessionData) Read(reader io.Reader) *SessionData {
	if readInt8(reader) == 0 {
		return nil
	}
	temp := FfiConverterSessionDataINSTANCE.Read(reader)
	return &temp
}

func (c FfiConverterOptionalSessionData) Lower(value *SessionData) C.RustBuffer {
	return LowerIntoRustBuffer[*SessionData](c, value)
}

func (c FfiConverterOptionalSessionData) LowerExternal(value *SessionData) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[*SessionData](c, value))
}

func (_ FfiConverterOptionalSessionData) Write(writer io.Writer, value *SessionData) {
	if value == nil {
		writeInt8(writer, 0)
	} else {
		writeInt8(writer, 1)
		FfiConverterSessionDataINSTANCE.Write(writer, *value)
	}
}

type FfiDestroyerOptionalSessionData struct{}

func (_ FfiDestroyerOptionalSessionData) Destroy(value *SessionData) {
	if value != nil {
		FfiDestroyerSessionData{}.Destroy(*value)
	}
}

type FfiConverterSequenceString struct{}

var FfiConverterSequenceStringINSTANCE = FfiConverterSequenceString{}

func (c FfiConverterSequenceString) Lift(rb RustBufferI) []string {
	return LiftFromRustBuffer[[]string](c, rb)
}

func (c FfiConverterSequenceString) Read(reader io.Reader) []string {
	length := readInt32(reader)
	if length == 0 {
		return nil
	}
	result := make([]string, 0, length)
	for i := int32(0); i < length; i++ {
		result = append(result, FfiConverterStringINSTANCE.Read(reader))
	}
	return result
}

func (c FfiConverterSequenceString) Lower(value []string) C.RustBuffer {
	return LowerIntoRustBuffer[[]string](c, value)
}

func (c FfiConverterSequenceString) LowerExternal(value []string) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[[]string](c, value))
}

func (c FfiConverterSequenceString) Write(writer io.Writer, value []string) {
	if len(value) > math.MaxInt32 {
		panic("[]string is too large to fit into Int32")
	}

	writeInt32(writer, int32(len(value)))
	for _, item := range value {
		FfiConverterStringINSTANCE.Write(writer, item)
	}
}

type FfiDestroyerSequenceString struct{}

func (FfiDestroyerSequenceString) Destroy(sequence []string) {
	for _, value := range sequence {
		FfiDestroyerString{}.Destroy(value)
	}
}

type FfiConverterSequenceKnownRoom struct{}

var FfiConverterSequenceKnownRoomINSTANCE = FfiConverterSequenceKnownRoom{}

func (c FfiConverterSequenceKnownRoom) Lift(rb RustBufferI) []KnownRoom {
	return LiftFromRustBuffer[[]KnownRoom](c, rb)
}

func (c FfiConverterSequenceKnownRoom) Read(reader io.Reader) []KnownRoom {
	length := readInt32(reader)
	if length == 0 {
		return nil
	}
	result := make([]KnownRoom, 0, length)
	for i := int32(0); i < length; i++ {
		result = append(result, FfiConverterKnownRoomINSTANCE.Read(reader))
	}
	return result
}

func (c FfiConverterSequenceKnownRoom) Lower(value []KnownRoom) C.RustBuffer {
	return LowerIntoRustBuffer[[]KnownRoom](c, value)
}

func (c FfiConverterSequenceKnownRoom) LowerExternal(value []KnownRoom) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[[]KnownRoom](c, value))
}

func (c FfiConverterSequenceKnownRoom) Write(writer io.Writer, value []KnownRoom) {
	if len(value) > math.MaxInt32 {
		panic("[]KnownRoom is too large to fit into Int32")
	}

	writeInt32(writer, int32(len(value)))
	for _, item := range value {
		FfiConverterKnownRoomINSTANCE.Write(writer, item)
	}
}

type FfiDestroyerSequenceKnownRoom struct{}

func (FfiDestroyerSequenceKnownRoom) Destroy(sequence []KnownRoom) {
	for _, value := range sequence {
		FfiDestroyerKnownRoom{}.Destroy(value)
	}
}

type FfiConverterSequenceOwnDevice struct{}

var FfiConverterSequenceOwnDeviceINSTANCE = FfiConverterSequenceOwnDevice{}

func (c FfiConverterSequenceOwnDevice) Lift(rb RustBufferI) []OwnDevice {
	return LiftFromRustBuffer[[]OwnDevice](c, rb)
}

func (c FfiConverterSequenceOwnDevice) Read(reader io.Reader) []OwnDevice {
	length := readInt32(reader)
	if length == 0 {
		return nil
	}
	result := make([]OwnDevice, 0, length)
	for i := int32(0); i < length; i++ {
		result = append(result, FfiConverterOwnDeviceINSTANCE.Read(reader))
	}
	return result
}

func (c FfiConverterSequenceOwnDevice) Lower(value []OwnDevice) C.RustBuffer {
	return LowerIntoRustBuffer[[]OwnDevice](c, value)
}

func (c FfiConverterSequenceOwnDevice) LowerExternal(value []OwnDevice) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[[]OwnDevice](c, value))
}

func (c FfiConverterSequenceOwnDevice) Write(writer io.Writer, value []OwnDevice) {
	if len(value) > math.MaxInt32 {
		panic("[]OwnDevice is too large to fit into Int32")
	}

	writeInt32(writer, int32(len(value)))
	for _, item := range value {
		FfiConverterOwnDeviceINSTANCE.Write(writer, item)
	}
}

type FfiDestroyerSequenceOwnDevice struct{}

func (FfiDestroyerSequenceOwnDevice) Destroy(sequence []OwnDevice) {
	for _, value := range sequence {
		FfiDestroyerOwnDevice{}.Destroy(value)
	}
}

type FfiConverterSequenceStatePair struct{}

var FfiConverterSequenceStatePairINSTANCE = FfiConverterSequenceStatePair{}

func (c FfiConverterSequenceStatePair) Lift(rb RustBufferI) []StatePair {
	return LiftFromRustBuffer[[]StatePair](c, rb)
}

func (c FfiConverterSequenceStatePair) Read(reader io.Reader) []StatePair {
	length := readInt32(reader)
	if length == 0 {
		return nil
	}
	result := make([]StatePair, 0, length)
	for i := int32(0); i < length; i++ {
		result = append(result, FfiConverterStatePairINSTANCE.Read(reader))
	}
	return result
}

func (c FfiConverterSequenceStatePair) Lower(value []StatePair) C.RustBuffer {
	return LowerIntoRustBuffer[[]StatePair](c, value)
}

func (c FfiConverterSequenceStatePair) LowerExternal(value []StatePair) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[[]StatePair](c, value))
}

func (c FfiConverterSequenceStatePair) Write(writer io.Writer, value []StatePair) {
	if len(value) > math.MaxInt32 {
		panic("[]StatePair is too large to fit into Int32")
	}

	writeInt32(writer, int32(len(value)))
	for _, item := range value {
		FfiConverterStatePairINSTANCE.Write(writer, item)
	}
}

type FfiDestroyerSequenceStatePair struct{}

func (FfiDestroyerSequenceStatePair) Destroy(sequence []StatePair) {
	for _, value := range sequence {
		FfiDestroyerStatePair{}.Destroy(value)
	}
}

type FfiConverterSequenceSyncListConfig struct{}

var FfiConverterSequenceSyncListConfigINSTANCE = FfiConverterSequenceSyncListConfig{}

func (c FfiConverterSequenceSyncListConfig) Lift(rb RustBufferI) []SyncListConfig {
	return LiftFromRustBuffer[[]SyncListConfig](c, rb)
}

func (c FfiConverterSequenceSyncListConfig) Read(reader io.Reader) []SyncListConfig {
	length := readInt32(reader)
	if length == 0 {
		return nil
	}
	result := make([]SyncListConfig, 0, length)
	for i := int32(0); i < length; i++ {
		result = append(result, FfiConverterSyncListConfigINSTANCE.Read(reader))
	}
	return result
}

func (c FfiConverterSequenceSyncListConfig) Lower(value []SyncListConfig) C.RustBuffer {
	return LowerIntoRustBuffer[[]SyncListConfig](c, value)
}

func (c FfiConverterSequenceSyncListConfig) LowerExternal(value []SyncListConfig) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[[]SyncListConfig](c, value))
}

func (c FfiConverterSequenceSyncListConfig) Write(writer io.Writer, value []SyncListConfig) {
	if len(value) > math.MaxInt32 {
		panic("[]SyncListConfig is too large to fit into Int32")
	}

	writeInt32(writer, int32(len(value)))
	for _, item := range value {
		FfiConverterSyncListConfigINSTANCE.Write(writer, item)
	}
}

type FfiDestroyerSequenceSyncListConfig struct{}

func (FfiDestroyerSequenceSyncListConfig) Destroy(sequence []SyncListConfig) {
	for _, value := range sequence {
		FfiDestroyerSyncListConfig{}.Destroy(value)
	}
}

type FfiConverterSequenceSyncRange struct{}

var FfiConverterSequenceSyncRangeINSTANCE = FfiConverterSequenceSyncRange{}

func (c FfiConverterSequenceSyncRange) Lift(rb RustBufferI) []SyncRange {
	return LiftFromRustBuffer[[]SyncRange](c, rb)
}

func (c FfiConverterSequenceSyncRange) Read(reader io.Reader) []SyncRange {
	length := readInt32(reader)
	if length == 0 {
		return nil
	}
	result := make([]SyncRange, 0, length)
	for i := int32(0); i < length; i++ {
		result = append(result, FfiConverterSyncRangeINSTANCE.Read(reader))
	}
	return result
}

func (c FfiConverterSequenceSyncRange) Lower(value []SyncRange) C.RustBuffer {
	return LowerIntoRustBuffer[[]SyncRange](c, value)
}

func (c FfiConverterSequenceSyncRange) LowerExternal(value []SyncRange) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[[]SyncRange](c, value))
}

func (c FfiConverterSequenceSyncRange) Write(writer io.Writer, value []SyncRange) {
	if len(value) > math.MaxInt32 {
		panic("[]SyncRange is too large to fit into Int32")
	}

	writeInt32(writer, int32(len(value)))
	for _, item := range value {
		FfiConverterSyncRangeINSTANCE.Write(writer, item)
	}
}

type FfiDestroyerSequenceSyncRange struct{}

func (FfiDestroyerSequenceSyncRange) Destroy(sequence []SyncRange) {
	for _, value := range sequence {
		FfiDestroyerSyncRange{}.Destroy(value)
	}
}

type FfiConverterMapStringString struct{}

var FfiConverterMapStringStringINSTANCE = FfiConverterMapStringString{}

func (c FfiConverterMapStringString) Lift(rb RustBufferI) map[string]string {
	return LiftFromRustBuffer[map[string]string](c, rb)
}

func (_ FfiConverterMapStringString) Read(reader io.Reader) map[string]string {
	result := make(map[string]string)
	length := readInt32(reader)
	for i := int32(0); i < length; i++ {
		key := FfiConverterStringINSTANCE.Read(reader)
		value := FfiConverterStringINSTANCE.Read(reader)
		result[key] = value
	}
	return result
}

func (c FfiConverterMapStringString) Lower(value map[string]string) C.RustBuffer {
	return LowerIntoRustBuffer[map[string]string](c, value)
}

func (c FfiConverterMapStringString) LowerExternal(value map[string]string) ExternalCRustBuffer {
	return RustBufferFromC(LowerIntoRustBuffer[map[string]string](c, value))
}

func (_ FfiConverterMapStringString) Write(writer io.Writer, mapValue map[string]string) {
	if len(mapValue) > math.MaxInt32 {
		panic("map[string]string is too large to fit into Int32")
	}

	writeInt32(writer, int32(len(mapValue)))
	for key, value := range mapValue {
		FfiConverterStringINSTANCE.Write(writer, key)
		FfiConverterStringINSTANCE.Write(writer, value)
	}
}

type FfiDestroyerMapStringString struct{}

func (_ FfiDestroyerMapStringString) Destroy(mapValue map[string]string) {
	for key, value := range mapValue {
		FfiDestroyerString{}.Destroy(key)
		FfiDestroyerString{}.Destroy(value)
	}
}

const (
	uniffiRustFuturePollReady      int8 = 0
	uniffiRustFuturePollMaybeReady int8 = 1
)

type rustFuturePollFunc func(C.uint64_t, C.UniffiRustFutureContinuationCallback, C.uint64_t)
type rustFutureCompleteFunc[T any] func(C.uint64_t, *C.RustCallStatus) T
type rustFutureFreeFunc func(C.uint64_t)

//export rustcore_uniffiFutureContinuationCallback
func rustcore_uniffiFutureContinuationCallback(data C.uint64_t, pollResult C.int8_t) {
	h := cgo.Handle(uintptr(data))
	waiter := h.Value().(chan int8)
	waiter <- int8(pollResult)
}

func uniffiRustCallAsync[E any, T any, F any](
	errConverter BufReader[E],
	completeFunc rustFutureCompleteFunc[F],
	liftFunc func(F) T,
	rustFuture C.uint64_t,
	pollFunc rustFuturePollFunc,
	freeFunc rustFutureFreeFunc,
) (T, E) {
	defer freeFunc(rustFuture)

	pollResult := int8(-1)
	waiter := make(chan int8, 1)

	chanHandle := cgo.NewHandle(waiter)
	defer chanHandle.Delete()

	for pollResult != uniffiRustFuturePollReady {
		pollFunc(
			rustFuture,
			(C.UniffiRustFutureContinuationCallback)(C.rustcore_uniffiFutureContinuationCallback),
			C.uint64_t(chanHandle),
		)
		pollResult = <-waiter
	}

	var goValue T
	ffiValue, err := rustCallWithError(errConverter, func(status *C.RustCallStatus) F {
		return completeFunc(rustFuture, status)
	})
	if value := reflect.ValueOf(err); value.IsValid() && !value.IsZero() {
		return goValue, err
	}
	return liftFunc(ffiValue), err
}

//export rustcore_uniffiFreeGorutine
func rustcore_uniffiFreeGorutine(data C.uint64_t) {
	handle := cgo.Handle(uintptr(data))
	defer handle.Delete()

	guard := handle.Value().(chan struct{})
	guard <- struct{}{}
}

func CoreSqliteVersion() SqliteVersion {
	return FfiConverterSqliteVersionINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) RustBufferI {
		return GoRustBuffer{
			inner: C.uniffi_zigzag_rustcore_fn_func_core_sqlite_version(_uniffiStatus),
		}
	}))
}

func CoreVersion() string {
	return FfiConverterStringINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) RustBufferI {
		return GoRustBuffer{
			inner: C.uniffi_zigzag_rustcore_fn_func_core_version(_uniffiStatus),
		}
	}))
}

func EnableTracing(filter string) *string {
	return FfiConverterOptionalStringINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) RustBufferI {
		return GoRustBuffer{
			inner: C.uniffi_zigzag_rustcore_fn_func_enable_tracing(FfiConverterStringINSTANCE.Lower(filter), _uniffiStatus),
		}
	}))
}

func LoginPassword(store StoreConfig, server string, username string, password string, deviceDisplayName string) (*Core, error) {
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) C.uint64_t {
			res := C.ffi_zigzag_rustcore_rust_future_complete_u64(handle, status)
			return res
		},

		func(ffi C.uint64_t) *Core {
			return FfiConverterCoreINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_func_login_password(FfiConverterStoreConfigINSTANCE.Lower(store), FfiConverterStringINSTANCE.Lower(server), FfiConverterStringINSTANCE.Lower(username), FfiConverterStringINSTANCE.Lower(password), FfiConverterStringINSTANCE.Lower(deviceDisplayName)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_u64(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_u64(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func RegisterWithToken(store StoreConfig, server string, username string, password string, token string, deviceDisplayName string) (*Core, error) {
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) C.uint64_t {
			res := C.ffi_zigzag_rustcore_rust_future_complete_u64(handle, status)
			return res
		},

		func(ffi C.uint64_t) *Core {
			return FfiConverterCoreINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_func_register_with_token(FfiConverterStoreConfigINSTANCE.Lower(store), FfiConverterStringINSTANCE.Lower(server), FfiConverterStringINSTANCE.Lower(username), FfiConverterStringINSTANCE.Lower(password), FfiConverterStringINSTANCE.Lower(token), FfiConverterStringINSTANCE.Lower(deviceDisplayName)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_u64(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_u64(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func RestoreSession(store StoreConfig, session SessionData) (*Core, error) {
	res, err := uniffiRustCallAsync[*CoreError](
		FfiConverterCoreErrorINSTANCE,

		func(handle C.uint64_t, status *C.RustCallStatus) C.uint64_t {
			res := C.ffi_zigzag_rustcore_rust_future_complete_u64(handle, status)
			return res
		},

		func(ffi C.uint64_t) *Core {
			return FfiConverterCoreINSTANCE.Lift(ffi)
		},
		C.uniffi_zigzag_rustcore_fn_func_restore_session(FfiConverterStoreConfigINSTANCE.Lower(store), FfiConverterSessionDataINSTANCE.Lower(session)),

		func(handle C.uint64_t, continuation C.UniffiRustFutureContinuationCallback, data C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_poll_u64(handle, continuation, data)
		},

		func(handle C.uint64_t) {
			C.ffi_zigzag_rustcore_rust_future_free_u64(handle)
		},
	)

	if err == nil {
		return res, nil
	}

	return res, err
}

func FfiSelftestSendQueuePayloads() []string {
	return FfiConverterSequenceStringINSTANCE.Lift(rustCall(func(_uniffiStatus *C.RustCallStatus) RustBufferI {
		return GoRustBuffer{
			inner: C.uniffi_zigzag_rustcore_fn_func_ffi_selftest_send_queue_payloads(_uniffiStatus),
		}
	}))
}

func FfiSelftestVerification(listener VerificationListener, rounds uint32) {
	rustCall(func(_uniffiStatus *C.RustCallStatus) bool {
		C.uniffi_zigzag_rustcore_fn_func_ffi_selftest_verification(FfiConverterCallbackInterfaceVerificationListenerINSTANCE.Lower(listener), FfiConverterUint32INSTANCE.Lower(rounds), _uniffiStatus)
		return false
	})
}

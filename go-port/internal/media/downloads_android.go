//go:build android

package media

/*
#include <jni.h>
#include <stdlib.h>

// The definitions live in downloads_android_jni.go: cgo forbids definitions in
// the preamble of a file that carries an //export directive.
extern void zigzagCacheDownloadsJNI(JNIEnv*, jclass);
extern char* zigzagCallSaveToDownloads(const char*);
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"os"
	"unsafe"

	"github.com/klauss/zigzag-go/internal/platform"
)

//export Java_com_wails_app_WailsBridge_nativeRegisterDownloads
func Java_com_wails_app_WailsBridge_nativeRegisterDownloads(env *C.JNIEnv, clazz C.jclass) {
	C.zigzagCacheDownloadsJNI(env, clazz)
}

func platformDownloadDirectory(string) string {
	directory, err := platform.UserCacheDir()
	if err != nil {
		return ""
	}
	return directory
}

func publishDownload(path, name string) (string, error) {
	defer func() { _ = os.Remove(path) }()
	payload, err := json.Marshal(struct {
		Path string `json:"path"`
		Name string `json:"name"`
		Mime string `json:"mime"`
	}{Path: path, Name: name, Mime: mimeTypeForName(name)})
	if err != nil {
		return "", fmt.Errorf("media: encode the download request: %w", err)
	}
	request := C.CString(string(payload))
	defer C.free(unsafe.Pointer(request))
	result := C.zigzagCallSaveToDownloads(request)
	if result == nil {
		return "", fmt.Errorf("media: save %s: the android bridge is unavailable", name)
	}
	defer C.free(unsafe.Pointer(result))
	destination := C.GoString(result)
	if destination == "" {
		return "", fmt.Errorf("media: save %s: android refused the download", name)
	}
	return destination, nil
}

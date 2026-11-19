package application

import "sync/atomic"

var nativeFileDrop atomic.Pointer[func(paths []string)]

func OnNativeFileDrop(hook func(paths []string)) {
	if hook == nil {
		nativeFileDrop.Store(nil)
		return
	}
	nativeFileDrop.Store(&hook)
}

func notifyNativeFileDrop(paths []string) {
	if hook := nativeFileDrop.Load(); hook != nil {
		(*hook)(paths)
	}
}

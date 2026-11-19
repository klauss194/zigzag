//go:build android

package media

/*
#include <jni.h>
#include <stdlib.h>
#include <string.h>

// JNI handles cached at Activity startup by
// Java_com_wails_app_WailsBridge_nativeRegisterDownloads (downloads_android.go).
// They survive for the process lifetime, which is the point: the registration
// call is the one moment a Java thread is in control, and a class global taken
// then is the only way a later Go thread can reach WailsBridge at all.
static JavaVM* zigzagJVM = NULL;
static jclass zigzagBridgeClass = NULL;
static jmethodID zigzagSaveMethod = NULL;

// zigzagEnv borrows or attaches the current thread and reports whether it
// attached it, so the caller knows to detach.
static JNIEnv* zigzagEnv(int* detach) {
	*detach = 0;
	if (zigzagJVM == NULL) {
		return NULL;
	}
	JNIEnv* env = NULL;
	jint result = (*zigzagJVM)->GetEnv(zigzagJVM, (void**)&env, JNI_VERSION_1_6);
	if (result == JNI_EDETACHED) {
		if ((*zigzagJVM)->AttachCurrentThread(zigzagJVM, &env, NULL) != 0) {
			return NULL;
		}
		*detach = 1;
	} else if (result != JNI_OK) {
		return NULL;
	}
	return env;
}

void zigzagCacheDownloadsJNI(JNIEnv* env, jclass clazz) {
	if (env == NULL || clazz == NULL) {
		return;
	}
	(*env)->GetJavaVM(env, &zigzagJVM);
	if (zigzagBridgeClass != NULL) {
		(*env)->DeleteGlobalRef(env, zigzagBridgeClass);
	}
	zigzagBridgeClass = (*env)->NewGlobalRef(env, clazz);
	zigzagSaveMethod = (*env)->GetStaticMethodID(env, zigzagBridgeClass,
			"saveToDownloads", "(Ljava/lang/String;)Ljava/lang/String;");
}

// zigzagCallSaveToDownloads answers a malloc'd string the caller frees, or NULL
// when the bridge is not ready. An empty string is a refusal the Go side names.
char* zigzagCallSaveToDownloads(const char* json) {
	if (zigzagJVM == NULL || zigzagBridgeClass == NULL || zigzagSaveMethod == NULL) {
		return NULL;
	}
	int detach = 0;
	JNIEnv* env = zigzagEnv(&detach);
	if (env == NULL) {
		return NULL;
	}
	char* answer = NULL;
	jstring request = (*env)->NewStringUTF(env, json);
	jstring result = (jstring)(*env)->CallStaticObjectMethod(
			env, zigzagBridgeClass, zigzagSaveMethod, request);
	if ((*env)->ExceptionCheck(env)) {
		(*env)->ExceptionDescribe(env);
		(*env)->ExceptionClear(env);
	} else if (result != NULL) {
		const char* chars = (*env)->GetStringUTFChars(env, result, NULL);
		if (chars != NULL) {
			answer = strdup(chars);
			(*env)->ReleaseStringUTFChars(env, result, chars);
		}
	}
	if (result != NULL) {
		(*env)->DeleteLocalRef(env, result);
	}
	if (request != NULL) {
		(*env)->DeleteLocalRef(env, request);
	}
	if (detach) {
		(*zigzagJVM)->DetachCurrentThread(zigzagJVM);
	}
	return answer;
}
*/
import "C"

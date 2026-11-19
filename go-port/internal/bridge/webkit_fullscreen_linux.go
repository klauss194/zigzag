//go:build linux && cgo && !gtk3 && !android && !server

package bridge

/*
#cgo pkg-config: gtk4 webkitgtk-6.0
#include <webkit/webkit.h>

// The window's web view. Wails puts it in a box under the GtkWindow (windowNew
// in pkg/application/linux_cgo.go), so look through the widget tree.
static WebKitWebView *find_web_view(GtkWidget *widget) {
	if (WEBKIT_IS_WEB_VIEW(widget)) return WEBKIT_WEB_VIEW(widget);
	for (GtkWidget *child = gtk_widget_get_first_child(widget); child; child = gtk_widget_get_next_sibling(child)) {
		WebKitWebView *found = find_web_view(child);
		if (found) return found;
	}
	return NULL;
}

static int turn_off_fullscreen(void *window) {
	WebKitWebView *view = find_web_view(GTK_WIDGET(window));
	if (!view) return 0;
	webkit_settings_set_enable_fullscreen(webkit_web_view_get_settings(view), FALSE);
	return 1;
}
*/
import "C"

import "github.com/wailsapp/wails/v3/pkg/application"

func turnOffWebKitFullscreen(window application.Window) {
	application.InvokeAsync(func() {
		native := window.NativeWindow()
		if native == nil {
			return
		}
		if C.turn_off_fullscreen(native) == 0 {
			mediaLog.Warn().Msg("webkit fullscreen: no web view in the window, the video fullscreen button stays")
		}
	})
}

package bridge

import (
	"bytes"
	"encoding/json"
	"io/fs"
	"net/http"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/klauss/zigzag-go/frontend"
)

var startPageDir, startPageDirErr = fs.Sub(frontend.Assets, "dist")

func NewStartPageMiddleware(peekUserID func() string) application.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			isRead := r.Method == http.MethodGet || r.Method == http.MethodHead
			if !isRead || (r.URL.Path != "/" && r.URL.Path != "/index.html") || startPageDirErr != nil {
				next.ServeHTTP(w, r)
				return
			}

			page, err := fs.ReadFile(startPageDir, "index.html")
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			var script string
			if userID := peekUserID(); userID != "" {
				script = "history.replaceState(null,\"\"," + jsString(mainURL(userID)) + ")"
			} else {
				script = "location.replace(" + jsString(loginURL()) + ")"
			}

			injected := bytes.Replace(page, []byte("<head>"),
				[]byte("<head><script>"+script+"</script>"), 1)

			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(injected)
		})
	}
}

func jsString(s string) string {
	encoded, _ := json.Marshal(s)
	return string(encoded)
}

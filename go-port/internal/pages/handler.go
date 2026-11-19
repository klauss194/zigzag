package pages

import (
	"bytes"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/trace"
)

var builtFiles = map[string]bool{
	"index.bundle.js":  true,
	"index.bundle.css": true,

	"index.bundle.js.map":  true,
	"index.bundle.css.map": true,
}

type Options struct {
	Pack []byte

	Next http.Handler
}

type Pages struct {
	next  http.Handler
	build *builder
	log   zerolog.Logger
}

func New(o Options) *Pages {
	log := trace.Log("pages")
	p := &Pages{next: o.Next, build: newBuilder(o.Pack, log), log: log}
	go func() { _, _ = p.build.page() }()
	return p
}

func (p *Pages) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if isMainPage(path) {
		p.serveMainPage(w)
		return
	}
	name := strings.TrimPrefix(path, "/")
	if builtFiles[name] {
		p.serveBuilt(w, r, name)
		return
	}
	p.next.ServeHTTP(w, r)
}

func isMainPage(p string) bool {
	return p == "/" || p == "/index.html" || p == "/workspace" || strings.HasPrefix(p, "/workspace/")
}

func (p *Pages) serveMainPage(w http.ResponseWriter) {
	page, err := p.build.page()
	if err != nil {
		p.log.Error().Err(err).Msg("main page")
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(page.files["index.html"])
}

func (p *Pages) serveBuilt(w http.ResponseWriter, r *http.Request, name string) {
	page, err := p.build.page()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	data, ok := page.files[name]
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")

	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}

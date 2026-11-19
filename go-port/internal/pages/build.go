package pages

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/rs/zerolog"

	"github.com/klauss/zigzag-go/internal/frontendbuild"
)

const routesDefine = "__ZZ_ROUTES__"

type mainPage struct {
	files map[string][]byte
}

type builder struct {
	pack []byte
	log  zerolog.Logger

	mu    sync.Mutex
	meta  frontendbuild.PackMeta
	base  *frontendbuild.Sources
	built *mainPage
}

func newBuilder(pack []byte, log zerolog.Logger) *builder {
	return &builder{pack: pack, log: log}
}

func (b *builder) page() (*mainPage, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.built != nil {
		return b.built, nil
	}
	if err := b.loadBase(); err != nil {
		return nil, err
	}
	result, err := b.run(b.base, Defaults)
	if err != nil {
		for _, d := range result.Diags {
			b.log.Error().Str("at", d.String()).Msg("main page build")
		}
		return nil, fmt.Errorf("building the app's own main page: %w", err)
	}
	b.log.Info().Dur("took", result.Took).Msg("main page built")
	b.built = &mainPage{files: result.Files}
	return b.built, nil
}

func (b *builder) loadBase() error {
	if b.base != nil {
		return nil
	}
	if len(b.pack) == 0 {
		return errors.New("the binary has no frontend source pack — run `npm run build` in go-port/frontend, then rebuild")
	}
	meta, src, err := frontendbuild.ReadPack(bytes.NewReader(b.pack))
	if err != nil {
		return fmt.Errorf("the app's frontend source: %w", err)
	}
	b.meta, b.base = meta, src
	return nil
}

func (b *builder) run(src *frontendbuild.Sources, routes []Route) (frontendbuild.Result, error) {

	table, err := json.Marshal(routes)
	if err != nil {
		return frontendbuild.Result{}, fmt.Errorf("route table: %w", err)
	}
	o := b.meta.RebuildOptions(src, "index")
	o.Define = map[string]string{routesDefine: string(table)}
	return frontendbuild.Build(o)
}

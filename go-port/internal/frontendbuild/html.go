package frontendbuild

import (
	"bytes"
	"fmt"
)

func renderPage(template []byte, name string, withCSS bool) ([]byte, error) {
	page := template
	if withCSS {
		var err error
		link := fmt.Sprintf(`<link rel="stylesheet" href="/%s.bundle.css">`, name)
		if page, err = insertBefore(page, "</head>", link); err != nil {
			return nil, fmt.Errorf("page %s: %w", name, err)
		}
	}
	script := fmt.Sprintf(`<script type="module" src="/%s.bundle.js"></script>`, name)
	page, err := insertBefore(page, "</body>", script)
	if err != nil {
		return nil, fmt.Errorf("page %s: %w", name, err)
	}
	return page, nil
}

func insertBefore(page []byte, tag, text string) ([]byte, error) {
	at := bytes.LastIndex(page, []byte(tag))
	if at < 0 {
		return nil, fmt.Errorf("template has no %s", tag)
	}
	out := make([]byte, 0, len(page)+len(text))
	out = append(out, page[:at]...)
	out = append(out, text...)
	out = append(out, page[at:]...)
	return out, nil
}

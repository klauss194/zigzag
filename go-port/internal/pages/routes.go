package pages

type Route struct {
	Path   string         `json:"path"`
	Screen string         `json:"screen"`
	Props  map[string]any `json:"props,omitempty"`
}

var Defaults = []Route{
	{Path: "/workspace/board", Screen: "zz-board", Props: map[string]any{"active": true}},
}

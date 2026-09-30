package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func withTempStore(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, "settings.json")
	orig := storePath
	storePath = func() (string, error) {
		return p, nil
	}
	t.Cleanup(func() {
		storePath = orig
	})
	return p
}

// TestDefaultSettings verifies first launch (file missing) defaults to dark, wrap=true, math=true.
func TestDefaultSettings(t *testing.T) {
	withTempStore(t)
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	want := Settings{
		Theme:           "dark",
		Wrap:            true,
		Math:            true,
		PreviewFont:     "Cascadia Code",
		WindowWidth:     DefaultWindowWidth,
		WindowHeight:    DefaultWindowHeight,
		WindowMaximized: false,
	}
	if s != want {
		t.Fatalf("default settings = %+v, want %+v", s, want)
	}
}

// TestSaveReload verifies saved settings survive a reload.
func TestSaveReload(t *testing.T) {
	withTempStore(t)
	want := Settings{
		Theme:           "light",
		Wrap:            false,
		Math:            false,
		PreviewFont:     "Cascadia Code",
		WindowWidth:     1440,
		WindowHeight:    900,
		WindowMaximized: true,
	}
	if err := Save(want); err != nil {
		t.Fatalf("save: %v", err)
	}
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s != want {
		t.Fatalf("settings = %+v, want %+v", s, want)
	}
}

// TestPreserveUnrelatedKeys verifies Save preserves other keys (e.g. lastfile).
func TestPreserveUnrelatedKeys(t *testing.T) {
	p := withTempStore(t)
	initial := map[string]any{
		"lastfile": "/tmp/x.md",
		"theme":    "dark",
	}
	b, err := json.Marshal(initial)
	if err != nil {
		t.Fatalf("marshal initial: %v", err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatalf("write initial: %v", err)
	}

	if err := Save(Settings{
		Theme:           "light",
		Wrap:            false,
		Math:            true,
		WindowWidth:     DefaultWindowWidth,
		WindowHeight:    DefaultWindowHeight,
		WindowMaximized: false,
	}); err != nil {
		t.Fatalf("save: %v", err)
	}

	data, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read store: %v", err)
	}
	var store map[string]any
	if err := json.Unmarshal(data, &store); err != nil {
		t.Fatalf("unmarshal store: %v", err)
	}
	if store["lastfile"] != "/tmp/x.md" {
		t.Fatalf("lastfile lost or corrupted: got %v, want /tmp/x.md", store["lastfile"])
	}
	if store["theme"] != "light" || store["wrap"] != false || store["math"] != true {
		t.Fatalf("saved values mismatch: got %v", store)
	}
}

// TestTypeMismatchFallback verifies invalid value types fall back to defaults without error.
func TestTypeMismatchFallback(t *testing.T) {
	p := withTempStore(t)
	invalid := map[string]any{
		"theme":           123,
		"wrap":            "yes",
		"math":            nil,
		"windowWidth":     "wide",
		"windowHeight":    200.0,
		"windowMaximized": "notabool",
	}
	b, err := json.Marshal(invalid)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	s, err := Load()
	if err != nil {
		t.Fatalf("load with corrupt types returned error: %v", err)
	}
	want := Settings{
		Theme:           "dark",
		Wrap:            true,
		Math:            true,
		PreviewFont:     DefaultPreviewFont,
		WindowWidth:     DefaultWindowWidth,
		WindowHeight:    DefaultWindowHeight,
		WindowMaximized: false,
	}
	if s != want {
		t.Fatalf("fallback settings = %+v, want %+v", s, want)
	}
}

// TestDefaultSettingsPreviewFont verifies the default preview font is Cascadia Code.
func TestDefaultSettingsPreviewFont(t *testing.T) {
	withTempStore(t)
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s.PreviewFont != "Cascadia Code" {
		t.Fatalf("default preview font = %q, want %q", s.PreviewFont, "Cascadia Code")
	}
}

// TestSaveReloadPreviewFont verifies the preview font survives a save/reload cycle.
func TestSaveReloadPreviewFont(t *testing.T) {
	withTempStore(t)
	want := Settings{
		Theme:           "dark",
		Wrap:            true,
		Math:            true,
		PreviewFont:     "JetBrains Mono",
		WindowWidth:     DefaultWindowWidth,
		WindowHeight:    DefaultWindowHeight,
		WindowMaximized: false,
	}
	if err := Save(want); err != nil {
		t.Fatalf("save: %v", err)
	}
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s != want {
		t.Fatalf("settings = %+v, want %+v", s, want)
	}
}

// TestLoadRejectsInvalidFont verifies an invalid stored previewFont falls back to the default.
func TestLoadRejectsInvalidFont(t *testing.T) {
	p := withTempStore(t)
	invalid := map[string]any{
		"theme":       "dark",
		"wrap":        true,
		"math":        true,
		"previewFont": ",serif",
	}
	b, err := json.Marshal(invalid)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s.PreviewFont != DefaultPreviewFont {
		t.Fatalf("invalid font fallback = %q, want %q", s.PreviewFont, DefaultPreviewFont)
	}
}

// TestNormalizePreviewFont verifies the validation rules: trimming, legal
// names, and the rejected classes (empty, over-long, control chars, CSS
// structure separators).
func TestNormalizePreviewFont(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{name: "simple", in: "Cascadia Code", want: "Cascadia Code"},
		{name: "trim", in: "  Fira Code  ", want: "Fira Code"},
		{name: "empty", in: "", wantErr: true},
		{name: "spaces", in: "   ", wantErr: true},
		{name: "overlong", in: string(make([]byte, MaxPreviewFontLen+1)), wantErr: true},
		{name: "control", in: "A\x00B", wantErr: true},
		{name: "newline", in: "A\nB", wantErr: true},
		{name: "doubleQuote", in: `A"B`, wantErr: true},
		{name: "backslash", in: `A\B`, wantErr: true},
		{name: "comma", in: "A,B", wantErr: true},
		{name: "semicolon", in: "A;B", wantErr: true},
		{name: "comment", in: "A/*x*/B", wantErr: true},
		{name: "brace", in: "A{B}", wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizePreviewFont(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("NormalizePreviewFont(%q) = %q, want error", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("NormalizePreviewFont(%q) error: %v", tc.in, err)
			}
			if got != tc.want {
				t.Fatalf("NormalizePreviewFont(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestPath verifies Path returns non-empty path.
func TestPath(t *testing.T) {
	p := withTempStore(t)
	got, err := Path()
	if err != nil {
		t.Fatalf("Path(): %v", err)
	}
	if got != p {
		t.Fatalf("Path() = %q, want %q", got, p)
	}
}

// TestWindowSettings verifies loading valid float64 window metrics and clamping/fallback.
func TestWindowSettings(t *testing.T) {
	p := withTempStore(t)
	raw := map[string]any{
		"windowWidth":     float64(1024),
		"windowHeight":    float64(768),
		"windowMaximized": true,
	}
	b, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s.WindowWidth != 1024 || s.WindowHeight != 768 || !s.WindowMaximized {
		t.Fatalf("unexpected window settings: got width=%d, height=%d, max=%v", s.WindowWidth, s.WindowHeight, s.WindowMaximized)
	}

	// Below minimum size falls back to default.
	tooSmall := map[string]any{
		"windowWidth":     float64(300),
		"windowHeight":    float64(200),
		"windowMaximized": false,
	}
	b, err = json.Marshal(tooSmall)
	if err != nil {
		t.Fatalf("marshal tooSmall: %v", err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatalf("write tooSmall: %v", err)
	}

	s, err = Load()
	if err != nil {
		t.Fatalf("load tooSmall: %v", err)
	}
	if s.WindowWidth != DefaultWindowWidth || s.WindowHeight != DefaultWindowHeight || s.WindowMaximized {
		t.Fatalf("tooSmall should fall back to default: got width=%d, height=%d, max=%v", s.WindowWidth, s.WindowHeight, s.WindowMaximized)
	}
}

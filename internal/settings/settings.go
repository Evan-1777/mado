// Package settings persists user preferences (theme, wrap, math, preview font)
// into the shared settings.json file in the executable directory alongside the
// filesys lastfile record.
package settings

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

const (
	// AppDir is the legacy directory name under %APPDATA% for Mado state.
	AppDir = "Mado"

	// JSON keys for persisted settings.
	themeKey       = "theme"
	wrapKey        = "wrap"
	mathKey        = "math"
	previewFontKey = "previewFont"

	// Default values for preferences.
	DefaultTheme       = "dark"
	DefaultWrap        = true
	DefaultMath        = true
	DefaultPreviewFont = "Cascadia Code"

	// MaxPreviewFontLen is the maximum accepted length of a preview font name.
	MaxPreviewFontLen = 100
)

// Settings holds user preferences persisted to disk.
type Settings struct {
	Theme       string
	Wrap        bool
	Math        bool
	PreviewFont string
}

// FontRejected is returned by NormalizePreviewFont when the input is not a
// valid single font name.
var FontRejected = errors.New("settings: invalid preview font")

// NormalizePreviewFont trims surrounding whitespace and validates the font
// name. It rejects empty values, over-long values, control characters and CSS
// structure separators so a user-supplied value can never escape the font
// declaration in the composed preview CSS. It returns the trimmed name on
// success.
func NormalizePreviewFont(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", FontRejected
	}
	if len(name) > MaxPreviewFontLen {
		return "", FontRejected
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return "", FontRejected
		}
		// Double quote, backslash, comma and semicolon terminate declarations
		// or entries in a font-family list; these break out of the quoted
		// string in the generated CSS.
		if r == '"' || r == '\\' || r == ',' || r == ';' {
			return "", FontRejected
		}
	}
	// CSS comments, at-rules and declaration blocks.
	if strings.ContainsAny(name, "/*{}@") {
		return "", FontRejected
	}
	return name, nil
}

// defaultStorePath returns the settings.json path next to the executable.
func defaultStorePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "settings.json"), nil
}

// storePath is overridable in tests to prevent writing next to test binaries.
var storePath = defaultStorePath

// Path returns the shared settings JSON path.
func Path() (string, error) {
	return storePath()
}

// Default returns the default user preferences.
func Default() Settings {
	return Settings{
		Theme:       DefaultTheme,
		Wrap:        DefaultWrap,
		Math:        DefaultMath,
		PreviewFont: DefaultPreviewFont,
	}
}

// Load reads the persisted settings. A missing or corrupt file falls back to
// defaults and never errors.
func Load() (Settings, error) {
	s := Default()
	path, err := storePath()
	if err != nil {
		return s, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return s, nil
		}
		return s, err
	}
	var store map[string]any
	if err := json.Unmarshal(data, &store); err != nil {
		// Corrupt store: fall back to defaults.
		return s, nil
	}
	if theme, ok := store[themeKey].(string); ok && theme != "" {
		s.Theme = theme
	}
	if wrap, ok := store[wrapKey].(bool); ok {
		s.Wrap = wrap
	}
	if math, ok := store[mathKey].(bool); ok {
		s.Math = math
	}
	if font, ok := store[previewFontKey].(string); ok {
		// Legacy or manually edited invalid font values fall back to the default.
		if valid, err := NormalizePreviewFont(font); err == nil {
			s.PreviewFont = valid
		}
	}
	return s, nil
}

// Save persists the settings, preserving unrelated top-level keys (e.g. the
// filesys lastfile record) already present in the shared JSON file.
func Save(s Settings) error {
	path, err := storePath()
	if err != nil {
		return err
	}
	store := map[string]any{}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &store)
	}
	if store == nil {
		store = map[string]any{}
	}
	store[themeKey] = s.Theme
	store[wrapKey] = s.Wrap
	store[mathKey] = s.Math
	store[previewFontKey] = s.PreviewFont
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// Package settings persists user preferences (theme, wrap, math) into the shared
// settings.json file in the executable directory alongside the filesys lastfile record.
package settings

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

const (
	// AppDir is the legacy directory name under %APPDATA% for Mado state.
	AppDir = "Mado"

	// JSON keys for persisted settings.
	themeKey = "theme"
	wrapKey  = "wrap"
	mathKey  = "math"

	// Default values for preferences.
	DefaultTheme = "dark"
	DefaultWrap  = true
	DefaultMath  = true
)

// Settings holds user preferences persisted to disk.
type Settings struct {
	Theme string
	Wrap  bool
	Math  bool
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
		Theme: DefaultTheme,
		Wrap:  DefaultWrap,
		Math:  DefaultMath,
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
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

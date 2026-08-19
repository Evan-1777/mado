// Package settings persists user preferences (theme) into the shared
// %APPDATA%/Mado/settings.json file alongside the filesys lastfile record.
package settings

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

const (
	// AppDir is the directory name under %APPDATA% for all Mado state.
	// It must match filesys.AppDir so both packages share one JSON file.
	AppDir = "Mado"

	// themeKey is the top-level JSON key for the active theme.
	themeKey = "theme"

	// DefaultTheme is used when no persisted value exists.
	DefaultTheme = "dark"

	// DefaultWordWrap controls whether the editor wraps long lines.
	DefaultWordWrap = true

	// DefaultMath controls whether LaTeX math is rendered.
	DefaultMath = true
)

// Settings holds user preferences persisted to disk.
type Settings struct {
	Theme    string `json:"Theme"`
	WordWrap bool   `json:"WordWrap"`
	Math     bool   `json:"Math"`
}

// settingsPath returns the shared settings JSON path.
func settingsPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, AppDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "settings.json"), nil
}

// Load reads the persisted settings. A missing or corrupt file falls back to
// defaults and never errors.
func Load() (Settings, error) {
	s := Settings{Theme: DefaultTheme, WordWrap: DefaultWordWrap, Math: DefaultMath}
	path, err := settingsPath()
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
	if v, ok := store[themeKey]; ok {
		if str, ok := v.(string); ok && str != "" {
			s.Theme = str
		}
	}
	if v, ok := store["wordWrap"]; ok {
		if b, ok := v.(bool); ok {
			s.WordWrap = b
		}
	}
	if v, ok := store["math"]; ok {
		if b, ok := v.(bool); ok {
			s.Math = b
		}
	}
	return s, nil
}

// Save persists the settings, preserving unrelated top-level keys (e.g. the
// filesys lastfile record) already present in the shared JSON file.
func Save(s Settings) error {
	path, err := settingsPath()
	if err != nil {
		return err
	}
	store := map[string]any{}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &store)
	}
	store[themeKey] = s.Theme
	store["wordWrap"] = s.WordWrap
	store["math"] = s.Math
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// Package filesys handles file I/O and last-file persistence for Mado.
package filesys

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

const (
	// AppDir is the directory name used under %APPDATA% for all Mado state.
	AppDir = "Mado"

	// lastFileKey is the top-level JSON key shared with the settings package.
	lastFileKey = "lastfile"

	// WelcomeDoc is the default document shown on first launch.
	WelcomeDoc = "# Welcome to Mado\n\n" +
		"A lightweight native Markdown editor for Windows.\n\n" +
		"## Quick tour\n\n" +
		"- **Edit on the left** — the preview updates as you type.\n" +
		"- **Press `Ctrl+S`** to save, `Ctrl+O` to open, `Ctrl+N` for a new file.\n" +
		"- **Toggle theme** from the title bar, on the right.\n\n" +
		"## It supports\n\n" +
		"| Feature | Syntax |\n" +
		"|---------|--------|\n" +
		"| Bold | **text** |\n" +
		"| Inline code | `code` |\n" +
		"| Keyboard keys | Press <kbd>Ctrl</kbd> + <kbd>S</kbd> |\n" +
		"| Task list | - [ ] todo / - [x] done |\n" +
		"| Raw HTML | <div>custom blocks</div> |\n\n" +
		"> Try editing this file — the preview updates live.\n"
)

// appDataDir returns the Mado state directory under %APPDATA%, creating it if needed.
func appDataDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, AppDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// settingsPath returns the shared settings JSON path.
func settingsPath() (string, error) {
	dir, err := appDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "settings.json"), nil
}

// ReadFile returns the content of the file at path.
func ReadFile(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// WriteFile writes content to path, returning an error on failure
// (permissions, disk full, ...).
func WriteFile(path, content string) error {
	return os.WriteFile(path, []byte(content), 0o644)
}

// GetLastFile returns the persisted last-opened file path, or the welcome
// document (persisted to disk so the preview has a real file) when no
// record exists.
func GetLastFile() (string, error) {
	path, err := settingsPath()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return persistWelcome()
		}
		return "", err
	}
	var store map[string]any
	if err := json.Unmarshal(data, &store); err != nil {
		return "", err
	}
	if v, ok := store[lastFileKey]; ok {
		if last, ok := v.(string); ok && last != "" {
			return last, nil
		}
	}
	return persistWelcome()
}

// persistWelcome writes the welcome document to disk and records it as the
// last file, so the preview can render a real file on first launch.
func persistWelcome() (string, error) {
	dir, err := appDataDir()
	if err != nil {
		return "", err
	}
	path := filepath.Join(dir, "welcome.md")
	if err := os.WriteFile(path, []byte(WelcomeDoc), 0o644); err != nil {
		return "", err
	}
	if err := SetLastFile(path); err != nil {
		return "", err
	}
	return path, nil
}

// SetLastFile persists the last-opened file path into the shared JSON store.
func SetLastFile(path string) error {
	p, err := settingsPath()
	if err != nil {
		return err
	}
	store := map[string]any{}
	if data, err := os.ReadFile(p); err == nil {
		_ = json.Unmarshal(data, &store)
	}
	store[lastFileKey] = path
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}

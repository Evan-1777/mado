// Package filesys handles file I/O and the write-only lastfile record for Mado.
package filesys

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// lastFileKey is the top-level JSON key shared with the settings package.
const lastFileKey = "lastfile"

// defaultStorePath returns the settings.json path next to the executable.
func defaultStorePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "settings.json"), nil
}

// storePath is overridable in tests to isolate test binaries.
var storePath = defaultStorePath

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

// SetLastFile persists the last-opened file path into the shared JSON store.
// Nothing reads the record back today (startup no longer restores it); it is
// kept as data for a future "restore last session" option.
func SetLastFile(path string) error {
	p, err := storePath()
	if err != nil {
		return err
	}
	store := map[string]any{}
	if data, err := os.ReadFile(p); err == nil {
		_ = json.Unmarshal(data, &store)
	}
	if store == nil {
		store = map[string]any{}
	}
	store[lastFileKey] = path
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o644)
}

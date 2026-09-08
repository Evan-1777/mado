// Package filesys handles file I/O and the write-only lastfile record for Mado.
package filesys

import (
	"encoding/json"
	"errors"
	"io"
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

// WriteFile writes content to path through a same-directory temporary file.
// The old target is left untouched until the complete replacement is ready.
func WriteFile(path, content string) error {
	mode := os.FileMode(0o644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode().Perm()
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	tmp, err := os.CreateTemp(filepath.Dir(path), ".mado-*")
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = tmp.Close()
			_ = os.Remove(tmp.Name())
		}
	}()

	if err := tmp.Chmod(mode); err != nil {
		return err
	}
	written, err := tmp.Write([]byte(content))
	if err != nil {
		return err
	}
	if written != len(content) {
		return io.ErrShortWrite
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return err
	}
	committed = true
	return nil
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

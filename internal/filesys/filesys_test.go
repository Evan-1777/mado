package filesys

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// TestReadFileMissing verifies reading a nonexistent file returns an error.
func TestReadFileMissing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing.md")
	if _, err := ReadFile(path); err == nil {
		t.Fatal("expected error for missing file")
	}
}

// TestWriteReadRoundTrip verifies write-then-read returns identical content.
func TestWriteReadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "doc.md")
	content := "# Hello\n\n**bold** text"
	if err := WriteFile(path, content); err != nil {
		t.Fatalf("write: %v", err)
	}
	got, err := ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if got != content {
		t.Fatalf("round trip mismatch:\nwant %q\n got %q", content, got)
	}
}

// setUserConfigDir points os.UserConfigDir at a per-test directory on every
// platform: Windows reads %AppData%, Linux reads XDG_CONFIG_HOME — both are
// set so the override works wherever the suite runs.
func setUserConfigDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("APPDATA", dir)
	t.Setenv("XDG_CONFIG_HOME", dir)
	return dir
}

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

// TestLastFilePersistence verifies SetLastFile/GetLastFile survive across calls.
func TestLastFilePersistence(t *testing.T) {
	withTempStore(t)
	setUserConfigDir(t)

	path := filepath.Join(t.TempDir(), "note.md")
	if err := SetLastFile(path); err != nil {
		t.Fatalf("set: %v", err)
	}
	got, err := GetLastFile()
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got != path {
		t.Fatalf("got %q want %q", got, path)
	}
}

// TestGetLastFileFirstRun verifies first launch (no settings file) returns a
// welcome document that is persisted to disk.
func TestGetLastFileFirstRun(t *testing.T) {
	withTempStore(t)
	setUserConfigDir(t)

	path, err := GetLastFile()
	if err != nil {
		t.Fatalf("get welcome: %v", err)
	}
	if path == "" {
		t.Fatal("expected a welcome path")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("welcome file missing on disk: %v", err)
	}
	content, err := ReadFile(path)
	if err != nil {
		t.Fatalf("read welcome: %v", err)
	}
	if len(content) == 0 {
		t.Fatal("welcome content empty")
	}
}

// TestPreserveSettingsKeysOnSetLastFile verifies SetLastFile preserves boolean settings keys.
func TestPreserveSettingsKeysOnSetLastFile(t *testing.T) {
	p := withTempStore(t)
	initial := map[string]any{
		"theme": "light",
		"wrap":  false,
		"math":  true,
	}
	b, err := json.Marshal(initial)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	if err := SetLastFile("/a.md"); err != nil {
		t.Fatalf("SetLastFile: %v", err)
	}

	data, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var store map[string]any
	if err := json.Unmarshal(data, &store); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if store["lastfile"] != "/a.md" {
		t.Fatalf("lastfile = %v, want /a.md", store["lastfile"])
	}
	if store["theme"] != "light" || store["wrap"] != false || store["math"] != true {
		t.Fatalf("settings keys altered: %+v", store)
	}
}

// TestGetLastFileWithMixedStore verifies GetLastFile correctly reads lastfile in presence of other keys.
func TestGetLastFileWithMixedStore(t *testing.T) {
	p := withTempStore(t)
	initial := map[string]any{
		"lastfile": "/b.md",
		"wrap":     true,
		"math":     false,
	}
	b, err := json.Marshal(initial)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	got, err := GetLastFile()
	if err != nil {
		t.Fatalf("GetLastFile: %v", err)
	}
	if got != "/b.md" {
		t.Fatalf("GetLastFile() = %q, want /b.md", got)
	}
}

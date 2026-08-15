package filesys

import (
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
// set so the override works wherever the suite runs. t.Setenv restores the
// originals automatically, so tests can never leak state into the real
// user config dir (~/.config/Mado on Linux).
func setUserConfigDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("APPDATA", dir)
	t.Setenv("XDG_CONFIG_HOME", dir)
	return dir
}

// TestLastFilePersistence verifies SetLastFile/GetLastFile survive across
// calls and live in the shared %APPDATA%/Mado/settings.json file.
func TestLastFilePersistence(t *testing.T) {
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

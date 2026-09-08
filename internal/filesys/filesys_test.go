package filesys

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
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

// TestWriteFileAtomic verifies complete writes, permission inheritance, and
// cleanup when the final replacement cannot be committed.
func TestWriteFileAtomic(t *testing.T) {
	dir := t.TempDir()

	newPath := filepath.Join(dir, "new.md")
	if err := WriteFile(newPath, "new content"); err != nil {
		t.Fatalf("write new file: %v", err)
	}
	got, err := os.ReadFile(newPath)
	if err != nil {
		t.Fatalf("read new file: %v", err)
	}
	if string(got) != "new content" {
		t.Fatalf("new content = %q, want %q", got, "new content")
	}

	existing := filepath.Join(dir, "existing.md")
	if err := os.WriteFile(existing, []byte("old content"), 0o600); err != nil {
		t.Fatalf("write old file: %v", err)
	}
	if err := os.Chmod(existing, 0o600); err != nil {
		t.Fatalf("chmod old file: %v", err)
	}
	if err := WriteFile(existing, "replacement"); err != nil {
		t.Fatalf("replace existing file: %v", err)
	}
	got, err = os.ReadFile(existing)
	if err != nil {
		t.Fatalf("read existing file: %v", err)
	}
	if string(got) != "replacement" {
		t.Fatalf("replacement content = %q, want %q", got, "replacement")
	}
	info, err := os.Stat(existing)
	if err != nil {
		t.Fatalf("stat existing file: %v", err)
	}
	if gotMode := info.Mode().Perm(); gotMode != 0o600 {
		t.Fatalf("replacement mode = %o, want %o", gotMode, 0o600)
	}

	occupied := filepath.Join(dir, "occupied")
	if err := os.Mkdir(occupied, 0o755); err != nil {
		t.Fatalf("mkdir occupied target: %v", err)
	}
	if err := WriteFile(occupied, "must not replace directory"); err == nil {
		t.Fatal("WriteFile unexpectedly replaced a directory")
	}
	if _, err := os.Stat(occupied); err != nil {
		t.Fatalf("failed replacement removed target: %v", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read temp directory: %v", err)
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".mado-") {
			t.Fatalf("temporary file left behind: %s", entry.Name())
		}
	}
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

// TestSetLastFileCreatesStore verifies SetLastFile creates the store file when
// it does not exist yet.
func TestSetLastFileCreatesStore(t *testing.T) {
	p := withTempStore(t)

	if err := SetLastFile("/a.md"); err != nil {
		t.Fatalf("SetLastFile: %v", err)
	}

	data, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read store: %v", err)
	}
	var store map[string]any
	if err := json.Unmarshal(data, &store); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if store["lastfile"] != "/a.md" {
		t.Fatalf("lastfile = %v, want /a.md", store["lastfile"])
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

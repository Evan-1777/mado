package settings

import (
	"os"
	"testing"
)

func withTempAPPDATA(t *testing.T) {
	t.Helper()
	orig := os.Getenv("APPDATA")
	os.Setenv("APPDATA", t.TempDir())
	t.Cleanup(func() { os.Setenv("APPDATA", orig) })
}

// TestDefaultTheme verifies first launch defaults to dark.
func TestDefaultTheme(t *testing.T) {
	withTempAPPDATA(t)
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s.Theme != "dark" {
		t.Fatalf("default theme = %q, want dark", s.Theme)
	}
}

// TestSaveReload verifies a saved theme survives a reload.
func TestSaveReload(t *testing.T) {
	withTempAPPDATA(t)
	if err := Save(Settings{Theme: "light"}); err != nil {
		t.Fatalf("save: %v", err)
	}
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s.Theme != "light" {
		t.Fatalf("theme = %q, want light", s.Theme)
	}
}

// TestLoadMissingFile verifies Load tolerates a missing settings file.
func TestLoadMissingFile(t *testing.T) {
	withTempAPPDATA(t)
	if _, err := Load(); err != nil {
		t.Fatalf("load with missing file errored: %v", err)
	}
}

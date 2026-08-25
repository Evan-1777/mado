package main

import (
	"os"
	"path/filepath"
	"testing"

	"mado/internal/settings"
)

func TestMigrateLegacyStore(t *testing.T) {
	t.Run("src exists dst missing", func(t *testing.T) {
		dir := t.TempDir()
		src := filepath.Join(dir, "legacy", "settings.json")
		dst := filepath.Join(dir, "exe", "settings.json")

		if err := os.MkdirAll(filepath.Dir(src), 0o755); err != nil {
			t.Fatalf("mkdir src: %v", err)
		}
		content := `{"theme":"light","lastfile":"/tmp/a.md"}`
		if err := os.WriteFile(src, []byte(content), 0o644); err != nil {
			t.Fatalf("write src: %v", err)
		}

		if err := migrateLegacyStore(src, dst); err != nil {
			t.Fatalf("migrateLegacyStore: %v", err)
		}

		got, err := os.ReadFile(dst)
		if err != nil {
			t.Fatalf("read dst: %v", err)
		}
		if string(got) != content {
			t.Fatalf("dst content mismatch: got %q, want %q", string(got), content)
		}
	})

	t.Run("src missing", func(t *testing.T) {
		dir := t.TempDir()
		src := filepath.Join(dir, "legacy", "settings.json")
		dst := filepath.Join(dir, "exe", "settings.json")

		if err := migrateLegacyStore(src, dst); err != nil {
			t.Fatalf("migrateLegacyStore with missing src errored: %v", err)
		}

		if _, err := os.Stat(dst); !os.IsNotExist(err) {
			t.Fatalf("expected dst not to exist, got stat err: %v", err)
		}
	})

	t.Run("dst exists", func(t *testing.T) {
		dir := t.TempDir()
		src := filepath.Join(dir, "legacy", "settings.json")
		dst := filepath.Join(dir, "exe", "settings.json")

		if err := os.MkdirAll(filepath.Dir(src), 0o755); err != nil {
			t.Fatalf("mkdir src: %v", err)
		}
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			t.Fatalf("mkdir dst: %v", err)
		}

		srcContent := `{"theme":"dark"}`
		dstContent := `{"theme":"light","wrap":false}`
		if err := os.WriteFile(src, []byte(srcContent), 0o644); err != nil {
			t.Fatalf("write src: %v", err)
		}
		if err := os.WriteFile(dst, []byte(dstContent), 0o644); err != nil {
			t.Fatalf("write dst: %v", err)
		}

		if err := migrateLegacyStore(src, dst); err != nil {
			t.Fatalf("migrateLegacyStore: %v", err)
		}

		got, err := os.ReadFile(dst)
		if err != nil {
			t.Fatalf("read dst: %v", err)
		}
		if string(got) != dstContent {
			t.Fatalf("dst was overwritten: got %q, want %q", string(got), dstContent)
		}
	})
}

// TestSetPreviewFontSaveFailureKeepsState verifies that a failed settings.Save
// does not mutate the in-memory settings: GetCSS/GetSettings must stay
// consistent with what is actually persisted.
func TestSetPreviewFontSaveFailureKeepsState(t *testing.T) {
	// Force Save to fail by occupying the store path with a directory.
	// ReadFile on it errors (ignored by Save), so WriteFile must fail too.
	path, err := settings.Path()
	if err != nil {
		t.Fatalf("settings.Path: %v", err)
	}
	if err := os.RemoveAll(path); err != nil {
		t.Fatalf("remove existing store: %v", err)
	}
	if err := os.Mkdir(path, 0o755); err != nil {
		t.Fatalf("mkdir store path: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(path) })

	a := &App{settings: settings.Settings{Theme: "dark", Wrap: true, Math: true, PreviewFont: "Fira Code"}}
	if err := a.SetPreviewFont("JetBrains Mono"); err == nil {
		t.Fatalf("SetPreviewFont should fail when the store is not writable")
	}
	if a.settings.PreviewFont != "Fira Code" {
		t.Fatalf("failed save mutated in-memory font: got %q, want %q", a.settings.PreviewFont, "Fira Code")
	}
}

package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"mado/internal/settings"
)

// TestStartupCreatesNoWelcomeDoc verifies startup is read-only: it must not
// create anything under the user config directory (no welcome document, no
// state directory). os.UserConfigDir is isolated for the same cross-platform
// reason as the filesys tests: Windows reads %AppData%, Linux reads
// XDG_CONFIG_HOME.
func TestStartupCreatesNoWelcomeDoc(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("APPDATA", dir)
	t.Setenv("XDG_CONFIG_HOME", dir)

	NewApp().startup(context.Background())

	configDir, err := os.UserConfigDir()
	if err != nil {
		t.Fatalf("UserConfigDir: %v", err)
	}
	appDir := filepath.Join(configDir, settings.AppDir)
	if _, err := os.Stat(appDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("startup wrote under the config dir: %s exists (stat err %v)", appDir, err)
	}
}

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

// TestLastFileFailureIsBestEffort verifies a lastfile write failure does not
// block the primary load or save operation.
func TestLastFileFailureIsBestEffort(t *testing.T) {
	lastFileFailure := func(string) error { return errors.New("lastfile store unavailable") }

	t.Run("LoadFile", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "load.md")
		const want = "# loaded"
		if err := os.WriteFile(path, []byte(want), 0o644); err != nil {
			t.Fatalf("write fixture: %v", err)
		}

		a := &App{setLastFile: lastFileFailure}
		got, err := a.LoadFile(path)
		if err != nil {
			t.Fatalf("LoadFile: %v", err)
		}
		if got != want {
			t.Fatalf("LoadFile content = %q, want %q", got, want)
		}
	})

	t.Run("SaveFile", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), "save.md")
		const want = "# saved"
		a := &App{setLastFile: lastFileFailure}
		if err := a.SaveFile(path, want); err != nil {
			t.Fatalf("SaveFile: %v", err)
		}
		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read saved file: %v", err)
		}
		if string(got) != want {
			t.Fatalf("saved content = %q, want %q", string(got), want)
		}
	})
}

// TestPersistFailureKeepsState verifies that a failed save does not mutate the
// in-memory settings: GetCSS/GetSettings must stay consistent with what is
// actually persisted. The store is stubbed out via App.saveSettings so the
// test never touches the real settings.json next to the test binary.
func TestPersistFailureKeepsState(t *testing.T) {
	newApp := func() *App {
		return &App{
			settings: settings.Settings{Theme: "dark", Wrap: true, Math: true, PreviewFont: "Fira Code"},
			// A store that refuses every write.
			saveSettings: func(settings.Settings) error { return errors.New("store not writable") },
		}
	}
	unchanged := settings.Settings{Theme: "dark", Wrap: true, Math: true, PreviewFont: "Fira Code"}

	t.Run("SetPreviewFont", func(t *testing.T) {
		a := newApp()
		if err := a.SetPreviewFont("JetBrains Mono"); err == nil {
			t.Fatal("SetPreviewFont should fail when the store is not writable")
		}
		if a.settings != unchanged {
			t.Fatalf("failed save mutated in-memory settings: got %+v, want %+v", a.settings, unchanged)
		}
	})

	t.Run("SetTheme", func(t *testing.T) {
		a := newApp()
		if err := a.SetTheme("light"); err == nil {
			t.Fatal("SetTheme should fail when the store is not writable")
		}
		if a.settings != unchanged {
			t.Fatalf("failed save mutated in-memory settings: got %+v, want %+v", a.settings, unchanged)
		}
	})

	t.Run("SetWrap", func(t *testing.T) {
		a := newApp()
		if err := a.SetWrap(false); err == nil {
			t.Fatal("SetWrap should fail when the store is not writable")
		}
		if a.settings != unchanged {
			t.Fatalf("failed save mutated in-memory settings: got %+v, want %+v", a.settings, unchanged)
		}
	})

	t.Run("SetMath", func(t *testing.T) {
		a := newApp()
		if err := a.SetMath(false); err == nil {
			t.Fatal("SetMath should fail when the store is not writable")
		}
		if a.settings != unchanged {
			t.Fatalf("failed save mutated in-memory settings: got %+v, want %+v", a.settings, unchanged)
		}
	})
}

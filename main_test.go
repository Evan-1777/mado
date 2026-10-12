package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"mado/internal/settings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
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
			settings: settings.Settings{
				Theme:           "dark",
				Wrap:            true,
				Math:            true,
				PreviewFont:     "Fira Code",
				WindowWidth:     settings.DefaultWindowWidth,
				WindowHeight:    settings.DefaultWindowHeight,
				WindowMaximized: false,
			},
			// A store that refuses every write.
			saveSettings: func(settings.Settings) error { return errors.New("store not writable") },
		}
	}
	unchanged := settings.Settings{
		Theme:           "dark",
		Wrap:            true,
		Math:            true,
		PreviewFont:     "Fira Code",
		WindowWidth:     settings.DefaultWindowWidth,
		WindowHeight:    settings.DefaultWindowHeight,
		WindowMaximized: false,
	}

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

	t.Run("SetWindowSize", func(t *testing.T) {
		a := newApp()
		if err := a.SetWindowSize(1024, 768); err == nil {
			t.Fatal("SetWindowSize should fail when the store is not writable")
		}
		if a.settings != unchanged {
			t.Fatalf("failed save mutated in-memory settings: got %+v, want %+v", a.settings, unchanged)
		}
	})

	t.Run("SetWindowMaximized", func(t *testing.T) {
		a := newApp()
		if err := a.SetWindowMaximized(true); err == nil {
			t.Fatal("SetWindowMaximized should fail when the store is not writable")
		}
		if a.settings != unchanged {
			t.Fatalf("failed save mutated in-memory settings: got %+v, want %+v", a.settings, unchanged)
		}
	})
}

// TestWindowAndClipboardBindings verifies orthogonal setter behavior and bounds clamping.
func TestWindowAndClipboardBindings(t *testing.T) {
	var saved settings.Settings
	a := NewApp()
	a.settings = settings.Default()
	a.saveSettings = func(s settings.Settings) error {
		saved = s
		return nil
	}

	if err := a.SetWindowSize(1024, 768); err != nil {
		t.Fatalf("SetWindowSize: %v", err)
	}
	if saved.WindowWidth != 1024 || saved.WindowHeight != 768 || saved.WindowMaximized {
		t.Fatalf("SetWindowSize unexpected saved state: %+v", saved)
	}

	// Maximizing leaves width and height unmolested
	if err := a.SetWindowMaximized(true); err != nil {
		t.Fatalf("SetWindowMaximized: %v", err)
	}
	if !saved.WindowMaximized || saved.WindowWidth != 1024 || saved.WindowHeight != 768 {
		t.Fatalf("SetWindowMaximized overwrote window dimensions: %+v", saved)
	}

	// Below minimum size is clamped
	if err := a.SetWindowSize(400, 300); err != nil {
		t.Fatalf("SetWindowSize clamped: %v", err)
	}
	if saved.WindowWidth != settings.MinWindowWidth || saved.WindowHeight != settings.MinWindowHeight {
		t.Fatalf("SetWindowSize did not clamp to min: got %dx%d, want %dx%d",
			saved.WindowWidth, saved.WindowHeight, settings.MinWindowWidth, settings.MinWindowHeight)
	}

	// SetClipboard succeeds without error
	if err := a.SetClipboard("test clipboard"); err != nil {
		t.Fatalf("SetClipboard: %v", err)
	}
}

// TestConcurrentBindingsNoRace exercises the Wails-style concurrent binding
// calls while the injected stores deliberately share one unsynchronized map.
// The App write lock must serialize both store paths and state mutation.
func TestConcurrentBindingsNoRace(t *testing.T) {
	dir := t.TempDir()
	loadPath := filepath.Join(dir, "load.md")
	if err := os.WriteFile(loadPath, []byte("# loaded"), 0o644); err != nil {
		t.Fatalf("write load fixture: %v", err)
	}

	shared := map[string]any{}
	a := &App{
		settings: settings.Default(),
		saveSettings: func(s settings.Settings) error {
			time.Sleep(time.Microsecond)
			shared["settings"] = s
			return nil
		},
		setLastFile: func(path string) error {
			time.Sleep(time.Microsecond)
			shared["lastfile"] = path
			return nil
		},
	}

	errs := make(chan error, 8*100)
	var wg sync.WaitGroup
	for worker := 0; worker < 8; worker++ {
		worker := worker
		wg.Add(1)
		go func() {
			defer wg.Done()
			savePath := filepath.Join(dir, fmt.Sprintf("save-%d.md", worker))
			for i := 0; i < 100; i++ {
				switch (worker*100 + i) % 10 {
				case 0:
					_, err := a.Render("# heading")
					if err != nil {
						errs <- err
					}
				case 1:
					_, err := a.GetCSS()
					if err != nil {
						errs <- err
					}
				case 2:
					_, err := a.GetSettings()
					if err != nil {
						errs <- err
					}
				case 3:
					if err := a.SetWrap(i%2 == 0); err != nil {
						errs <- err
					}
				case 4:
					if err := a.SetMath(i%2 == 0); err != nil {
						errs <- err
					}
				case 5:
					if err := a.SetPreviewFont("Fira Code"); err != nil {
						errs <- err
					}
				case 6:
					a.SetDirty(true)
				case 7:
					if _, err := a.LoadFile(loadPath); err != nil {
						errs <- err
					}
				case 8:
					if err := a.SaveFile(savePath, fmt.Sprintf("%d", i)); err != nil {
						errs <- err
					}
				case 9:
					_ = a.shouldPreventClose()
				}
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("concurrent binding: %v", err)
	}
	if _, ok := shared["settings"]; !ok {
		t.Fatal("concurrent settings writes did not complete")
	}
	if _, ok := shared["lastfile"]; !ok {
		t.Fatal("concurrent lastfile writes did not complete")
	}
}

func TestSaveHtmlFile(t *testing.T) {
	app := NewApp()
	dir := t.TempDir()

	t.Run("html text writes to disk", func(t *testing.T) {
		target := filepath.Join(dir, "out.html")
		const html = "<!DOCTYPE html><html lang=\"zh-CN\"><body>正文</body></html>"

		if err := app.SaveHtmlFile(target, html); err != nil {
			t.Fatalf("SaveHtmlFile: %v", err)
		}
		got, err := os.ReadFile(target)
		if err != nil {
			t.Fatalf("ReadFile: %v", err)
		}
		if string(got) != html {
			t.Fatalf("got %q, want %q", string(got), html)
		}
	})

	t.Run("empty path returns error", func(t *testing.T) {
		err := app.SaveHtmlFile("", "<html></html>")
		if err == nil {
			t.Fatal("expected error for empty path, got nil")
		}
	})
}

func TestGetThemeCSS(t *testing.T) {
	app := NewApp()

	t.Run("light theme returns light tokens", func(t *testing.T) {
		css, err := app.GetThemeCSS("light")
		if err != nil {
			t.Fatalf("GetThemeCSS(light): %v", err)
		}
		if !strings.Contains(css, "/* mado theme tokens: light */") {
			t.Fatal("expected light tokens in composed css")
		}
	})

	t.Run("dark theme returns dark tokens", func(t *testing.T) {
		css, err := app.GetThemeCSS("dark")
		if err != nil {
			t.Fatalf("GetThemeCSS(dark): %v", err)
		}
		if !strings.Contains(css, "/* mado theme tokens: dark */") {
			t.Fatal("expected dark tokens in composed css")
		}
	})

	t.Run("unknown theme returns error", func(t *testing.T) {
		_, err := app.GetThemeCSS("unknown")
		if err == nil {
			t.Fatal("expected error for unknown theme, got nil")
		}
	})
}

func TestSaveHtmlFileDialog(t *testing.T) {
	t.Run("dialog error returns error", func(t *testing.T) {
		app := &App{
			saveFileDialog: func(ctx context.Context, opts runtime.SaveDialogOptions) (string, error) {
				return "", errors.New("host dialog error")
			},
		}
		path, err := app.SaveHtmlFileDialog("doc.html")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if path != "" {
			t.Fatalf("expected empty path on error, got %q", path)
		}
	})

	t.Run("dialog cancel returns empty path and nil error", func(t *testing.T) {
		app := &App{
			saveFileDialog: func(ctx context.Context, opts runtime.SaveDialogOptions) (string, error) {
				return "", nil
			},
		}
		path, err := app.SaveHtmlFileDialog("doc.html")
		if err != nil {
			t.Fatalf("expected nil error on cancel, got %v", err)
		}
		if path != "" {
			t.Fatalf("expected empty path on cancel, got %q", path)
		}
	})

	t.Run("dialog success returns chosen path and defaults empty name", func(t *testing.T) {
		var capturedName string
		app := &App{
			saveFileDialog: func(ctx context.Context, opts runtime.SaveDialogOptions) (string, error) {
				capturedName = opts.DefaultFilename
				return "/home/user/export.html", nil
			},
		}
		path, err := app.SaveHtmlFileDialog("")
		if err != nil {
			t.Fatalf("SaveHtmlFileDialog: %v", err)
		}
		if path != "/home/user/export.html" {
			t.Fatalf("got path %q, want /home/user/export.html", path)
		}
		if capturedName != "untitled.html" {
			t.Fatalf("got default filename %q, want untitled.html", capturedName)
		}
	})
}


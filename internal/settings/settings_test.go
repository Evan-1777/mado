package settings

import (
	"testing"
)

func withTempAPPDATA(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	// Windows reads %AppData%, Linux reads XDG_CONFIG_HOME — set both so the
	// override isolates the real user config dir on every platform.
	t.Setenv("APPDATA", dir)
	t.Setenv("XDG_CONFIG_HOME", dir)
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

// TestSettingsDefaults verifies first launch defaults for all fields.
func TestSettingsDefaults(t *testing.T) {
	withTempAPPDATA(t)
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s.Theme != DefaultTheme {
		t.Fatalf("theme = %q, want %q", s.Theme, DefaultTheme)
	}
	if s.WordWrap != DefaultWordWrap {
		t.Fatalf("wordWrap = %v, want %v", s.WordWrap, DefaultWordWrap)
	}
	if s.Math != DefaultMath {
		t.Fatalf("math = %v, want %v", s.Math, DefaultMath)
	}
}

// TestSettingsSaveReload verifies saved WordWrap/Math survive reload.
func TestSettingsSaveReload(t *testing.T) {
	withTempAPPDATA(t)
	want := Settings{Theme: "light", WordWrap: false, Math: false}
	if err := Save(want); err != nil {
		t.Fatalf("save: %v", err)
	}
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s.Theme != want.Theme || s.WordWrap != want.WordWrap || s.Math != want.Math {
		t.Fatalf("round trip: got %+v want %+v", s, want)
	}
}

// TestSettingsSaveReloadDefaults verifies default bool values round-trip.
func TestSettingsSaveReloadDefaults(t *testing.T) {
	withTempAPPDATA(t)
	want := Settings{Theme: DefaultTheme, WordWrap: true, Math: true}
	if err := Save(want); err != nil {
		t.Fatalf("save: %v", err)
	}
	s, _ := Load()
	if s.WordWrap != true || s.Math != true {
		t.Fatalf("defaults round trip: got %+v", s)
	}
}

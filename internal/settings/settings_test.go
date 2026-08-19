package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

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

// TestDefaultSettings verifies first launch (file missing) defaults to dark, wrap=true, math=true.
func TestDefaultSettings(t *testing.T) {
	withTempStore(t)
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	want := Settings{Theme: "dark", Wrap: true, Math: true}
	if s != want {
		t.Fatalf("default settings = %+v, want %+v", s, want)
	}
}

// TestSaveReload verifies saved settings survive a reload.
func TestSaveReload(t *testing.T) {
	withTempStore(t)
	want := Settings{Theme: "light", Wrap: false, Math: false}
	if err := Save(want); err != nil {
		t.Fatalf("save: %v", err)
	}
	s, err := Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if s != want {
		t.Fatalf("settings = %+v, want %+v", s, want)
	}
}

// TestPreserveUnrelatedKeys verifies Save preserves other keys (e.g. lastfile).
func TestPreserveUnrelatedKeys(t *testing.T) {
	p := withTempStore(t)
	initial := map[string]any{
		"lastfile": "/tmp/x.md",
		"theme":    "dark",
	}
	b, err := json.Marshal(initial)
	if err != nil {
		t.Fatalf("marshal initial: %v", err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatalf("write initial: %v", err)
	}

	if err := Save(Settings{Theme: "light", Wrap: false, Math: true}); err != nil {
		t.Fatalf("save: %v", err)
	}

	data, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read store: %v", err)
	}
	var store map[string]any
	if err := json.Unmarshal(data, &store); err != nil {
		t.Fatalf("unmarshal store: %v", err)
	}
	if store["lastfile"] != "/tmp/x.md" {
		t.Fatalf("lastfile lost or corrupted: got %v, want /tmp/x.md", store["lastfile"])
	}
	if store["theme"] != "light" || store["wrap"] != false || store["math"] != true {
		t.Fatalf("saved values mismatch: got %v", store)
	}
}

// TestTypeMismatchFallback verifies invalid value types fall back to defaults without error.
func TestTypeMismatchFallback(t *testing.T) {
	p := withTempStore(t)
	invalid := map[string]any{
		"theme": 123,
		"wrap":  "yes",
		"math":  nil,
	}
	b, err := json.Marshal(invalid)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	s, err := Load()
	if err != nil {
		t.Fatalf("load with corrupt types returned error: %v", err)
	}
	want := Settings{Theme: "dark", Wrap: true, Math: true}
	if s != want {
		t.Fatalf("fallback settings = %+v, want %+v", s, want)
	}
}

// TestPath verifies Path returns non-empty path.
func TestPath(t *testing.T) {
	p := withTempStore(t)
	got, err := Path()
	if err != nil {
		t.Fatalf("Path(): %v", err)
	}
	if got != p {
		t.Fatalf("Path() = %q, want %q", got, p)
	}
}


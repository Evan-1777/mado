package theme

import (
	"strings"
	"testing"
)

// TestDark verifies ThemeCSS("dark") includes token vars and base rules.
func TestDark(t *testing.T) {
	css, err := ThemeCSS("dark")
	if err != nil {
		t.Fatalf("dark: %v", err)
	}
	if !strings.Contains(css, "--bg") {
		t.Fatal("dark css missing --bg token")
	}
	if !strings.Contains(css, ".chroma") {
		t.Fatal("dark css missing base content")
	}
	if !strings.Contains(css, "mado theme tokens: dark") {
		t.Fatalf("dark css missing dark marker, got: %.120s", css)
	}
}

// TestLight verifies ThemeCSS("light") includes its own token vars.
func TestLight(t *testing.T) {
	css, err := ThemeCSS("light")
	if err != nil {
		t.Fatalf("light: %v", err)
	}
	if !strings.Contains(css, "--bg") {
		t.Fatal("light css missing --bg token")
	}
	if !strings.Contains(css, "mado theme tokens: light") {
		t.Fatalf("light css missing light marker, got: %.120s", css)
	}
}

// TestInvalidTheme verifies an unknown theme errors.
func TestInvalidTheme(t *testing.T) {
	if _, err := ThemeCSS("sepia"); err == nil {
		t.Fatal("expected error for unknown theme")
	}
}

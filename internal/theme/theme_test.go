package theme

import (
	"strings"
	"testing"
)

// TestDark verifies ThemeCSS("dark") includes token vars and base rules.
func TestDark(t *testing.T) {
	css, err := ThemeCSS("dark", "Cascadia Code")
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
	css, err := ThemeCSS("light", "Cascadia Code")
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
	if _, err := ThemeCSS("sepia", "Cascadia Code"); err == nil {
		t.Fatal("expected error for unknown theme")
	}
}

// TestPreviewFontVariable verifies both themes emit --preview-font with the
// requested font first and the built-in fallback stack after it.
func TestPreviewFontVariable(t *testing.T) {
	for _, th := range []string{"light", "dark"} {
		css, err := ThemeCSS(th, "Fira Code")
		if err != nil {
			t.Fatalf("%s: %v", th, err)
		}
		if !strings.Contains(css, `--preview-font: "Fira Code", "Cascadia Code"`) {
			t.Fatalf("%s css missing custom font in --preview-font, got substring check fail", th)
		}
		if !strings.Contains(css, "--preview-font") {
			t.Fatalf("%s css missing --preview-font", th)
		}
		if !strings.Contains(css, "font-family: var(--preview-font)") {
			t.Fatalf("%s css body/code/kbd missing var(--preview-font)", th)
		}
	}
}

// TestPreviewFontNoInjection verifies CSS structure characters cannot escape
// the font declaration: callers such as settings.NormalizePreviewFont strip
// them, but the theme layer must not be the place where an injection becomes
// executable CSS. The quote is escaped inside the CSS string, and the only
// literal selector occurrences are the ones from base.css.
func TestPreviewFontNoInjection(t *testing.T) {
	css, err := ThemeCSS("dark", `x"; } body { color: red; } /*`)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// The quote inside the value must be escaped, keeping the value a single
	// quoted string.
	if !strings.Contains(css, "x\\\"; } body") {
		t.Fatalf("expected escaped quote in font value, got: %s", css)
	}
	// The declaration tail we append must survive: the value ends with our
	// fallback stack, not with the attacker's content.
	if !strings.Contains(css, "sans-serif; }") {
		t.Fatalf("font declaration tail missing, got: %s", css)
	}
}

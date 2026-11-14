package theme

import (
	"fmt"
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

// TestTokenValues pins preview colors to the paired Material Design 3 shell
// palette. The iframe has its own stylesheet, so these literals keep both
// surfaces aligned.
func TestTokenValues(t *testing.T) {
	want := map[string]map[string]string{
		"dark": {
			"--bg":           "#121318",
			"--fg":           "#e3e2e9",
			"--muted":        "#c5c6d0",
			"--border":       "#44464f",
			"--accent":       "#b4c5ff",
			"--accent-soft":  "rgba(180, 197, 255, 0.16)",
			"--selection-bg": "rgba(180, 197, 255, 0.32)",
			"--code-bg":      "#1a1b20",
			"--quote-bg":     "#1a1b20",
			"--quote-border": "#8f909a",
			"--table-head":   "#1e1f25",
			"--table-stripe": "#16171d",
			"--link":         "#b4c5ff",
			"--heading":      "#e3e2e9",
		},
		"light": {
			"--bg":           "#ffffff",
			"--fg":           "#1a1b20",
			"--muted":        "#44464f",
			"--border":       "#c5c6d0",
			"--accent":       "#4b5c92",
			"--accent-soft":  "#dbe1ff",
			"--selection-bg": "#dbe1ff",
			"--code-bg":      "#f4f3fa",
			"--quote-bg":     "#f4f3fa",
			"--quote-border": "#757780",
			"--table-head":   "#eeedf4",
			"--table-stripe": "#faf8ff",
			"--link":         "#4b5c92",
			"--heading":      "#1a1b20",
		},
	}
	for _, themeName := range []string{"dark", "light"} {
		css, err := ThemeCSS(themeName, "Cascadia Code")
		if err != nil {
			t.Fatalf("%s: %v", themeName, err)
		}
		for name, value := range want[themeName] {
			decl := fmt.Sprintf("%s: %s;", name, value)
			if !strings.Contains(css, decl) {
				t.Errorf("%s css missing %s", themeName, decl)
			}
		}
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
// the font declaration: callers such as settings.NormalizePreviewFont reject
// them, but the theme layer must not be the place where an injection becomes
// executable CSS. The whole declaration — injected value plus the fallback
// stack and closing brace we append — has to survive verbatim, which proves
// the payload stayed inside the quoted string instead of becoming a rule.
func TestPreviewFontNoInjection(t *testing.T) {
	const decl = `:root { --preview-font: "%s", "Cascadia Code", "JetBrains Mono", Consolas, "Microsoft YaHei UI", "Segoe UI", sans-serif, monospace; }`
	cases := []struct {
		name    string
		input   string
		escaped string // expected value inside the declaration
	}{
		{name: "quote", input: `x"; } body { color: red; } /*`, escaped: `x\"; } body { color: red; } /*`},
		{name: "newline", input: "x\n}\nbody { color: red; }", escaped: "x}body { color: red; }"},
	}
	for _, tc := range cases {
		css, err := ThemeCSS("dark", tc.input)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", tc.name, err)
		}
		want := fmt.Sprintf(decl, tc.escaped)
		if !strings.Contains(css, want) {
			t.Fatalf("%s: injected font broke out of the declaration, want substring:\n%s", tc.name, want)
		}
	}
}

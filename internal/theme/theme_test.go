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

// TestTokenValues pins every preview token to the Zinc palette the app shell
// uses. The iframe gets its own stylesheet, so a drifting literal here would
// silently paint the preview in a different grey than the editor around it.
func TestTokenValues(t *testing.T) {
	want := map[string]map[string]string{
		"dark": {
			"--bg":           "#09090b",
			"--fg":           "#f4f4f5",
			"--muted":        "#a1a1aa",
			"--border":       "#27272a",
			"--accent":       "#2563eb",
			"--accent-soft":  "rgba(37, 99, 235, 0.18)",
			"--code-bg":      "#18181b",
			"--quote-bg":     "#18181b",
			"--quote-border": "#52525b",
			"--table-head":   "#18181b",
			"--table-stripe": "#27272a",
			// High-contrast blue: #2563eb would fail WCAG AA on the dark
			// canvas, so links use the brighter step of the same hue.
			"--link":    "#60a5fa",
			"--heading": "#fafafa",
		},
		"light": {
			"--bg":           "#ffffff",
			"--fg":           "#18181b",
			"--muted":        "#71717a",
			"--border":       "#e4e4e7",
			"--accent":       "#2563eb",
			"--accent-soft":  "#eff6ff",
			"--code-bg":      "#f4f4f5",
			"--quote-bg":     "#fafafa",
			"--quote-border": "#a1a1aa",
			"--table-head":   "#f4f4f5",
			"--table-stripe": "#fafafa",
			"--link":         "#2563eb",
			"--heading":      "#09090b",
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

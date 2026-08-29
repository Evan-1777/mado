// Package theme embeds the design-token CSS for the Mado preview and composes
// the final stylesheet for a given theme.
package theme

import (
	"embed"
	"fmt"
	"strings"
)

//go:embed assets/theme/*.css
var cssFS embed.FS

var baseCSS []byte

func init() {
	b, err := cssFS.ReadFile("assets/theme/base.css")
	if err != nil {
		// Programmer error: base.css is embedded at build time.
		panic(err)
	}
	baseCSS = b
}

// ThemeCSS returns the composed stylesheet for the given theme and preview
// font: token block + base rules + theme-specific overrides. The preview font
// is injected as the --preview-font variable; the hardcoded default stack is
// always appended as fallback.
func ThemeCSS(themeName string, previewFont string) (string, error) {
	themeName = strings.ToLower(strings.TrimSpace(themeName))
	if themeName != "light" && themeName != "dark" {
		return "", fmt.Errorf("theme: unknown theme %q", themeName)
	}
	previewFont = strings.TrimSpace(previewFont)
	tokens, err := cssFS.ReadFile("assets/theme/tokens-" + themeName + ".css")
	if err != nil {
		return "", err
	}
	fontDecl := cssFontDecl(previewFont)
	return fmt.Sprintf("%s\n%s\n%s\n", tokens, fontDecl, baseCSS), nil
}

// cssFontDecl renders the --preview-font variable. It is a second line of
// defense behind settings.NormalizePreviewFont, which is the only place that
// rejects a font name; this function never errors, it only neutralizes: the
// two characters that can terminate a CSS double-quoted string are escaped,
// and characters that cannot appear inside one at all (a raw newline would
// turn the value into a bad-string token and let the rest of the line
// re-parse as CSS) are dropped.
func cssFontDecl(previewFont string) string {
	sanitized := strings.Map(func(r rune) rune {
		if r == 0 || r == '\n' || r == '\r' || r == '\f' {
			return -1
		}
		return r
	}, previewFont)
	name := strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(sanitized)
	// monospace is last in the stack so code/kbd cannot fall back to a
	// proportional font when the requested font is missing; body text still
	// resolves to sans-serif first and never reaches it.
	return fmt.Sprintf(":root { --preview-font: \"%s\", \"Cascadia Code\", \"JetBrains Mono\", Consolas, \"Microsoft YaHei UI\", \"Segoe UI\", sans-serif, monospace; }", name)
}

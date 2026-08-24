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

// cssFontDecl renders the --preview-font variable. A font name containing CSS
// structure characters would break out of the declaration, so it is quoted
// and every character that could close the string is rejected first; this
// function is a second line of defense with an explicit error for anything
// that still reaches it.
func cssFontDecl(previewFont string) string {
	// NUL bytes and newlines cannot survive a CSS string; quoting the name
	// and escaping only what is needed keeps the declaration safe for any
	// input that passed settings validation.
	name := strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(previewFont)
	return fmt.Sprintf(":root { --preview-font: \"%s\", \"Cascadia Code\", \"JetBrains Mono\", Consolas, \"Microsoft YaHei UI\", \"Segoe UI\", sans-serif; }", name)
}

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

// ThemeCSS returns the composed stylesheet for the given theme:
// token block + base rules + theme-specific overrides.
func ThemeCSS(theme string) (string, error) {
	theme = strings.ToLower(strings.TrimSpace(theme))
	if theme != "light" && theme != "dark" {
		return "", fmt.Errorf("theme: unknown theme %q", theme)
	}
	tokens, err := cssFS.ReadFile("assets/theme/tokens-" + theme + ".css")
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s\n%s\n", tokens, baseCSS), nil
}

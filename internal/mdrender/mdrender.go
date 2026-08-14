// Package mdrender renders Markdown to safe HTML using goldmark with GFM,
// typographer and Chroma code highlighting. Raw HTML is allowed except for
// <script> tags, which are silently stripped.
package mdrender

import (
	"bytes"
	"regexp"
	"strings"

	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
)

// scriptRe matches <script ...> and </script> tags (case-insensitive,
// attributes optional, no nesting in HTML). Used to strip executable JS
// while keeping other raw HTML like <kbd>/<div>.
var scriptRe = regexp.MustCompile(`(?is)<\s*/?\s*script\b[^>]*>`)

// Render converts Markdown source to sanitized HTML.
func Render(md string) (string, error) {
	engine := goldmark.New(
		goldmark.WithExtensions(
			extension.GFM,
			extension.Typographer,
			highlighting.NewHighlighting(
				highlighting.WithStyle("github"),
				highlighting.WithFormatOptions(
					chromahtml.WithClasses(true),
				),
			),
		),
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
		),
		goldmark.WithRendererOptions(
			html.WithUnsafe(),
		),
	)
	var buf bytes.Buffer
	if err := engine.Convert([]byte(md), &buf); err != nil {
		return "", err
	}
	return scriptRe.ReplaceAllString(buf.String(), ""), nil
}

// StripScripts removes script tags from raw HTML (used defensively).
func StripScripts(html string) string {
	return strings.ReplaceAll(html, "<script", "&lt;script")
}

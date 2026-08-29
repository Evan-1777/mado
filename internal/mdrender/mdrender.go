// Package mdrender renders Markdown to safe HTML using goldmark with GFM,
// typographer and Chroma code highlighting. Raw HTML is allowed except for
// <script> tags, which are silently stripped.
package mdrender

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/util"
)

// renderCodeWrapper wraps every fenced code block in a
// `<div class="md-line" data-line="N">` so the preview gutter can show the
// block's source line.
//
// The attribute has to live on the wrapper: Chroma owns the `<pre>` open tag
// and we do not control it. The tempting alternative — writing our own `<pre>`
// and asking Chroma for PreventSurroundingPre(true) — is worse than it looks:
// that flag also sets formatter.preventSurroundingPre, which drops the
// per-line `<span class="line"><span class="cl">` wrappers and disables the
// hl_lines/linenos rendering paths entirely. A wrapper div costs one element
// and leaves Chroma byte-for-byte untouched.
func renderCodeWrapper(w util.BufWriter, c highlighting.CodeBlockContext, entering bool) {
	if !entering {
		// Same context instance as the entering call, so this mirrors the
		// opening tag exactly — no state to carry between the two.
		if !c.Highlighted() {
			_, _ = w.WriteString("</code></pre>")
		}
		_, _ = w.WriteString("</div>\n")
		return
	}
	_, _ = w.WriteString(`<div class="md-line"`)
	if line, ok := dataLine(c.Attributes()); ok {
		_, _ = w.WriteString(` data-line="`)
		_, _ = w.WriteString(line)
		_, _ = w.WriteString(`"`)
	}
	_ = w.WriteByte('>')
	// Blocks Chroma does not highlight (no lexer, or nohl=true) reach us with
	// the code lines written straight through, so we owe them the <pre> that
	// Chroma's own formatter would have emitted. Highlighted blocks already
	// carry their own <pre class="chroma">.
	if !c.Highlighted() {
		_, _ = w.WriteString("<pre><code")
		if lang, ok := c.Language(); ok {
			_, _ = w.WriteString(` class="language-`)
			_, _ = w.Write(lang)
			_, _ = w.WriteString(`"`)
		}
		_, _ = w.WriteString(">")
	}
}

// dataLine reads the source line stamped by srclineTransformer.
func dataLine(attr highlighting.ImmutableAttributes) (string, bool) {
	if attr == nil {
		return "", false
	}
	v, ok := attr.Get(dataLineAttr)
	if !ok {
		return "", false
	}
	line, ok := v.([]byte)
	return string(line), ok
}

// scriptRe matches <script ...> and </script> tags (case-insensitive,
// attributes optional, no nesting in HTML). Used to strip executable JS
// while keeping other raw HTML like <kbd>/<div>.
var scriptRe = regexp.MustCompile(`(?is)<\s*/?\s*script\b[^>]*>`)

// Render converts Markdown source to sanitized HTML.
func Render(md string, math bool) (string, error) {
	exts := []goldmark.Extender{
		extension.GFM,
		extension.Typographer,
		highlighting.NewHighlighting(
			highlighting.WithStyle("github"),
			highlighting.WithFormatOptions(
				chromahtml.WithClasses(true),
			),
			highlighting.WithWrapperRenderer(renderCodeWrapper),
		),
	}
	if math {
		exts = append(exts, MathExtension)
	}

	engine := goldmark.New(
		goldmark.WithExtensions(exts...),
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
			// Priority 1000 keeps us behind GFM's table transformers (0 and
			// 200): PrioritizedSlice sorts ascending, so a bigger number runs
			// later and sees the finished AST.
			parser.WithASTTransformers(util.Prioritized(&srclineTransformer{}, 1000)),
		),
		goldmark.WithRendererOptions(
			html.WithUnsafe(),
		),
	)
	var buf bytes.Buffer
	ctx := parser.NewContext(parser.WithIDs(&slugIDs{}))
	if err := engine.Convert([]byte(md), &buf, parser.WithContext(ctx)); err != nil {
		return "", err
	}
	return scriptRe.ReplaceAllString(buf.String(), ""), nil
}

// slugIDs generates heading ids in the common slug format: CJK characters
// are kept as-is, every other non-alphanumeric character (full-width
// punctuation, spaces, dashes, underscores) collapses to a single '-', and
// ASCII letters are lowercased. This matches the ids hand-written in TOC
// links like `[环境搭建](#环境搭建)` or `[先搞清楚 WSL](#一先搞清楚-wsl-是什么)`;
// goldmark's built-in generator drops all non-ASCII characters, so headings
// that are mostly Chinese end up with an id of "heading" that no TOC link
// can hit (see Plan.md 2026-08-16).
type slugIDs struct {
	seen map[string]bool
}

var _ parser.IDs = (*slugIDs)(nil)

// Generate implements parser.IDs: slugifies value and disambiguates
// duplicates with a -N suffix, mirroring goldmark's built-in ids behavior.
func (s *slugIDs) Generate(value []byte, _ ast.NodeKind) []byte {
	base := slugify(value)
	id := base
	if s.seen == nil {
		s.seen = map[string]bool{}
	}
	for i := 1; s.seen[id]; i++ {
		id = fmt.Sprintf("%s-%d", base, i)
	}
	s.seen[id] = true
	return []byte(id)
}

// Put implements parser.IDs: registers an explicitly specified id so later
// auto-generated ids do not collide with it.
func (s *slugIDs) Put(value []byte) {
	if s.seen == nil {
		s.seen = map[string]bool{}
	}
	s.seen[string(value)] = true
}

// slugify converts heading text to a GitHub-style slug: letters/digits stay
// (ASCII lowercased), ASCII whitespace becomes a single '-', literal '-' and
// '_' are kept, and every other character — including full-width CJK
// punctuation like '、' or '（' — is dropped. This matches the ids hand-
// written in real-world TOC links: `一、先搞清楚 WSL 是什么` becomes
// `一先搞清楚-wsl-是什么` (punctuation removed, spaces become dashes),
// verified against GitHub's own rendering. An all-punctuation heading falls
// back to "heading" like goldmark's built-in generator.
func slugify(value []byte) string {
	var b strings.Builder
	var dashPending bool
	for i := 0; i < len(value); {
		r, size := utf8.DecodeRune(value[i:])
		i += size
		switch {
		case r == '-' || r == '_':
			b.WriteRune(r)
			dashPending = false
		case unicode.IsSpace(r):
			dashPending = true
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if dashPending {
				b.WriteByte('-')
				dashPending = false
			}
			b.WriteRune(unicode.ToLower(r))
		}
	}
	if id := strings.Trim(b.String(), "-"); id != "" {
		return id
	}
	return "heading"
}

// StripScripts removes script tags from raw HTML (used defensively).
func StripScripts(html string) string {
	return strings.ReplaceAll(html, "<script", "&lt;script")
}

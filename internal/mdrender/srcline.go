package mdrender

import (
	"bytes"
	"strconv"

	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
)

// dataLineAttr is the HTML attribute carrying the 1-based source line where a
// block starts. The preview gutter renders it with CSS
// `content: attr(data-line)` (see theme/assets/theme/base.css), and the
// frontend reads it back to jump between editor and preview.
var dataLineAttr = []byte("data-line")

// srclineTransformer stamps every top-level block of the document with the
// source line it starts on.
//
// Only direct children of the Document are stamped: a nested block (a list
// item, a paragraph inside a blockquote) starts on almost the same y as its
// parent, so stamping every block would stack several numbers on the same
// line and force the frontend to de-duplicate them.
//
// The value goes out as a `data-` attribute, which goldmark's
// html.RenderAttributes writes unconditionally even when a node renderer
// passes an attribute filter (see the dataPrefix branch there); no
// AttributeFilter has to change.
type srclineTransformer struct{}

// Transform implements parser.ASTTransformer.
func (t *srclineTransformer) Transform(node *ast.Document, reader text.Reader, _ parser.Context) {
	src := reader.Source()
	// cursor is the first offset a block may start at: the line right after
	// the previous block ended. Blocks carrying no source position of their
	// own (thematic breaks, for instance) fall back to it, which is also the
	// lower bound for every search, so no block can claim an offset that
	// belongs to its predecessor.
	cursor := 0
	for n := node.FirstChild(); n != nil; n = n.NextSibling() {
		if line, ok := markLine(src, n, cursor); ok {
			n.SetAttribute(dataLineAttr, []byte(strconv.Itoa(line)))
		}
		if end := blockEnd(src, n); end > cursor {
			cursor = nextBlockStart(src, end)
		}
	}
}

// nextBlockStart returns the offset where the block following the one that
// ends at off begins: past off's newline and past any blank lines in between.
// Blocks without a position of their own (thematic breaks) land here, and the
// blank lines they are separated by must not be counted as content.
func nextBlockStart(src []byte, off int) int {
	for off < len(src) && (src[off] == '\n' || src[off] == '\r') {
		off++
	}
	return off
}

// markLine stamps n and reports whether it got a line number. Fenced code
// blocks need the info-string attributes merged in first (see mergeInfoAttrs)
// before anything is written to the node.
func markLine(src []byte, n ast.Node, cursor int) (int, bool) {
	if fence, ok := n.(*ast.FencedCodeBlock); ok {
		mergeInfoAttrs(src, fence)
	}
	off := blockOffset(src, n)
	if off < cursor {
		off = cursor
	}
	if len(src) == 0 {
		return 1, true
	}
	if off > len(src) {
		return 0, false
	}
	return bytes.Count(src[:off], []byte("\n")) + 1, true
}

// mergeInfoAttrs parses the `{...}` part of a fenced block's info string and
// merges the result into the node. goldmark-highlighting's getAttributes
// skips info-string parsing entirely once node.Attributes() is non-nil, so
// writing data-line first would silently drop `{nohl=true}`/`{style=...}`.
func mergeInfoAttrs(src []byte, n *ast.FencedCodeBlock) {
	if n.Info == nil {
		return
	}
	info := n.Info.Segment.Value(src)
	// Upstream only parses when the brace sits past the language word
	// (attrStartIdx > 0); mirror that so we never parse a leading brace.
	idx := bytes.IndexByte(info, '{')
	if idx <= 0 {
		return
	}
	attrs, ok := parser.ParseAttributes(text.NewReader(info[idx:]))
	if !ok {
		return
	}
	for _, a := range attrs {
		n.SetAttribute(a.Name, a.Value)
	}
}

// blockEnd returns the byte offset right past the last source byte n covers,
// or -1 when the block carries no source position.
func blockEnd(src []byte, n ast.Node) int {
	if lines := n.Lines(); lines.Len() > 0 {
		return lines.At(lines.Len() - 1).Stop
	}
	if t, ok := n.(*ast.Text); ok {
		return t.Segment.Stop
	}
	end := -1
	for c := n.FirstChild(); c != nil; c = c.NextSibling() {
		if e := blockEnd(src, c); e > end {
			end = e
		}
	}
	return end
}

// blockOffset returns the byte offset in src where n starts, or -1 when the
// block carries no source position.
func blockOffset(src []byte, n ast.Node) int {
	switch n := n.(type) {
	case *ast.FencedCodeBlock:
		// The info segment points at the line *after* the fence, so back up
		// one newline to land on the fence line itself.
		base := -1
		if n.Info != nil {
			base = n.Info.Segment.Start
		} else if n.Lines().Len() > 0 {
			base = n.Lines().At(0).Start
		}
		if base <= 0 {
			return -1
		}
		return bytes.LastIndexByte(src[:base-1], '\n') + 1
	case *MathBlock:
		return n.start
	case *ast.Text:
		// Table cells hold bare text with no line segment of their own.
		return n.Segment.Start
	}
	if lines := n.Lines(); lines.Len() > 0 {
		return lines.At(0).Start
	}
	for c := n.FirstChild(); c != nil; c = c.NextSibling() {
		if off := blockOffset(src, c); off >= 0 {
			return off
		}
	}
	return -1
}

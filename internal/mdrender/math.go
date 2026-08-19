package mdrender

import (
	"bytes"
	"html"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	htmlrenderer "github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

var (
	KindMathInline = ast.NewNodeKind("MathInline")
	KindMathBlock  = ast.NewNodeKind("MathBlock")
)

// MathInline represents an inline LaTeX math formula ($...$).
type MathInline struct {
	ast.BaseInline
	Content []byte
}

func (n *MathInline) Dump(source []byte, level int) {
	ast.DumpHelper(n, source, level, nil, nil)
}

func (n *MathInline) Kind() ast.NodeKind {
	return KindMathInline
}

func NewMathInline(content []byte) *MathInline {
	return &MathInline{
		BaseInline: ast.BaseInline{},
		Content:    content,
	}
}

// MathBlock represents a block-level LaTeX math formula ($$...$$).
type MathBlock struct {
	ast.BaseBlock
	Content []byte
}

func (n *MathBlock) Dump(source []byte, level int) {
	ast.DumpHelper(n, source, level, nil, nil)
}

func (n *MathBlock) Kind() ast.NodeKind {
	return KindMathBlock
}

func NewMathBlock() *MathBlock {
	return &MathBlock{
		BaseBlock: ast.BaseBlock{},
	}
}

// --- Inline parser ---

type mathInlineParser struct{}

var defaultMathInlineParser = &mathInlineParser{}

func (s *mathInlineParser) Trigger() []byte {
	return []byte{'$'}
}

func (s *mathInlineParser) Parse(parent ast.Node, block text.Reader, pc parser.Context) ast.Node {
	if block.PrecendingCharacter() == '\\' {
		return nil
	}
	line, _ := block.PeekLine()
	if len(line) == 0 || line[0] != '$' {
		return nil
	}
	if len(line) > 1 && line[1] == '$' {
		return nil
	}

	// Search for closing $ on the same line
	var closedAt = -1
	for i := 1; i < len(line); i++ {
		c := line[i]
		if c == '\n' || c == '\r' {
			break
		}
		if c == '\\' {
			i++
			continue
		}
		if c == '$' {
			closedAt = i
			break
		}
	}

	if closedAt == -1 {
		return nil
	}

	content := line[1:closedAt]
	if len(content) == 0 {
		return nil
	}
	// Currency / spacing heuristic: no leading or trailing spaces allowed
	if content[0] == ' ' || content[0] == '\t' {
		return nil
	}
	if content[len(content)-1] == ' ' || content[len(content)-1] == '\t' {
		return nil
	}

	block.Advance(closedAt + 1)
	return NewMathInline(content)
}

// --- Block parser ---

type mathBlockParser struct{}

var defaultMathBlockParser = &mathBlockParser{}

func (b *mathBlockParser) Trigger() []byte {
	return nil
}

func (b *mathBlockParser) CanInterruptParagraph() bool {
	return true
}

func (b *mathBlockParser) CanAcceptIndentedLine() bool {
	return false
}

func (b *mathBlockParser) Open(parent ast.Node, reader text.Reader, pc parser.Context) (ast.Node, parser.State) {
	line, _ := reader.PeekLine()
	pos := 0
	for pos < len(line) && (line[pos] == ' ' || line[pos] == '\t') {
		pos++
	}
	if pos > 3 {
		return nil, parser.NoChildren
	}
	rest := line[pos:]
	if !bytes.HasPrefix(rest, []byte("$$")) {
		return nil, parser.NoChildren
	}

	node := NewMathBlock()
	afterOpener := bytes.TrimRight(rest[2:], "\r\n")

	// Single-line block: `$$\frac{a}{b}$$`
	if len(afterOpener) >= 2 && bytes.HasSuffix(afterOpener, []byte("$$")) {
		content := afterOpener[:len(afterOpener)-2]
		node.Content = bytes.TrimSpace(content)
		reader.AdvanceToEOL()
		return node, parser.Close
	}

	trimmedAfter := bytes.TrimSpace(afterOpener)
	if len(trimmedAfter) > 0 {
		node.Content = append(node.Content, trimmedAfter...)
	}
	reader.AdvanceToEOL()
	return node, parser.NoChildren
}

func (b *mathBlockParser) Continue(node ast.Node, reader text.Reader, pc parser.Context) parser.State {
	line, _ := reader.PeekLine()
	trimmed := bytes.TrimSpace(line)
	if bytes.Equal(trimmed, []byte("$$")) || bytes.HasSuffix(trimmed, []byte("$$")) {
		reader.AdvanceToEOL()
		mb := node.(*MathBlock)
		if !bytes.Equal(trimmed, []byte("$$")) {
			content := trimmed[:len(trimmed)-2]
			if len(content) > 0 {
				if len(mb.Content) > 0 {
					mb.Content = append(mb.Content, '\n')
				}
				mb.Content = append(mb.Content, content...)
			}
		}
		return parser.Close
	}
	reader.AdvanceToEOL()
	mb := node.(*MathBlock)
	lineContent := bytes.TrimRight(line, "\r\n")
	if len(mb.Content) > 0 {
		mb.Content = append(mb.Content, '\n')
	}
	mb.Content = append(mb.Content, lineContent...)
	return parser.Continue | parser.NoChildren
}

func (b *mathBlockParser) Close(node ast.Node, reader text.Reader, pc parser.Context) {
	mb := node.(*MathBlock)
	mb.Content = bytes.TrimSpace(mb.Content)
}

// --- HTML renderer ---

type mathHTMLRenderer struct {
	htmlrenderer.Config
}

var defaultMathHTMLRenderer = &mathHTMLRenderer{
	Config: htmlrenderer.NewConfig(),
}

func (r *mathHTMLRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(KindMathInline, r.renderMathInline)
	reg.Register(KindMathBlock, r.renderMathBlock)
}

func (r *mathHTMLRenderer) renderMathInline(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	in := n.(*MathInline)
	escaped := html.EscapeString(string(in.Content))
	_, _ = w.WriteString(`<span class="math-inline" data-tex="`)
	_, _ = w.WriteString(escaped)
	_, _ = w.WriteString(`">`)
	_, _ = w.WriteString(escaped)
	_, _ = w.WriteString(`</span>`)
	return ast.WalkContinue, nil
}

func (r *mathHTMLRenderer) renderMathBlock(w util.BufWriter, source []byte, n ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	b := n.(*MathBlock)
	escaped := html.EscapeString(string(b.Content))
	_, _ = w.WriteString(`<div class="math-block" data-tex="`)
	_, _ = w.WriteString(escaped)
	_, _ = w.WriteString(`">`)
	_, _ = w.WriteString(escaped)
	_, _ = w.WriteString("</div>\n")
	return ast.WalkContinue, nil
}

// --- Goldmark Extension ---

type mathExtension struct{}

var MathExtension = &mathExtension{}

func (e *mathExtension) Extend(m goldmark.Markdown) {
	m.Parser().AddOptions(
		parser.WithBlockParsers(
			util.Prioritized(defaultMathBlockParser, 500),
		),
		parser.WithInlineParsers(
			util.Prioritized(defaultMathInlineParser, 500),
		),
	)
	m.Renderer().AddOptions(
		renderer.WithNodeRenderers(
			util.Prioritized(defaultMathHTMLRenderer, 500),
		),
	)
}

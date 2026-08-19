package mdrender

import (
	"net/url"
	"regexp"
	"testing"
)

// TestRenderBold verifies **b** produces a <strong> element.
func TestRenderBold(t *testing.T) {
	out, err := Render("**b**", false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if want := "<strong>b</strong>"; !contains(out, want) {
		t.Fatalf("bold: output %q missing %q", out, want)
	}
}

// TestRenderCode verifies `x` produces an inline <code> element.
func TestRenderCode(t *testing.T) {
	out, err := Render("`x`", false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if want := "<code>x</code>"; !contains(out, want) {
		t.Fatalf("code: output %q missing %q", out, want)
	}
}

// TestRenderTable verifies GFM table syntax produces a <table>.
func TestRenderTable(t *testing.T) {
	src := "| a | b |\n|---|---|\n| 1 | 2 |\n"
	out, err := Render(src, false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !contains(out, "<table>") {
		t.Fatalf("table: output missing <table>: %q", out)
	}
}

// TestRenderTaskList verifies GFM task list items render checkboxes.
func TestRenderTaskList(t *testing.T) {
	out, err := Render("- [x] done\n- [ ] todo", false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !contains(out, `type="checkbox"`) {
		t.Fatalf("task list: output missing checkbox: %q", out)
	}
}

// TestStripScripts verifies <script> tags are removed while other raw HTML
// (kbd) is preserved.
func TestStripScripts(t *testing.T) {
	src := "<script>alert(1)</script><kbd>Ctrl</kbd>"
	out, err := Render(src, false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if contains(out, "<script") {
		t.Fatalf("script not stripped: %q", out)
	}
	if !contains(out, "<kbd>Ctrl</kbd>") {
		t.Fatalf("kbd not preserved: %q", out)
	}
}

// TestRenderCodeFence verifies fenced code blocks get highlighted with classes.
func TestRenderCodeFence(t *testing.T) {
	out, err := Render("```go\nfunc main() {}\n```", false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !contains(out, "chroma") {
		t.Fatalf("code fence: output missing chroma class: %q", out)
	}
}

// TestRenderHeadingIDs verifies heading ids match the hand-written TOC slugs
// from real-world Chinese documents.
func TestRenderHeadingIDs(t *testing.T) {
	cases := []struct{ heading, wantID string }{
		{"## 一、先搞清楚 WSL 是什么", "一先搞清楚-wsl-是什么"},
		{"## 二、环境搭建与安装", "二环境搭建与安装"},
		{"## 三、性能与网络调优", "三性能与网络调优"},
		{"## 四、文件互通与协作", "四文件互通与协作"},
		{"## 五、Claude Code 实战", "五claude-code-实战"},
		{"## 六、常用命令速查", "六常用命令速查"},
		{"## 七、常见问题排查", "七常见问题排查"},
	}
	var src string
	for _, c := range cases {
		src += c.heading + "\n\n"
	}
	out, err := Render(src, false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	for _, c := range cases {
		want := `id="` + c.wantID + `"`
		if !contains(out, want) {
			t.Errorf("heading %q: output missing %q in %q", c.heading, want, out)
		}
	}
	if contains(out, `id="heading"`) {
		t.Errorf("fallback id \"heading\" should not appear: %q", out)
	}
}

// TestRenderUnicodeTOCLinkTarget covers the complete renderer boundary behind
// preview TOC clicks.
func TestRenderUnicodeTOCLinkTarget(t *testing.T) {
	const id = "一先搞清楚-wsl-是什么"
	out, err := Render("[一、先搞清楚 WSL 是什么](#"+id+")\n\n## 一、先搞清楚 WSL 是什么\n", false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}

	match := regexp.MustCompile(`href="(#.*?)"`).FindStringSubmatch(out)
	if len(match) != 2 {
		t.Fatalf("TOC link: output missing href fragment: %q", out)
	}
	fragment, err := url.PathUnescape(match[1][1:])
	if err != nil {
		t.Fatalf("decode href fragment %q: %v", match[1], err)
	}
	if fragment != id {
		t.Fatalf("TOC target: decoded fragment %q, want %q", fragment, id)
	}
	if !contains(out, `id="`+id+`"`) {
		t.Fatalf("TOC target: output missing id %q: %q", id, out)
	}
}

// TestRenderDuplicateHeadingIDs verifies repeated headings get -N suffixes.
func TestRenderDuplicateHeadingIDs(t *testing.T) {
	out, err := Render("## Foo\n\n## Foo\n", false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !contains(out, `id="foo"`) || !contains(out, `id="foo-1"`) {
		t.Fatalf("duplicate headings: expected id=\"foo\" and id=\"foo-1\", got %q", out)
	}
}

// --- Math Extension Tests ---

// 1. $E=mc^2$ -> output contains class="math-inline" and data-tex="E=mc^2"
func TestRenderMathInline(t *testing.T) {
	out, err := Render("$E=mc^2$", true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if want := `<span class="math-inline" data-tex="E=mc^2">E=mc^2</span>`; !contains(out, want) {
		t.Fatalf("math inline: output %q missing %q", out, want)
	}
}

// 2. $$\frac{a}{b}$$ block -> output contains class="math-block"
func TestRenderMathBlock(t *testing.T) {
	out, err := Render("$$\\frac{a}{b}$$", true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if want := `<div class="math-block" data-tex="\frac{a}{b}">\frac{a}{b}</div>`; !contains(out, want) {
		t.Fatalf("math block singleline: output %q missing %q", out, want)
	}

	multiline := "$$\n\\frac{a}{b}\n$$"
	outMulti, err := Render(multiline, true)
	if err != nil {
		t.Fatalf("render multi: %v", err)
	}
	if want := `<div class="math-block" data-tex="\frac{a}{b}">\frac{a}{b}</div>`; !contains(outMulti, want) {
		t.Fatalf("math block multiline: output %q missing %q", outMulti, want)
	}
}

// 3. TeX contains <, >, &, " -> data-tex is HTML escaped
func TestRenderMathEscaping(t *testing.T) {
	out, err := Render(`$a < b & c > d "$`, true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	want := `data-tex="a &lt; b &amp; c &gt; d &#34;"`
	if !contains(out, want) {
		t.Fatalf("math escaping: output %q missing %q", out, want)
	}
}

// 4. $5 and $10 -> output literal text, no math-inline
func TestRenderMathCurrencyProtection(t *testing.T) {
	out, err := Render("I have $5 and $10 in cash.", true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if contains(out, "math-inline") {
		t.Fatalf("currency erroneously parsed as math: %q", out)
	}
	if !contains(out, "$5 and $10") {
		t.Fatalf("currency text altered: %q", out)
	}
}

// 5. \$5 -> output contains $ literal, no math-inline
func TestRenderMathEscapedDollar(t *testing.T) {
	out, err := Render(`\$5`, true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if contains(out, "math-inline") {
		t.Fatalf("escaped dollar parsed as math: %q", out)
	}
	if !contains(out, "$5") {
		t.Fatalf("escaped dollar output missing $5: %q", out)
	}
}

// 6. Fenced code block $x$ and inline code `$x$` -> no math placeholder
func TestRenderMathInCode(t *testing.T) {
	outInlineCode, err := Render("`$x$`", true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if contains(outInlineCode, "math-inline") || !contains(outInlineCode, "<code>$x$</code>") {
		t.Fatalf("math inside inline code: %q", outInlineCode)
	}

	outFencedCode, err := Render("```\n$x$\n```", true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if contains(outFencedCode, "math-inline") || contains(outFencedCode, "math-block") {
		t.Fatalf("math inside code fence: %q", outFencedCode)
	}
}

// 7. math=false -> $...$/$$...$$ output as normal text
func TestRenderMathDisabled(t *testing.T) {
	out, err := Render("$E=mc^2$ and $$\\frac{1}{2}$$", false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if contains(out, "math-inline") || contains(out, "math-block") {
		t.Fatalf("math rendered while disabled: %q", out)
	}
}

// 8. Unclosed $ -> literal output
func TestRenderMathUnclosed(t *testing.T) {
	out, err := Render("$E=mc^2", true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if contains(out, "math-inline") {
		t.Fatalf("unclosed dollar rendered as math: %q", out)
	}
	if !contains(out, "$E=mc^2") {
		t.Fatalf("unclosed dollar text lost: %q", out)
	}
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}

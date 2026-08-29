package mdrender

import (
	"strings"
	"testing"
)

// TestSourceLineBlocks verifies every top-level block carries the 1-based
// source line it starts on.
func TestSourceLineBlocks(t *testing.T) {
	cases := []struct{ src, want string }{
		{"# H\n\npara\n", ` data-line="1">H</h1>`},
		{"# H\n\npara\n", `<p data-line="3"`},
		{"# H\n\n\npara\n", `<p data-line="4"`},
		{"- a\n- b\n", `<ul data-line="1"`},
		{"> quoted\n", `<blockquote data-line="1"`},
		{"| a | b |\n|---|---|\n| 1 | 2 |\n", `<table data-line="1"`},
		{"a\n\n---\n\nb\n", `<hr data-line="3"`},
	}
	for _, c := range cases {
		out, err := Render(c.src, false)
		if err != nil {
			t.Fatalf("render %q: %v", c.src, err)
		}
		if !contains(out, c.want) {
			t.Errorf("source line %q: output missing %q: %q", c.src, c.want, out)
		}
	}
}

// TestSourceLineCodeFence verifies fenced code blocks get their line on the
// wrapper div, with Chroma's own output untouched.
func TestSourceLineCodeFence(t *testing.T) {
	out, err := Render("# H\n\n```go\nx := 1\n```\n", false)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if want := `<div class="md-line" data-line="3">`; !contains(out, want) {
		t.Fatalf("code fence: output missing %q: %q", want, out)
	}
	if want := `<div class="md-line" data-line="3"><pre class="chroma">`; !contains(out, want) {
		t.Fatalf("code fence: wrapper must be followed by Chroma's pre: %q", out)
	}
	// Proves PreventSurroundingPre is off: Chroma's per-line wrappers survive.
	if want := `<span class="line"><span class="cl">`; !contains(out, want) {
		t.Fatalf("code fence: Chroma line wrappers missing: %q", out)
	}
	// data-line belongs to the wrapper only, never to Chroma's <pre>.
	solo, err := Render("```go\nx := 1\n```\n", false)
	if err != nil {
		t.Fatalf("render solo: %v", err)
	}
	if n := strings.Count(solo, "data-line"); n != 1 {
		t.Fatalf("code fence: data-line must appear once (wrapper only), got %d: %q", n, solo)
	}

	plain, err := Render("# H\n\n```notalang\nx := 1\n```\n", false)
	if err != nil {
		t.Fatalf("render plain: %v", err)
	}
	if want := `<div class="md-line" data-line="3">`; !contains(plain, want) {
		t.Fatalf("unhighlighted fence: output missing %q: %q", want, plain)
	}
	if want := `<pre><code class="language-notalang">`; !contains(plain, want) {
		t.Fatalf("unhighlighted fence: plain pre/code missing: %q", plain)
	}

	// {nohl=true} must survive: the transformer merges info-string attributes
	// before stamping data-line, otherwise goldmark-highlighting would skip
	// parsing them and the option would be silently dropped.
	nohl, err := Render("# H\n\n```go {nohl=true}\nx := 1\n```\n", false)
	if err != nil {
		t.Fatalf("render nohl: %v", err)
	}
	if want := `<div class="md-line" data-line="3">`; !contains(nohl, want) {
		t.Fatalf("nohl fence: output missing %q: %q", want, nohl)
	}
	if contains(nohl, "chroma") {
		t.Fatalf("nohl fence: block was highlighted anyway: %q", nohl)
	}
	if !contains(nohl, "language-go") {
		t.Fatalf("nohl fence: language class lost: %q", nohl)
	}
}

// TestSourceLineMathBlock verifies $$ blocks report their source line even
// though goldmark keeps no position for custom blocks.
func TestSourceLineMathBlock(t *testing.T) {
	out, err := Render("# H\n\n$$\nx^2\n$$\n", true)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	want := `<div class="math-block" data-tex="x^2" data-line="3">`
	if !contains(out, want) {
		t.Fatalf("math block: output missing %q: %q", want, out)
	}
}

package mdrender

import "testing"

// TestRenderBold verifies **b** produces a <strong> element.
func TestRenderBold(t *testing.T) {
	out, err := Render("**b**")
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if want := "<strong>b</strong>"; !contains(out, want) {
		t.Fatalf("bold: output %q missing %q", out, want)
	}
}

// TestRenderCode verifies `x` produces an inline <code> element.
func TestRenderCode(t *testing.T) {
	out, err := Render("`x`")
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
	out, err := Render(src)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !contains(out, "<table>") {
		t.Fatalf("table: output missing <table>: %q", out)
	}
}

// TestRenderTaskList verifies GFM task list items render checkboxes.
func TestRenderTaskList(t *testing.T) {
	out, err := Render("- [x] done\n- [ ] todo")
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
	out, err := Render(src)
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
	out, err := Render("```go\nfunc main() {}\n```")
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if !contains(out, "chroma") {
		t.Fatalf("code fence: output missing chroma class: %q", out)
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

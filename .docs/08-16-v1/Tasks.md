# Tasks：修复目录锚点链接不响应跳转

**关联 Plan**：`Plan.md` —— 修复目录锚点链接不响应跳转 v1.0
**总计 Task**：2 个

---

## Phase 1：mdrender 接入自定义标题 id 生成器

### TASK-001：实现 slug 生成器并接入 Render

- **Status**：DONE
- **Description**：在 `internal/mdrender/mdrender.go` 中新增 slug 函数，并通过 `parser.WithIDs` + `parser.WithIDGenerator` 接入 goldmark。
- **Details**：
  - 新增 `headingSlug` 函数：遍历标题文本的 UTF-8 字符——
    - 小写 ASCII 字母/数字：保留
    - 空格（`util.IsSpace`）、ASCII `-`/`_`、全角标点（CJK 统一表意文字之外的任何非 ASCII 字符，参考 goldmark 官方 `extra.WithIDGenerator` 实现）：转为 `-`
    - 中文等 CJK 字符：原样保留
    - 连续分隔符合并为单个 `-`，首尾去除 `-`
  - 空结果回退为 `"heading"`（与原生行为一致）
  - 通过 `parser.WithIDs` 注入自定义 `parser.IDs` 实现（`Generate` 调 slug + 去重加 `-N` 后缀，`Put` 注册显式 id），`Render` 中同时加 `parser.WithIDGenerator` 与 `parser.WithAutoHeadingID` 保持既有标题 id 行为
- **Acceptance Criteria**：
  - `Render("## 一、先搞清楚 WSL 是什么")` 输出含 `id="一先搞清楚-wsl-是什么"`
  - `Render("## 环境搭建与安装")` 输出含 `id="环境搭建与安装"`
  - 重复标题（`## Foo` 两次）输出 `id="foo"` 与 `id="foo-1"`
  - 英文标题（`## Hello World`）输出 `id="hello-world"`（与旧行为一致）

---

## Phase 2：测试与回归

### TASK-002：新增 id/slug 测试用例并跑回归

- **Status**：DONE
- **Description**：在 `internal/mdrender/mdrender_test.go` 中新增用例，并用用户提供的真实样例做端到端断言。
- **Details**：
  - 新增 `TestRenderHeadingIDs`：渲染用户 TOC 样例中的全部 7 个标题，断言输出中每个 `id="..."` 与用户目录 href 的片段完全一致（`#` 后部分逐一对上）
  - 新增 `TestRenderDuplicateHeadingIDs`：重复标题断言 `foo` / `foo-1`
  - 新增 `TestRenderExplicitHeadingID`：`## Title {#custom}` 断言保留 `id="custom"`
  - 回归：`cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 确认前端无改动仍通过；`go vet ./...` + `go test ./...`
- **Acceptance Criteria**：
  - `go test ./...` 全部通过（含既有 6 个用例与新增用例）
  - 用户样例中 7 个目录 href 全部与渲染 id 精确匹配
  - `go vet ./...` 无输出；esbuild 语法检查通过

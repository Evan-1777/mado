# Tasks：Split 双栏源行号栏与双向跳转

**关联 Plan**：`Plan.md` —— Split 双栏源行号栏与双向跳转 v1.0
**总计 Task**：12 个

> 验收约定：本机验证链见 `.docs/Project.md` §2「本机验证链」。Go 命令需先
> `export PATH=$HOME/.local/go/bin:$PATH`。无 GUI 测试框架，UI 行为的可机械验证部分为
> 零产物语法检查 + 全量构建 + 纯函数单测，交互手感在 Windows 端手动验收。

---

## Phase 1：渲染层输出源行号锚点（Go / mdrender）

### TASK-001：新增源行号 AST 变换并接入渲染管线

- **Status**：DONE
- **Description**：在 `internal/mdrender/` 新增 `srcline.go`，实现 goldmark `ASTTransformer`，为 Document 的直接子块写入源码起始行号属性；在 `mdrender.go` 的 `Render` 中注册该变换。
- **Details**：
  - 属性名 `data-line`，值为十进制行号字符串（1 起算）。goldmark 的 `html.RenderAttributes` 对 `data-` 前缀属性无条件放行（见 `renderer/html/html.go` 的 `dataPrefix` 分支），无需改任何 `AttributeFilter`。
  - 新增类型 `srclineTransformer`，实现 `Transform(node *ast.Document, reader text.Reader, _ parser.Context)`：取 `reader.Source()` 为源码，遍历 `node.FirstChild()` 起的全部兄弟节点，**只处理直接子块**（不递归标注后代，避免列表项与其父块数字重叠）。
  - 内部函数 `lineOf(src []byte, n ast.Node) (int, bool)`：先求 `blockOffset`，`off < 0` 返回 false；行号 = `bytes.Count(src[:off], []byte("\n")) + 1`。
  - 内部函数 `blockOffset(src []byte, n ast.Node) int`，按此顺序取值：
    1. `*ast.FencedCodeBlock`：内容首行偏移再回退一行即栅栏行——优先取 `n.Info.Segment.Start`，`Info` 为 nil 时取 `Lines().At(0).Start`；再 `bytes.LastIndexByte(src[:base-1], '\n') + 1`（`base <= 0` 返回 -1）
    2. `*ast.MathBlock`：读节点上记录的起始偏移（TASK-003 添加该字段）
    3. 自身 `Lines().Len() > 0`：取 `Lines().At(0).Start`
    4. `*ast.Text`：取 `Segment.Start`（表格单元格只有内联文本，靠这条命中）
    5. 深度优先递归子节点，返回首个 >= 0 的结果；否则 -1
  - 注册：`mdrender.go` 的 `goldmark.WithParserOptions` 增加 `parser.WithASTTransformers(util.Prioritized(&srclineTransformer{}, 1000))`。**优先级必须高于 200**：`PrioritizedSlice.Sort()` 按 Priority 升序排序后依次 append，数值小的先执行；GFM 的表格变换用 0 与 200，取 1000 确保读到最后成型的 AST。需新增 import `github.com/yuin/goldmark/util`。
  - **标注 `*ast.FencedCodeBlock` 前先合并 info 串属性**：goldmark-highlighting 的 `getAttributes`（`highlighting.go:375`）在 `node.Attributes() != nil` 时**完全跳过** info 串的 `{...}` 解析，直接写 `data-line` 会静默丢弃 `{nohl=true}`/`{style=...}` 等既有语法。合并步骤：取 `n.Info.Segment.Value(src)` → `bytes.IndexByte(info, '{')`，下标 `<= 0` 则跳过（与上游 `attrStartIdx > 0` 判定一致）→ `parser.ParseAttributes(text.NewReader(info[idx:]))`（goldmark 导出的同一函数，不复制解析逻辑）→ 逐条 `n.SetAttribute(a.Name, a.Value)` → 最后才写 `data-line`（用户写 `data-line` 时以真实行号覆盖）。
  - 英文注释说明：为什么只标注顶层块、`data-` 属性为什么无需改过滤器、为什么要合入 info 串属性。
- **Acceptance Criteria**：
  - `go vet ./internal/mdrender/` 无输出、退出码 0
  - `go test ./internal/mdrender/ -run TestSourceLineBlocks -v` PASS，逐条断言：
    - `"# H\n\npara\n"` → 输出含 `<h1 data-line="1"` 与 `<p data-line="3"`
    - `"# H\n\n\npara\n"` → 输出含 `<p data-line="4"`
    - `"- a\n- b\n"` → 输出含 `<ul data-line="1"`（列表整体一个锚点）
    - `"> quoted\n"` → 输出含 `<blockquote data-line="1"`
    - `"| a | b |\n|---|---|\n| 1 | 2 |\n"` → 输出含 `<table data-line="1"`
    - `"a\n\n---\n\nb\n"` → 输出含 `<hr data-line="3"`
  - `go test ./...` 全绿（现有渲染用例无回归）

### TASK-002：为围栏代码块补齐行号（包装渲染器）并锁定输出基线

- **Status**：DONE
- **Description**：为 goldmark-highlighting 注入 `WithWrapperRenderer`，在围栏代码块外输出带 `data-line` 的 `<div class="md-line">` 包装层；**不引入 `PreventSurroundingPre`**，Chroma 输出保持零变化。
- **Details**：
  - **禁止 `chromahtml.PreventSurroundingPre(true)`**：该开关除把 preWrapper 换成空壳外，还会置位 `f.preventSurroundingPre`（chroma `formatters/html/html.go` 第 43 行赋值、286/319 两处判定），连带删除行包装 span `<span class="line"><span class="cl">` 并让 `hl_lines`/`linenos` 的渲染路径整体失效。因此无法做到「开标签逐字节一致」，改走包装层路线。
  - `mdrender.go` 只加一项配置 `highlighting.WithWrapperRenderer(func(w util.BufWriter, c highlighting.CodeBlockContext, entering bool))`：
    - `!entering` → 写 `</div>` 后返回
    - entering → 写 `<div class="md-line"`；取到行号补 ` data-line="N"`；写 `>`
    - 不分支 `c.Highlighted()`、不写 `<pre>`/`<code>`、不碰语言 class：Chroma 默认 preWrapper 照旧输出 `<pre class="chroma"><code>`（高亮）或 `<pre><code class="language-X">`（未高亮）
  - 辅助函数 `dataLine(attr highlighting.ImmutableAttributes) (string, bool)`：`attr` 理论上非 nil（变换器已写 `data-line`），仍按 nil 安全处理；属性值类型为 `[]byte`。
  - `data-line` 只落在包装层上，不在 `<pre>` 上；顶层块才带行号，嵌套在列表项内的代码块只输出无属性的 `<div class="md-line">`。
  - 英文注释写明：为什么用包装层而不是自写 `<pre>`（关联 chroma 的 `preventSurroundingPre` 副作用）。
- **Acceptance Criteria**：
  - `go test ./internal/mdrender/ -run TestSourceLineCodeFence -v` PASS，断言：
    - `"# H\n\n```go\nx := 1\n```\n"` → 输出含 `<div class="md-line" data-line="3">`，且其后紧跟 `<pre class="chroma">`
    - 同一输出含 `<span class="line"><span class="cl">`（**反证未开启 `PreventSurroundingPre`**）
    - `"# H\n\n```notalang\nx := 1\n```\n"` → 输出含 `<div class="md-line" data-line="3">` 与 `<pre><code class="language-notalang">`
    - `strings.Count(out, "data-line") == 1`（行号只落包装层，`<pre>` 上无重复）
    - `"# H\n\n```go {nohl=true}\nx := 1\n```\n"` → 输出含 `<div class="md-line" data-line="3">`、**不含** `chroma`、含 `language-go`（证明 info 串属性未被 `data-line` 遮蔽，对应 TASK-001 的合并逻辑）
  - `go test ./...` 全绿（现有高亮用例无回归）

### TASK-003：为公式块补齐行号

- **Status**：DONE
- **Description**：`MathBlock` 不留存源码行信息，需在解析期记录起始偏移并在渲染期输出 `data-line`。
- **Details**：
  - `internal/mdrender/math.go`：`MathBlock` 增加未导出字段 `start int`；`mathBlockParser.Open` 中把现有 `line, _ := reader.PeekLine()` 改为 `_, seg := reader.PeekLine()`，并在 `reader.AdvanceToEOL()` 之前记录 `node.start = seg.Start`（沿用已 trim 前导空格的 `pos` 逻辑不变）
  - `renderMathBlock`：在写完 `data-tex="..."` 的闭合引号后、`>` 之前，若 `n.AttributeString("data-line")` 取到值（`ast.Node` 接口方法，值类型为 `[]byte`）则追加 ` data-line="N"`
  - `srcline.go` 的 `blockOffset` 增加 `*ast.MathBlock` 分支返回 `n.start`（TASK-001 已预留该分支）
- **Acceptance Criteria**：
  - `go test ./internal/mdrender/ -run TestSourceLineMathBlock -v` PASS，断言 `"# H\n\n$$\nx^2\n$$\n"` 的输出含 `<div class="math-block" data-tex="x^2" data-line="3">`
  - `go test ./...` 全绿（现有公式用例无回归）

---

## Phase 2：行号映射纯函数与测试（前端）

### TASK-004：新增 `frontend/src/gutter.ts` 纯函数模块

- **Status**：DONE
- **Description**：新增不依赖 DOM / CodeMirror 的映射模块，供 UI 层与单测共用。
- **Details**：
  - 导出 `pickBlockIndex(lines: number[], target: number): number`
  - 语义（文件顶部用英文注释写清）：`lines` 为按文档顺序升序的块起始行号（可重复）；返回最后一个 `lines[i] <= target` 的下标；`target` 小于 `lines[0]` 时返回 `0`（回退到首块，保证「点击第 1 行之前的行也能跳到开头」）；空数组返回 `-1`
  - 用二分实现（`lines` 升序），避免长文档逐块线性扫描
  - 不引入任何依赖，不引用 `document` / CodeMirror
- **Acceptance Criteria**：
  - `cd frontend && node_modules/.bin/esbuild src/gutter.ts --bundle > /dev/null` 退出码 0 且无 stderr

### TASK-005：新增 gutter 映射的 Node 原生测试并接入 npm test

- **Status**：DONE
- **Description**：新增 `frontend/tests/gutter.test.ts`，用项目既有的无框架断言风格覆盖映射逻辑，并接入 `npm test`。
- **Details**：
  - 沿用 `frontend/tests/fontCommit.test.ts` 的写法：本地 `fail()` / `expectEq()` 助手 + 顶层 `await`，无测试框架、无构建产物（Node 原生 type-stripping，Node >= 22.6）
  - 覆盖用例：精确命中、落在两块之间、重复行号（取最后一个）、`target` 小于首行 → 0、`target` 大于末行 → 末个下标、单元素、空数组 → -1
  - `frontend/package.json` 的 `test` 脚本改为 `node tests/fontCommit.test.ts && node tests/gutter.test.ts`
- **Acceptance Criteria**：
  - `cd frontend && npm test` 退出码 0，stdout 同时含两个测试文件的通过输出

---

## Phase 3：Preview 行号栏视觉

### TASK-006：预览主题样式表新增行号栏规则

- **Status**：DONE
- **Description**：在 `internal/theme/assets/theme/base.css` 末尾新增行号栏规则——样式必须落在这里，因为行号画在 iframe 文档内，`frontend/src/style.css` 只作用于父窗口，管不到帧内。
- **Details**：
  - `#md-content > [data-line] { position: relative; }`（常驻，作为行号定位的包含块）
  - `body.md-gutter #md-content > [data-line]::before`：`content: attr(data-line); position: absolute; top: 0; right: 100%; margin-right: .6rem; font-size: .78rem; line-height: 1.6rem; font-variant-numeric: tabular-nums; color: var(--muted); opacity: .45; user-select: none; cursor: pointer; transition: opacity .15s ease, color .15s ease;`
    - `line-height: 1.6rem`（25.6px）让数字的行盒中心与正文首行中心（14.5px × 1.75 ≈ 25.4px）重合
    - `right: 100%` 使数字右边缘对齐内容左边缘，位数变化时自然右对齐
  - 内边距补偿：`div.md-line[data-line]::before { margin-top: .9rem; }`、`blockquote[data-line]::before { margin-top: .15rem; }`（这两类块有上内边距，数字要落到首行内容行）
    - `md-line` 是 mdrender 的包装渲染器为围栏代码块输出的外层 div（见 TASK-002），**不是**用户内容；外边距折叠使它的边框盒顶边与内部 `<pre>` 顶边重合，所以数字仍按 `pre` 的 `0.9rem` 上内边距补偿
  - 悬停提亮：`body.md-gutter #md-content > [data-line]:hover::before { opacity: 1; color: var(--accent); }`
  - 全部走既有主题令牌，不写硬编码颜色；文件顶部英文注释说明数字来自 mdrender 写入的 `data-line`，无 JS 定位、无滚动同步
- **Acceptance Criteria**：
  - `go test ./internal/theme/` PASS（现有断言均为 `strings.Contains`，新增规则不破坏）
  - `grep -c "md-gutter" internal/theme/assets/theme/base.css` >= 4

### TASK-007：行号栏的 Split 显示开关

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 增加行号栏可见性同步，预览列可见时显示（Split 与 Preview 单栏；用户确认两个模式都显示）。
- **Details**：
  - 新增 `function isPreviewVisible(): boolean`：pane 上不含 `editor-only` 类
  - 新增 `function syncGutterVisibility(): void`：`previewIframe.contentDocument?.body.classList.toggle('md-gutter', isPreviewVisible())`
  - 三个调用点：
    1. `writePreview` 末尾（srcdoc 引导分支与原地更新分支之后统一调一次）
    2. `previewIframe` 的 `load` 监听器（与 `hookPreviewLinks()` 同处，srcdoc 重建后帧 body 是新节点，必须重挂类）
    3. 模式按钮点击回调（切模式后立即生效）
- **Acceptance Criteria**：
  - `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty > /dev/null` 退出码 0 且无 stderr
  - `grep -c "syncGutterVisibility" frontend/src/main.ts` >= 4（1 处定义 + 3 处调用）

---

## Phase 4：双向跳转 + 模式顺序 + 折叠槽下线

### TASK-008：模式按钮顺序调整为 Preview / Editor / Split

- **Status**：DONE
- **Description**：调整 `frontend/src/main.ts` 工具栏 `.seg` 内三个模式按钮的顺序。
- **Details**：
  - 顺序改为 `Preview`（`data-mode="preview"`）→ `Editor`（`data-mode="editor"`）→ `Split`（`data-mode="split"`）
  - `class="active"` 移到 `Preview` 按钮上，同时 `pane` 的初始 class 由 `'pane'` 改为 `'pane preview-only'`，二者保持一致（启动默认模式为 Preview，见 Plan §3「启动默认模式」）
  - 按钮点击处理逻辑不变（用 `btn.dataset.mode` 判定，与顺序无关）
- **Acceptance Criteria**：
  - `cd frontend && npm run build` 退出码 0
  - `grep -o 'data-mode="[a-z]*"' frontend/src/main.ts` 输出依次为 `data-mode="preview"`、`data-mode="editor"`、`data-mode="split"`
  - `grep -c 'class="pane preview-only"\|pane preview-only' frontend/src/main.ts` >= 1（初始模式与默认选中项一致）

### TASK-009：编辑区行号栏去掉折叠槽

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中把 `foldGutter()` 换成 `codeFolding()`，行号栏不再出现折叠箭头，键盘折叠能力保留。
- **Details**：
  - `@codemirror/language` 的导入：`foldGutter` 改为 `codeFolding`
  - extensions 数组中 `foldGutter()` 改为 `codeFolding()`；`foldKeymap` 保留在 keymap 数组（`foldGutter` 内部才带 fold state field，换成 `codeFolding()` 后快捷键仍可用）
  - 不改动 `lineNumbers()`、`highlightActiveLine()` 等其余扩展
- **Acceptance Criteria**：
  - `cd frontend && npm run build` 退出码 0
  - `grep -c "foldGutter" frontend/src/main.ts` 输出 0
  - `grep -c "codeFolding" frontend/src/main.ts` 输出 >= 2（import + 使用）

### TASK-010：Editor ↔ Preview 行号双向跳转

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中实现两侧行号点击互跳，把目标行在对方视口置顶。
- **Details**：
  - 新增 `scrollEditorToLine(line: number)`：把 line clamp 到 `[1, cm.state.doc.lines]` → `cm.dispatch({ effects: EditorView.scrollIntoView(cm.state.doc.line(n).from, { y: 'start' }) })`；不 `focus()`、不改 selection（用 CM 自带 effect 而非手算 scrollTop，视口外行高为估算值，effect 会二次校正落点）
  - 新增 `scrollPreviewToLine(line: number)`：取帧内 `article = doc.getElementById('md-content')`，`Array.from(article.querySelectorAll(':scope > [data-line]'))` 收集块与其行号数组 → `pickBlockIndex(lines, line)` → 下标 < 0 直接返回 → `blocks[i].scrollIntoView({ behavior: 'smooth', block: 'start' })`
  - **Editor 侧绑定必须挂在 `cm.scrollDOM` 上**，不能用 `EditorView.domEventHandlers`：后者只挂到 `contentDOM`，而 `.cm-gutters` 是 `contentDOM` 的兄弟节点（见 `@codemirror/view` 的 `ensureHandlers` 与 `gutterView` 构造），行号槽的 mousedown 到不了那里。绑定方式：
    ```
    cm.scrollDOM.addEventListener('mousedown', (e) => { ... })
    ```
    判定顺序：`e.button !== 0` 直接返回 → 取 `cm.dom.querySelector('.cm-gutters')` 矩形，`e.clientX` 落在矩形外返回 → `cm.posAtCoords({ x: e.clientX, y: e.clientY }, false)` 为 null 返回（`posAtCoords` 先按 y 定位行块，x 只影响列，落在行号槽也能拿到正确行） → `scrollPreviewToLine(cm.state.doc.lineAt(pos).number)`
    - **不加模式门禁**：单栏模式下对方栏被隐藏，跳转无可见效果但也不产生副作用；加门禁反而会让 Preview 单栏里可见的行号栏点了没反应（与用户确认的显示范围矛盾）
  - **Preview 侧改造 `hookPreviewLinks`** 为帧内 click 统一入口：先算 `article.getBoundingClientRect().left`；若 `e.clientX < contentLeft`（同样不加模式门禁，理由同上），取顶层 `[data-line]` 块列表，选第一个 `getBoundingClientRect().bottom > e.clientY` 的块（越界取末个，无块返回），`e.preventDefault()` 后 `scrollEditorToLine(line)` 并 return；否则走原有链接拦截逻辑。**用坐标判定而非伪元素命中**，`::before` 的点击命中行为跨版本有差异。
- **Acceptance Criteria**：
  - `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty > /dev/null` 退出码 0 且无 stderr
  - `cd frontend && npm run build` 退出码 0
  - `cd frontend && npm test` 退出码 0
  - 交互（点击两侧行号后目标行在对方栏置顶；Split 与 Preview 单栏均显示行号栏）在 Windows 端手动验收

---

## Phase 5：文档维护与全链路回归

### TASK-011：更新 `.docs/Project.md`

- **Status**：DONE
- **Description**：按 `.docs/Project.md` §0 维护速查同步本次变更涉及的章节。
- **Details**：
  - §1 当前阶段：更新为「开发中（v1.6：Split 双栏源行号栏与双向跳转）」
  - §4 架构与数据流「预览通道」补充：mdrender 在每个顶层块写入 `data-line` 源行号锚点 → 帧内 CSS `::before` 生成行号栏（父窗口 CSS 管不到 iframe，规则在 theme 的 base.css） → 两侧行号点击互跳
  - §4 编辑器段落补充：行号栏只负责行号与跳转，无折叠槽（`codeFolding()` + `foldKeymap`，仅键盘折叠）；模式顺序 Preview / Editor / Split，启动默认为 Preview
  - §6 约束与已知坑新增四条：
    1. 源行号锚点覆盖顶层块，缩进代码块与原始 HTML 块无锚点（goldmark 这两类渲染器忽略节点属性），行号栏在该块处跳过、跳转回退到最近的前序锚点
    2. 跳转粒度是渲染块而非单行：多行块内部的行只能把整块置顶
    3. `EditorView.domEventHandlers` 只挂 `contentDOM`，行号槽事件必须监听 `cm.scrollDOM`
    4. 围栏代码块的 `data-line` 落在包装层 `<div class="md-line">` 上而非 `<pre>`：chroma 的 `<pre>` 开标签不受控，包装层是唯一注入点；**不得改用 `chromahtml.PreventSurroundingPre(true)` 自写 `<pre>`**——该开关会连带删除行包装 span 并使 `hl_lines`/`linenos` 渲染路径失效
    5. 变换器标注围栏块前必须合并 info 串 `{...}` 属性：goldmark-highlighting 的 `getAttributes` 在节点已有属性时跳过 info 串解析，否则 `{nohl=true}`/`{style=...}` 会被静默丢弃
  - §8 决策记录新增（日期 2026-08-29）：行号锚点由 Go 渲染期写入而非前端解析、行号栏用 CSS `content: attr(data-line)` 而非 JS 测高、围栏代码块用包装层 div 而非 `PreventSurroundingPre` 自写 `<pre>`、跳转仅滚动不改焦点
  - §9 术语表新增：**源行号锚点** = Go 渲染期写入顶层块元素的 `data-line`，值为该块在 Markdown 源码中的起始行号
- **Acceptance Criteria**：
  - `grep -n "源行号锚点" .docs/Project.md` 至少命中 3 处（§4 / §8 / §9）
  - `grep -n "v1.6" .docs/Project.md` 命中 §1 当前阶段
  - 文档中不出现与本次实现矛盾的描述（无 `foldGutter`、无 `PreventSurroundingPre`、默认模式写 Preview）

### TASK-012：全链路回归验证与归档

- **Status**：DONE
- **Description**：按 `.docs/Project.md` §2 本机验证链跑完整回归，确认无编译/测试退化，随后归档 Plan 与 Tasks。
- **Details**：
  - 依次执行：`cd frontend && npm install --include=dev` → 零产物语法检查 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（stdout 丢弃）→ `npm run build` → `npm test` → 仓库根目录 `go vet ./...` → `go test ./...`
  - 确认 `git status --porcelain` 不出现 `frontend/dist/`、`node_modules/` 等被忽略产物
  - Plan.md / Tasks.md 全部 Task 置 DONE、Plan 状态置 DONE 并填写完成日期与回归测试结论，按 AGENTS.md Archive 流程移入 `.docs/08-29-v2/`（`.docs/08-29-v1` 已被上一阶段占用，当天版本号顺延）
  - Git Commit：Conventional Commits 类型前缀 + 中文详细描述（见 SCOPE.md 全局备注 7）
- **Acceptance Criteria**：
  - 上述六条命令退出码全为 0
  - `git status --porcelain` 不出现 `frontend/dist/` 或 `node_modules/` 条目
  - 归档目录 `.docs/08-29-v2/` 同时含 `Plan.md` 与 `Tasks.md`，根目录无残留

---

## 依赖与优先级

| Task | 依赖 | 优先级 |
|------|------|--------|
| TASK-001 | — | P0 |
| TASK-002 | TASK-001 | P0 |
| TASK-003 | TASK-001 | P1 |
| TASK-004 | — | P0 |
| TASK-005 | TASK-004 | P0 |
| TASK-006 | TASK-001 | P0 |
| TASK-007 | TASK-006 | P0 |
| TASK-008 | — | P1 |
| TASK-009 | — | P1 |
| TASK-010 | TASK-002, TASK-005, TASK-007 | P0 |
| TASK-011 | TASK-001 ~ TASK-010 | P2 |
| TASK-012 | TASK-011 | P2 |

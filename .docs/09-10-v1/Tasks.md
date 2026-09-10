# Tasks：编辑页面文本选中高亮可见性修复与选区令牌标准化

**关联 Plan**：`Plan.md` —— 编辑页面文本选中高亮可见性修复与选区令牌标准化 v1.0  
**总计 Task**：4 个

---

## Phase 1：选区令牌体系与活动行图层重构

### TASK-001：重构编辑器活动行背景透明度并引入选区语义令牌

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 中增加 `--blue-200` 原始调色板色值，在明暗主题中分别定义 `--selection-bg` 与 `--editor-active-line` 语义令牌，将 `.cm-activeLine` 重构为使用低透明度背景，并将 CodeMirror 选区与全局 `::selection` 切换为 `--selection-bg`。
- **Details**：
  - 在 `frontend/src/style.css` 的 state 调色板区（第 23-28 行）添加 `--blue-200: #bfdbfe;`；
  - 在深色模式 `:root`（第 60-70 行）添加 `--selection-bg: rgba(37, 99, 235, 0.45);` 与 `--editor-active-line: rgba(255, 255, 255, 0.04);`；
  - 在浅色模式 `:root[data-theme="light"]`（第 100-110 行）添加 `--selection-bg: var(--blue-200);` 与 `--editor-active-line: rgba(24, 24, 27, 0.04);`；
  - 将 `:root[data-theme] .cm-editor .cm-activeLine` 的背景由 `var(--surface-hover)` 改为 `var(--editor-active-line)`；
  - 将 `:root[data-theme] .cm-editor .cm-selectionBackground, :root[data-theme] .cm-editor.cm-focused .cm-selectionBackground` 的背景由 `var(--accent-soft)` 改为 `var(--selection-bg)`；
  - 从该规则组中删除第三个选择器 `:root[data-theme] .cm-editor .cm-content ::selection`：drawSelection 经 `hideNativeSelection` 以 `background-color: ... !important` 把行内原生选区置为透明，该声明恒不生效，改值只会保留死代码；
  - 增加全局规则 `::selection { background: var(--selection-bg); }`，使预览区与输入控件等仍走原生选区的文本收敛到同一令牌。
- **Acceptance Criteria**：
  - 运行命令 `grep -n "selection-bg" frontend/src/style.css` 退出码为 0，输出显示深浅模式两处语义令牌声明及选区样式绑定
  - 运行命令 `grep -n "editor-active-line" frontend/src/style.css` 退出码为 0，输出显示深浅模式两处半透明令牌声明及 `.cm-activeLine` 绑定
  - 运行命令 `grep -A 2 -n "cm-editor .cm-activeLine" frontend/src/style.css` 输出包含 `background: var(--editor-active-line);`
  - 运行命令 `grep -c "cm-content ::selection" frontend/src/style.css` 输出为 `0`（死声明已删除）
- **Dependencies**：无
- **Priority**：P0

---

## Phase 2：外壳与预览区双向令牌对齐与契约更新

### TASK-002：对称更新预览主题令牌、清理浅色主题冗余选区声明与契约测试

- **Status**：DONE
- **Description**：在预览主题令牌样式表与 base.css 中接入 `--selection-bg`，删除 CodeMirror 浅色语法主题中被外壳规则覆盖的冗余选区声明，并同步更新 Go 与 Node 契约测试以维持单一事实来源。
- **Details**：
  - 在 `internal/theme/assets/theme/tokens-dark.css` 中添加 `--selection-bg: rgba(37, 99, 235, 0.45);`；
  - 在 `internal/theme/assets/theme/tokens-light.css` 中添加 `--selection-bg: #bfdbfe;`；
  - 将 `internal/theme/assets/theme/base.css` 的 `::selection` 样式改为 `background: var(--selection-bg);`；
  - 删除 `frontend/src/main.ts` 中 `lightSyntax` 的选区规则（第 494-496 行）：其 focused 选择器与外壳 `:root[data-theme] .cm-editor.cm-focused .cm-selectionBackground` 具体度相同，且外壳样式表后加载，实际生效色始终来自外壳令牌，保留会形成双源；
  - 在 `internal/theme/theme_test.go` 的 `TestTokenValues` 中为 "dark" 添加 `"--selection-bg": "rgba(37, 99, 235, 0.45)"`、为 "light" 添加 `"--selection-bg": "#bfdbfe"` 断言；
  - 在 `frontend/tests/uiContract.test.mjs` 的 `state` 中添加 `'--blue-200': '#bfdbfe'`，并在 `darkTokens` 与 `lightTokens` 期望表中分别添加 `'--selection-bg': 'rgba(37, 99, 235, 0.45)'` 与 `'--selection-bg': '#bfdbfe'` 断言；
  - 在 `frontend/tests/uiContract.test.mjs` 中补充静态规则断言：`.cm-activeLine` 绑定 `var(--editor-active-line)`、`.cm-selectionBackground` 绑定 `var(--selection-bg)`、`base.css` 的 `::selection` 绑定 `var(--selection-bg)`，并断言深浅两组 `--editor-active-line` 声明值。
- **Acceptance Criteria**：
  - 运行命令 `go test ./internal/theme` 退出码为 0 且输出包含 `ok`
  - 运行命令 `node frontend/tests/uiContract.test.mjs` 退出码为 0 且输出包含 `ui contract self-check: OK`
  - 运行命令 `npm test --prefix frontend` 退出码为 0 且全部用例通过
- **Dependencies**：TASK-001
- **Priority**：P0

---

## Phase 3：无头浏览器交互回归与全链构建验证

### TASK-003：编写选区可见性与图层层级自动化无头回归检查

- **Status**：DONE
- **Description**：在 `frontend/tests/startup.check.mjs` 中扩充无头 Chrome 选区图层可见性用例，机械验证单行选区不被活动行遮挡、且选区计算色与令牌一致。
- **Details**：
  - 在 `frontend/tests/startup.check.mjs` 场景末尾增加 `selection-visibility` 用例（此时文档为启动文档加一次尾随输入，首行是 `# word`）：
    1. 点击 `[data-mode="editor"]` 切至编辑模式，取视图实例 `const view = document.querySelector('.cm-content').cmTile.root.view;`（CM6 的 Tile 构造器在 DOM 元素上写入 `cmTile`，与 `EditorView.findFromDOM` 同一内部路径），调用 `view.focus()`；
    2. 派发单行选区 `view.dispatch({ selection: { anchor: 2, head: 6 } })`（范围为文档内的 `word`；超出文档长度的锚点会被钳制成空选区，不会产生任何选区标记）；
    3. `waitFor` `.cm-selectionBackground` 出现（图层经异步 measure 重建），断言其 `getBoundingClientRect()` 宽高均大于 0；
    4. 断言 `.cm-activeLine` 的矩形与选区标记矩形纵向相交（选区落在激活行上，即用户报告的单行场景），且 `.cm-activeLine` 计算背景 alpha < 1（不再是 `var(--surface-hover)` 的不透明值），确保底层选区层不被遮蔽；
    5. 断言暗色模式下 `.cm-selectionBackground` 计算背景色为 `rgba(37, 99, 235, 0.45)`；
    6. 点击 `#btn-settings` 打开设置对话框、点击 `#set-theme-light`，`waitFor` `document.documentElement.dataset.theme === 'light'`，重新 `waitFor` 选区标记后断言计算背景色为 `rgb(191, 219, 254)`；
  - 更新 `frontend/tests/startup.check.mjs` 头部注释，把选区可见性纳入该脚本的职责说明；
  - 执行 `npm run build --prefix frontend` 编译完整产物后运行无头回归。
- **Acceptance Criteria**：
  - 运行命令 `npm run build --prefix frontend && node frontend/tests/startup.check.mjs` 退出码为 0 且输出包含 `selection-visibility: PASS` 与 `ALL PASS`
- **Dependencies**：TASK-001, TASK-002
- **Priority**：P1

### TASK-004：执行全量回归验证并更新 Project.md 架构文档

- **Status**：DONE
- **Description**：执行后端全量测试与前端构建验证链，依据实际实现同步更新 `.docs/Project.md` 的维护记录与架构约定。
- **Details**：
  - 运行 `go test ./...` 确保所有 Go 模块通过测试；
  - 运行 `cd frontend && npm test` 确保全部前端契约通过测试；
  - 在 `.docs/Project.md` 的 §4 架构与数据流、§6 约束与已知坑、§8 决策记录中记录本次选区令牌与活动行图层重构：§6 增加「CM6 选区层是 `.cm-scroller` 内负 z-index 图层，行元素背景必须保持半透明（当前约 4%），不透明背景会遮蔽选区」的坑位，§8 记录选区令牌与弱强调令牌分离、浅色语法主题冗余声明删除的决策。
- **Acceptance Criteria**：
  - 运行命令 `go test ./...` 退出码为 0 且所有测试通过
  - 运行命令 `cd frontend && npm test` 退出码为 0 且全部自检通过
  - 运行命令 `git diff .docs/Project.md` 退出码为 0 且输出显示已记录本次选区修复与令牌决策
- **Dependencies**：TASK-001, TASK-002, TASK-003
- **Priority**：P1

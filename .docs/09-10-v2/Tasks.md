# Tasks：本轮选区修复遗留缺陷批判性修复

**关联审计**：最新归档更新（`.docs/09-10-v1/`）的代码质量与工程设计审计报告（6 项）
**总计 Task**：6 个
**状态**：DONE
**完成日期**：2026-09-10
**回归结论**：`go vet ./...` + `go test ./...`（5 包）全通过；`cd frontend && npm test`（fontCommit/gutter/tocGutter/renderScheduler/uiContract）全通过；`npm run build` 后 `node frontend/tests/startup.check.mjs` 连续 10 次 ALL PASS（修复前同一脚本 6 连跑出现 1 次 `stage=selection-visibility` 超时；调试副本仅派发前 measure 仍 2/20 超时，派发前后各一次同步 measure 后 25/25 通过）

---

## Phase 1：令牌契约与样式健壮性

### TASK-001：语义令牌改用调色板 alpha 通道并为聚焦选区规则补图层特异性

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 的 raw palette 中登记 `--selection-bg` / `--editor-active-line` 所需的半透明色值，语义层不再内嵌字面量；聚焦选区选择器补充 `.cm-selectionLayer` 层级类，摆脱对样式表加载顺序的依赖；同步更新 `frontend/tests/uiContract.test.mjs` 断言。
- **Details**：
  - `frontend/src/style.css` raw palette 区（`--success` 之后）新增：
    - `--blue-600-a45: rgba(37, 99, 235, 0.45);`
    - `--white-a04: rgba(255, 255, 255, 0.04);`
    - `--zinc-900-a04: rgba(24, 24, 27, 0.04);`
  - 深色 `:root`：`--selection-bg: var(--blue-600-a45);`、`--editor-active-line: var(--white-a04);`
  - 浅色 `:root[data-theme="light"]`：`--editor-active-line: var(--zinc-900-a04);`（`--selection-bg: var(--blue-200)` 已是引用，保持）
  - 选区选择器组第二行改为 `:root[data-theme] .cm-editor.cm-focused .cm-selectionLayer .cm-selectionBackground`，并加注释说明：oneDark 聚焦选区规则与旧写法同权重，只有多出的图层类让本规则以特异性取胜，而非依赖注入顺序；
  - `frontend/tests/uiContract.test.mjs`：palette 表登记三个新色值；把两条 `--editor-active-line: rgba(...)` 字面量断言改为 `var()` 引用断言；新增 `--selection-bg: var(--blue-600-a45);` 与 `.cm-editor.cm-focused .cm-selectionLayer .cm-selectionBackground` 子串断言。
- **Acceptance Criteria**：
  - 运行命令 `grep -n "blue-600-a45\|white-a04\|zinc-900-a04" frontend/src/style.css` 输出包含调色板定义各 1 处与语义引用各 1 处
  - 运行命令 `grep -c "cm-selectionLayer" frontend/src/style.css` 输出为 `1`（聚焦选择器已带图层类）
  - 运行命令 `node frontend/tests/uiContract.test.mjs` 退出码为 0 且输出包含 `ui contract self-check: OK`
- **Dependencies**：无
- **Priority**：P0

### TASK-002：预览选区显式指定文字色，消除蓝底蓝字

- **Status**：DONE
- **Description**：在 `internal/theme/assets/theme/base.css` 的 `::selection` 中补充 `color: var(--fg);`，并同步 uiContract 断言，使深色模式下被选中的代码关键字（`.chroma .k` 为 `var(--accent)`）不再以同色系文字压在蓝色选区上。
- **Details**：
  - `internal/theme/assets/theme/base.css`：`::selection { background: var(--selection-bg); color: var(--fg); }`
  - `frontend/tests/uiContract.test.mjs`：新增 `hasRule(baseCss, '::selection', 'color: var(--fg)', 'preview selection text')`
  - 两张预览令牌文件与 `theme_test.go` 的色值断言不受影响（仅新增文字色声明）
- **Acceptance Criteria**：
  - 运行命令 `grep -A 3 -n "^::selection" internal/theme/assets/theme/base.css` 输出包含 `color: var(--fg);`
  - 运行命令 `node frontend/tests/uiContract.test.mjs` 退出码为 0 且输出包含 `ui contract self-check: OK`
  - 运行命令 `go test ./internal/theme` 退出码为 0
- **Dependencies**：无
- **Priority**：P1

---

## Phase 2：模式切换测量与无头回归去竞态

### TASK-003：模式切回编辑列时显式请求 CodeMirror 重新测量

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 模式按钮回调中，当切换后编辑器列可见（`mode !== 'preview'`）时调用 `cm.requestMeasure()`，消除 `display:none → 显示` 后 CodeMirror 视口停留在 0x0 陈旧状态的窗口。
- **Details**：
  - 位置：`toolbar.querySelectorAll('.seg button')` 的 click 回调内，`syncGutterVisibility();` 之后；
  - 形式：`if (mode !== 'preview') cm.requestMeasure();`，附注释说明预览模式下编辑列为 `display:none`，重新显示后 CodeMirror 仅靠异步 observer 感知，需显式测量，否则切换后立即派发的选区/滚动会拿到 0x0 几何；
  - `cm` 为已声明的模块级 `EditorView` 实例，`requestMeasure()` 是公开 API，无类型问题。
- **Acceptance Criteria**：
  - 运行命令 `grep -n -B 3 "cm.requestMeasure()" frontend/src/main.ts` 输出显示调用位于模式回调且带 `mode !== 'preview'` 条件
  - 运行命令 `npm run build --prefix frontend` 退出码为 0
- **Dependencies**：无
- **Priority**：P1

### TASK-004：修复无头选区用例竞态并收敛 CodeMirror 私有字段访问

- **Status**：DONE
- **Description**：在 `frontend/tests/startup.check.mjs` 的 `selection-visibility` 用例中，切到编辑模式后先同步 `view.measure()` 再派发选区；把 `cmTile` 私有路径收敛到单个 helper，并在内部结构失效时抛出明确错误。
- **Details**：
  - 用例开头定义 helper：
    ```js
    const editorView = () => {
      const view = document.querySelector('.cm-content')?.cmTile?.root?.view;
      if (!view) throw new Error('cannot reach the CodeMirror view (cmTile internals changed)');
      return view;
    };
    ```
    并注释说明这是 `EditorView.findFromDOM` 的内部同路径、非公开契约，集中一处便于升级时定位；
  - 派发序列：点击编辑模式 → `const view = editorView()` → `view.focus()` → `view.measure()` → `view.dispatch({ selection: { anchor: 2, head: 6 } })` → 再次 `view.measure()`；
  - 采用同步内部 `measure()` 而非公开 `requestMeasure()`：后者只调度动画帧；调试副本实测仅派发前 measure 仍有 2/20 超时（派发后的重绘被排入 measure 请求，依赖 rAF 排空，无头虚拟时间不保证触发），派发前后各一次同步 measure 后 25/25 通过；
  - 注释记录竞态根因：用例切换前编辑列 `display:none`，视图停留在 0x0 测量；CodeMirror 仅通过异步 Intersection/ResizeObserver 感知恢复，且 ResizeObserver 回调带 75ms 静默判定，脏测量下 `RectangleMarker.forRange` 返回空标记列表。
- **Acceptance Criteria**：
  - 运行命令 `grep -n "cmTile" frontend/tests/startup.check.mjs` 输出 2 行，且均位于 `editorView` helper 内（访问表达式与错误提示文案）
  - 运行命令 `grep -c "view.measure()" frontend/tests/startup.check.mjs` 输出为 `2`（派发前后各一次同步测量）
  - 运行命令 `npm run build --prefix frontend && node frontend/tests/startup.check.mjs` 退出码为 0 且输出包含 `selection-visibility: PASS` 与 `ALL PASS`
- **Dependencies**：TASK-001, TASK-002, TASK-003
- **Priority**：P0

### TASK-005：连续 10 次无头回归与前后端全量测试

- **Status**：DONE
- **Description**：以 10 次连续无头检查证明竞态消除（修复前实测 6 连跑出现 1 次 `stage=selection-visibility` 超时），并执行前端、后端全量测试。
- **Details**：
  - 循环执行 `node frontend/tests/startup.check.mjs` 10 次，统计退出码与输出；
  - 执行 `cd frontend && npm test`；
  - 执行 `export PATH=$HOME/.local/go/bin:$PATH && go vet ./... && go test ./...`。
- **Acceptance Criteria**：
  - 10 次无头检查全部退出码为 0 且每次输出包含 `ALL PASS`（无一次 `stage=selection-visibility` 超时）
  - 运行命令 `cd frontend && npm test` 退出码为 0
  - 运行命令 `go vet ./... && go test ./...` 退出码为 0 且全部包 `ok`
- **Dependencies**：TASK-004
- **Priority**：P0

---

## Phase 3：文档维护

### TASK-006：更新 Project.md 的选区通道、坑位与决策记录

- **Status**：DONE
- **Description**：在 `.docs/Project.md` §4 补记选区通道的新增约束（调色板 alpha 通道、聚焦规则图层特异性、模式切换测量、预览选区文字色），§6 增补对应坑位，§8 记录本轮批判性修复决策。
- **Details**：
  - §4「文本选区通道」词条扩充：调色板 alpha 通道（`--blue-600-a45` / `--white-a04` / `--zinc-900-a04`）、聚焦选择器带 `.cm-selectionLayer` 的原因、模式切换后 `cm.requestMeasure()`、预览 `::selection` 强制 `--fg` 文字色；
  - §6 增补坑位：编辑列 `display:none` 期间 CodeMirror 视口停留 0x0，重新显示后须显式 `requestMeasure()`，否则紧接的选区/滚动派发会拿到空标记（无头用例曾因此 30%+ 概率超时）；聚焦选区规则与 oneDark 同权重，仅靠加载顺序决出胜负；
  - §8 新增 2026-09-10 决策条目：以调色板 alpha 通道替代语义层裸 RGBA、选择器补图层类实现特异性确定性、无头用例测量前置 + 私有访问收敛、预览选区文字色收敛 `--fg`；并记录未采纳项（提升选区层 z-index / 仅改外壳）与剩余已知项（外壳既有玻璃/背板字面量保持现状）。
- **Acceptance Criteria**：
  - 运行命令 `git diff .docs/Project.md` 输出显示 §4/§6/§8 均含本轮修复内容
  - 运行命令 `grep -n "selectionLayer\|requestMeasure\|blue-600-a45" .docs/Project.md` 输出非空
- **Dependencies**：TASK-001, TASK-002, TASK-003, TASK-004, TASK-005
- **Priority**：P1

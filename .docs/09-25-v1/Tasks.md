# Tasks：默认模式改为编辑

**关联计划**：`Plan.md`（v1.0，2026-09-25）
**总计 Task**：4 个
**状态**：DONE
**完成日期**：2026-09-25
**回归结论**：`go vet ./... && go test ./...` 通过；`npm test` 通过；`npm run build` 后 `startup.check.mjs` ×6 与 `modeScroll.check.mjs` ×6 全部 ALL PASS

---

## Phase 1：默认模式与工具栏顺序对齐

### TASK-001：将工具栏模式按钮顺序改为 编辑 / 预览 / 分栏 并把默认选中态移到编辑

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 的工具栏模板中，把 `id="tab-editor"` 的按钮移到最前并携带 `class="active"` 与 `aria-selected="true"`，`id="tab-preview"` 按钮退为 `aria-selected="false"` 且不带 `active`，分栏按钮保持末位。
- **Details**：
  - 目标块为 `const toolbar` 的 `toolbar.innerHTML` 三行按钮（现顺序 preview → editor → split）；
  - 仅调整三行的先后与 `class`/`aria-selected` 归属，`id`、`data-mode`、`role`、`aria-controls`、中文标签全部保持不变；
  - 不引入默认模式常量、不新增配置项。
- **Acceptance Criteria**：
  - 运行命令 `grep -n 'data-mode' frontend/src/main.ts` 输出中第一个匹配为 `data-mode="editor"` 且该行含 `aria-selected="true"`，最后一个为 `data-mode="split"`
  - 运行命令 `grep -c 'class="active"' frontend/src/main.ts` 输出为 `1`
- **Dependencies**：无
- **Priority**：P0

### TASK-002：将 pane 初始类由 preview-only 改为 editor-only

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中把 `pane.className = 'pane preview-only'` 改为 `pane.className = 'pane editor-only'`，并更新其上方注释，使注释陈述「首个工具栏 tab 即默认模式」而非具体为 Preview。
- **Details**：
  - `pane` 元素创建处（`const pane = document.createElement('main')`）与其后一行类名赋值；
  - 注释由 Starts in Preview 改为 Starts in Editor；
  - 不触碰 `isPreviewVisible()`／`isTocSidebarVisible()` 等按类名判断的既有函数。
- **Acceptance Criteria**：
  - 运行命令 `grep -n "'pane editor-only'\|'pane preview-only'" frontend/src/main.ts` 仅匹配到 `'pane editor-only'`
  - 运行命令 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（工作目录 `frontend`）退出码为 0
- **Dependencies**：无
- **Priority**：P0

---

## Phase 2：契约与无头自检同步

### TASK-003：同步 uiContract 契约测试的默认模式断言

- **Status**：DONE
- **Description**：在 `frontend/tests/uiContract.test.mjs` 中把模式标签的中文标签校验顺序改为 编辑 / 预览 / 分栏，并新增断言：`aria-selected="true"` 位于编辑 tab、`pane` 初始类为 `pane editor-only`。
- **Details**：
  - 修改第 201 行 `for (const [mode, label] of [...])` 的数组顺序；
  - 在其后追加两条断言（选中项为 editor、初始 pane 类为 editor-only）；
  - 保留既有 `id="tab-*"`、`role="tabpanel"`、`sandbox` 等断言不动。
- **Acceptance Criteria**：
  - 运行命令 `node frontend/tests/uiContract.test.mjs` 退出码为 0 且输出包含 `ui contract self-check: OK`
  - 运行命令 `git diff frontend/tests/uiContract.test.mjs` 包含 `editor-only` 与编辑居首的顺序断言
- **Dependencies**：TASK-001, TASK-002
- **Priority**：P0

### TASK-004：同步 startup 无头自检的首 tab 断言

- **Status**：DONE
- **Description**：在 `frontend/tests/startup.check.mjs` 的 `mode-aria-contract` 用例中，把首按钮断言由「preview 且选中」改为「editor 且选中」，并同步模式存在性数组顺序为 编辑 / 预览 / 分栏。
- **Details**：
  - 修改 `modeButtons[0].getAttribute('aria-selected') === 'true'` 为同时断言 `modeButtons[0].dataset.mode === 'editor'`；
  - 修改 `['preview', 'editor', 'split']` 为 `['editor', 'preview', 'split']`；
  - 不改动其余用例与等待条件。
- **Acceptance Criteria**：
  - 运行命令 `npm run build --prefix frontend` 退出码为 0
  - 运行命令 `node frontend/tests/startup.check.mjs` 退出码为 0 且输出包含 `mode-aria-contract: PASS` 与 `ALL PASS`
- **Dependencies**：TASK-001, TASK-002
- **Priority**：P0

---

## Phase 3：文档维护与回归

### TASK-005：更新 Project.md 默认模式叙述并执行全量回归

- **Status**：DONE
- **Description**：更新 `.docs/Project.md` §4「编辑器与模式」条目为 编辑 / 预览 / 分栏 顺序与 Editor 默认，§1「当前阶段」反映本次变更，§8 追加 2026-09-25 决策记录（保留 2026-08-29 的历史记录不改写），随后执行前端与 Go 全量回归。
- **Details**：
  - §1 当前阶段描述更新为 v1.10 或等价表述，说明默认模式改为编辑；
  - §4「编辑器与模式」：工具栏顺序 Editor / Preview / Split，启动默认 Editor（初始类 `pane editor-only`）；
  - §8 顶部追加：2026-09-25 启动默认模式与工具栏顺序改为 Editor / Preview / Split——理由：默认起始页面改为编辑态；
  - 运行 `cd frontend && npm test`、`npm run build && node tests/startup.check.mjs`、`node tests/modeScroll.check.mjs`、`go vet ./... && go test ./...`。
- **Acceptance Criteria**：
  - 运行命令 `git diff .docs/Project.md` 同时包含 §1、§4、§8 的改动
  - 运行命令 `cd frontend && npm test` 退出码为 0
  - 运行命令 `export PATH=$HOME/.local/go/bin:$PATH && go vet ./... && go test ./...` 退出码为 0
- **Dependencies**：TASK-001, TASK-002, TASK-003, TASK-004
- **Priority**：P0
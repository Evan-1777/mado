# Plan：默认模式改为编辑

**状态**：DONE
**日期**：2026-09-25
**版本**：v1.0
**回归测试结论**：`go vet ./... && go test ./...` 全部通过（5 个包）；`cd frontend && npm test` 全部通过；`npm run build` 后连续 6 次 `node tests/startup.check.mjs` 与 6 次 `node tests/modeScroll.check.mjs` 全部 ALL PASS。

---

## 1. 背景与目标

当前应用启动后落入 Preview（阅读态），工具栏顺序为 预览 / 编辑 / 分栏，该顺序由 2026-08-29 的决策确立（「顺序首位即默认，启动先落阅读态」）。

本次需求将该决策反转：**默认起始页面改为编辑（Editor），工具栏顺序变为 编辑 / 预览 / 分栏**。

目标：

- 启动后 `pane` 初始类为 `pane editor-only`，与工具栏首个 tab 一致；
- 工具栏按钮 DOM 顺序为 编辑 / 预览 / 分栏，`aria-selected="true"` 落在编辑按钮；
- 契约测试与无头自检同步反映新的首 tab，防止默认模式再次漂移；
- 既有模式切换、滚动保持、TOC 可见性、gutter 可见性逻辑不受影响。

## 2. 阶段划分

### Phase 1：默认模式与工具栏顺序对齐（P0）

**输入**：现有 `frontend/src/main.ts` 工具栏模板与 `pane` 初始类。

**产出**：编辑居首、默认 Editor 的工具栏与初始布局状态。

**验收标准**：`grep` 确认首个 `data-mode` 为 `editor`、`aria-selected="true"` 位于编辑按钮、`pane` 初始类含 `editor-only`；`npm test` 通过。

### Phase 2：契约与无头自检同步（P0）

**输入**：`frontend/tests/uiContract.test.mjs` 与 `frontend/tests/startup.check.mjs` 中对首个模式按钮的断言。

**产出**：断言以「编辑为首」为基准，且仍校验三 tab 存在、恰有一个选中、选中项为首 tab。

**验收标准**：`node frontend/tests/uiContract.test.mjs` 与 `npm test` 退出码为 0。

### Phase 3：文档维护与回归（P0）

**输入**：`.docs/Project.md` §1 当前阶段、§4 编辑器与模式、§8 决策记录。

**产出**：Project.md 与代码实际状态一致，新增本次决策记录，保留历史决策不改写。

**验收标准**：`git diff .docs/Project.md` 覆盖上述小节；`go vet ./... && go test ./...`、`npm test`、`npm run build` 全部通过。

## 3. 架构与关键决策

- **默认模式与工具栏顺序共用单一事实**：DOM 顺序首位即默认模式，避免「顺序」与「默认」两处独立状态漂移。本次不新增默认模式常量或配置项。
- **不改动模式切换逻辑**：`editor|preview|split` 三态切换、预览滚动保存/恢复、CodeMirror 同步测量均为模式无关实现，仅标签顺序与初始类变化，无需改动切换 handler。
- **不引入「记住上次模式」等新行为**：需求仅为默认值调整，超出范围的功能一律不做。

## 4. 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| 只改默认类未改按钮顺序，导致 UI 顺序与默认态不一致 | 首屏选中项不在首位，用户困惑 | Phase 1 同时修改模板顺序与初始类，并用契约测试锁定 |
| 无头自检 `mode-aria-contract` 硬编码首按钮为 preview | 默认模式变更后自检失败 | Phase 2 同步断言为编辑居首 |
| 编辑态启动下预览 iframe 处于隐藏态 | 首帧写入 / gutter 可见性回归 | Phase 3 执行 `startup.check.mjs` 全量回归 |

**依赖**：无外部依赖；`modeScroll.check.mjs` 仅按 `data-mode` 选择器操作，不依赖顺序，无需修改。

## 5. 范围外

- 不新增/移除模式，不改变分栏行为；
- 不持久化「上次使用模式」；
- 不改动 Go 侧任何代码。

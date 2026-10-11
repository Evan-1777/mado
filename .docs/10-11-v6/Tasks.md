# Tasks：批判性吸收 Review 审阅报告并修复残留问题（10-11-v6）

**关联 Plan**：`Plan.md` —— 批判性吸收 Review 审阅报告并修复残留问题（10-11-v6）  
**总计 Task**：3 个

---

## Phase 1：隔离文档容器与样式隔离

### TASK-001：在 pdfExporter.ts 中改用隔离离屏 iframe 作为捕获容器，对齐深色背景色并移除 100 页静默截断

- **Status**：DONE
- **Executor**：主线
- **Description**：重构 `frontend/src/pdfExporter.ts` 的宿主创建逻辑，使用离屏 `iframe` 替代直接在主文档 `document.body` 注入样式与节点，对齐深色背景为 `#1f1f1f`，并移除 `MAX_EXPORT_PAGES` 静默截断。
- **Details**：
  - 创建离屏隐藏 `iframe`（`width: ${A4_WIDTH_PX}px; height: ${A4_HEIGHT_PX}px; position: fixed; left: 0; top: 0; opacity: 0; pointer-events: none; border: 0`）。
  - 在 `iframe.contentDocument` 内构建 HTML 骨架并注入 `katexLink` 与 `baseThemeCss`，彻底杜绝全局样式泄漏到外壳。
  - 在 `iframe` 内提供重置样式：`html, body { margin: 0; padding: 0; max-width: none; width: ${contentWidth}px; overflow: hidden; background: ${pageBg}; color: ${pageFg}; }`。
  - 将深色模式背景值统一收敛为 `#1f1f1f`（浅色为 `#ffffff`），消除切片与外层 A4 边距接缝。
  - 移除 `if (pageRanges.length > MAX_EXPORT_PAGES) pageRanges.length = MAX_EXPORT_PAGES` 逻辑，消除丢内容隐患。
  - 在 `finally` 块中彻底移除 `iframe` 节点。
- **Acceptance Criteria**：
  - 导出期间主文档 `document.body` 的 `paddingTop` 保持为 `0px`，`maxWidth` 保持为 `none`，`backgroundColor` 不被修改。
  - `node tests/pdfBuilder.test.ts` 通过。

---

## Phase 2：页边距精度对齐与配置精准忽略

### TASK-002：修正 pdfExporter.ts 页边距像素数值以真实匹配界面 20mm/10mm/30mm 标注，并将 .gitignore 范围收窄

- **Status**：DONE
- **Executor**：主线
- **Description**：将 `pdfExporter.ts` 中的 `MARGIN_SPECS` 像素值按 96 DPI（3.78 px/mm）精确对齐为 76px / 38px / 114px，并将 `.gitignore` 中的 `.codebuddy/` 规则收窄为 `.codebuddy/*.local.json`。
- **Details**：
  - `std` (20mm): `{ top: 76, bottom: 76, left: 76, right: 76 }`
  - `compact` (10mm): `{ top: 38, bottom: 38, left: 38, right: 38 }`
  - `wide` (30mm): `{ top: 114, bottom: 114, left: 114, right: 114 }`
  - 更新 `.gitignore`，将 `.codebuddy/` 改为 `.codebuddy/*.local.json`，确保 `.codebuddy/agents/*` 与 `.codebuddy/skills/*` 正常纳管。
- **Acceptance Criteria**：
  - 边距像素数值严格吻合界面毫米预设。
  - `git status` 正常感知 `.codebuddy` 跟踪状态，忽略本地配置。

---

## Phase 3：外壳零污染断言与全量回归

### TASK-003：在 export.check.mjs 中添加外壳 body 几何/背景零污染断言并验证全栈

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `frontend/tests/export.check.mjs` 中添加针对外壳 `document.body` 样式（`maxWidth`、`paddingTop`、`fontSize`、`backgroundColor`）在导出前后及导出过程中零污染的断言用例，并运行全栈测试。
- **Details**：
  - 记录导出前外壳 `body` 的 computedStyle 快照。
  - 在导出中及导出后断言快照与当前计算样式严格一致。
  - 执行 `go test ./...`、`npm test`、`npm run build`、`node tests/export.check.mjs`。
- **Acceptance Criteria**：
  - `export.check.mjs` 输出 `shell-layout-unpolluted: PASS` 且全流程 PASS。
  - 全套构建与测试 100% 绿色。

# Tasks：批判性吸收 Review 审阅报告并修复残留问题

**关联 Plan**：无（Quick 模式）  
**状态**：DONE  
**完成日期**：2026-10-11  
**回归测试结论**：全部通过（npm test、npm run build、tests/modeScroll.check.mjs、tests/startup.check.mjs、go test ./... 全部通过）  
**总计 Task**：4 个（已完成 4 个）  

---

### TASK-001：补齐导出 iframe 沙箱隔离与打印异常清理保证

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：无
- **Executor**：主线
- **Description**：在 `frontend/src/main.ts` 中为离屏打印 iframe 补齐 `sandbox="allow-same-origin"` 属性，并在打印调用处添加同步异常捕获兜底清理。
- **Details**：
  - 在创建离屏 iframe 时调用 `iframe.setAttribute('sandbox', 'allow-same-origin')`，严格对齐主预览 iframe 的安全沙箱契约，阻断 Markdown 原生 HTML 内联 `on*` 事件在同源帧中执行。
  - 在 `runExport()` 的 `printWin.focus()` / `printWin.print()` 调用处增加异常捕获，若打印调用发生同步异常，立即执行 `cleanup()` 移除离屏 DOM，防止节点泄漏。
- **Acceptance Criteria**：
  - 导出 iframe 明确具备 `sandbox="allow-same-origin"`。
  - 任何调用异常分支均能立即清理离屏 iframe。

---

### TASK-002：剔除装饰性卡片并为分段器添加 ARIA 无障碍状态

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：无
- **Executor**：主线
- **Description**：在 `frontend/index.html`、`frontend/src/style.css` 与 `frontend/src/main.ts` 中删除静态装饰的 `.sheet-preview-card`，并为色彩与边距分段器添加 `aria-pressed` 状态同步。
- **Details**：
  - 从 `frontend/index.html` 移除 `.sheet-preview-card` 结构。
  - 从 `frontend/src/style.css` 移除 `.sheet-preview-card`、`.mini-sheet`、`.mini-line`、`.mini-desc` 样式定义，消减无关 CSS 体积。
  - 在 `frontend/index.html` 的分段器按钮上添加 `aria-pressed="true"`（默认选中项）与 `aria-pressed="false"`（未选中项）。
  - 在 `frontend/src/main.ts` 的分段器点击处理中，为同组全部按钮同步切换 `aria-pressed`。
- **Acceptance Criteria**：
  - 模态弹窗更紧凑自洽，无虚假示意卡片。
  - 分段器具备屏幕阅读器无障碍状态。

---

### TASK-003：扩充 uiContract 契约测试与安全/无障碍断言

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001, TASK-002
- **Executor**：主线
- **Description**：在 `frontend/tests/uiContract.test.mjs` 中增加针对导出 iframe 沙箱、分段器 `aria-pressed` 状态及剔除装饰卡片的契约检查。
- **Details**：
  - 断言 `frontend/src/main.ts` 中导出 iframe 明确设置 `sandbox="allow-same-origin"`。
  - 断言 `frontend/index.html` 包含 `aria-pressed="true"` 与 `aria-pressed="false"`。
  - 断言 `frontend/index.html` 与 `frontend/src/style.css` 不再包含 `sheet-preview-card`。
- **Acceptance Criteria**：
  - `cd frontend && npm test` 零错误通过。

---

### TASK-004：同步更新 Project.md 事实文档并核销审阅项

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-001, TASK-002, TASK-003
- **Executor**：主线
- **Description**：更新 `.docs/Project.md` 中的架构决策与安全说明，保持文档与代码库一致。
- **Details**：
  - 在约束与决策中补充记录：导出 iframe 统一采用 `sandbox="allow-same-origin"` 维持全局沙箱契约。
  - 记录分段器无障碍契约与异常清理保障。
- **Acceptance Criteria**：
  - `Project.md` 与实际代码库状态严格一致。

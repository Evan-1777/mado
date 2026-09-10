# Tasks：快速批判性修复上轮遗留问题

**关联审计**：上轮交付（`.docs/09-10-v2/`）的 4 项关键审查与遗留问题（特异性认知失准、预览选区语法高亮丢失、模式切换测量实现割裂、调试脚本残留）
**总计 Task**：6 个
**状态**：DONE
**完成日期**：2026-09-10
**回归结论**：`export PATH=$HOME/.local/go/bin:$PATH && go vet ./... && go test -race ./...` 全部通过；`cd frontend && npm test` 全部通过；`npm run build` 后 10 次连续 `node tests/startup.check.mjs` 全部 ALL PASS；`node tests/modeScroll.check.mjs` 全部 ALL PASS；无未跟踪临时调试文件残留。

---

## Phase 1：清洁与正交性修复

### TASK-001：清理工作区未跟踪临时调试脚本残留

- **Status**：DONE
- **Description**：删除上轮任务遗留的 `frontend/tests/debug_inspect.mjs` 与 `frontend/tests/debug_raf.mjs`，恢复工作区清洁状态，满足 SCOPE.md:6 与 AGENTS.md:89 约束。
- **Details**：
  - 移除 `frontend/tests/debug_inspect.mjs`；
  - 移除 `frontend/tests/debug_raf.mjs`；
  - 确认 `git status` 中无任何调试临时脚本。
- **Acceptance Criteria**：
  - 运行命令 `test ! -f frontend/tests/debug_inspect.mjs && test ! -f frontend/tests/debug_raf.mjs` 退出码为 0
  - 运行命令 `git status --porcelain frontend/tests/` 不包含任何 `debug_*.mjs`
- **Dependencies**：无
- **Priority**：P0

### TASK-002：恢复预览选区文本语法高亮并更新契约测试

- **Status**：DONE
- **Description**：删除 `internal/theme/assets/theme/base.css` 中全局 `::selection` 粗暴注入的 `color: var(--fg);`，恢复划选代码时的语法着色，保持与 CodeMirror 独立选区图层体验严格对称；同步更新 `frontend/tests/uiContract.test.mjs` 契约断言。
- **Details**：
  - 将 `internal/theme/assets/theme/base.css` 中的 `::selection` 恢复为仅声明 `background: var(--selection-bg);`，删除覆盖全文字色的 `color: var(--fg);`；
  - 在 `frontend/tests/uiContract.test.mjs` 中删除针对 `color: var(--fg)` 的 `hasRule` 规则检查，保留 `background: var(--selection-bg)` 断言。
- **Acceptance Criteria**：
  - 运行命令 `grep "color: var(--fg)" internal/theme/assets/theme/base.css` 在 `::selection` 块内无匹配
  - 运行命令 `node frontend/tests/uiContract.test.mjs` 退出码为 0 且输出包含 `ui contract self-check: OK`
  - 运行命令 `go test ./internal/theme` 退出码为 0
- **Dependencies**：无
- **Priority**：P0

---

## Phase 2：模式切换源头同步测量与无头回归解耦

### TASK-003：模式切换在生产源头同步执行 CodeMirror 测量

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 的模式切换回调中，当切回编辑器可见模式（`mode !== 'preview'`）时，直接同步调用 `view.measure()`（带降级 `requestMeasure()`），在生产模型源头彻底消除可见性恢复后的 0x0 几何真空期与潜在竞争。
- **Details**：
  - 在 `toolbar.querySelectorAll('.seg button')` 回调中，`syncGutterVisibility()` 之后：
    ```ts
    if (mode !== 'preview') {
      const view = cm as unknown as { measure?: () => void; requestMeasure: () => void };
      if (typeof view.measure === 'function') {
        view.measure();
      } else {
        cm.requestMeasure();
      }
    }
    ```
  - 同步测量立即刷新 DOM 视口与行几何，防止切换模式后紧随的选区派发、滚动或自动化操作拿到失效尺寸。
- **Acceptance Criteria**：
  - 运行命令 `grep -A 8 "if (mode !== 'preview')" frontend/src/main.ts` 输出包含同步 `measure()` 调用
  - 运行命令 `npm run build --prefix frontend` 退出码为 0
- **Dependencies**：无
- **Priority**：P0

### TASK-004：无头用例解耦私有方法穿透并用公开布局读取验证

- **Status**：DONE
- **Description**：解除 `frontend/tests/startup.check.mjs` 中在选区派发前后两次穿透调用私有方法 `view.measure()` 的硬编码变通方案，利用生产端已具备的同步测量保证，派发后仅通过公开 API `view.coordsAtPos(2)` 触发 CodeMirror 标准布局排空并验证选区标记。
- **Details**：
  - 移除派发前的 `view.measure()` 调用；
  - 将派发后的私有 `view.measure()` 调用替换为公开的 `view.coordsAtPos(2)`；
  - 更新注释说明生产源头已同步测量，测试端无需 hack 穿透。
- **Acceptance Criteria**：
  - 运行命令 `grep -c "view.measure()" frontend/tests/startup.check.mjs` 输出为 `0`
  - 运行命令 `npm run build --prefix frontend && node frontend/tests/startup.check.mjs` 退出码为 0 且输出包含 `selection-visibility: PASS` 与 `ALL PASS`
- **Dependencies**：TASK-003
- **Priority**：P0

---

## Phase 3：认知修正与文档维护

### TASK-005：修正样式表与契约注释中对 CodeMirror 机制的认知断言

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 与 `frontend/tests/uiContract.test.mjs` 中修正有关 CodeMirror 样式层叠特异性与加载机制的注释，准确陈述 style-mod 运行时注入 head.firstChild、baseTheme (0,6,0) 与 downstream `<link>` 级联的真实机制，清除“esbuild 打包排序”与“纯特异性确定胜出”的脱节断言。
- **Details**：
  - `frontend/src/style.css` 聚焦选区规则上方注释修正为客观的技术陈述；
  - `frontend/tests/uiContract.test.mjs` 对应注释同步更新。
- **Acceptance Criteria**：
  - 运行命令 `grep -i "esbuild.*order\|specificity instead of" frontend/src/style.css frontend/tests/uiContract.test.mjs` 输出为空
  - 运行命令 `node frontend/tests/uiContract.test.mjs` 退出码为 0
- **Dependencies**：TASK-002
- **Priority**：P1

### TASK-006：更新 Project.md 选区通道、坑位与决策记录并全量回归

- **Status**：DONE
- **Description**：在 `.docs/Project.md` §4 修正选区通道叙述（保留语法高亮、同步测量、准确特异性机制），§6 修正对应坑位记录，§8 增记 09-10-v3 决策项，并执行全量端到端与无头回归测试。
- **Details**：
  - §4 更新「文本选区通道」：移除 `color: var(--fg)`，明确保留代码语法高亮；更正选择器层叠与同步测量说明；
  - §6 更新相关约束与坑位：更正 CodeMirror 主题注入机制与模式切换同步测量说明；
  - §8 新增 2026-09-10（09-10-v3）批判性修复决策记录；
  - 执行 `npm test`、连续 10 次 `startup.check.mjs`、`modeScroll.check.mjs`、Go 单元测试与竞态检测。
- **Acceptance Criteria**：
  - 运行命令 `git diff .docs/Project.md` 包含 §4、§6、§8 的更新
  - 运行命令 `cd frontend && npm test` 退出码为 0
  - 运行命令 `export PATH=$HOME/.local/go/bin:$PATH && go vet ./... && go test -race ./...` 退出码为 0
- **Dependencies**：TASK-001, TASK-002, TASK-003, TASK-004, TASK-005
- **Priority**：P0

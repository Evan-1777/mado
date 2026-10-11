# Tasks：修复文档导出未调起打印窗口缺陷

**关联 Plan**：`Plan.md` —— 修复文档导出未调起打印窗口缺陷 v1.0  
**状态**：DONE  
**完成日期**：2026-10-11  
**回归测试结论**：esbuild 语法检查、前端 5 项自检与全量 Go 测试均全部通过（退出码 0）  
**总计 Task**：3 个（已完成 3 个）

---

## Phase 1：沙箱权限修复

### TASK-001：补齐导出 iframe 沙箱的 allow-modals 权限

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `frontend/src/main.ts` 中将导出 iframe 的 sandbox 属性由 `allow-same-origin` 调整为 `allow-same-origin allow-modals`。
- **Details**：
  - 定位 `frontend/src/main.ts` 的 `runExport()` 函数内部第 1204 行
  - 将 `iframe.setAttribute('sandbox', 'allow-same-origin');` 替换为 `iframe.setAttribute('sandbox', 'allow-same-origin allow-modals');`
  - 严禁引入 `allow-scripts`，确保 Markdown 渲染输出中的潜在内联脚本（如 `onerror` 等）仍被可靠阻断
- **Acceptance Criteria**：
  - `frontend/src/main.ts` 源码中导出 iframe 显式声明 `allow-same-origin allow-modals` 且不包含 `allow-scripts`
  - 执行 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 零产物语法检查通过

---

## Phase 2：契约测试与构建验证

### TASK-002：更新 uiContract 契约测试并执行构建验证

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `frontend/tests/uiContract.test.mjs` 中同步更新沙箱属性检查，运行全量前端自检并完成打包构建。
- **Details**：
  - 定位 `frontend/tests/uiContract.test.mjs` 第 242 行
  - 将 `has(ts, "iframe.setAttribute('sandbox', 'allow-same-origin')", 'export iframe sandbox');` 更新为 `has(ts, "iframe.setAttribute('sandbox', 'allow-same-origin allow-modals')", 'export iframe sandbox');`
  - 在 `frontend` 目录执行 `npm test`（覆盖 fontCommit、gutter、tocGutter、renderScheduler、uiContract 5 项自检）
  - 在 `frontend` 目录执行 `npm run build`，产出最新 `dist/` 构建物供 Go embed 使用
- **Acceptance Criteria**：
  - `npm test` 退出码为 0，无任何失败断言
  - `npm run build` 成功完成打包，生成 `frontend/dist/app.js`

---

## Phase 3：文档维护

### TASK-003：同步维护 Project.md 架构契约与数据流

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `.docs/Project.md` 中同步更新数据流与约束决策中关于导出沙箱的说明。
- **Details**：
  - 在「数据流」章节的「文档导出为 PDF」条目中，将沙箱描述同步更新为 `sandbox="allow-same-origin allow-modals"`
  - 在「约束与决策」章节更新导出 iframe 沙箱条目，记录授予 `allow-modals` 解除 Chromium sandboxed modals 限制的根因与依据
- **Acceptance Criteria**：
  - `.docs/Project.md` 内容与代码库最新修改完全一致，无陈旧描述残留

---

## 交付后手动验收（Windows 目标环境）

依据 `Project.md:143` 确立的分工边界，Linux 开发环境完成上述静态契约与构建验证后，真实 UI 行为交由 Windows 实机验收：
- [ ] 在 Windows 10/11 环境启动构建二进制 `mado.exe`
- [ ] 打开任意 Markdown 文档并点击标题栏「导出为 PDF」按钮
- [ ] 在导出配置弹窗点击「导出」按钮，确认正常唤起系统原生打印设置/PDF导出预览窗口

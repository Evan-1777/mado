# Plan：修复文档导出未调起打印窗口缺陷

**状态**：DONE  
**日期**：2026-10-11  
**版本**：v1.0  
**回归测试结论**：esbuild 语法检查、前端 5 项自检（fontCommit、gutter、tocGutter、renderScheduler、uiContract）及全量 Go 单测与竞态验证（go test -race ./...）全部通过，静态契约断言与前端构建验证无回归。

---

## 1. 背景与目标

在提交 `1ae72b3`（10-11-v2 归档）后，用户点击「导出为 PDF」弹窗内的「导出」按钮时，弹窗正常关闭，但系统打印窗口未被调起，导出操作完全静默失效。

### 缺陷溯源与根因分析
- 在 10-11-v2 中，为了对齐主预览 iframe 的安全隔离要求，向离屏导出 iframe 增加了 `sandbox="allow-same-origin"` 属性。
- 根据 HTML 与 Chromium 规范，包含 `sandbox` 属性的 browsing context 默认启用 sandboxed modals 限制。当未授予 `allow-modals` 权限时，任何对 `window.print()`、`window.alert()` 等模态对话框的调用均会被 Chromium 直接忽略，并在控制台输出：
  `Ignored call to 'print()'. The document is sandboxed, and the 'allow-modals' keyword is not set.`
- 该忽略行为属于静默丢弃，不抛出同步 JS 异常，导致 `try/catch` 无法捕获；同时表单正常提交使得 `<dialog>` 关闭，且后续 1 秒兜底定时器移除了 iframe，最终表现为弹窗关闭且无任何系统窗口唤起。

### 本次目标
1. 在保持阻止 Markdown 潜在内联脚本（不授予 `allow-scripts`）的安全前提下，为离屏导出 iframe 补齐 `allow-modals` 权限（即 `sandbox="allow-same-origin allow-modals"`）。
2. 同步更新 `frontend/tests/uiContract.test.mjs` 中的契约检查，并通过前端全部自动化测试及重新构建。
3. 同步维护 `.docs/Project.md` 中的数据流与架构决策描述。

---

## 2. 阶段划分

### Phase 1：沙箱权限修复
| 项目 | 内容 |
|------|------|
| **输入** | `frontend/src/main.ts` 中的 `runExport()` 实现 |
| **输出** | `iframe.setAttribute('sandbox', 'allow-same-origin allow-modals')` |
| **验收标准** | 导出 iframe 源码显式声明 `allow-same-origin allow-modals` 且不含 `allow-scripts`；通过 esbuild 零产物语法检查；运行时实际打印 UI 唤起行为交由 Windows 实机手动验收 |

### Phase 2：契约测试与构建验证
| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 修改后的源码及 `frontend/tests/uiContract.test.mjs` |
| **输出** | 更新后的 `uiContract.test.mjs`、重新构建的 `frontend/dist/app.js` |
| **验收标准** | `npm test` 中包含 uiContract 在内的 5 项自检测试全部通过（退出码 0）；`npm run build` 构建成功且无错误 |

### Phase 3：文档维护
| 项目 | 内容 |
|------|------|
| **输入** | 本次契约更新细节 |
| **输出** | 更新后的 `.docs/Project.md` |
| **验收标准** | `Project.md` 中的「数据流」与「约束与决策」准确记录 `allow-same-origin allow-modals` 的配置依据与 Chromium 模态拦截背景 |

---

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 导出 iframe 沙箱策略 | `sandbox="allow-same-origin allow-modals"` | 授予 `allow-modals` 解除 Chromium 对 `window.print()` 的模态阻断；未配置 `allow-scripts` 继续有效防御 Markdown 原生 HTML 内联 `on*` 脚本执行 | 仅配置 `allow-modals`（若缺失 `allow-same-origin`，`srcdoc` 帧将退化为不透明独特源，导致父级无法跨源访问 `contentDocument` 进行 KaTeX 回填与调用 `print()`）；移除 `sandbox` 属性（放弃内联脚本隔离，破坏既有安全边界）；授予 `allow-scripts`（违背最小权限原则，导致内联恶意脚本可在同源执行） |
| 修复层级 | 结构源头修正（main.ts 导出管道初始化处） | 遵循工程纪律，在创建离屏 iframe 的唯一结构源头配置正确的权限契约，不增加多余胶水代码与分支判断 | 在调用点周围增加复杂的异步代理或降级分支（属于末端修补，增加系统复杂度） |

---

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `allow-modals` 是否会突破脚本阻断防护 | 🟢 低 | HTML 规范明确定义 `allow-modals` 仅开放 alert/confirm/prompt/print 等模态交互，代码执行权限完全由 `allow-scripts` 决定；`allow-scripts` 保持缺省即有效隔离脚本执行，实机行为由 Windows 手动验收核对 |
| 契约断言未更新导致 CI / 测试失败 | 🟢 低 | 将 `uiContract.test.mjs` 更新与构建验证纳入 Phase 2 强制验收标准 |

---

## 5. Phase 依赖关系

<div style="display: flex; align-items: center; gap: 12px; margin: 16px 0; padding: 12px 16px; background: #f6f8fa; border: 1px solid #d0d7de; border-radius: 6px; font-size: 13px;">
  <span style="font-weight: 600; padding: 4px 8px; background: #eaeef2; border-radius: 4px;">Phase 1: 沙箱权限修复</span>
  <span style="color: #57606a;">──→</span>
  <span style="font-weight: 600; padding: 4px 8px; background: #eaeef2; border-radius: 4px;">Phase 2: 契约测试与构建</span>
  <span style="color: #57606a;">──→</span>
  <span style="font-weight: 600; padding: 4px 8px; background: #eaeef2; border-radius: 4px;">Phase 3: 文档维护</span>
</div>

三阶段呈严格单向线性依赖，前序阶段输出即为后序阶段输入。

---

## 6. Subagent 协同规划

对照三维效益模型（任务复杂度、上下文关联度、经济与时间效益）评估本次修复：

| 阶段 | 上下文依赖 | 并行收益 | 执行主体 | 决策理由 |
|------|-----------|---------|----------|----------|
| Phase 1：沙箱权限修复 | 强（涉及 main.ts 导出管线及 Chromium 行为） | 无（线性单一改动） | 主线 | 差分极小（单行契约变更），主线处理直接高效，无冷启动开销 |
| Phase 2：契约测试与构建 | 强（依赖 Phase 1 修改） | 无（紧接 Phase 1 验证） | 主线 | 属于主线即时闭环验证，避免上下文传递导致构建产物脱节 |
| Phase 3：文档维护 | 强（依赖 Phase 1/2 最终结论） | 无（归档前收尾） | 主线 | Project.md 同步维护，主线直接编辑无通信成本 |

> **协同结论**：本次任务目标高度聚焦，代码差分小且前后强依赖，启动 Subagent 带来额外的上下文加载开销而无实质并行收益，因此全流程由主线独立完成。

---

> ### Task 拆解预览
>
> | Phase | 预估 Task 数 | 执行主体 | 目标 Task |
> |-------|-------------|----------|-----------|
> | Phase 1 | 1 | 主线 | TASK-001：补齐导出 iframe 沙箱的 allow-modals 权限 |
> | Phase 2 | 1 | 主线 | TASK-002：更新 uiContract 契约测试与前端构建验证 |
> | Phase 3 | 1 | 主线 | TASK-003：同步维护 Project.md 文档 |
>
> **总计预估**：3 个 Task。详细定义见 `Tasks.md`。

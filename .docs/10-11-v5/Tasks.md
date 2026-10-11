# Tasks：批判性吸收 Review 审阅报告并修复残留问题（10-11-v5）

**关联 Plan**：`Plan.md` —— 批判性吸收 Review 审阅报告并修复残留问题（10-11-v5）  
**总计 Task**：5 个

---

## Phase 1：契约修正与主题样式拉取

### TASK-001：修复后端保存对话框错误契约与提供显式主题 CSS 导出方法

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `app.go` 中将 `SavePdfFileDialog` 返回类型改为 `(string, error)`，并新增 `GetThemeCSS(themeName string) (string, error)` 导出方法；在 `main_test.go` 中补齐对应单元测试。
- **Details**：
  - `SavePdfFileDialog` 遇到 `runtime.SaveFileDialog` 错误时直接返回 `("", err)`，用户取消时返回 `("", nil)`。
  - `GetThemeCSS` 接收 `themeName`，读取持久化的 `PreviewFont` 并调用 `theme.ThemeCSS(themeName, font)`。
  - 重构 `GetCSS()` 直接调用 `a.GetThemeCSS(themeName)`，保持代码极简自洽。
  - 在 `main_test.go` 中添加对 `SavePdfFileDialog`（无上下文时报错）与 `GetThemeCSS`（返回对应主题令牌）的测试用例。
- **Acceptance Criteria**：
  - `go test ./...` 全绿。
  - 导出方法签名对齐错误语义。

### TASK-002：前端对齐 SavePdfFileDialog 错误处理并显式拉取目标主题 CSS

- **Status**：DONE
- **Executor**：主线
- **Description**：更新 `frontend/wailsjs/go/main/App.d.ts` 与 `App.js` 绑定，在 `frontend/src/main.ts` 中根据导出选中的主题拉取对应样式并处理对话框异常。
- **Details**：
  - 在 `App.d.ts` 与 `App.js` 补齐 `GetThemeCSS(arg1:string):Promise<string>` 声明与转发。
  - 在 `main.ts` 中：
    - 若选中的为 `'light'`，调用 `GetThemeCSS('light')`；若为 `'current'`，调用 `GetCSS()`（或 `GetThemeCSS(currentTheme)`）。
    - 捕获 `SavePdfFileDialog` 异常，区分取消（空串直接 return）与错误（抛错进入 catch 块并更新状态栏为「导出失败」）。
- **Acceptance Criteria**：
  - `cd frontend && npx esbuild src/main.ts --bundle --loader:.css=empty` 语法检查通过。
  - 暗色主题下选择浅色导出能拉取到白底暗字 light 令牌。

---

## Phase 2：下线缩放控件与回收调试探针

### TASK-003：移除缩放步进控件与清理 main.ts 调试探针

- **Status**：DONE
- **Executor**：主线
- **Description**：从 `frontend/index.html` 与 `frontend/src/style.css` 移除缩放步进相关 DOM 与样式，并在 `frontend/src/main.ts` 中移除缩放事件绑定与全部 `[ExportDiag]` 调试日志。
- **Details**：
  - `index.html`：移除 `<div class="export-item">... 缩放比例 ...</div>` 结构。
  - `style.css`：清理 `.export-stepper` 及其子元素相关样式。
  - `main.ts`：移除 `exportScale`、`exportScaleInput`、`exportStepMinus`、`exportStepPlus` 及其事件监听；清除 `main.ts` 中所有的 `[ExportDiag]` console 日志。
- **Acceptance Criteria**：
  - 导出弹窗仅保留「页面色彩」与「页边距」两个控制项。
  - 生产代码中无任何 `[ExportDiag]` 探针残留。

---

## Phase 3：捕获管线强化（字体、克隆隔离与进度）

### TASK-004：优化 pdfExporter.ts 字体时序、DOM 克隆隔离、进度反馈并清理日志

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `frontend/src/pdfExporter.ts` 中实现 KaTeX link 的 load 事件 await、为 html2canvas 配置 ignoreElements 过滤 `#app` 与对话框、增加进度更新回调与 100 页保护，并清理调试日志与失效 zoom 属性。
- **Details**：
  - 添加 `waitForLink` 等待 `katexLink` 加载完成（带 500ms 超时容错），确保 `@font-face` 规则注册后再执行公式回填与 `document.fonts.ready`。
  - 移除 `.pdf-export-wrapper` 中的 `zoom: ${scaleRatio}` 及 `scale` 相关失效逻辑，统一采用标准 100% 比例。
  - 在 `html2canvas` 选项中添加 `ignoreElements: (el) => el.id === 'app' || el.tagName === 'DIALOG'`，消除长文档对主编辑器树的重复克隆。
  - 添加 `onProgress?: (current: number, total: number) => void` 参数并在切片循环中回调，供前端展示例如 `导出中 (1/3)...`。
  - 增加页数保护 `if (pageRanges.length > 100) pageRanges.length = 100`。
  - 清理 `pdfExporter.ts` 中的全部 `[ExportDiag]` 日志。
- **Acceptance Criteria**：
  - `node tests/pdfBuilder.test.ts` 通过。
  - 前端打包 `npm run build` 成功。

---

## Phase 4：无头自动化冒烟验证与契约锁定

### TASK-005：补充无头导出冒烟检查与 UI 契约测试

- **Status**：DONE
- **Executor**：主线
- **Description**：新增 `frontend/tests/export.check.mjs` 无头冒烟自检脚本，并在 `frontend/tests/uiContract.test.mjs` 中更新契约检查。
- **Details**：
  - 创建 `tests/export.check.mjs`，复用无头 Chrome CDP 通信，验证完整的导出交互流程：
    - 渲染含有 LaTeX 公式与代码块的文档。
    - 唤起导出弹窗，切换为浅色主题。
    - 点击「导出」按钮，桩拦截 `SavePdfFileDialog` 与 `SavePdfFile`。
    - 断言拦截到的 Base64 数据解码后以 `%PDF-1.4` 开头，且至少生成 1 页。
    - 验证用户取消与对话框抛错时界面的状态响应。
  - 更新 `uiContract.test.mjs` 契约断言，确保不再引用已移除的缩放控件，且锁定导出弹窗关键状态。
- **Acceptance Criteria**：
  - `node tests/export.check.mjs` 执行通过并输出 PASS。
  - `node tests/uiContract.test.mjs` 通过。

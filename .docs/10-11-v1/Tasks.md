# Tasks：支持文档导出为 PDF 格式（方案 B：可选缩放与高级版面控制）

**关联 Plan**：`Plan.md` —— 支持文档导出为 PDF 格式（方案 B） v1.1  
**状态**：DONE  
**完成日期**：2026-10-11  
**回归测试结论**：全部通过（go test ./...、go test -race ./...、npm test、npm run build、tests/modeScroll.check.mjs 与 tests/startup.check.mjs 均零错误通过）  
**总计 Task**：8 个（已完成 8 个）  

---

## Phase 1：打印样式层与排版变量契约

### TASK-001：在 base.css 中编写 @media print 打印专用样式

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：无
- **Executor**：主线
- **Description**：在 `internal/theme/assets/theme/base.css` 中增加 `@media print` 样式块，重置打印边距与背景色，并设置防断页与防御性屏蔽规则。
- **Details**：
  - 声明基于变量的页面边距：`@page { margin: var(--print-margin, 15mm 20mm); size: auto; }`
  - 设置打印色彩规则：默认浅色白底黑字（`html, body { background: #ffffff !important; color: #242424 !important; }`）；若根节点携带 `data-print-theme="current"` 则允许透传当前主题色彩
  - 优化分页防断策略：`h1, h2, h3, h4, h5, h6 { break-after: avoid; break-inside: avoid; }` 以及 `pre, blockquote, table, .math-block, img { break-inside: avoid; }`
  - 防御性隐藏：`body.md-gutter #md-content > [data-line]::before { display: none !important; }` 与 `.copy-code-btn { display: none !important; }`（注释标明离屏帧内属兜底保险）
- **Acceptance Criteria**：
  - `internal/theme/assets/theme/base.css` 包含完整 `@media print` 块
  - 普通屏幕环境下的预览排版与交互不受任何干扰

### TASK-002：在打印样式中配置 --print-scale 缩放变量与 zoom 规则

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001
- **Executor**：主线
- **Description**：在 `internal/theme/assets/theme/base.css` 的 `@media print` 中支持动态缩放比例变量 `--print-scale`，确立单一数据源。
- **Details**：
  - 在 `@media print` 内为 `body` 规则添加 `max-width: 100% !important; padding: 0 !important;`
  - 声明唯一缩放规则：`zoom: var(--print-scale, 1);`
  - 外部调用者仅需通过注入 `:root { --print-scale: <数值>; --print-margin: <边距>; }` 控制排版，禁止在注入端使用内联 `body { zoom }` 导致重复覆盖
- **Acceptance Criteria**：
  - `zoom: var(--print-scale, 1)` 在 `@media print` 中正确声明
  - 缩放变量缺失时回退默认比例 `1`

---

## Phase 2：导出模态弹窗与 Fluent 2 视觉层

### TASK-003：在 index.html 中新增方案 B 导出 PDF 模态结构

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：无
- **Executor**：主线
- **Description**：在 `frontend/index.html` 中新增原生 `<dialog id="export-dialog">` 及其方案 B 控件结构。
- **Details**：
  - 添加 `<dialog id="export-dialog" aria-labelledby="export-dialog-title">` 与 `<form method="dialog" class="export-form">`
  - 头部区域：包含标题 `<h2 id="export-dialog-title">导出为 PDF</h2>` 与关闭按钮 `<button type="submit" class="export-close-btn" aria-label="关闭">✕</button>`
  - 缩放步进设置：包含标签与说明，步进减按钮 `<button type="button" id="export-step-minus">-</button>`、步进加按钮 `<button type="button" id="export-step-plus">+</button>` 及数值输入框 `<input type="text" id="export-scale-input" value="100%" aria-label="缩放比例"/>`
  - 页面色彩设置：分段器 `<div class="export-segmented" id="export-theme-seg">`，含「浅色 (推荐打印)」与「当前主题」按钮
  - 页面边距设置：分段器 `<div class="export-segmented" id="export-margin-seg">`，含「标准 (20mm)」、「紧凑 (10mm)」、「宽松 (30mm)」按钮
  - 动作按钮组：取消按钮 `<button type="submit" value="cancel">取消</button>` 与主导出按钮 `<button type="submit" value="export" class="primary">导出</button>`
- **Acceptance Criteria**：
  - HTML 结构语法合法，各控件具备无障碍 `aria-label` 与名称关联，符合原生 `<dialog>` 顶层规范

### TASK-004：在 style.css 中编写导出弹窗与方案 B 控件的 Fluent 2 样式

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-003
- **Executor**：主线
- **Description**：在 `frontend/src/style.css` 中为导出弹窗更新全部 3 处共享选择器组，并为方案 B 控件实现样式。
- **Details**：
  - 同步更新三处既有 dialog 共享选择器组：`style.css:931`（不透明兜底）、`style.css:942`（`::backdrop` 模糊）、`style.css:949`（`@supports` 毛玻璃与深度阴影）
  - 设定 `#export-dialog` 宽度为 `420px`（对齐 Demo B）与紧凑内边距
  - 编写步进控件 `.export-stepper` 与分段控制器 `.export-segmented button`（遵循通用后代选择器风格，active 态为 `--accent-soft`）
  - 为所有新增可交互元素添加 `:focus-visible` 规范轮廓（`outline: 2px solid var(--focus-ring); outline-offset: 1px;`）
- **Acceptance Criteria**：
  - 弹窗居中且在深浅两色主题下具有优雅的 Fluent 2 亚克力毛玻璃质感
  - 控件交互态（hover, active, focus-visible）齐备

---

## Phase 3：前端交互与离屏打印调度管道

### TASK-005：在 main.ts 中集成标题栏按钮与导出弹窗交互契约

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-003, TASK-004
- **Executor**：主线
- **Description**：在 `frontend/src/main.ts` 中挂载标题栏导出按钮，并严格遵循项目 `<dialog>` 契约管理弹窗状态。
- **Details**：
  - 声明 `GLYPH_EXPORT` 矢量 SVG 图标，在 `titlebar-actions` 插入 `btn-export`（严格排布于 `btn-save` 与 `btn-settings` 之间）
  - 遵循 Project.md:121 契约：每次触发 `showModal()` 前清空 `exportDialog.returnValue = ''`；在 `exportForm` 的 `submit` 事件中读取 `event.submitter?.getAttribute('value')`，仅在值为 `'export'` 时调用 `runExport()`
  - 绑定快捷键 `Ctrl-p` 与 `Ctrl-Shift-e`：阻止默认浏览器打印并唤出导出弹窗
  - 状态同步：步进按钮与直接输入联动（范围钳制在 50% ~ 200%），分段器记录选定色彩模式与边距模式
  - 遮罩外点击关闭与 Esc 键取消逻辑完整绑定
- **Acceptance Criteria**：
  - 点击标题栏按钮或按下快捷键均能可靠弹出对话框
  - 弹窗返回值与关闭契约符合全局规范，避免读取陈旧状态

### TASK-006：在 main.ts 中实现离屏可渲染打印调度管道与时序保障

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-002, TASK-005
- **Executor**：主线
- **Description**：在 `frontend/src/main.ts` 中实现离屏可渲染 iframe 打印调度函数，保证样式与字体完整就绪后再触发系统打印。
- **Details**：
  - 创建离屏可渲染 iframe 容器：使用 `position: fixed; left: -10000px; top: -10000px; width: 1024px; height: 768px; border: 0;`（严禁使用 `display: none`）
  - 获取最新 Markdown 渲染 HTML 与基础 CSS，组装并写入 HTML 骨架（注入单一变量 `--print-scale: ${scale / 100}; --print-margin: ${margin};`）
  - 建立确定性就绪时序：
    1. 等待 iframe `load` 事件触发；
    2. 执行 `renderMathInFrame` 进行 KaTeX 公式回填；
    3. 执行 `await printDoc.fonts.ready`（配合 300ms 兜底），确保 woff2 字体完成栅格化；
    4. 调用 `printWindow.focus()` 与 `printWindow.print()`；
  - 在 `onafterprint` 或 1000ms 定时器兜底中自动清理并从父 DOM 中移除该离屏 iframe
- **Acceptance Criteria**：
  - 在「编辑」、「预览」、「分栏」三种模式下均能正常触发系统打印并导出为 PDF
  - 严格满足字体与公式就绪时序，不出现样式丢失或公式乱码
  - 打印调度不重置主预览区滚动条，不污染当前编辑器状态

---

## Phase 4：UI 契约测试与文档维护

### TASK-007：扩充 uiContract.test.mjs 契约测试用例

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001, TASK-004, TASK-005
- **Executor**：主线
- **Description**：在 `frontend/tests/uiContract.test.mjs` 中补充针对方案 B 导出控件、标题栏顺序与打印样式的自动化断言。
- **Details**：
  - 更新 `actionOrder` 检查数组为：`['btn-new', 'btn-open', 'btn-theme', 'btn-save', 'btn-export', 'btn-settings']`
  - 增加针对 `export-dialog` 的断言：验证 `id="export-dialog"`、`aria-labelledby="export-dialog-title"`、`id="export-scale-input"`、`id="export-theme-seg"`、`id="export-margin-seg"`
  - 增加焦点轮廓断言：确保 `.export-close-btn`、`#export-step-minus`、`#export-step-plus`、`.export-segmented button` 包含于 `:focus-visible` 测试列表
  - 增加 `@media print` 规则断言：验证 `baseCss` 包含 `body.md-gutter #md-content > [data-line]::before` 隐藏规则、`.copy-code-btn` 隐藏规则与 `zoom: var(--print-scale, 1)`
- **Acceptance Criteria**：
  - 执行 `cd frontend && npm test` 零错误通过

### TASK-008：同步更新 Project.md 与 SCOPE.md 项目文档

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-006, TASK-007
- **Executor**：主线
- **Description**：更新 `.docs/Project.md` 与 `.docs/SCOPE.md`，使项目事实来源与新特性保持强一致。
- **Details**：
  - 更新 `Project.md` 的「概述」：移除将“导出 HTML/PDF”列为非目标的表述，更新支持导出为 PDF（方案 B）的最新状态
  - 更新「结构」与「数据流」：增补 PDF 导出离屏可渲染打印流程、排版时序保障与样式变量说明
  - 更新「约束与决策」：增加导出 PDF 采用离屏 iframe 原生打印、`zoom` 缩放单一变量、`document.fonts.ready` 字体就绪时序保障及 Windows 端手动验收路径说明
  - 更新 `SCOPE.md`：同步修正边界说明
- **Acceptance Criteria**：
  - `Project.md` 与实际代码库状态 100% 一致，无陈旧与冲突表述

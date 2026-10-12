# Tasks：退役复杂 PDF 栅格化管线并重构为独立 HTML 导出

**关联 Plan**：`Plan.md` —— 退役复杂 PDF 栅格化管线并重构为独立 HTML 导出 v1.2  
**总计 Task**：10 个  
**状态**：DONE  
**完成日期**：2026-10-12  
**回归测试结论**：`npm test` 6 项自检全绿；`npm run build` 成功；`node tests/export.check.mjs` ALL PASS；`go vet ./...` 零告警；`go test -count=1 -race ./...` 全绿。

---

## Phase 1：后端导出接口与契约改造

### TASK-001：在 `app.go` 中将 PDF 导出方法重构为 HTML 导出方法并更新 `main_test.go`

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Description**：在 `app.go` 中下线 `SavePdfFileDialog` 与 `SavePdfFile`，新增 `SaveHtmlFileDialog` 与 `SaveHtmlFile`，清理无用的 `base64` / `fmt` 引用，并在 `main_test.go` 中更新单测。
- **Details**：
  - 在 `app.go` 中移除 `SavePdfFileDialog` 与 `SavePdfFile`。
  - 移除 `app.go` 中仅供 PDF 导出使用的 `"encoding/base64"` 与 `"fmt"` 导入包。
  - 新增 `SaveHtmlFileDialog(defaultFilename string) (string, error)`：标题为 `导出为 HTML`，默认文件名 `untitled.html`，过滤器设置为 `{DisplayName: "HTML 文档", Pattern: "*.html;*.htm"}`。
  - 新增 `SaveHtmlFile(path string, content string) error`：校验 `path != ""`，直接通过 `filesys.WriteFile(path, content)` 原子落盘 UTF-8 字符串。
  - 在 `main_test.go` 中移除 `"encoding/base64"` 导入，将 `TestSavePdfFile` 和 `TestSavePdfFileDialog` 重构为 `TestSaveHtmlFile` 和 `TestSaveHtmlFileDialog`，覆盖正常写盘、空路径报错、对话框取消与对话框底层报错分支。
- **Acceptance Criteria**：
  - `go test -v -run "TestSaveHtml" ./...` 绿灯通过
  - Go 后端代码中无 `SavePdf` 遗留方法及未使用 import

### TASK-002：同步更新前端 `wailsjs` 本地绑定存根

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：TASK-001
- **Description**：在 `frontend/wailsjs/go/main/App.d.ts` 与 `frontend/wailsjs/go/main/App.js` 中将 `SavePdfFileDialog` / `SavePdfFile` 替换为 `SaveHtmlFileDialog` / `SaveHtmlFile`。
- **Details**：
  - 在 `App.d.ts` 中声明 `export function SaveHtmlFileDialog(arg1:string):Promise<string>;` 与 `export function SaveHtmlFile(arg1:string,arg2:string):Promise<void>;`。
  - 在 `App.js` 中实现对应的方法转发存根，并移除 `SavePdf*` 相关声明与实现。
- **Acceptance Criteria**：
  - `frontend/wailsjs/` 接口定义与 Go 后端保持一致

---

## Phase 2：独立 HTML 导出核心与依赖下线

### TASK-003：卸载 `html2canvas` 依赖、清理 `pdfBuilder` 并重新生成锁文件

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Description**：从 `frontend/package.json` 移除 `html2canvas` 依赖，删除 `frontend/src/pdfBuilder.ts` 与 `frontend/tests/pdfBuilder.test.ts`，并执行 `npm install` 刷新 `package-lock.json`。
- **Details**：
  - 在 `frontend/package.json` 的 `dependencies` 中移除 `"html2canvas"`。
  - 在 `frontend/package.json` 的 `"scripts"` 中将 `"test"` 移除 `node tests/pdfBuilder.test.ts`。
  - 删除文件 `frontend/src/pdfBuilder.ts` 与 `frontend/tests/pdfBuilder.test.ts`。
  - 在 `frontend` 目录执行 `npm install --include=dev`，确保 `package-lock.json` 重新生成并与 `package.json` 严格对齐。
- **Acceptance Criteria**：
  - `frontend/package.json` 与 `package-lock.json` 均不包含 `html2canvas`
  - 仓库内无遗留的 `pdfBuilder.ts` 与 `pdfBuilder.test.ts`

### TASK-004：实现 `frontend/src/htmlExporter.ts` 与单元自检 `frontend/tests/htmlExporter.test.ts`

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：TASK-003
- **Description**：创建 `frontend/src/htmlExporter.ts` 实现独立 HTML 文档组装（单一来源 KaTeX 版本、代码长行折行保护、纯内存回填），编写零依赖自检并接入 `npm test`，同时删除旧的 `frontend/src/pdfExporter.ts`。
- **Details**：
  - 创建 `frontend/src/htmlExporter.ts`，从 `katex` 单一来源导入版本：`import { version as KATEX_VERSION } from 'katex';`。
  - 定义接口 `ExportHtmlOptions`（包含 `title?: string; margin: 'std' | 'compact' | 'wide'; renderMath?: (root: HTMLElement) => void`）。
  - 实现纯函数 `buildExportHtml(articleInnerHtml: string, baseThemeCss: string, options: ExportHtmlOptions): string`：
    - 产出标准 HTML5 文档结构：
      - `<!DOCTYPE html><html lang="zh-CN"><head>...`
      - `<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">`
      - `<title>` 插入 HTML 安全转义后的 `options.title || 'untitled'`
      - 注入 `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css">`（省略无收益的 `crossorigin`）
      - `<style>` 标签内嵌入传入的 `baseThemeCss`
      - 注入 `@page { size: A4; margin: 20mm; }`（按 options.margin 映射：std -> 20mm, compact -> 10mm, wide -> 30mm）
      - 注入 `@media print` 样式：
        - `body { max-width: none !important; margin: 0 !important; padding: 0 !important; }`
        - `print-color-adjust: exact; -webkit-print-color-adjust: exact;`
        - 代码长行折行防截断：`pre { overflow-x: visible !important; white-space: pre-wrap !important; word-break: break-word !important; }`
        - 元素防断页与孤行保护：`.md-line, pre, blockquote, table, img, figure { break-inside: avoid; page-break-inside: avoid; }`，`h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }`
      - 注入辅助类隐藏样式：`.copy-code-btn { display: none !important; }`
      - `<body>` 包含 `<article id="md-content">`
  - 实现 `exportToHtmlData(html: string, baseThemeCss: string, options: ExportHtmlOptions): Promise<string>`：使用内存未挂载元素（`document.createElement('div')`，纯内存操作不附加到 DOM 树）回填公式后提取 `innerHTML`，调用 `buildExportHtml`。
  - 删除旧文件 `frontend/src/pdfExporter.ts`。
  - 创建 `frontend/tests/htmlExporter.test.ts`，断言 HTML 骨架、title 转义、主题 CSS 内嵌、KaTeX 版本链接匹配、@page 边距映射、print pre-wrap 规则、防断页规则与复制按钮隐藏。
  - 在 `frontend/package.json` 的 `"test"` 脚本中接入 `node tests/htmlExporter.test.ts`。
- **Acceptance Criteria**：
  - `node frontend/tests/htmlExporter.test.ts` 测试全绿通过
  - 旧 `pdfExporter.ts` 已移除

---

## Phase 3：前端模态界面与导出主流程接入

### TASK-005：更新 `frontend/index.html` 导出模态文案与结构

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Description**：在 `frontend/index.html` 中将 `#export-dialog` 的标题与说明调整为 HTML 导出。
- **Details**：
  - 注释由 `<!-- Export PDF dialog -->` 更新为 `<!-- Export HTML dialog -->`
  - 标题调整为 `<h2 id="export-dialog-title">导出为 HTML</h2>`
  - 页面色彩说明调整为 `选择输出为浅色风格或保留当前深色风格`
  - 页面边距说明调整为 `设置打印及排版边距范围`
- **Acceptance Criteria**：
  - `#export-dialog-title` 内容为 `导出为 HTML`

### TASK-006：在 `frontend/src/main.ts` 中接入 HTML 导出管线与状态反馈

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：TASK-002, TASK-004, TASK-005
- **Description**：在 `frontend/src/main.ts` 中将旧 PDF 导出引用替换为 HTML 导出，维护提交按钮状态机与状态栏反馈。
- **Details**：
  - 导入切换为 `import { exportToHtmlData } from './htmlExporter';`，并导入 `SaveHtmlFileDialog` 与 `SaveHtmlFile`。
  - 标题栏按钮 `#btn-export` 的 `title` 与 `aria-label` 更新为 `导出为 HTML (Ctrl+Shift+E)`。
  - 重构 `runExport()`：
    - 状态机锁定：若 `exportSubmitBtn` 存在，设置 `disabled = true; textContent = '生成中...';`
    - 读取编辑区文本 `cm.state.doc.toString()`
    - 并行获取 `Render(md)` 与主题样式（`exportTheme === 'light' ? GetThemeCSS('light') : cssForTheme()`）
    - 获取当前文档标题：使用 `titleEl.textContent || 'untitled'` 作为单一事实来源
    - 计算默认文件名：沿用既有逻辑 `const defaultBase = currentFile ? baseName(currentFile).replace(/\.[^/.]+$/, '') : 'untitled';`，扩展名设为 `.html`
    - 调用 `exportToHtmlData(html, baseThemeCss, { title: docTitle, margin: exportMargin, renderMath: renderMathInRoot })`
    - 调用 `SaveHtmlFileDialog(defaultHtmlName)`
    - 若用户取消则直接退出；若选定路径则调用 `SaveHtmlFile(chosenPath, htmlData)`
    - 成功后关闭弹窗并在状态栏提示 `已导出为 HTML: ${baseName(chosenPath)}`
    - 失败则在状态栏提示 `导出失败`
    - 状态机复位：在 `finally` 块内若 `exportSubmitBtn` 存在，重置 `disabled = false; textContent = '导出';`
- **Acceptance Criteria**：
  - 执行 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 零错误通过
  - `main.ts` 中无任何 `Pdf` 相关调用残留

---

## Phase 4：契约自检、无头冒烟与全量回归

### TASK-007：更新 `frontend/tests/uiContract.test.mjs` 契约断言

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Dependency**：TASK-006
- **Description**：更新 UI 契约测试以断言 HTML 导出的相关标识与方法。
- **Details**：
  - 验证 `ts` 包含 `SaveHtmlFileDialog`、`SaveHtmlFile`、`exportToHtmlData`
  - 验证 `ts` 不包含 `SavePdfFileDialog`、`SavePdfFile`、`exportToPdfData`
  - 验证 `#export-dialog` 及其控件结构完好
- **Acceptance Criteria**：
  - `node frontend/tests/uiContract.test.mjs` 绿灯通过

### TASK-008：更新 `frontend/tests/export.check.mjs` 无头冒烟自检

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Dependency**：TASK-006
- **Description**：将无头 Chrome 导出冒烟测试桩与断言对齐 HTML 导出流程，重点验证导出的 HTML 真实内容与结构。
- **Details**：
  - 桩中替换为 `SaveHtmlFileDialog` 与 `SaveHtmlFile`
  - 深度校验导出的 HTML 字符串：
    - 包含合法文档骨架 `<!DOCTYPE html>`、`<html lang="zh-CN">`、`<title>`
    - 包含嵌入的 Fluent 主题样式 `<style>` 与正确的 KaTeX CDN 链接
    - 包含 `@page` 与 `@media print` 规则（`print-color-adjust: exact`、`pre { overflow-x: visible; white-space: pre-wrap; }`）
    - 结构化校验数学公式：断言包含 `.katex` 结构与 `.katex-html[aria-hidden="true"]`，且 MathML 元素具备合规结构（不作依赖外部网络的视觉判定）
    - 包含编辑辅助元素（`.copy-code-btn`）隐藏规则
  - 验证状态栏提示包含 `已导出为 HTML:`
  - 验证取消与错误处理分支
  - 保留外壳样式防污染作为廉价基础不变量检查
- **Acceptance Criteria**：
  - `npm run build && node frontend/tests/export.check.mjs` 全断言通过

### TASK-009：执行全链路构建与跨平台回归验证

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：TASK-001 ~ TASK-008
- **Description**：全量执行前端测试、资产打包构建、Go 代码检查与竞态测试。
- **Details**：
  - `cd frontend && npm test` 验证全部 6 项前端自检
  - `npm run build` 打包前端并同步资产
  - `go vet ./...` 检查 Go 代码静态分析
  - `go test -count=1 -race ./...` 执行全量 Go 测试
- **Acceptance Criteria**：
  - 前端与后端测试 100% 通过，零回归问题

---

## Phase 5：项目事实文档维护与边界同步

### TASK-010：维护 `.docs/Project.md` 架构与事实文档

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependency**：TASK-009
- **Description**：依据本次变更同步维护 `.docs/Project.md`，逐条核销已退役的 PDF 机制，更新非目标、结构树、测试链、数据流与架构决策。
- **Details**：
  - 第 8 行（阶段）：更新为「独立 HTML 导出（浅色/当前主题、标准/紧凑/宽松打印边距，内嵌完整 Fluent 2 样式表与同源 KaTeX 样式外链，方便通过浏览器或外部工具快速导出为原生高保真 PDF）」
  - 第 9 行（非目标）：移除非目标中的「导出独立 HTML」
  - 第 24 行（环境与运行）：将测试链中的 `pdfBuilder` 自检描述替换为 `htmlExporter`
  - 第 52-56 行（结构树）：移除 `pdfBuilder.ts`、`pdfExporter.ts` 与 `pdfBuilder.test.ts`，补充 `htmlExporter.ts` 与 `htmlExporter.test.ts`
  - 第 71 行（数据流）：将原 html2canvas 按页分块 JPEG 栅格化位图导出数据流重构为独立 HTML 导出数据流（直接拉取主题 CSS、内存节点回填 KaTeX、纯文本 IPC 传输、原子落盘）
  - 约束与决策段落逐条判定处理：
    - 退役/改写条目：
      - 第 142 行（自研按页分块 PDF 1.4 管线）：改写为退役该管线，全面重构为轻量独立 HTML 导出的理由与决策
      - 第 143 行（按 A4 窗口分块规避 16384px 硬件上限）：标注已随栅格化下线而退役
      - 第 144 行（自研轻量 PDF 1.4 编码器）：标注已随 pdfBuilder 下线而退役
      - 第 148 行（html2canvas 缩放步进）：标注已随 html2canvas 卸载而退役
      - 第 151 行（离屏 iframe 容器防外壳污染）：更新为导出 HTML 使用纯内存未挂载容器回填公式
      - 第 152 行（96 DPI 边距换算）：改写为 CSS Paged Media `@page` 边距定义（20mm/10mm/30mm）
      - 第 155 行（export.check.mjs 冒烟断言）：更新为对独立 HTML 真实结构与防代码截断样式的断言
    - 确认保留条目：
      - 第 147 行（SaveFileDialog 区分取消与失败契约对齐至 SaveHtmlFileDialog）保留
      - 第 149 行（GetThemeCSS 显式按需拉取主题样式）继续成立，保留
- **Acceptance Criteria**：
  - `Project.md` 与代码库实际状态 100% 一致，无陈旧 PDF 接口描述与失效决策遗留

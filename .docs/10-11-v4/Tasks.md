# Tasks：自研文档 PDF 导出管线（替代系统原生打印）

**关联 Plan**：`Plan.md` —— 自研文档 PDF 导出管线 v1.2  
**总计 Task**：8 个

---

## Phase 1：新导出管线探针与后端落盘通道

### TASK-001：在新导出管线各关键节点注入诊断日志探针

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependencies**：无
- **Description**：在前端导出数据流（`runExport`、`exportToPdfData` 各阶段、`SavePdfFileDialog` 调用及落盘返回）中注入确定性控制台诊断日志。
- **Details**：
  - 在 `runExport()` 入口输出：`[ExportDiag] runExport started, docLength: ..., theme: ..., scale: ...`。
  - 在 `exportToPdfData` 内部各里程碑输出：`[ExportDiag] DOM prepared`、`[ExportDiag] math rendered & fonts ready`、`[ExportDiag] chunk capture completed, pageCount: ...`、`[ExportDiag] pdf base64 generated, bytes: ...`。
  - 在唤起 Go 端对话框前后输出：`[ExportDiag] calling SavePdfFileDialog`、`[ExportDiag] SavePdfFileDialog returned path: ...`（若用户取消明确输出 `[ExportDiag] user cancelled save`）。
  - 在落盘成功及异常 catch 块输出详细上下文：`console.info('[ExportDiag] export succeeded')` 与 `console.error('[ExportDiag] export failed', err)`。
- **Acceptance Criteria**：
  - 点击导出按钮后，开发者控制台输出完整的阶段推进日志，能够精确定位任意步骤的中断原因。

### TASK-002：实现后端 PDF 另存为对话框与文件原子保存方法

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependencies**：无
- **Description**：在 `app.go` 中新增 `SavePdfFileDialog(defaultFilename string)` 与 `SavePdfFile(path string, base64Data string)` 导出方法，并同步手补 `frontend/wailsjs/go/main/App.js` 与 `App.d.ts` 绑定。
- **Details**：
  - `SavePdfFileDialog` 封装 `runtime.SaveFileDialog`，设置标题为「导出为 PDF」，过滤规则为 `{DisplayName: "PDF 文档", Pattern: "*.pdf"}`，默认文件名为传入的 `defaultFilename`（若为空则为 `untitled.pdf`）。用户取消返回空字符串。
  - `SavePdfFile` 接收路径与 base64 编码的 PDF 二进制数据，经 `base64.StdEncoding.DecodeString` 解码为原始字节切片 `pdfBytes`。
  - 复用 `filesys.WriteFile(path, string(pdfBytes))` 完成原子保存，依赖 `filesys.WriteFile` 内部原生短写保护机制（`written != len(content) -> io.ErrShortWrite`）。
  - 同步在 `frontend/wailsjs/go/main/App.js` 与 `App.d.ts` 中手补这两个方法的存根与类型声明。
- **Acceptance Criteria**：
  - `go test ./...` 编译通过。
  - 单测中验证：有效 base64 正常落盘且内容一致；非法 base64 明确返回解码错误；空路径返回错误。

---

## Phase 2：轻量 PDF 1.4 编码器与按页分块栅格化管线

### TASK-003：安装 html2canvas 依赖并实现轻量 PDF 1.4 编码器

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependencies**：无
- **Description**：安装 `html2canvas` 依赖，并在 `frontend/src/pdfBuilder.ts` 中实现纯 TypeScript 的极简 PDF 1.4 组装模块。
- **Details**：
  - 执行 `cd frontend && npm install --include=dev html2canvas`。
  - 创建 `frontend/src/pdfBuilder.ts`，实现函数 `buildPdfFromImages(pages: { data: Uint8Array, width: number, height: number }[], pageSize: { width: number, height: number }): Uint8Array`。
  - 输出标准 PDF 1.4 结构：文件头 `%PDF-1.4`、Catalog 对象、Pages 树、Page 节点、DCTDecode/FlateDecode 图像流对象与 Content 定位矩阵，生成严格的 xref 表与 trailer。
  - 提供 `uint8ArrayToBase64(bytes: Uint8Array): string` 辅助函数。
- **Acceptance Criteria**：
  - 通过 esbuild 零产物语法检查：`esbuild src/main.ts --bundle --loader:.css=empty`。
  - 生成的二进制数据符合 PDF 1.4 规范，开头为 `%PDF-1.4`，结尾为 `%%EOF`。

### TASK-004：实现完备样式/字体注入与按页分块几何管线

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependencies**：TASK-003
- **Description**：在 `frontend/src/pdfExporter.ts` 中实现注入完整主题/KaTeX 样式与字体、按 A4 几何分块渲染 DOM 并避开行截断的捕获逻辑。
- **Details**：
  - 创建隐藏挂载容器，注入完备样式清单：
    1. 动态主题样式：调用 `cssForTheme()` 并注入容器专用 `<style>` 标签；
    2. KaTeX 公式样式：挂载 `<link rel="stylesheet" href="./katex/katex.min.css"/>`；
    3. 容器排版类名与缩放变量：赋予 `--print-scale` 与边距变量，对齐 Fluent 2 排版规范。
  - 串行等待渲染与字体就绪：调用 `renderMathInFrame(containerDoc)` 回填 LaTeX 公式，并在父上下文显式 `await document.fonts.ready`（带 300ms 兜底），确保所有 woff2 字体与公式符号栅格化就绪。
  - 遍历容器所有直接子元素（`article.children`，覆盖有/无 `data-line` 的全部元素），读取真实 `getBoundingClientRect()` 下沿计算分页断点：
    - 若 A4 目标分页线下沿切中某个子元素内部，优先在该子元素顶部断页（软避让）。
  - 对每个分页窗口独立进行渲染捕获，**单页独立绘制至 Canvas**，彻底避免单个 Canvas 高度触及 Chromium 16384px 硬件上限。
  - 每一页画布重建统一的内页内边距（Padding），导出为图像字节并由 `buildPdfFromImages` 组合为多页 PDF。
  - 捕获完成后彻底清空并移除临时挂载容器。
- **Acceptance Criteria**：
  - 无论是短文档还是超长多页文档（10 页以上），均能稳定生成多页 PDF 数据，无 Canvas 内存崩溃或空白输出。
  - 捕获内容完整保留 Fluent 2 主题排版、代码语法色彩与 KaTeX 公式，无样式缺失或乱码。
  - 页面断行避让顶层块，内页均有统一页边距。

---

## Phase 3：导出弹窗交互贯通与死代码清理

### TASK-005：改造导出弹窗提交流程并贯通全链路数据流

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependencies**：TASK-001, TASK-002, TASK-004
- **Description**：在 `frontend/src/main.ts` 中重构 `runExport()` 函数，将原有不可靠的 `printWin.print()` 替换为调用 `exportToPdfData` 与后端另存为对话框的闭环数据流。
- **Details**：
  - 提取当前文件名并将扩展名替换为 `.pdf`（空白未命名文档默认 `untitled.pdf`）。
  - 在 `runExport()` 执行时将弹窗内「导出」按钮置为 disabled 并更新文本为「生成中...」。
  - 异步调用 `exportToPdfData()` 获得 PDF Base64 字符串。
  - 调用 Go 端 `SavePdfFileDialog(defaultName)` 调起原生另存为窗口：
    - 若用户取消（返回空字符串），恢复按钮状态并直接退出。
    - 若用户确认路径，调用 `SavePdfFile(chosenPath, base64Data)` 完成写盘。
  - 写盘成功关闭弹窗，状态栏提示「已导出为 PDF: <文件名>」。
  - 异常时捕获并在状态栏显示「导出失败」。
- **Acceptance Criteria**：
  - 点击「导出」后确定性调起系统的另存为对话框。
  - 保存成功后磁盘生成有效的 `.pdf` 文件。
  - 用户取消保存时界面正常恢复，无假死与红字。

### TASK-006：清理 base.css 废弃打印样式与离屏 iframe 代码

- **Status**：DONE
- **Executor**：主线
- **Priority**：P0
- **Dependencies**：TASK-005
- **Description**：清理 `internal/theme/assets/theme/base.css` 中的 `@media print` 块，并删除 `main.ts` 中残余的离屏沙箱 iframe 相关逻辑。
- **Details**：
  - 在 `internal/theme/assets/theme/base.css` 中删除已退役的 `@media print` 规则块、`--print-margin`、`--print-scale` 变量消费及 `[data-print-theme]`。
  - 在 `frontend/src/main.ts` 中删除 `MARGIN_MAP`、`printSkeleton`、`loadPromise`、`cleanup` 等围绕 `printWin.print()` 的遗留代码。
- **Acceptance Criteria**：
  - `base.css` 不再包含 `@media print` 及未使用的打印专有变量。
  - `main.ts` 零离屏打印 iframe 残留代码。

---

## Phase 4：契约测试加固、全栈自检与文档维护

### TASK-007：更新 uiContract 断言并编写 pdfBuilder 自检脚本

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Dependencies**：TASK-006
- **Description**：更新 `frontend/tests/uiContract.test.mjs` 中的硬断言，编写 `frontend/tests/pdfBuilder.test.ts` 单元自检脚本并接入 `npm test`。
- **Details**：
  - 在 `uiContract.test.mjs` 中移除已删除的 `@media print`（232-236 行）和 `allow-modals`（242 行）断言。
  - 在 `uiContract.test.mjs` 中添加对自研导出关键组件（如 `SavePdfFileDialog`、`pdfBuilder` 引用）的契约检查。
  - 在 `frontend/tests/pdfBuilder.test.ts` 中编写纯逻辑自检（不依赖 DOM），验证生成包含两页纯色图像的 PDF 二进制包含合法 `%PDF-1.4`、Catalog、Pages 与 trailer。
  - 更新 `frontend/package.json` 的 `test` 脚本，将 `pdfBuilder.test.ts` 加入流水线（总计 6 项前端自检）。
- **Acceptance Criteria**：
  - `cd frontend && npm test` 包含 6 项自检全部通过（退出码 0）。

### TASK-008：执行全量全栈回归测试与 Project.md 维护

- **Status**：DONE
- **Executor**：主线
- **Priority**：P1
- **Dependencies**：TASK-007
- **Description**：执行全套零产物检查、构建命令与 Go 单元及竞态测试，并同步更新 `.docs/Project.md` 架构契约、约束与手动验收清单。
- **Details**：
  - 执行 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 零产物语法检查。
  - 执行 `npm run build` 打包 `dist/app.js`。
  - 执行 `node tests/modeScroll.check.mjs` 与 `node tests/startup.check.mjs` dev-only 无头检查。
  - 执行 `go test ./...` 与 `go test -race ./...`。
  - 更新 `.docs/Project.md`：
    - 更新「数据流」中的「文档导出为 PDF」条目：记录自研按页分块与轻量 PDF 1.4 编码器，以及 Wails `SaveFileDialog` 原生另存为流程。
    - 更新「约束与决策」：改写 140-143 行原离屏 iframe 打印描述，明确退役系统打印并采用自研按页分块导出的依据、Trade-off 与 Windows 手动验收清单。
- **Acceptance Criteria**：
  - 全套构建与测试命令零错误通过。
  - `Project.md` 与代码库实际状态严格保持单一事实来源。

---

## 交付后手动验收清单（Windows 目标环境）

依据 `Project.md` 确立的分工边界，Linux 开发环境完成上述静态契约与自检验证后，真实 UI 行为交由 Windows 实机验收：
- [ ] **另存为对话框唤起**：点击标题栏「导出为 PDF」，在弹窗点击「导出」，确认 100% 调起系统原生「另存为」文件选择窗口。
- [ ] **取消保存无异常**：在「另存为」对话框中点击「取消」，确认弹窗恢复可用状态，状态栏无红色报错。
- [ ] **多页超长文档导出**：打开超长 Markdown 文档（10 页以上）执行导出，确认生成的 PDF 包含完整多页，无空白页或截断崩溃。
- [ ] **高保真要素呈现**：打开包含复杂 KaTeX 公式（如 `$\int f(x)dx$`）、Chroma 围栏代码块及中文字符的文档，确认导出的 PDF 排版清晰对齐，无公式源码残留或乱码。

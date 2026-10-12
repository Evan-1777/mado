# Plan：退役复杂 PDF 栅格化管线并重构为独立 HTML 导出

**状态**：DONE  
**日期**：2026-10-12  
**版本**：v1.2（吸收独立全量审计修订版）  
**回归测试结论**：交付段全量回归通过。`cd frontend && npm test` 6 项自检全绿；`npm run build` 打包成功；`node tests/export.check.mjs` 5 项无头冒烟断言（modal-open-and-controls / shell-layout-unpolluted / export-success-html / export-cancel-silence / export-error-feedback）ALL PASS；`go vet ./...` 零告警；`go test -count=1 -race ./...` 5 包全绿。

---

## 1. 背景与目标

当前 PDF 导出管线基于离屏 `html2canvas` 栅格化并分块编码为 JPEG 位图，再由 TS 组装为 PDF 1.4。实际使用中存在显著局限：
1. **渲染效果不符预期**：位图化导致矢量文本与数学公式模糊、无法划词选中复制、A4 分块缝隙处理复杂且易出现元素截断。
2. **系统复杂度高**：引入压缩后近 200KB 级（源文件 430KB+）的外部库 `html2canvas`、手动维护 Canvas 测量与分块计算，以及手写 150 行 PDF 1.4 xref 交叉引用表与 DCTDecode 流包装器。
3. **平台与工具兼容性差**：位图 PDF 无法方便地交由外部专业排版与转换工具（Pandoc、Chrome/Edge 无头打印、WeasyPrint 等）进行二次处理与样式定制。

本次计划将文档导出彻底改造为**轻量高保真独立 HTML 导出**：
- 导出包含完整 HTML5 文档结构的独立文件，正文与 Fluent 2 排版样式、代码高亮令牌 100% 内嵌自包含；数学公式依托与应用同源版本（`import { version } from 'katex'`）的标准 KaTeX CDN 样式与字体渲染（遵循 YAGNI 避免单文件内嵌 1.2MB Base64 字体的冗余膨胀）。
- 内置 CSS Paged Media 规范（`@page` 边距定义、`print-color-adjust: exact`、`break-inside: avoid` 防断页、以及代码块 `@media print { pre { overflow-x: visible; white-space: pre-wrap; word-break: break-word; } }` 防裁切），使导出的 HTML 文件可在任何现代浏览器中直接秒级打开，且通过浏览器「打印 / 另存为 PDF」或其他 CLI 工具一键导出为原生矢量高保真 PDF。
- 彻底卸载 `html2canvas`，删除 `pdfBuilder.ts`，下线后端 `SavePdf*` 接口并替换为直接文本写入的 `SaveHtml*` 契约，同步更新事实文档与测试链，显著精简依赖与代码体积。

## 2. 阶段划分

### Phase 1：后端导出接口与契约改造
| 项目 | 内容 |
|------|------|
| **输入** | `app.go`、`main_test.go`、`frontend/wailsjs/` |
| **输出** | 下线 `SavePdfFileDialog` / `SavePdfFile`，新增 `SaveHtmlFileDialog` / `SaveHtmlFile` 原生绑定与单测，清理无用 import |
| **验收标准** | `SaveHtmlFileDialog` 正确设置 HTML 文件过滤器，`SaveHtmlFile` 直接原子落盘 UTF-8 文本；`main_test.go` 导出用例全绿；wailsjs 本地存根同步更新 |

### Phase 2：独立 HTML 导出核心与依赖下线
| 项目 | 内容 |
|------|------|
| **输入** | `frontend/package.json`、`frontend/package-lock.json`、`frontend/src/pdfBuilder.ts`、`frontend/src/pdfExporter.ts` |
| **输出** | 卸载 `html2canvas` 并重新生成 lockfile，删除 `pdfBuilder.ts` 与 `pdfBuilder.test.ts`，创建 `frontend/src/htmlExporter.ts`（单一真实来源 KaTeX 版本、内存未挂载回填、代码折行防截断）与单元自检 `htmlExporter.test.ts` |
| **验收标准** | `exportToHtmlData` 产出包含 Doctype、`<title>`、内嵌 Fluent 主题 CSS、同源 KaTeX 链接、@page 边距、代码长行折行、断页保护与语法色彩保护的 HTML；`npm test` 纯 Node 自检全绿 |

### Phase 3：前端模态界面与导出主流程接入
| 项目 | 内容 |
|------|------|
| **输入** | `frontend/index.html`、`frontend/src/main.ts` |
| **输出** | 模态标题与工具栏文案对齐「导出为 HTML」，`runExport` 流程调用 `exportToHtmlData` 与 `SaveHtmlFile` 并维护提交按钮状态机 |
| **验收标准** | 标题栏与快捷键（Ctrl+Shift+E / Ctrl+P）唤出导出弹窗，支持浅色/当前主题及标准(20mm)/紧凑(10mm)/宽松(30mm)边距，成功后状态栏提示「已导出为 HTML: <文件名>」 |

### Phase 4：契约自检、无头冒烟与全量回归
| 项目 | 内容 |
|------|------|
| **输入** | `frontend/tests/uiContract.test.mjs`、`frontend/tests/export.check.mjs` |
| **输出** | 契约测试与 dev-only 无头冒烟适配 HTML 导出管道，断言导出内容结构（结构化断言，不依赖外网视觉渲染） |
| **验收标准** | `npm test` 6 项自检全绿；`node tests/export.check.mjs` 冒烟断言（文档结构、内嵌样式、长行防截断规则、取消、异常、外壳防污染）全绿；`go test -race ./...` 全绿 |

### Phase 5：项目事实文档维护与边界同步
| 项目 | 内容 |
|------|------|
| **输入** | `.docs/Project.md` |
| **输出** | 同步更新 Project.md（移除非目标中的「导出独立 HTML」，更新阶段、结构树、测试链、数据流，逐条核销已退役的 PDF 栅格化决策记录） |
| **验收标准** | Project.md 与实际代码库 100% 一致，无陈旧 PDF 接口与失效决策遗留 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 导出格式定位 | 独立 HTML 文档（内嵌 CSS） | 遵循 YAGNI 与工程纪律；HTML 是 Web 原生一等公民，体积轻巧（数十 KB）、矢量清晰且可被 Edge/Chrome/Pandoc 任意工具无缝转为 PDF | 继续在应用内尝试复杂的 PDF 矢量绘制库（引入巨额 CJK 字体包与代码体积） |
| 样式交付方式 | `<style>` 标签全量内嵌 `GetThemeCSS` | 正文与 Fluent 排版自包含，脱离 Mado 运行环境双击即看，保证排版与色彩一致 | 外部 CSS 文件引用（产生多文件依赖，移动文件时样式丢失） |
| 公式样式交付 | 动态引用与应用同源的 KaTeX CDN 样式表与字体 | 权衡最优解：从 `katex` 包单一真实来源导入版本号；公式在渲染期已输出标准语义 DOM，借助 CDN 样式正常呈现；避免每份 HTML 强行内联 1.2MB Base64 字体的冗杂膨胀 | Base64 内联 20 个 woff2 字体（严重违反轻量原则，大幅减缓导出性能） |
| 打印排版与代码防裁切 | `@media print` 注入 `pre-wrap` 与 CSS Paged Media 边距 | 解决分页媒体下 `overflow-x: auto` 导致的代码右侧被物理裁断痛点；长行优雅折行优于硬性切断 | 保持横向裁剪（破坏打印可读性） |
| IPC 传输方式 | 直接传递 UTF-8 字符串 | 纯文本无二进制编码开销，消除 Base64 编码与解码步骤，链路最短 | 保留 Base64 传输（对文本格式属于无谓浪费） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 本地无网络环境下打开含公式 HTML 的字体加载 | 🟢 低 | 显式界定为已知限制；离线时缺少 KaTeX CSS 会导致数学符号排版回退，有网环境由 CDN 完整呈现 |
| 打印时超宽代码行被物理裁断 | 🟡 中 | 在 `@media print` 中为 `pre` 显式设置 `overflow-x: visible; white-space: pre-wrap; word-break: break-word;` |
| 打印时浏览器默认过滤背景色彩导致代码块变白 | 🟡 中 | 在 `@media print` 中强制声明 `print-color-adjust: exact; -webkit-print-color-adjust: exact;` |
| 导出 HTML 包含编辑辅助元素（行号/复制按钮） | 🟢 低 | 导出的 HTML 容器不挂载 `md-gutter` 类天然无行号；CSS 中显式隐藏 `.copy-code-btn`，保持文档纯净 |

## 5. Phase 依赖关系

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
```

- Phase 1 提供 Go 后端新导出 API 与 IPC 存根。
- Phase 2 构建核心 HTML 组装逻辑并下线冗余依赖与旧模块。
- Phase 3 驱动界面文案与前端主流程打通。
- Phase 4 统一对齐自动化契约、无头冒烟与全栈回归。
- Phase 5 同步项目事实文档与架构决策。

## 6. Subagent 协同规划

对照三维效益模型（任务复杂度、上下文关联度、经济与时间效益）评估委托需求：

| 阶段 | 上下文依赖 | 并行收益 | 执行主体 | 决策理由 |
|------|-----------|---------|----------|----------|
| Phase 1：后端契约改造 | 强（涉及 Wails 绑定与测试隔离） | 无（主干基石） | 主线 | 避免跨语言契约不一致导致的运行时错误 |
| Phase 2：HTML 导出核心 | 强（涉及主题 CSS 与 KaTeX 结构） | 低（串行前置） | 主线 | 差分短且直击根因，主线实现最干净 |
| Phase 3：前端界面接入 | 强（关联 DOM 结构与快捷键） | 无（依赖 Phase 2） | 主线 | 界面交互与事件绑定上下文紧密连接 |
| Phase 4：测试与回归 | 强（验证整条数据流一致性） | 无（串行闭环） | 主线 | 本地命令与冒烟断言直接验证效率最高 |
| Phase 5：事实文档维护 | 强（全局架构与既有约束同步） | 无（收尾闭环） | 主线 | 紧密对照改动实况更新 Project.md |

> **协同结论**：全阶段各模块改动聚焦于同一条纵向导出数据链路（Go 绑定 → 前端组装 → 界面调用 → 自动化验证 → 事实文档维护），上下文高度耦合且单项差分精简。为避免上下文隔离带来的认知与同步开销，全阶段均由主线直接执行，不强制拆分 Subagent。

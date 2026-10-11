# Plan：支持文档导出为 PDF 格式（方案 B：可选缩放与高级版面控制）

**状态**：DONE  
**日期**：2026-10-11  
**版本**：v1.1  
**回归测试结论**：全部通过（go test ./...、go test -race ./...、npm test、npm run build、tests/modeScroll.check.mjs 与 tests/startup.check.mjs 均零错误通过）  

---

## 1. 背景与目标

当前 Mado 具备 Markdown 编辑、实时双向定位渲染与大纲目录导航能力。用户已明确选定**方案 B（高级版面控制与多维设置式）**，将 Markdown 内容排版导出至打印及 PDF。核心目标如下：

- 在标题栏与快捷键（`Ctrl+P` / `Ctrl+Shift+E`）提供「导出为 PDF」入口。
- 构建符合 Microsoft Fluent 2 规范的原生模态弹窗，提供用户选定的方案 B 交互模型：
  - 缩放比例（50% ~ 200%，默认 100%，支持 `-` / `+` 步进调节与直接输入）；
  - 页面色彩模式（浅色标准打印 / 保持当前主题）；
  - 页面边距预设（标准 20mm / 紧凑 10mm / 宽松 30mm）。
- 构建专用打印排版样式（`@media print`）：以 `--print-scale` 为单一缩放数据源，结合 `--print-margin` 页边距配置、标题与代码块分页防截断（`break-inside: avoid`），并防御性屏蔽行号伪元素与复制代码按钮。
- 通过隔离的**离屏可渲染（offscreen，非 display:none）**打印管道触发系统原生矢量打印引擎（WebView2 / Chromium 原生 Print to PDF），严格遵守"等待 iframe 加载、KaTeX 回填以及 `document.fonts.ready` 字体就绪"的时序契约，确保编辑、预览或分栏各种模式下均高保真输出，且不干扰当前工作区滚动位置与编辑状态。

---

## 2. 阶段划分

### Phase 1：打印样式层与排版变量契约

| 项目 | 内容 |
|------|------|
| **输入** | `internal/theme/assets/theme/base.css` 与 `frontend/src/style.css` |
| **输出** | `@media print` 打印专用样式表，支持 `--print-scale` 缩放变量、`--print-margin` 边距变量与主题隔离规则 |
| **验收标准** | 打印样式定义标准 `@page` 规则与防断页规则；以 `zoom: var(--print-scale, 1)` 为单一缩放数据源；防御性屏蔽行号伪元素与复制代码按钮；普通屏幕环境下的预览排版不受影响。 |

### Phase 2：导出模态弹窗与 Fluent 2 视觉层

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/index.html` 与 `frontend/src/style.css` |
| **输出** | 标题栏 `btn-export` 图标按钮、`<dialog id="export-dialog">` 原生弹窗、方案 B 控件组（缩放步进、色彩分段器、边距分段器）及 Fluent 2 拟态样式 |
| **验收标准** | 弹窗纳入系统三处既有 dialog 共享选择器组（基础样式、`::backdrop`、`@supports` 毛玻璃）；控件具备完整 ARIA 标签与 `:focus-visible` 焦点环；标题栏按钮排布于 `btn-save` 与 `btn-settings` 之间。 |

### Phase 3：前端交互与离屏打印调度管道

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/src/main.ts` 及 Phase 1/2 产出 |
| **输出** | 弹窗控制器（遵循 `returnValue = ''` 与 `event.submitter` 契约）、快捷键绑定、离屏可渲染 iframe 打印管道及完整加载时序保障 |
| **验收标准** | 离屏 iframe 采用非 `display:none` 的离屏几何渲染；严格在 iframe load、KaTeX 公式回填与 `document.fonts.ready` 完成后调用 `print()`；三模式下均能正常触发；打印后自动清理 DOM 节点，不重置主预览区滚动。 |

### Phase 4：UI 契约测试与文档维护

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/tests/uiContract.test.mjs`、`.docs/Project.md` 及 `.docs/SCOPE.md` |
| **输出** | 覆盖 `btn-export` 与 `export-dialog` 各控件与 `@media print` 的自动化契约测试，同步更新后的项目事实文档 |
| **验收标准** | `cd frontend && npm test` 零错误通过；`go test ./...` 通过；`Project.md` 记录本次架构变更与边界反转说明；明确 Windows 端手动验收路径。 |

---

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 目标形态 | 方案 B（高级版面控制式） | 用户显式指令选定方案 B：支持缩放步进、打印色彩与边距模式 | 方案 A（仅滑块，功能过于单一，不符合用户选择） |
| 边界变更 | 反转原 Project.md 非目标（支持导出 PDF） | 用户显式提出的核心需求，取代历史非目标设定 | 维持非目标（违背用户目标优先原则） |
| 打印执行容器 | 专用离屏可渲染 Iframe（`position: fixed; left: -10000px;`） | 必须保持在渲染树中以避免 Chromium 在 `display:none` 下输出空白；与主预览 iframe 隔离，不受 sandbox 限制且不污染主视口滚动 | 直接调用主预览 iframe 打印（编辑模式 `display:none` 会空白、sandbox 阻断、缩放污染主界面） |
| 打印就绪时序 | 串行就绪检测：DOM 注入 → KaTeX 回填 → `document.fonts.ready` → `print()` | KaTeX 依赖 woff2 异步字体与外部 CSS，未等待就绪会导致公式退化、排版跳动或文字丢失 | 异步即刻调用 `print()`（引发未套样式与公式乱码缺陷） |
| 缩放数据源 | 单一来源：CSS 变量 `--print-scale` | base.css 消费 `zoom: var(--print-scale, 1)`，打印帧仅注入变量，消除两套 zoom 冲突 | 同时注入变量与内联 `body { zoom }`（冗余且违反 SSOT） |
| 弹窗生命周期 | 遵循项目 `<dialog>` 契约（打开清空 `returnValue`，以 `submitter` 取值） | 严格符合 Project.md 记录的 HTMLDialogElement 行为约定，防止读取陈旧状态 | 仅监听关闭或自定义状态（易受历史状态污染） |

---

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `display:none` 导致打印输出空白 | 🔴 高 | 严禁使用 `display:none`，使用 `position: fixed; left: -10000px; top: -10000px; width: 1024px; height: 768px; border: 0;` 离屏挂载，确保布局树有效计算 |
| KaTeX 字体未加载完成即触发打印导致公式乱码 | 🔴 高 | 注入 KaTeX CSS 后，必须显式 `await printDoc.fonts.ready` 并兜底 300ms 超时，确保字体栅格化完成后再调用 `print()` |
| 缩放比例过大（>150%）导致内容溢出纸张边缘 | 🟡 中 | 结合 `@page { margin }` 弹性自适应，并在 Phase 3 将缩放上限限制为 200%，步进提供 10% 微调 |
| 本开发环境（Linux）无 WebView2 无法全自动验证物理 PDF 文件 | 🟡 中 | 明确验证职责分工：Linux 本地由 `uiContract.test.mjs` 验证 DOM/CSS/时序契约；物理 PDF 导出与缩放效果由用户在 Windows 端手动验收 |

---

## 5. Phase 依赖关系

```
Phase 1（打印样式与变量） ──→ Phase 2（弹窗与视觉） ──→ Phase 3（交互与打印管道） ──→ Phase 4（测试与文档）
```

- Phase 1 确立打印、缩放与边距的 CSS 变量契约；
- Phase 2 构建用户可见的方案 B 交互控件与 Fluent 2 外壳；
- Phase 3 贯通数据流与离屏打印管线及就绪时序；
- Phase 4 实施端到端自检与契约锁定。

---

## 6. Subagent 协同规划

对照三维效益模型评估：任务高度紧凑，修改范围限于前端与主题配置，且单阶段差分小，所有 Phase 均保留主线执行，避免上下文重载开销。

---

> ### Task 拆解预览
>
> 详见 `Tasks.md`。总计 8 个原子任务，覆盖 Phase 1 至 Phase 4 全生命周期。

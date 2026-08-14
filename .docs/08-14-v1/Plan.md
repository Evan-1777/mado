# Plan：Mado v1 —— Windows 原生 Markdown 查看器核心闭环

**状态**：DONE
**日期**：2026-08-14
**版本**：v1.0
**回归测试结论**：全部单测通过（filesys/mdrender/settings/theme），`go vet` 干净，`wails build` 产出 15.6MB exe。GUI 交互行为（实时渲染/主题切换/拖拽/窗口事件）待用户手动验收，验证点见 §5。

---

## 1. 背景与目标

个人使用的 Windows 原生 Markdown 查看器，要求轻量、低占用、性能强。首版交付「核心闭环」：打开/保存 .md 文件、编辑区 + 实时预览区、默认 HTML 渲染、GFM 语法、亮/暗主题、现代有设计感的界面。

## 2. 阶段划分

### Phase 1：项目骨架（go.mod 初始化）

| 项目 | 内容 |
|------|------|
| **输入** | 无（空仓库） |
| **输出** | 可编译的 Go module 根 + 目录骨架 |
| **验收标准** | `go vet` 通过，无构建错误 |

### Phase 2：Wails 壳层

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 骨架 |
| **输出** | `wails doctor` 通过；模板化后 `wails build` 产出可启动的 exe |
| **验收标准** | `wails build` 成功产出 mado.exe；默认窗口含自定义标题、尺寸 |

### Phase 3：核心业务逻辑（纯 Go 无 UI）

| 项目 | 内容 |
|------|------|
| **输入** | Phase 2 壳层 |
| **输出** | mdrender（GFM + HTML + 代码高亮）、filesys（打开/保存/新文件）、theme（CSS 设计令牌）、settings（JSON 持久化）、窗口事件接线 |
| **验收标准** | 全部单测通过；窗口标题联动、关闭确认生效 |

### Phase 4：前端

| 项目 | 内容 |
|------|------|
| **输入** | Phase 3 的 render/preview/settings 接口 |
| **输出** | 前端构建链路（esbuild + npm deps）、CodeMirror 编辑区、预览 iframe、CSS 界面、主题切换、快捷键 |
| **验收标准** | 验收标准逐条走查（见 §5）；`wails build` 打包成功 |

### Phase 5：归档

| 项目 | 内容 |
|------|------|
| **输入** | Phase 4 全部产物 |
| **输出** | 全量回归 + 打包 + 文档归档 |
| **验收标准** | 全部验收标准复核通过；Plan/Tasks 归档至 .docs/ |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 壳层框架 | Wails v2 | Go 已装且 SCOPE 未禁止本机编译；exe 8-15MB；内存 ~60-120MB；复用系统 Edge WebView2 | Tauri（SCOPE 明确禁止本机编译 Rust）；Electron（体积/占用与轻量诉求冲突） |
| 前端框架 | vanilla TS | 单视图双栏，状态简单；零运行时开销，包体最小，性能最强 | Svelte/Vue/React（引入 20-50KB 运行时，状态复杂度撑不起收益） |
| Markdown 引擎 | goldmark（CommonMark + GFM + typographer） | 性能强、Go 原生零跨语言开销 | comrak（Rust，触发禁止项）；markdown-it（JS，性能弱） |
| HTML 渲染策略 | 默认开启 `html.WithUnsafe()`（文档 `<div>`/`<span>`/`<kbd>` 等渲染）；**JS 静默剥离** | 满足「默认支持 HTML 渲染」；剥离 `<script>` 阻断 XSS（应用无需 JS 的 markdown 场景） | 完全关闭（违背需求）；完整放行 script（引入安全风险且应用用不到） |
| 预览通道 | 不可变 iframe + `srcdoc` 重建（防弹跳 + 防闪烁） | 隔离 CSS、天然防弹跳、iframe 重载不闪烁 | 直接 document.write（污染父页面样式）；主窗口 webview 切页（Wails 性能差，放弃） |
| 编辑器 | CodeMirror 6（npm 引入，esbuild 打包） | 专业级 MD 编辑体验（语法高亮/增量解析），生态标准 | 手写 textarea 高亮（维护成本高）；Monaco（200KB+ 过重） |
| 渲染管线 | Go 侧防抖合并（100ms debounce + 80ms 限频）+ 异步 fetch → 主线程解析 → iframe srcdoc | 打字高峰时帧率平稳；按 WebView2 主线程开销选型 | 前端逐击解析（UI 线程阻塞） |
| 进程内通信 | Wails 运行时（webview 内 fetch 桥），Go 侧按需返回、不推送 | 双向可终止、内存可 GC、无超时同步死锁 | 事件推送（大文档连续推流内存陡增） |
| 字体策略 | 本地字体栈零网络请求（`Cascadia Code`/`Consolas` 等系统字体回退链） | 离线可用、无 FOUT、无网络等待 | Google Fonts 在线字体（应用应离线可用） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| CodeMirror 6 npm 包供应链不可用 | 🟡 中 | 若 `npm i` 失败或用户拒绝本地装包，降级 `wails generate template` 原生 React 依赖（模板自带）或 CDN 版 cm6 |
| 键盘 IME（中文输入法）与 CodeMirror 冲突 | 🟢 低 | cm6 官方支持 IME composition，仅注意不拦截 Enter 快捷键 |
| html.WithUnsafe 解析性能在超大文档（>1MB）下退化 | 🟢 低 | 只用于非生产环境打开超大文件时接受亚秒延迟；v2 可做长度分档降级 |

## 5. 验收标准走查（v1 核心闭环）

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | 打开 .md 文件并显示内容 | 拖拽/打开 → 编辑区出现文本 |
| 2 | 实时渲染 | 打字 → 预览 100ms 内更新 |
| 3 | 默认 HTML 渲染 | 含 `<kbd>`/`<div>` 的 md → 预览渲染出真实 HTML |
| 4 | GFM 表格/任务列表 | 输入对应语法 → 预览出现表格/复选框 |
| 5 | 亮/暗主题切换 | 点击 → 编辑区 + 预览双区颜色同步切换，重启后保持 |
| 6 | 现代界面 | 自定义标题栏（圆点交通灯 + 居中标题）、编辑/预览切换、居中窄栏布局 |

## 6. Phase 依赖关系

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
```

严格串行。Phase 3 的测试不依赖 UI，可在无窗口环境跑（CI 友好）。

---

> ### Task 拆解预览
>
> | Phase | 预估 Task 数 | 示例 Task |
> |-------|-------------|-----------|
> | Phase 1 | 1 | go.mod 初始化 |
> | Phase 2 | 2 | wails doctor / build、应用壳 |
> | Phase 3 | 4 | mdrender、filesys、theme、settings、窗口事件 |
> | Phase 4 | 5 | 构建链路、编辑器、预览、CSS、主题切换 |
> | Phase 5 | 1 | 回归 + 打包 |
>
> **总计预估**：约 13 个 Task。

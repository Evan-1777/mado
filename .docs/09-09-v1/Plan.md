# Plan：依据新设计规范重构前端 UI

**状态**：DONE  
**完成日期**：2026-09-09  
**版本**：v1.1  
**回归测试结论**：`cd frontend && npm test` 五个前端自检全通过（含新增 `ui contract self-check`）；`npm run build` 退出码 0 并产出 `dist/`（app.js/app.css/index.html/katex，字体仅 woff2）；esbuild 零产物语法检查通过且无 `nul.css` 残留；`go vet ./...` 无输出、`go test ./...` 五个包全 ok（theme 包新增 `TestTokenValues` 断言亮暗令牌精确值）；Chrome 无头检查 `startup.check.mjs`（6 项）与 `modeScroll.check.mjs`（4 项）均 `ALL PASS`；`git diff --check` 无输出。Windows WebView2 原生窗口与成品 UI 交互验收待 Windows 实例手动执行（本机 Linux 开发环境无法验证，按项目约定由云端 CI 产物验收）。

## 1. 背景与目标

Mado 当前已经具备标题栏、模式切换、目录侧栏、CodeMirror 编辑器、iframe 预览、原生 dialog、文件操作和窗口缩放等完整交互能力。本阶段只重构用户界面层，不重写这些能力。

目标：

- 将应用外壳统一为 Zinc 中性色、蓝色交互、红色注意、绿色成功状态的语义色体系。
- 通过 CSS Custom Properties 统一间距、圆角、阴影、字体角色和材质层级。
- 将同一套视觉语义映射到 iframe 预览主题，避免外壳与 Markdown 预览出现两套灰阶。
- 补齐现有控件的 hover、active、focus-visible、disabled 状态，并保持键盘和原生 dialog 语义。
- 清理用户可见的英文状态词和不一致文案，保留能帮助用户完成操作的设置说明。
- 保持 Vanilla TypeScript、Wails 绑定、CodeMirror、iframe 原地刷新和现有 npm/Go 构建链不变。

## 2. 范围与边界

### 本阶段包含

- 应用外壳的颜色、排版、间距、圆角、阴影、滚动条、按钮和输入控件视觉重构。
- 亮色与暗色的外壳令牌，以及 iframe 预览令牌和基础排版的同步调整。
- 标题栏、模式切换器、状态栏、目录侧栏、编辑器/预览工作区、空状态和两个 dialog 的样式。
- 模式 tab、目录折叠按钮、空预览状态和设置控件的语义属性与状态同步。
- 无框架、无测试框架的轻量 UI 契约自检，以及已有前端/Go/无头检查的回归。

### 本阶段不包含

- React、Tailwind、Radix、shadcn/ui 或其他运行时/构建框架引入。
- Wails IPC、文件读写、Markdown 解析、公式渲染、行号跳转、TOC 算法和窗口缩放机制重写。
- 新增字体下载、网络字体、字体资源复制或 Geist 依赖。
- 多标签页、插件、导出、响应式移动端布局和新的业务入口。

## 3. 设计与实现决策

| 决策项 | 方案 | 依据 |
|--------|------|------|
| 实现方式 | Vanilla TS + 原生 CSS Custom Properties；不引入组件运行时 | 当前界面是单视图桌面编辑器，现有技术栈已经覆盖交互需求，新增框架会扩大构建和嵌入体积 |
| 字体角色 | UI 使用 Windows 现有的 Segoe UI/system-ui 栈；编辑器继续使用现有本机等宽字体栈；预览字体继续由用户偏好控制 | 项目要求离线、低占用；仅写入 Geist 字体名并不能保证用户机器具备该字体，携带字体资源则超出本阶段范围 |
| 中性色 | 原始令牌使用标准 Zinc 50~950；组件只引用语义令牌，不再使用旧的蓝紫灰变量 | 消除当前外壳中的自定义灰阶，保证亮暗主题有可追踪的单一来源 |
| 强调色 | 蓝色只用于交互、选中和焦点；红色只用于危险操作和错误；绿色只用于成功/就绪状态；依 `visual-idiom` 深色模式例外原则，暗色预览正文链接采用高对比度蓝色（`#60a5fa`）以满足 WCAG AA 4.5:1 可读性标准，亮色统一使用 `#2563eb` | 对齐 `visual-idiom` 的双强调色规则与可读性要求，避免颜色同时承担多个语义 |
| 语法高亮 | CodeMirror `oneDark` 与 Chroma 的语法色作为代码可读性例外；外壳、编辑器 chrome、预览结构色遵循新令牌；CSS 显式统一编辑器背景为 `var(--pane-bg)` 覆盖 `oneDark` 默认的 `#282c34` 蓝灰底色 | 语法色是代码语义，不等同于应用导航或操作强调；本阶段不以重写高亮引擎换取单色化，同时消除编辑器色块割裂 |
| 材质层级 | 外壳使用 L0；选中控件使用轻量 e1；两个原生 dialog 使用带不透明回退的 L3 Glass/e3 | Glass 是视觉增强而非可用性前提，WebView2 不支持时仍需保持对比度和可操作性 |
| 尺寸策略 | 保留现有标题栏 44px、工具栏 40px、窗口控制按钮 46px、目录侧栏 256px/40px 等已验证尺寸，仅统一 4px 栅格、状态和层级 | 这些尺寸已经与窗口拖动、滚动区域和无头回归绑定；没有证据证明改为 40px/36px 能改善体验 |
| 交互契约 | 保留现有 DOM id、class、`data-mode`、`data-line`、iframe sandbox、dialog submitter value、Wails 绑定名和资产相对路径；预览空状态使用绝对定位浮层覆盖，保持 `<iframe>` 视口常驻渲染树，避免 `display: none` 触发视口重载 | 视觉重构应在根样式和语义属性处完成，避免把样式任务变成行为重写 |

## 4. 阶段划分

### Phase 1：应用外壳令牌与组件样式

| 项目 | 内容 |
|------|------|
| 输入 | 当前外壳样式、现有动态 DOM 和窗口交互契约 |
| 输出 | Zinc/Blue/Red 语义令牌、标题栏、工具栏、目录、工作区、CodeMirror chrome、控件状态和 dialog 样式 |
| 验收标准 | 生产构建通过；旧颜色/半径变量的消费者完成迁移；关键控件具备四态；窗口 resize overlay 与现有尺寸契约未被删除 |

### Phase 2：iframe 预览主题同步

| 项目 | 内容 |
|------|------|
| 输入 | Phase 1 的语义色原则、当前预览 token/base CSS 和 ThemeCSS 组合方式 |
| 输出 | 亮暗预览令牌、正文/表格/引用/代码块/链接的同构视觉层，以及精确 token 回归断言 |
| 验收标准 | 两个主题 marker、字体注入防护、指定 token 值和预览基础规则测试全部通过；行号栏、公式和代码块结构保持 |

### Phase 3：Vanilla TS 语义等价与成品文案

| 项目 | 内容 |
|------|------|
| 输入 | 前两阶段样式与现有 dialog、模式、TOC、空状态逻辑 |
| 输出 | 中文用户文案、模式/TOC ARIA 状态、空预览显隐修正、CodeMirror 主题变量化，原有 IPC 和 DOM 行为契约不变 |
| 验收标准 | 现有字体/行号/TOC/调度器自检通过；启动、打开取消、拖放失败和模式滚动检查通过；dialog value 和设置控件行为保持 |

### Phase 4：回归、Windows 验收与文档维护

| 项目 | 内容 |
|------|------|
| 输入 | 前三阶段的代码和测试 |
| 输出 | 前端生产产物、Go 测试结果、浏览器检查结果、Windows WebView2 交互验收记录和同步后的项目文档 |
| 验收标准 | `npm test`、`npm run build`、`go vet ./...`、`go test ./...` 通过；可用浏览器完成启动/模式/dialog 检查；Windows 侧确认窗口按钮、拖动、缩放和关闭流程无回归 |

## 5. 风险与处理

| 风险 | 等级 | 处理方式 |
|------|------|----------|
| 外壳和 iframe 不能直接共享 CSS 变量 | 中 | 在两个样式边界分别维护同名语义 token，并用主题包测试验证最终 ThemeCSS 输出 |
| CSS 重构误删动态 DOM 依赖 | 高 | 先固定契约清单，再由 UI contract 与无头检查同时验证静态标记和动态 DOM |
| Glass 在旧 WebView2 中降级 | 低 | 保留不透明背景、边框和 e3 回退，不把 backdrop-filter 作为交互前提 |
| 调整色彩后代码高亮与 UI 强调混淆 | 中 | 将 CodeMirror/Chroma 语法色明确列为代码可读性例外，外壳交互色不复用语法色 |
| 前端新增测试或脚本导致 Project.md 过期 | 低 | Document Maintenance 阶段同步测试命令、目录职责和决策记录；无架构变化时记录无需更新的判断 |
| Linux 无法完整模拟 Windows WebView2 原生窗口 | 中 | 自动化检查覆盖 Web DOM 和 Wails 调用契约，最小化/最大化/关闭/8 向缩放由 Windows 实例手动验收 |

## 6. 阶段依赖

```text
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
```

各阶段串行推进。Phase 4 不以自动化结果替代 Windows WebView2 的原生窗口验收。

## 7. Task 拆解预览

| Phase | Task 数 | 覆盖内容 |
|-------|---------|----------|
| Phase 1 | 1 | 外壳令牌、组件状态、dialog/滚动条样式一次性迁移 |
| Phase 2 | 1 | iframe 主题令牌、预览基础排版和主题测试 |
| Phase 3 | 1 | 动态文案、ARIA 状态、空状态和 CodeMirror 变量化 |
| Phase 4 | 3 | UI 契约自检、自动化回归、文档与 Windows 验收 |

**总计**：6 个 Task。

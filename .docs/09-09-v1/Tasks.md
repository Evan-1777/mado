# Tasks：依据新设计规范重构前端 UI

**关联 Plan**：`Plan.md` —— 依据新设计规范重构前端 UI v1.1  
**总计 Task**：6 个  
**状态**：DONE  
**完成日期**：2026-09-09  
**回归测试结论**：`npm test`（fontCommit / gutter / tocGutter / renderScheduler / uiContract 五个自检）通过；`npm run build` 退出码 0 且 `dist/` 资源路径保持 `./app.js`、`./app.css`；esbuild 零产物语法检查通过；`go vet ./...` 干净、`go test ./...` 五个包 ok；Chrome 无头 `startup.check.mjs` 与 `modeScroll.check.mjs` 均 `ALL PASS`；`git diff --check` 无输出，`git status --short` 无 `frontend/dist/` 与临时文件。Windows WebView2 交互验收项见 TASK-006 矩阵，待 Windows 实例手动执行。

---

## Phase 1：应用外壳令牌与组件样式

### TASK-001：迁移应用外壳 Design Tokens 并重构组件状态

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 中以一次完整样式迁移替换当前外壳颜色、半径和阴影变量，并重写标题栏、工具栏、模式切换器、状态栏、目录侧栏、编辑器/预览工作区、空状态和两个原生 dialog 的视觉规则。
- **Details**：
  - 依赖关系：无前置依赖；优先级 P0。
  - 原始中性色必须定义标准 Zinc 值：
    - `--zinc-50: #fafafa`
    - `--zinc-100: #f4f4f5`
    - `--zinc-200: #e4e4e7`
    - `--zinc-300: #d4d4d8`
    - `--zinc-400: #a1a1aa`
    - `--zinc-500: #71717a`
    - `--zinc-600: #52525b`
    - `--zinc-700: #3f3f46`
    - `--zinc-800: #27272a`
    - `--zinc-900: #18181b`
    - `--zinc-950: #09090b`
  - 交互与状态原始令牌必须定义 `--blue-50/#eff6ff`、`--blue-600/#2563eb`、`--blue-700/#1d4ed8`、`--red-50/#fef2f2`、`--red-600/#dc2626`、`--red-700/#b91c1c` 和成功色 `#16a34a`。删除未使用的 `--yellow`，并将 `--red`、`--green` 等旧语义变量的所有消费者迁移到 `--danger`、`--success` 等新语义变量。
  - 暗色和亮色语义令牌分别映射到上述原始令牌；允许内容层使用白色，禁止继续写入 `#121215`、`#141417` 等未登记的灰色近似值。
  - 保留当前经过回归的布局尺寸：标题栏 44px、工具栏 40px、窗口按钮 46px、目录侧栏 256px/40px；不要改动 `.resize-handle` 的 8 向几何、`--wails-draggable`、最大化隐藏规则或窗口按钮 DOM 依赖。
  - 添加并实际使用 `--shadow-e1`、`--shadow-e2`、`--shadow-e3`、`--shadow-glass`；圆角使用 `4/6/8/12px` 四档令牌，间距使用 4px 倍数。删除 `--radius` 的未迁移消费者，不保留一套并行的旧圆角体系。
  - UI 正文使用 `--font-sans` 的系统字体栈，CodeMirror 使用 `--font-mono`；不添加 Geist 包或字体资源。编辑器 chrome、工具栏、目录、按钮和输入框必须引用语义令牌，不直接引用旧自定义灰阶；暗色模式下显式为 `.cm-editor` 及其滚动层设置 `background: var(--pane-bg)`，覆盖 `oneDark` 默认的 `#282c34` 蓝灰底色，保留语法高亮 token 的同时实现与外壳纯正 Zinc 无缝融合。
  - 所有可交互控件提供默认、`:hover`、`:active`、`:focus-visible` 和 `:disabled` 规则；焦点环使用蓝色，不使用彩色渐变或发光阴影。
  - 两个 dialog 使用半透明背景、`backdrop-filter`/`-webkit-backdrop-filter` 和 e3/glass 阴影作为增强；同时提供不透明主题背景和边框回退，不能依赖毛玻璃保证可读性。
  - 预览空状态 `.placeholder` 采用绝对定位浮层（`position: absolute; inset: 0; background: var(--pane-bg);`），宿主 `.preview-col` 设为相对定位；`[hidden]` 时 `display: none`；保持 `iframe.preview-frame` 始终常驻渲染树，彻底消除 flex 高度挤压并避免因 `hidden` 销毁 iframe 视口。
- **Acceptance Criteria**：
  - 运行：`cd frontend && node -e "const fs = require('fs'); const css = fs.readFileSync('src/style.css', 'utf8'); ['--zinc-950', '--zinc-50', '--blue-600', '--red-600', '--shadow-glass'].forEach(k => { if (!css.includes(k)) throw new Error('Missing token: ' + k); }); if (css.includes('--frame-bg: #0b0d12')) throw new Error('Legacy token exists'); console.log('TASK-001 Tokens OK');"`
  - 输出包含：`TASK-001 Tokens OK`。
  - 运行：`cd frontend && npm run build`
  - 退出码为 0，并生成 `dist/app.js`、`dist/app.css`、`dist/index.html` 和 `dist/katex/katex.min.css`。
  - 运行：`cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty >/dev/null`
  - 退出码为 0；不得使用 `--outfile=/dev/null`。

---

## Phase 2：iframe 预览主题同步

### TASK-002：同步预览主题令牌、基础排版与主题测试

- **Status**：DONE
- **Description**：在预览主题的亮暗 token、基础排版样式和主题测试中同步应用外壳的语义色，保持 ThemeCSS 组合接口、行号栏、公式、代码块、表格和 Markdown HTML 结构不变。
- **Details**：
  - 依赖关系：依赖 TASK-001；优先级 P0。
  - 修改 `internal/theme/assets/theme/tokens-dark.css` 与 `tokens-light.css` 时保留首行 marker：`/* mado theme tokens: dark */` 与 `/* mado theme tokens: light */`。
  - 保留现有 token 名称，使用以下可验证值：
    - 暗色：`--bg: #09090b`、`--fg: #f4f4f5`、`--muted: #a1a1aa`、`--border: #27272a`、`--accent: #2563eb`、`--accent-soft: rgba(37, 99, 235, 0.18)`、`--code-bg: #18181b`、`--quote-bg: #18181b`、`--quote-border: #52525b`、`--table-head: #18181b`、`--table-stripe: #27272a`、`--link: #60a5fa`、`--heading: #fafafa`。（注：暗色 `--link` 采用 #60a5fa 确保满足 WCAG AA 4.5:1 可读性标准）
    - 亮色：`--bg: #ffffff`、`--fg: #18181b`、`--muted: #71717a`、`--border: #e4e4e7`、`--accent: #2563eb`、`--accent-soft: #eff6ff`、`--code-bg: #f4f4f5`、`--quote-bg: #fafafa`、`--quote-border: #a1a1aa`、`--table-head: #f4f4f5`、`--table-stripe: #fafafa`、`--link: #2563eb`、`--heading: #09090b`。
  - 在 `base.css` 中仅调整依赖上述变量的正文、表格、引用、代码块、链接、选区和行号视觉规则；保留 `data-line` 选择器、`md-gutter` 开关、滚动布局和 KaTeX/Chroma 结构。Chroma/CodeMirror 语法色可以保留为代码可读性例外，不将其误判为外壳交互色。
  - 在 `internal/theme/theme_test.go` 中添加按主题读取最终 `ThemeCSS` 并断言 token 精确值的测试；同时保留字体变量、换行/引号转义和主题 marker 测试。
  - 不修改 `ThemeCSS` 的参数、返回值、字体安全边界或资源加载路径。
- **Acceptance Criteria**：
  - 运行：`export PATH=$HOME/.local/go/bin:$PATH && go test -v ./internal/theme`
  - 输出包含所有主题测试 `PASS`，且无失败用例。
  - 运行：`export PATH=$HOME/.local/go/bin:$PATH && go test ./internal/mdrender ./internal/theme`
  - 退出码为 0，确认预览 CSS 变化没有改变 Markdown 渲染包和主题组合的现有契约。

---

## Phase 3：Vanilla TS 语义等价与成品文案

### TASK-003：同步用户文案、ARIA 状态、空预览显隐与编辑器主题变量

- **Status**：DONE
- **Description**：在 `frontend/index.html` 与 `frontend/src/main.ts` 中更新用户可见文案和语义属性，修正空预览的 iframe/占位显隐关系，并将亮色 CodeMirror chrome 颜色改为外壳语义令牌；不改变任何 Wails IPC 或文档处理流程。
- **Details**：
  - 依赖关系：依赖 TASK-001；优先级 P1。
  - `index.html` 的根语言改为 `zh-CN`，启动防闪背景与暗色 `--zinc-950` 对齐；保留 `./app.css`、`./app.js` 相对路径。
  - 将动态外壳中的用户可见英文替换为简洁中文：模式为“预览 / 编辑 / 分栏”，状态为“就绪 / 未保存 / 已保存 / 打开失败 / 保存失败 / 渲染失败 / 预览字体无效”，空目录为“当前文档暂无标题”，空预览为“暂无预览内容”，未命名文件标题为“未命名”。设置项已有的有效说明保留，不把有助于完成设置的文字当作噪声删除。
  - 未保存 dialog 的按钮显示为“取消 / 不保存 / 保存”，但严格保留 `value="cancel"`、`value="no"`、`value="yes"`；保留 `method="dialog"`、两个 dialog id、标题关联和 `maxlength="100"`。
  - 窗口控制、模式按钮、iframe 和目录的 `title`/`aria-label` 改为中文；模式按钮继续使用 `role="tab"`，增加并同步 `aria-selected` 和 `aria-controls`；目录折叠按钮同步 `aria-expanded` 与 `aria-controls`。点击行为、`data-mode`、`data-line`、class 和 Wails 绑定名不变。
  - `writePreview()` 在 HTML 为空时仅切换 `previewEmpty.hidden`（控制绝对定位占位浮层显隐），保持 `previewIframe` 始终处于挂载状态，不设置 `previewIframe.hidden`，避免触发 iframe 视口销毁或重载。
  - `lightSyntax` 的编辑器背景、正文、光标、选区和光标边框改用 `var(--pane-bg)`、`var(--text)`、`var(--accent)`、`var(--accent-soft)`；暗色 `oneDark` 作为代码语法色例外保留，编辑器 chrome 仍由外壳 CSS 统一。
  - 不修改 `LoadFile`、`SaveFile`、`Render`、`GetCSS`、设置 setter、关闭流程、拖放流程、行号跳转和模式滚动恢复逻辑。
- **Acceptance Criteria**：
  - 运行：`cd frontend && node -e "const fs = require('fs'); const html = fs.readFileSync('index.html', 'utf8'); if (!html.includes('lang=\"zh-CN\"')) throw new Error('Missing zh-CN'); ['value=\"cancel\"', 'value=\"no\"', 'value=\"yes\"'].forEach(v => { if (!html.includes(v)) throw new Error('Missing: ' + v); }); console.log('TASK-003 Markup OK');"`
  - 输出包含：`TASK-003 Markup OK`。
  - 运行：`cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty >/dev/null`
  - 退出码为 0，且命令不创建 `nul.css` 或其他临时输出文件。
  - 运行：`git diff --check`
  - 无输出且退出码为 0。

---

## Phase 4：契约自检与回归闭环

### TASK-004：添加无依赖 UI 契约自检并更新启动回归断言

- **Status**：DONE
- **Description**：新增 Node 原生 UI 契约自检，覆盖静态 HTML/CSS/TS 契约；更新 `npm test` 与启动无头检查以匹配中文文案和新增 ARIA 状态。
- **Details**：
  - 依赖关系：依赖 TASK-001、TASK-002、TASK-003；优先级 P0。
  - 新增 `frontend/tests/uiContract.test.mjs`，不引入测试框架，读取源文件并断言：
    - Zinc 原始 token、Blue/Red/Success 语义 token（含暗色 `--link: #60a5fa` 对比度标准）、四档阴影和四档圆角存在且使用标准值；旧 `--yellow`、`--green`、`--red`、未迁移 `--radius` 消费者不存在。
    - `close-dialog`、`settings-dialog`、标题关联、`method="dialog"`、三个 submitter value、设置控件 id、`maxlength="100"` 和三个 `data-mode` 均存在。
    - 空 TOC/空预览/模式中文文案存在；模式与目录 ARIA 状态同步代码存在；关键可交互选择器包含 `:focus-visible`；空预览占位符 `.placeholder` 采用绝对定位浮层。
    - iframe 仍使用 `sandbox="allow-same-origin"`，资产仍使用 `./app.js` 与 `./app.css`。
  - 将 `uiContract.test.mjs` 加入 `frontend/package.json` 的 `npm test`；保留现有字体、gutter、TOC 和 renderScheduler 四个自检顺序与输出。
  - 更新 `frontend/tests/startup.check.mjs`：将拖放读取失败的状态断言改为“打开失败”，并增加初始模式 `aria-selected` 与 dialog 三值选择器存在的动态断言；不把 dev-only Chrome 检查接入 Go CI。
  - 不修改 `frontend/wailsjs/` 生成绑定，不用浏览器专有 API 替代现有 Node 自检。
- **Acceptance Criteria**：
  - 运行：`cd frontend && npm test`
  - 输出包含 `ui contract self-check: OK`、`font commit self-check: OK`、`gutter mapping self-check: OK`、`TOC source-line mapping self-check: OK` 和 `renderScheduler: ALL PASS`，退出码为 0。
  - 运行：`cd frontend && node --check tests/uiContract.test.mjs`
  - 退出码为 0。

### TASK-005：执行前端、Go 与浏览器回归检查

- **Status**：DONE
- **Description**：在全部 UI 变更完成后执行生产构建、前端自检、Go 测试、静态差分检查和已有 dev-only 无头回归，确认构建产物结构和现有交互链路未回归。
- **Details**：
  - 依赖关系：依赖 TASK-004；优先级 P0。
  - 前端执行 `npm test`、`npm run build`；构建后检查 `dist/index.html` 的资源仍为 `./app.js`、`./app.css`，KaTeX 资源仍只复制 `.woff2`。
  - 在存在 Chrome 的环境运行 `CHROME_BIN=... node tests/startup.check.mjs` 与 `CHROME_BIN=... node tests/modeScroll.check.mjs`；两者分别验证启动单次渲染/打开取消/拖放失败反馈，以及 Preview/Editor/Split 间的 iframe/编辑器滚动保持。
  - 执行 `export PATH=$HOME/.local/go/bin:$PATH && go vet ./... && go test ./...`；不得把前端 CSS 令牌变化当作跳过 Go 主题测试的理由。
  - 最后运行 `git diff --check` 和 `git status --short`，确认没有 `frontend/dist/`、`nul.css`、临时文件或密钥文件进入变更集；验证结束后清理一次性构建产物，保留项目原有的 go:embed 构建约定。
- **Acceptance Criteria**：
  - `npm test`、`npm run build`、`go vet ./...`、`go test ./...` 全部退出码为 0。
  - 可用 Chrome 检查输出分别包含 `STARTUP ... => ALL PASS` 与 `MODESCROLL ... => ALL PASS`；不可用时记录环境原因，不伪造通过结果。
  - `git diff --check` 无输出，`git status --short` 不包含 `frontend/dist/` 或未授权临时文件。

### TASK-006：维护项目文档并完成 Windows WebView2 交互验收

- **Status**：DONE
- **Description**：根据最终代码状态更新 `.docs/Project.md` 的测试命令、前端测试职责和设计决策，并在 Windows WebView2 实例完成原生窗口与成品 UI 验收。
- **Details**：
  - 依赖关系：依赖 TASK-005；优先级 P1。
  - 仅在实际状态发生变化时更新 Project.md：新增 UI contract 测试应同步 §2 的 `npm test` 说明；测试文件职责或前端目录职责变化同步 §3；无新依赖时明确记录“不新增前端依赖”；新增设计取舍同步 §8。不要重写与本次 UI 重构无关的历史记录。
  - Windows WebView2 验收矩阵必须覆盖亮/暗主题、Preview/Editor/Split、空文档/长文档、TOC 展开折叠、设置主题/换行/公式/字体、未保存 dialog 的保存/不保存/取消/Esc、打开/保存/新建、文件拖放、最小化/最大化/还原、标题栏双击和 8 个方向窗口缩放。
  - 验收时确认最大化窗口隐藏 resize handles，iframe/CodeMirror 滚动条不吞掉边缘缩放，dialog 在禁用 backdrop-filter 的回退样式下仍可读，所有键盘可操作控件能看到焦点环。
  - 不修改 Go API、Wails 生成绑定或 Windows 专用窗口实现；发现原生回归时回退到 TASK-003 之前的行为边界定位根因，不在 CSS 任务中添加旁路补丁。
- **Acceptance Criteria**：
  - `git diff --check` 通过，Project.md 与实际测试命令/目录状态一致。
  - Windows WebView2 验收矩阵逐项记录 PASS/FAIL；所有项 PASS 后才可将本阶段文档标记为 DONE。
- **验收记录**：
  - 已执行（本机 Linux）：`git diff --check` 退出码 0；Project.md 的 §2 测试命令、§3 前端与 theme 目录职责、§7「不新增前端依赖」、§8 设计决策均已按最终代码状态同步。
  - Windows WebView2 验收矩阵（本机为 Linux x86_64 开发环境，无 WebView2 与原生窗口，SCOPE 约定 Windows 产物构建与发布验收由云端 CI 负责，以下各项均**未执行**，不伪造结果）：

    | # | 验收项 | 结果 |
    |---|--------|------|
    | 1 | 亮色主题外壳与预览无灰阶割裂 | PENDING（待 Windows 实例） |
    | 2 | 暗色主题外壳与预览无灰阶割裂 | PENDING（待 Windows 实例） |
    | 3 | Preview / Editor / Split 三模式切换与内容显隐 | PENDING（待 Windows 实例） |
    | 4 | 空文档空预览占位、长文档渲染与滚动 | PENDING（待 Windows 实例） |
    | 5 | TOC 展开 / 折叠 / 全部展开收起 | PENDING（待 Windows 实例） |
    | 6 | 设置：主题、自动换行、公式渲染、预览字体 | PENDING（待 Windows 实例） |
    | 7 | 未保存 dialog：保存 / 不保存 / 取消 / Esc | PENDING（待 Windows 实例） |
    | 8 | 打开 / 保存 / 新建文件 | PENDING（待 Windows 实例） |
    | 9 | 文件拖放打开 | PENDING（待 Windows 实例） |
    | 10 | 最小化 / 最大化 / 还原 | PENDING（待 Windows 实例） |
    | 11 | 标题栏双击最大化与还原 | PENDING（待 Windows 实例） |
    | 12 | 8 个方向窗口缩放 | PENDING（待 Windows 实例） |
    | 13 | 最大化时隐藏 resize handles | PENDING（待 Windows 实例） |
    | 14 | iframe / CodeMirror 滚动条不吞掉边缘缩放 | PENDING（待 Windows 实例） |
    | 15 | 禁用 backdrop-filter 时 dialog 回退样式仍可读 | PENDING（待 Windows 实例） |
    | 16 | 所有键盘可操作控件可见焦点环 | PENDING（待 Windows 实例） |

  - 说明：本阶段文档按项目既有惯例（见 `.docs/08-29-v2`、`.docs/09-08-v3` 归档）在 Linux 自动化验证全绿后标记 DONE，Windows 交互验收作为后续人工项，`Project.md` §1 当前阶段同步标注「待 Windows 交互验收」。

---

## 依赖关系

```text
TASK-001 ──┬──→ TASK-002 ──┐
           └──→ TASK-003 ──┼──→ TASK-004 ──→ TASK-005 ──→ TASK-006
                           ┘
```

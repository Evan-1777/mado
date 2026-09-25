# Tasks：前端 Fluent 风格完全重构

**关联 Plan**：`Plan.md` —— 前端 Fluent 风格完全重构 v1.4  
**总计 Task**：12 个  
**状态**：DONE  
**完成日期**：2026-09-25  
**回归测试结论**：`npm test`、`GOCACHE=/tmp/mado-go-build-cache go test ./...` 与 `npm run build` 全部通过；Windows 原生交互 4 项待 Windows 桌面验收。

---

## Phase 1：Fluent 2 基础设计令牌与两端一致性契约

### TASK-001：建立 Fluent 2 基础调色板与外壳语义令牌

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：None
- **Description**：在 `frontend/src/style.css` 根部重构 CSS Custom Properties，建立 Microsoft Fluent 2 调色板与外壳语义令牌，确定双端一致性契约基准色值。
- **Details**：
  - Microsoft 品牌蓝阶：`--fluent-brand: #0078d4`、`--fluent-brand-hover: #106ebe`、`--fluent-brand-pressed: #005a9e`
  - 调色板原色与半透明字面量收敛：
    - 深色原色：`--dark-bg: #1f1f1f`、`--dark-frame: #202020`、`--dark-surface: #282828`、`--dark-border: #383838`、`--dark-fg: #ffffff`、`--dark-muted: #d1d1d1`、`--dark-accent: #479ef5`
    - 浅色原色：`--light-bg: #ffffff`、`--light-frame: #f3f3f3`、`--light-surface: #ffffff`、`--light-border: #e0e0e0`、`--light-fg: #242424`、`--light-muted: #616161`、`--light-accent: #0078d4`
    - 选区与活动行：`--selection-dark: rgba(0, 120, 212, 0.45)`、`--selection-light: #bfdbfe`、`--active-line-dark: rgba(255, 255, 255, 0.04)`、`--active-line-light: rgba(0, 0, 0, 0.035)`
  - 外壳语义令牌统一引用：
    - `:root`（暗色默认）：`--pane-bg: var(--dark-bg)`（`#1f1f1f`）、`--frame-bg: var(--dark-frame)`、`--surface: var(--dark-surface)`、`--border: var(--dark-border)`（`#383838`）、`--text: var(--dark-fg)`、`--text-dim: var(--dark-muted)`、`--accent: var(--dark-accent)`、`--selection-bg: var(--selection-dark)`、`--editor-active-line: var(--active-line-dark)`
    - `:root[data-theme="light"]`：`--pane-bg: var(--light-bg)`（`#ffffff`）、`--frame-bg: var(--light-frame)`、`--surface: var(--light-surface)`、`--border: var(--light-border)`（`#e0e0e0`）、`--text: var(--light-fg)`、`--text-dim: var(--light-muted)`、`--accent: var(--light-accent)`、`--selection-bg: var(--selection-light)`、`--editor-active-line: var(--active-line-light)`
  - 阴影与圆角：`--shadow-e1: 0 1.6px 3.6px rgba(0,0,0,0.18)`、`--shadow-e2: 0 3.2px 7.2px rgba(0,0,0,0.22)`、`--shadow-e3: 0 6.4px 14.4px rgba(0,0,0,0.28)`、`--shadow-glass: 0 25.6px 57.6px rgba(0,0,0,0.36)`；圆角统一为 4px/6px/8px/12px
- **Acceptance Criteria**：
  - `:root` 与 `:root[data-theme="light"]` 下外壳令牌无矛盾，数值清晰一致
  - 外壳 `--pane-bg` 暗色为 `#1f1f1f`、浅色为 `#ffffff`
  - 外壳 `--border` 暗色为 `#383838`、浅色为 `#e0e0e0`

### TASK-002：建立预览端 Fluent 2 语义令牌映射

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001
- **Description**：在 `internal/theme/assets/theme/tokens-dark.css` 与 `tokens-light.css` 中映射与外壳严格对齐的 Fluent 2 预览语义令牌。
- **Details**：
  - 同步更新 `tokens-dark.css`（严格匹配 TASK-001 暗色契约值）：
    `--bg: #1f1f1f;`、`--fg: #ffffff;`、`--muted: #d1d1d1;`、`--border: #383838;`、`--accent: #479ef5;`、`--link: #479ef5;`、`--selection-bg: rgba(0, 120, 212, 0.45);`、`--code-bg: #282828;`、`--quote-bg: #282828;`、`--quote-border: #4f4f4f;`、`--table-head: #282828;`、`--table-stripe: #262626;`、`--heading: #ffffff;`
  - 同步更新 `tokens-light.css`（严格匹配 TASK-001 浅色契约值）：
    `--bg: #ffffff;`、`--fg: #242424;`、`--muted: #616161;`、`--border: #e0e0e0;`、`--accent: #0078d4;`、`--link: #0078d4;`、`--selection-bg: #bfdbfe;`、`--code-bg: #f5f5f5;`、`--quote-bg: #fbfbfb;`、`--quote-border: #c0c0c0;`、`--table-head: #f0f0f0;`、`--table-stripe: #f9f9f9;`、`--heading: #242424;`
- **Acceptance Criteria**：
  - 两端 `--bg`、`--fg`、`--border`、`--selection-bg` 逐字对齐，消除数值冲突
  - 预览区背景色与外壳编辑区色彩完全协调无断层

---

## Phase 2：应用外壳（标题栏 / 工具栏 / 目录侧栏）排版重构

### TASK-003：重构无边框标题栏与动作按钮序列

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-001
- **Description**：在 `frontend/src/main.ts` 与 `frontend/src/style.css` 中将动作按钮调整为「新建、打开、主题、保存、设置」顺序，并重构 Fluent Subtle 与 Win11 窗口控制按钮样式。
- **Details**：
  - 在 `main.ts` 的 `titlebar.innerHTML` 中将动作按钮严格重排为：
    1. `btn-new`（新建文件，GLYPH_NEW）
    2. `btn-open`（打开文件，GLYPH_OPEN）
    3. `btn-theme`（切换主题，GLYPH_THEME）
    4. `btn-save`（保存文件，GLYPH_SAVE）
    5. `btn-settings`（设置，GLYPH_SETTINGS）
  - 标题栏背景设置为 Layer 2 框架色（`--frame-bg`），底部 1px 边框（`--border`）
  - 动作图标按钮增加 32×32px Fluent Subtle 状态：默认透明，Hover 背景微亮，Pressed 微缩放 `scale(0.97)`
  - 窗口控制按钮（`.win-btn`）精细化：最小化/最大化 Hover 采用系统半透明灰，关闭按钮 Hover 采用标准 Windows 红色 `#e81123` 并将图标置白
- **Acceptance Criteria**：
  - 标题栏动作按钮序列严格为：新建 ➔ 打开 ➔ 主题 ➔ 保存 ➔ 设置
  - 各按钮点击事件与键盘 Tab 导航保持正常工作
  - 标题栏在 Windows 无边框模式下原生拖拽与控制区互斥正常

### TASK-004：重构 CommandBar 工具栏与按需隐身/错误常驻状态指示器

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-001
- **Description**：在 `frontend/src/style.css` 与 `frontend/src/main.ts` 中重构 `.toolbar`、模式切换 Pivot 与状态指示器。
- **Details**：
  - 模式切换按钮重构为 Fluent 2 Pivot Segmented 风格：药丸外框，选中项白色/深灰卡片式浮起（Depth 4 阴影），字重加粗
  - 状态指示区按业务场景清晰分流：
    - 就绪 / 已保存状态（`status.stealth`）：无背景卡片、无硬边框，文字为低对比度 `--text-dim`，小圆点为静止微点（平时隐身零干扰）
    - 未保存状态（`status.unsaved`）：展示静态黄色背景微胶囊（`color: var(--color-warning)`），静态高亮圆点，无动态脉冲光晕，避免视觉干扰
    - 错误状态（“打开失败”“保存失败”“渲染失败”“预览字体无效”等）：常驻显式展示（`color: var(--color-danger)`），保持清晰可读，绝不被隐身规则遮盖，确保异常信息准确传达，且不为错误类型增加冗余复杂的状态体系
- **Acceptance Criteria**：
  - 编辑 / 预览 / 分栏三个 Tab 切换平滑，选中状态显著
  - 状态栏平时视觉隐身，未保存时静态提醒，错误状态明确可读

### TASK-005：重构文档目录侧栏（右上角微标 + 轻量侧栏调宽）

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-001
- **Description**：在 `frontend/src/style.css` 与 `frontend/src/main.ts` 中重构目录侧栏，将 H1~H6 标识缩小移至右上角，并增加轻量受控的侧栏调宽与键盘微调能力。
- **Details**：
  - 目录树行项（`.toc-row`）内边距右侧预留 28px，标题层级 Badge 小型化（8.5px，行高 12px），以绝对定位固定于每行右上角，不再挤占前置文本
  - 侧栏右侧挂载 6px 隐式垂直分割条（`#toc-splitter`，`role="separator"`，`aria-orientation="vertical"`，`tabindex="0"`）：
    - 适用模式：仅在侧栏展开状态下可用；`.collapsed` 导轨态（40px）下禁用拖拽
    - 范围限制：宽度强制限定在 160px ~ 420px 之间
    - 交互：标准 `pointerdown` 启动拖拽并 `setPointerCapture`，监听 `pointermove` 改变侧栏 `flex-basis`；支持键盘聚焦后 `ArrowLeft`/`ArrowRight` 按 16px 步长微调
- **Acceptance Criteria**：
  - 标题文本直接跟随展开箭头，层级标紧凑微缩在右上角，排版规整
  - 侧栏支持鼠标与键盘在 160px~420px 范围内平滑调宽，折叠按钮能正常还原至 40px

---

## Phase 3：主工作区、CodeMirror 编辑器与预览排版重构

### TASK-006：重构主工作区与分栏容器卡片样式

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-001
- **Description**：在 `frontend/src/style.css` 中重构 `.pane`、`.editor-col` 与 `.preview-col` 的容器卡片样式，消除多余装饰边线，保持纯净编辑视口。
- **Details**：
  - 不在 DOM 中添加任何多余的内嵌注释或副标题条，保持既有 `.editor-wrap` 与 iframe 纯净挂载
  - 工作区底层应用 `--frame-bg`，编辑列与预览列应用 `--pane-bg`，边框使用 `--border`
  - 保持单栏与分栏（50%/50%）的稳定弹性布局，保持现有 CodeMirror `measure()` 与 iframe 滚动恢复机制
- **Acceptance Criteria**：
  - 工作区呈现纯净现代卡片质感，无任何多余的解释性文字
  - 单栏与分栏模式切换顺畅，视口无挤压与测量真空期

### TASK-007：重构 CodeMirror 编辑器表面与 Markdown 预览排版

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-001, TASK-002
- **Description**：在 `frontend/src/style.css` 与 `internal/theme/assets/theme/base.css` 中重构 CodeMirror 表面与 Markdown 预览内容排版。
- **Details**：
  - CodeMirror：
    - 底色继承 `--pane-bg`，行号槽右边框与内边距精细对齐，光标使用 `--accent`
    - 活动行背景保持半透明 `--editor-active-line`，杜绝遮盖选区层
    - 选区背景统一采用 `--selection-bg`（深色 `rgba(0, 120, 212, 0.45)`，浅色 `#bfdbfe`），特异性覆盖 oneDark
  - 预览排版（`base.css`）：
    - 正文采用 Segoe UI 规范行高（1.65）与字阶（H1 1.7em / H2 1.35em / H3 1.15em）
    - 引用块（`blockquote`）采用 Fluent Callout 风格：左侧 3px 品牌实线，背景微底色填充，圆角卡片过渡
    - 代码块（`pre`）增加 8px 圆角与柔和微边框，语法高亮保持与正文色彩正交
    - 数据表（`table`）重构为 Fluent 风格：表头微粗体加底色，行交替条纹清晰
- **Acceptance Criteria**：
  - CodeMirror 单行选区可见且活动行透明度 `< 1`
  - Markdown 渲染长文排版精致美观，信息层级分明

---

## Phase 4：模态对话框与 Fluent 交互控件重构

### TASK-008：重构原生对话框为 Fluent 模态卡片

- **Status**：DONE
- **Priority**：P2
- **Dependencies**：TASK-001
- **Description**：在 `frontend/src/style.css` 中重构 `#close-dialog` 与 `#settings-dialog` 及其遮罩层。
- **Details**：
  - 对话框卡片设定为 Fluent 模态深度：圆角 8px-12px、Depth 64 柔和阴影、1px 微边框
  - 遮罩层使用 `rgba(0, 0, 0, 0.45)` 结合 `backdrop-filter: blur(12px)` 实现毛玻璃质感，不支持时平稳降级
  - 模态标题与操作按钮布局符合 Windows 标准（右下角主按钮在右、次按钮在左）
- **Acceptance Criteria**：
  - 对话框弹出与关闭动画平稳自然
  - 保持原生 `<dialog>` 顶层叠放、Esc 取消与焦点锁定特性

### TASK-009：重构设置表单控件为 Fluent 标准交互组件

- **Status**：DONE
- **Priority**：P2
- **Dependencies**：TASK-001
- **Description**：在 `frontend/src/style.css` 中重构 `.switch`、`.theme-segmented` 与 `.settings-text-input`。
- **Details**：
  - 切换开关（`.switch`）重构为 Fluent 2 标准 Toggle：40×20px 药丸轮廓，未勾选时中性边框，勾选时品牌蓝填充，滑块滑动平滑
  - 主题分段选择（`.theme-segmented`）重构为微型 Pivot，选中项高亮浮起
  - 文本输入框（`.settings-text-input`）重构为 Fluent 风格：浅灰底色、聚焦时底部出现 2px 品牌蓝强调线
- **Acceptance Criteria**：
  - 各表单项在深浅双主题下均具备清晰的交互状态
  - 键盘 Tab 切换聚焦环准确环绕各控件

---

## Phase 5：测试契约同步与双端全量回归验证

### TASK-010：同步 Go 侧 `internal/theme/theme_test.go` 令牌断言

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-002
- **Description**：在 `internal/theme/theme_test.go` 中更新 `TestTokenValues` 测试用例中对新 Fluent 令牌的字面量断言。
- **Details**：
  - 将暗色断言映射更新为：`--bg: #1f1f1f`、`--border: #383838`、`--accent: #479ef5`、`--selection-bg: rgba(0, 120, 212, 0.45)`、`--code-bg: #282828`、`--heading: #ffffff`
  - 将浅色断言映射更新为：`--bg: #ffffff`、`--border: #e0e0e0`、`--accent: #0078d4`、`--selection-bg: #bfdbfe`、`--code-bg: #f5f5f5`、`--heading: #242424`
- **Acceptance Criteria**：
  - `go test ./internal/theme` 零报错通过

### TASK-011：同步 `frontend/tests/uiContract.test.mjs` UI 契约测试

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001, TASK-003, TASK-010
- **Description**：在 `frontend/tests/uiContract.test.mjs` 中同步更新调色板、按钮顺序与 UI 契约断言。
- **Details**：
  - 更新 raw palette、elevation、radii 与 preview tokens 校验期望值
  - 校验标题栏动作按钮的新顺序：`btn-new` ➔ `btn-open` ➔ `btn-theme` ➔ `btn-save` ➔ `btn-settings`
  - 确认 ARIA 状态、Tab 属性与无障碍选择器全部覆盖
- **Acceptance Criteria**：
  - `node frontend/tests/uiContract.test.mjs` 零失败通过

### TASK-012：执行全量测试套件构建与 Windows 原生交互验收

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001 至 TASK-011
- **Description**：运行前端构建与全量测试套件，并对照验收清单完成 Windows 桌面原生交互手动检查。
- **Completion**：自动化构建与测试通过；Windows 交互核对留待 Windows 主机完成。
- **Details**：
  - 执行 `npm run build` 产出 `dist/`
  - 执行 `npm test`（覆盖 fontCommit、gutter、tocGutter、renderScheduler、uiContract）
  - 执行 `go test ./...` 覆盖全部 Go 模块
  - Windows 原生桌面交互手动核对清单：
    1. 标题栏在 Windows 原生无边框下拖拽顺畅，按钮操作区域互斥正常（不触发窗口拖拽）；
    2. 标题栏最小化/最大化/关闭按钮交互正常（Hover/Pressed/Close 红色）；
    3. 目录侧栏展开态下，鼠标在 160px~420px 范围内拖拽平滑，键盘 Tab 聚焦分割条后使用左右方向键能以 16px 步长微调，折叠按钮能还原至 40px；
    4. 状态栏在未保存态与错误态（如文件打开失败、保存失败）下，文字与指示点清晰可见。
- **Acceptance Criteria**：
  - 构建产物生成正常无警告，所有自动化单元测试与契约测试 100% 通过
  - Windows 原生交互手动核对清单 4 项全部通过

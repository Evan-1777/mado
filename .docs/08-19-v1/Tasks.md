# Tasks：公式渲染、设置页与编辑器自动换行

**关联 Plan**：`Plan.md` —— 公式渲染、设置页与编辑器自动换行 v1.5  
**总计 Task**：12 个

---

## Phase 1：数据模型与后端设置持久化扩展

### TASK-001：扩展 Settings 数据模型与 JSON 读写兼容层

- **Status**：DONE
- **Description**：在 `internal/settings/settings.go` 中扩展 `Settings` 结构体，新增 `WordWrap` 与 `Math` 字段；重构 `internal/settings` 与 `internal/filesys` 中的 JSON 反序列化逻辑为 `map[string]any`，确保字符串与布尔类型字段共存。
- **Details**：
  - `internal/settings/settings.go`：
    - `Settings` 结构体包含：`Theme string`、`WordWrap bool`、`Math bool`
    - 定义默认值常量：`DefaultTheme = "dark"`、`DefaultWordWrap = true`、`DefaultMath = true`
    - `Load()`：反序列化使用 `map[string]any`，分别安全提取 `theme`（string）、`wordWrap`（bool）、`math`（bool），缺失字段回退默认值
    - `Save()`：读取并反序列化现有 `settings.json` 到 `map[string]any`，写入 `theme`、`wordWrap`、`math`，保留 `lastfile` 等既有顶层字段
  - `internal/filesys/filesys.go`：
    - `GetLastFile()` 与 `SetLastFile()` 中的 `store` 类型由 `map[string]string` 调整为 `map[string]any`，提取 `lastfile` 时做类型断言 `store[lastFileKey].(string)`，避免布尔字段导致 JSON 解析失败
- **Acceptance Criteria**：
  - 运行 `export PATH=$HOME/.local/go/bin:$PATH && go vet ./internal/settings ./internal/filesys` 零警告零报错

### TASK-002：补充 settings 与 filesys 兼容性与持久化单元测试

- **Status**：DONE
- **Description**：在 `internal/settings/settings_test.go` 与 `internal/filesys/filesys_test.go` 中补充针对布尔字段（WordWrap, Math）读写、默认值回退及跨包共享 `settings.json` 兼容性的单元测试。
- **Details**：
  - `TestSettingsDefaults`：验证首次加载时 `Theme == "dark"`、`WordWrap == true`、`Math == true`
  - `TestSettingsSaveReload`：保存包含 `WordWrap: false`、`Math: true` 的配置，重新加载后字段值一致
  - `TestSettingsFilesysCoexistence`：写入 `lastfile` 与 `settings` 后，双方读取互不破坏、互不覆盖
- **Acceptance Criteria**：
  - 运行 `export PATH=$HOME/.local/go/bin:$PATH && go test -v ./internal/settings ./internal/filesys` 全部 PASS

### TASK-003：在 App 绑定层扩展设置方法与更新前端类型定义

- **Status**：DONE
- **Description**：在 `app.go` 中新增 `SaveSettings(s settings.Settings)`、`SetWordWrap(wrap bool)`、`SetMath(math bool)` 导出方法，并同步更新 `frontend/wailsjs/` 中的类型与绑定声明。
- **Details**：
  - `app.go`：
    - `startup()`：加载持久化设置，若有错误回退默认值
    - `SaveSettings(s settings.Settings) error`：保存设置，更新 `a.settings`，若 Theme 变化同步更新窗口主题
    - `SetWordWrap(wrap bool) error`：更新 `a.settings.WordWrap` 并持久化
    - `SetMath(enabled bool) error`：更新 `a.settings.Math` 并持久化
  - 同步更新 `frontend/wailsjs/go/models.ts` 与 `frontend/wailsjs/go/main/App.d.ts` / `App.js` 对应方法签名与属性定义
- **Acceptance Criteria**：
  - 运行 `export PATH=$HOME/.local/go/bin:$PATH && go vet ./...` 零报错

---

## Phase 2：后端 Markdown 公式解析与保护

### TASK-004：在 mdrender 中集成 goldmark-mathjax 扩展

- **Status**：DONE
- **Description**：在 `internal/mdrender/mdrender.go` 中引入 `github.com/litao91/goldmark-mathjax` 扩展，支持行内公式 `$...$` 与块级公式 `$$...$$` 解析，保护 LaTeX 语法不受 CommonMark 符号转义破坏。
- **Details**：
  - 在 `goldmark.New` 的 `WithExtensions` 中添加 `mathjax.MathJax`（或配置 Delimiters）
  - 保留原有 `extension.GFM`、`extension.Typographer`、`highlighting`、`parser.WithAutoHeadingID`、`html.WithUnsafe` 以及自定义 `slugIDs` 上下文
  - 确保 `<script>` 标签剥离（`scriptRe`）正常工作，不误伤数学公式中的 `<` 或 `>` 符号
- **Acceptance Criteria**：
  - 运行 `export PATH=$HOME/.local/go/bin:$PATH && go build ./internal/mdrender` 编译通过

### TASK-005：编写 mdrender 数学公式解析单元测试

- **Status**：DONE
- **Description**：在 `internal/mdrender/mdrender_test.go` 中新增数学公式解析与特殊字符保护测试用例。
- **Details**：
  - 测试行内公式：`$E=mc^2$` 输出包含 `class="math inline"` 与 `\(E=mc^2\)`
  - 测试块级公式：`$$\sum_{i=1}^n i$$` 输出包含 `class="math display"` 与 `\[\sum_{i=1}^n i\]`
  - 测试 LaTeX 符号保护：`$x_1 + x_2 * y_3$` 中的 `_` 与 `*` 不被解析为 `<em>` 或 `<strong>`
- **Acceptance Criteria**：
  - 运行 `export PATH=$HOME/.local/go/bin:$PATH && go test -v ./internal/mdrender` 全部 PASS

---

## Phase 3：前端公式渲染引擎与 KaTeX 样式集成

### TASK-006：配置 KaTeX 依赖与前端静态资源构建

- **Status**：DONE
- **Description**：在 `frontend/package.json` 中配置 `katex` 依赖与构建脚本，确保 `npm run build` 时 KaTeX 样式与字体文件正确分发至 `frontend/dist/`。
- **Details**：
  - 确保 `frontend/package.json` 包含 `katex` 生产依赖
  - 更新 `scripts.build`：在打包同时将 `node_modules/katex/dist/fonts` 拷贝至 `dist/fonts`，并生成 `dist/app.css`
  - 确保 esbuild 语法检查参数兼容 KaTeX 资源引用
- **Acceptance Criteria**：
  - 运行 `cd frontend && npm run build` 成功执行且 `dist/fonts` 存在 `.woff2` 字体文件

### TASK-007：构建前端数学公式渲染流水线

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中实现将 HTML 中的数学公式节点转换为 KaTeX 静态 HTML 的渲染流水线。
- **Details**：
  - 引入 `katex`（`import katex from 'katex'`）与 `katex/dist/katex.min.css`
  - 实现 `renderMathInHtml(html: string, mathEnabled: boolean): string`：
    - 若 `mathEnabled` 为 true，提取 DOM 或正则匹配 `.math.inline`（`\(...\)`）与 `.math.display`（`\[...\]`），调用 `katex.renderToString(tex, { displayMode, throwOnError: false })` 转换为安全静态 HTML
    - 若 `mathEnabled` 为 false，将公式内容还原为原始 `$tex$` / `$$tex$$` 纯文本呈现
  - 在 `refreshPreview` 中将 `Render(md)` 的输出经过 `renderMathInHtml` 处理后写入 preview iframe
- **Acceptance Criteria**：
  - 运行 `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 零报错通过

---

## Phase 4：编辑器自动换行能力与设置页 UI 实现

### TASK-008：实现 CodeMirror 动态自动换行隔间

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中通过 `@codemirror/view` 的 `EditorView.lineWrapping` 与 `Compartment` 实现编辑器自动换行动态热切换。
- **Details**：
  - 创建 `wrapCompartment = new Compartment()`
  - 在 CodeMirror 初始化 extensions 中挂载 `wrapCompartment.of(currentWordWrap ? [EditorView.lineWrapping] : [])`
  - 实现 `applyWordWrap(wrap: boolean)`：通过 `cm.dispatch({ effects: wrapCompartment.reconfigure(wrap ? [EditorView.lineWrapping] : []) })` 动态生效
- **Acceptance Criteria**：
  - 运行 `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 零报错通过

### TASK-009：构建 Win11 Fluent 风格设置页模态 UI

- **Status**：DONE
- **Description**：在 `frontend/index.html` 与 `frontend/src/style.css` 中构建原生 `<dialog id="settings-dialog">` 设置模态框，包含 Win11 风格的开关组件（Toggle Switch）、分组卡片与无边框设计。
- **Details**：
  - `frontend/index.html`：
    - 添加 `<dialog id="settings-dialog">`
    - 包含设置页标题、关闭按钮（`✕`）
    - 设置分组：
      1. 编辑器设置：自动换行（Toggle Switch: `setting-word-wrap`）
      2. 渲染设置：公式渲染（Toggle Switch: `setting-math`）
      3. 外观设置：主题偏好（Toggle Switch 或 Select: `setting-theme`）
  - `frontend/src/style.css`：
    - 实现 Win11 风格 Toggle Switch（iOS/Win11 胶囊滑动开关，支持 active/focus/hover 动效）
    - 支持深色与浅色主题下的背景、文字、边框与投影令牌自适应
    - 支持 Esc 键关闭与 Backdrop 点击平滑过渡
- **Acceptance Criteria**：
  - 样式语法合规，CSS 无未定义变量，HTML 结构自闭合且符合无障碍规范

### TASK-010：实现设置页事件交互、快捷键绑定与持久化联动

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中实现设置页的打开/关闭、状态同步、控件事件监听、`Ctrl+,` 快捷键响应及与 Go 侧的设置持久化联动。
- **Details**：
  - 在标题栏操作区新增设置按钮（`btn-settings`，内联齿轮 SVG 图标）
  - 注册 `Ctrl+,` 快捷键与标题栏按钮点击事件，呼出设置模态框
  - 打开设置页时，将当前内存状态（`currentTheme`, `currentWordWrap`, `currentMath`）同步到 UI 控件
  - 监听开关变更：
    - 换行切换：调用 `applyWordWrap` 并触发 `SaveSettings`
    - 公式切换：更新 `currentMath`，触发 `refreshPreview` 并调用 `SaveSettings`
    - 主题切换：调用 `applyTheme` 并调用 `SaveSettings`
  - 在应用启动 `init()` 时加载 `GetSettings()`，初始化主题、换行与公式渲染状态
- **Acceptance Criteria**：
  - 运行 `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 零报错通过

---

## Phase 5：全链路验证与交付准备

### TASK-011：执行前端零产物检查与生产构建打包验证

- **Status**：DONE
- **Description**：验证前端所有模块编译正确性，产出完整的 `dist/` 构建物供 Go embed 使用。
- **Details**：
  - 运行零产物语法检查：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`
  - 运行完整打包：`npm run build`，检查 `dist/app.js`、`dist/app.css`、`dist/index.html` 与 `dist/fonts/`
- **Acceptance Criteria**：
  - 零产物语法检查 stdout 为空且退出码为 0
  - `npm run build` 成功退出，`dist/index.html` 与 `dist/app.js` 均存在且大于 0 字节

### TASK-012：执行全量 Go 单元测试与代码规约检查

- **Status**：DONE
- **Description**：运行全量 Go 静态检查与单元测试套件，确保所有 internal 模块及主程序通过验证。
- **Details**：
  - 运行 `go vet ./...`
  - 运行 `go test ./...` 覆盖 `filesys`、`mdrender`、`settings`、`theme` 全部包
- **Acceptance Criteria**：
  - `go vet ./...` 零输出零报错
  - `go test ./...` 输出全部包为 `ok`

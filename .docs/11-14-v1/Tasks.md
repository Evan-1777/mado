# Tasks：宿主框架迁移至 MyGo 与前端 Material Design 3 重构

**关联 Plan**：`Plan.md` —— 宿主框架迁移至 MyGo 与前端 Material Design 3 重构 v1.1  
**总计 Task**：14 个  
**状态**：DONE（14/14）  
**完成日期**：2026-11-14  
**回归测试结论**：全部本机静态检查、单测、竞态测试与三项无头浏览器检查退出码均为 0；`mygo generate` 无差异；无 wails 残留；详细结论见 `Plan.md` 头部回填

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 16px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e8ec;">任务依赖拓扑与阶段分布（共 14 项，全部由主线顺序交付）</div>
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 12px; line-height: 1.5;">
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 1 · 宿主与契约</div>
      <div>TASK-001 ──▶ TASK-002 ──▶ TASK-003 ──▶ TASK-004</div>
    </div>
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 2 · MD3 令牌与样式</div>
      <div>TASK-005 ──▶ TASK-006</div>
    </div>
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 3 · 模块化前端</div>
      <div>TASK-007 ──▶ TASK-008 ──▶ TASK-009 ──▶ TASK-010 ──▶ TASK-011</div>
    </div>
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 4 · 测试、CI 与文档</div>
      <div>TASK-012 ──▶ TASK-013 ──▶ TASK-014</div>
    </div>
  </div>
</div>

---

## Phase 1：宿主框架迁移与后端契约重构

### TASK-001：切换 Go 模块依赖至 MyGo、创建 `mygo.json` 并清理 Wails 构建残留文件

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：无
- **Executor**：主线
- **Description**：在 `go.mod` 中移除 `github.com/wailsapp/wails/v2` 及关联间接依赖，声明 `go 1.27.3` 并引入 `github.com/egoist/mygo v0.7.4`；在根目录新增 `mygo.json`，删除 `wails.json`、`build/windows/installer/project.nsi` 与 `frontend/package.json.md5`，并同步清理 `.gitignore` 中的悬空规则。
- **Details**：
  - `go.mod` 保持 `github.com/yuin/goldmark v1.8.5`、`github.com/alecthomas/chroma/v2 v2.14.0` 与 `github.com/yuin/goldmark-highlighting/v2 v2.0.0-20230729083705-37449abec8cc` 锁定版本不变，仅将桌面宿主框架切换为 `github.com/egoist/mygo v0.7.4`。
  - 在根目录创建 `mygo.json`，精确声明以下字段：
    - `name`: `"Mado"`，`slug`: `"mado"`，`identifier`: `"io.github.mado.editor"`，`version`: `"0.1.0"`，`publisher`: `"Mado"`
    - `main`: `"."`，`out`: `"dist"`，`bindings`: `"frontend/src/mygo.ts"`
    - `frontendDist`: `"frontend/dist"`，`buildCommand`: `"npm --prefix frontend run build"`
    - `fileAssociations`: `[{ "ext": ["md", "markdown", "mdown"], "name": "Markdown Document", "mimeType": "text/markdown", "role": "Editor" }]`
  - 删除版本库跟踪的 Wails 遗留文件：`wails.json`、`build/windows/installer/project.nsi`、`frontend/package.json.md5`。
  - 清理 `.gitignore`：删除已失效的 `build/bin/`、`build/windows/*`、`!build/windows/installer/`、`build/windows/installer/*`、`!build/windows/installer/project.nsi` 规则，保留 `dist/`、`frontend/dist/`（补充确保前端构建产物被忽略）、`node_modules/`、`frontend/node_modules/`、`*.exe` 等有效忽略项。
- **Acceptance Criteria**：
  - `wails.json`、`build/windows/installer/project.nsi` 与 `frontend/package.json.md5` 已不存在
  - `.gitignore` 不含 `project.nsi` 或 `build/windows` 悬空例外规则，且包含 `dist/` 与 `frontend/dist/`
  - `go.mod` 不包含任何 `wailsapp` 字符串，且包含 `github.com/egoist/mygo v0.7.4`
  - `mygo.json` 为合法 JSON 且包含 `identifier`、`bindings`、`frontendDist`、`buildCommand` 与 `fileAssociations`

### TASK-002：重构 `app.go` 为纯 Go MyGo 绑定服务（保持平台剪贴板桩文件零改动）

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001
- **Executor**：主线
- **Description**：移除 `app.go` 中的 `wails/v2/pkg/runtime` 依赖，替换为 `github.com/egoist/mygo` 原生窗口控制、主题源同步与文件对话框接口，保持 `app_windows.go` 与 `app_other.go` 原样不动，确保全部业务契约与离线单测隔离性。
- **Details**：
  - `App` 结构体字段调整：移除 `ctx context.Context`，新增 `win *mygo.Window`；将 `saveFileDialog` 测试注入字段签名改为无框架耦合的 `func(defaultFilename string) (string, error)`（保持 `saveSettings` 与 `setLastFile` 注入字段不变）。
  - 新增窗口揭示导出方法 `ShowWindow()`：加读锁读取 `win := a.win`，当 `win != nil` 时调用 `win.Show()`（不添加无消费方的额外尺寸查询方法）。
  - 保留并适配全部既有导出方法签名与语义：
    - `LoadFile(path string) (string, error)`、`SaveFile(path, content string) error`、`Render(md string) (string, error)`、`GetCSS() (string, error)`、`GetThemeCSS(themeName string) (string, error)`、`GetSettings() (settings.Settings, error)`
    - `SetTheme(themeName string) error`：持久化成功后，仅当 `a.win != nil`（应用事件循环已就绪）时调用 `mygo.Theme.SetSource(mygo.ThemeLight)` 或 `mygo.Theme.SetSource(mygo.ThemeDark)`，以同步更新 Windows 原生文件对话框、DWM 边框、`light-dark()` 窗口底色及 WebView2 `prefers-color-scheme`，且避免在离线单测 goroutine 中触发主线程等待
    - `SetWrap(wrap bool) error`、`SetMath(math bool) error`、`SetPreviewFont(font string) error`、`SetWindowSize(width, height int) error`、`SetWindowMaximized(maximized bool) error`
    - `SetClipboard(text string) error`：保持直接委托 `setNativeClipboard(text)`，`app_windows.go`（纯 Go `syscall` Win32 剪贴板历史写入）与 `app_other.go`（8 行空操作桩）均不做任何修改
    - `SetTitle(title string)`：当 `a.win != nil` 时调用 `a.win.SetTitle("Mado — " + title)`
    - `SetStartupFile(path string)`、`GetStartupFile() string`、`SetDirty(dirty bool)`
    - `ForceQuit()`：加锁置 `a.quitting = true`，当 `a.win != nil` 时调用 `mygo.App.Quit()`
    - `OpenFileDialog() string`：当 `a.win == nil` 时返回 `""`；否则调用 `mygo.Dialog.Open(mygo.OpenDialogOptions{ Parent: a.win, Title: "Open Markdown file", Filters: []mygo.FileFilter{{Name: "Markdown", Extensions: []string{"md", "markdown", "mdown", "txt"}}, {Name: "All files", Extensions: []string{"*"}}} })`，取首个路径返回（取消或空切片返回 `""`）
    - `SaveFileDialog() string`：当 `a.win == nil` 时返回 `""`；否则调用 `mygo.Dialog.Save(mygo.SaveDialogOptions{ Parent: a.win, Title: "Save Markdown file", DefaultPath: "untitled.md", Filters: []mygo.FileFilter{{Name: "Markdown", Extensions: []string{"md", "markdown", "mdown", "txt"}}} })`
    - `SaveHtmlFileDialog(defaultFilename string) (string, error)`：空文件名默认设为 `"untitled.html"`；若 `a.saveFileDialog != nil` 则调用注入函数，若 `a.win == nil` 则返回 `("", nil)`，否则调用 `mygo.Dialog.Save`（过滤器 `Extensions: []string{"html", "htm"}`）
    - `SaveHtmlFile(path, content string) error`：保持空路径校验与 `filesys.WriteFile` 原子写入不变
  - 将 `startup(ctx context.Context)` 重写为无参 `initState()`（执行 `migrateLegacyStore` 并加载 `settings.Load()`），只读不创建任何用户配置目录。
- **Acceptance Criteria**：
  - `app.go`、`app_other.go`、`app_windows.go` 中均不含 `import "C"` 与 `wailsapp` 引用，且 `git diff app_windows.go app_other.go` 为空
  - 离线调用 `NewApp().initState()`、`SetTheme`、`SetClipboard`、`SaveHtmlFileDialog` 等方法不会阻塞或 panic

### TASK-003：重写 `main.go` 为 MyGo 应用生命周期、隐藏标题栏窗口与类型化事件入口

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-002
- **Executor**：主线
- **Description**：重写 `main.go`，声明类型化事件 `request-close` 与 `open-file`，绑定 `App` 服务，配置隐藏启动与隐藏系统标题栏的 MyGo 主窗口，并接入命令行参数、系统文件关联与关闭拦截钩子。
- **Details**：
  - 包级声明两个类型化事件：
    - `var requestCloseEvent = mygo.NewEvent[struct{}]("request-close")`
    - `var openFileEvent = mygo.NewEvent[string]("open-file")`
  - 在 `main()` 中，`mygo.App.Run()` 之前执行：
    1. 创建 `app := NewApp()` 并调用 `app.initState()` 读取持久化 `settings.Settings`
    2. 保持与原实现完全一致的命令行参数处理：`if len(os.Args) > 1 && os.Args[1] != ""` 时调用 `app.SetStartupFile(os.Args[1])`（不添加额外前缀特判分支）
    3. 注册 `mygo.App.OnOpenFile(func(path string))`：若窗口尚未创建则调用 `app.SetStartupFile(path)`，若窗口已存在则调用 `_ = openFileEvent.Emit(win, path)` 交由前端走未保存确认并打开文档
    4. 根据持久化主题预设 `mygo.Theme.SetSource`（`"light"` 对应 `mygo.ThemeLight`，默认 `"dark"` 对应 `mygo.ThemeDark`）
    5. 调用 `mygo.App.SetName("Mado")` 与 `mygo.Bind(app)`
    6. 注册 `mygo.App.OnWindowAllClosed(func() { mygo.App.Quit() })`
  - 在 `mygo.App.WhenReady` 回调中创建主窗口：
    - `BackgroundColor` 使用 MyGo 原生双色语法 `"light-dark(#eeedf4, #1e1f25)"`，自动随 `Theme.SetSource` 同步浅色/深色 MD3 框架基底色
    - `mygo.WindowOptions` 配置：`Title: "Mado"`，`URL: "/"`，`Width: s.WindowWidth`，`Height: s.WindowHeight`，`MinWidth: settings.MinWindowWidth`，`MinHeight: settings.MinWindowHeight`，`Maximized: s.WindowMaximized`，`Hidden: true`，`TitleBarStyle: mygo.TitleBarHidden`，`HideWindowButtons: true`，`BackgroundColor: "light-dark(#eeedf4, #1e1f25)"`
    - 将创建的 `*mygo.Window` 赋给 `app.setWindow(win)`（加锁赋值）
    - 注册 `win.OnClose(func(e *mygo.CloseEvent))`：若 `app.shouldPreventClose()` 返回 `true`，调用 `e.PreventDefault()` 并调用 `_ = requestCloseEvent.Emit(win, struct{}{})`
  - 不在 `main.go` 中手写 `//go:embed all:frontend/dist`（由 `mygo build` 编译覆盖层自动生成 `mygo_frontend_gen.go` 并调用 `mygo.SetFrontend`，消除静态资源双份嵌入）。
- **Acceptance Criteria**：
  - `CGO_ENABLED=0 go build .` 编译通过且无警告
  - `main.go` 不含任何 Wails 导入与重复 `embed.FS` 声明，且包含 `light-dark(#eeedf4, #1e1f25)` 与 `Hidden: true`

### TASK-004：更新 `main_test.go`、补齐前端 TypeScript 类型检查配置与 `mygo-runtime` 依赖并生成 `frontend/src/mygo.ts`

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-003
- **Executor**：主线
- **Description**：移除 `main_test.go` 中的 Wails runtime 引用并对齐新注入签名；在 `frontend/package.json` 中新增 `mygo-runtime@0.7.4` 与 `typescript@5.8.3` 并同步锁文件，新增 `frontend/tsconfig.json`，执行 `go mod tidy` 与 `mygo generate` 产出 `frontend/src/mygo.ts`。
- **Details**：
  - 更新 `main_test.go`：
    - 删除 `"github.com/wailsapp/wails/v2/pkg/runtime"` 导入
    - `TestStartupCreatesNoWelcomeDoc` 改为调用 `NewApp().initState()`
    - `TestSaveHtmlFileDialog` 中 `saveFileDialog` 注入函数签名更新为 `func(defaultFilename string) (string, error)`
    - 保持全部测试函数（`TestStartupCreatesNoWelcomeDoc`、`TestMigrateLegacyStore`、`TestLastFileFailureIsBestEffort`、`TestPersistFailureKeepsState`、`TestWindowAndClipboardBindings`、`TestConcurrentBindingsNoRace`、`TestSaveHtmlFile`、`TestGetThemeCSS`、`TestSaveHtmlFileDialog`）断言完整不删减
  - 更新 `frontend/package.json`：
    - 保持既有 8 项生产依赖（`@codemirror/commands`、`@codemirror/lang-markdown`、`@codemirror/language`、`@codemirror/state`、`@codemirror/theme-one-dark`、`@codemirror/view`、`@lezer/highlight`、`katex`）与开发依赖（`esbuild`）原有版本声明不变
    - 在 `dependencies` 中新增 `"mygo-runtime": "0.7.4"`，在 `devDependencies` 中新增 `"typescript": "5.8.3"`
    - 在 `scripts` 中保留 `copy-assets`、`build`、`dev`、`test` 不变，新增 `"typecheck": "tsc --noEmit"`
  - 新增 `frontend/tsconfig.json`：
    - 配置 `"compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "lib": ["ES2022", "DOM", "DOM.Iterable"], "strict": true, "noEmit": true, "allowImportingTsExtensions": true, "skipLibCheck": true }`，`"include": ["src/**/*.ts", "tests/**/*.ts"]`（`allowImportingTsExtensions` 兼容既有测试中 `.ts` 后缀导入）。
  - 在 `frontend/` 下执行 `npm install --include=dev`，同步更新 `frontend/package-lock.json`（保障云端 CI `npm ci` 严格一致性）。
  - 在根目录执行 `CGO_ENABLED=0 go mod tidy`，随后执行 `CGO_ENABLED=0 go run github.com/egoist/mygo/cmd/mygo@v0.7.4 generate` 生成 `frontend/src/mygo.ts`。
- **Acceptance Criteria**：
  - `CGO_ENABLED=0 go vet ./...` 退出码为 0
  - `CGO_ENABLED=0 go test ./...` 与 `CGO_ENABLED=0 go test -race ./...` 全部 5 个包通过
  - `frontend/tsconfig.json` 已创建，`frontend/package-lock.json` 已同步包含 `mygo-runtime` 与 `typescript`，`./frontend/node_modules/.bin/tsc --version` 可正常输出 `Version 5.8.3`
  - `frontend/src/mygo.ts` 成功生成，包含 `export const App`（含 `showWindow` 等全部绑定方法）与 `export const events`（含 `requestClose` 与 `openFile`）

---

## Phase 2：Material Design 3 令牌体系与预览主题重塑

### TASK-005：重塑 `internal/theme/assets/theme/` 预览深浅色令牌与基础排版样式表为 MD3 规范

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-004
- **Executor**：主线
- **Description**：将后端内嵌的 `tokens-dark.css`、`tokens-light.css` 与 `base.css` 替换为与外壳一致的 Material Design 3 色彩角色、圆角与排版规范，保持预览与独立 HTML 导出的全部契约钩子。
- **Details**：
  - `internal/theme/assets/theme/tokens-dark.css`（保留首行 `/* mado theme tokens: dark */` 注释标识）：
    - `--bg: #121318;`（对齐 MD3 Dark `surface`）、`--fg: #e3e2e9;`（`on-surface`）、`--muted: #c5c6d0;`（`on-surface-variant`）、`--border: #44464f;`（`outline-variant`）、`--accent: #b4c5ff;`（`primary`）、`--accent-soft: rgba(180, 197, 255, 0.16);`、`--selection-bg: rgba(180, 197, 255, 0.32);`、`--code-bg: #1a1b20;`（`surface-container-low`）、`--quote-bg: #1a1b20;`、`--quote-border: #8f909a;`（`outline`）、`--table-head: #1e1f25;`（`surface-container`）、`--table-stripe: #16171d;`、`--link: #b4c5ff;`、`--heading: #e3e2e9;`
  - `internal/theme/assets/theme/tokens-light.css`（保留首行 `/* mado theme tokens: light */` 注释标识）：
    - `--bg: #ffffff;`（对齐 MD3 Light `surface-container-lowest`）、`--fg: #1a1b20;`（`on-surface`）、`--muted: #44464f;`（`on-surface-variant`）、`--border: #c5c6d0;`（`outline-variant`）、`--accent: #4b5c92;`（`primary`）、`--accent-soft: #dbe1ff;`（`primary-container`）、`--selection-bg: #dbe1ff;`、`--code-bg: #f4f3fa;`（`surface-container-low`）、`--quote-bg: #f4f3fa;`、`--quote-border: #757780;`（`outline`）、`--table-head: #eeedf4;`（`surface-container`）、`--table-stripe: #faf8ff;`（`surface`）、`--link: #4b5c92;`、`--heading: #1a1b20;`
  - `internal/theme/assets/theme/base.css`：
    - 更新圆角与间距为 MD3 尺度：`pre` 使用 `12px` 圆角（`medium`），行内 `code` 使用 `6px` 圆角，引用块使用 `0 12px 12px 0` 圆角与 `3px solid var(--quote-border)` 左边线，表格外框圆角 `12px`
    - 完整保留 `::-webkit-scrollbar`、`::selection { background: var(--selection-bg); }`、`body.md-gutter` 左缘源行号悬停浮现（`[data-line]::before`）、`.md-line` 定位以及 `.copy-code-btn` 全圆角胶囊造型（`28px`、`border-radius: 9999px`）、默认 `opacity: 0`、`:hover`/`:focus-within` `opacity: 1`、`.copy-icon`/`.copied-icon` 切换与 `.copied { border-color: var(--accent); color: var(--accent); }` 规则
    - 不引入 `@media print`（打印分页样式仍由 `htmlExporter.ts` 独立注入）。
- **Acceptance Criteria**：
  - `CGO_ENABLED=0 go test ./internal/theme/...` 与 `CGO_ENABLED=0 go test ./...` 全部通过
  - `node frontend/tests/htmlExporter.test.ts` 通过

### TASK-006：新建 `frontend/src/tokens.css` 并重写 `frontend/src/style.css` 实现完整 MD3 设计系统

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-005
- **Executor**：主线
- **Description**：新增 `frontend/src/tokens.css` 定义完整的 MD3 色彩、字阶、圆角、缓动与状态层自定义属性；重写 `frontend/src/style.css`，构建基于 MD3 色调表面（Tonal Surface）的单层紧凑顶栏、全圆角分段按钮、胶囊导航抽屉、双圆角卡片画布与 28px 超大圆角模态框样式。
- **Details**：
  - `frontend/src/tokens.css`：
    - 定义 `:root` 共享几何、字阶、形状与动效令牌：
      - `--md-sys-shape-corner-none: 0px`、`--md-sys-shape-corner-extra-small: 4px`、`--md-sys-shape-corner-small: 8px`、`--md-sys-shape-corner-medium: 12px`、`--md-sys-shape-corner-large: 16px`、`--md-sys-shape-corner-extra-large: 28px`、`--md-sys-shape-corner-full: 9999px`
      - `--md-sys-typescale-headline-small-*`（24px/32px/400）、`title-medium-*`（16px/24px/500）、`title-small-*`（14px/20px/500）、`body-large-*`（16px/24px/400）、`body-medium-*`（14px/20px/400）、`body-small-*`（12px/16px/400）、`label-large-*`（14px/20px/500）、`label-medium-*`（12px/16px/500）、`label-small-*`（11px/16px/500）
      - `--md-sys-motion-easing-emphasized: cubic-bezier(0.2, 0, 0, 1)`、`emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1)`、`emphasized-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15)`、`standard: cubic-bezier(0.2, 0, 0, 1)` 及 `duration-short2: 100ms`、`short4: 200ms`、`medium2: 300ms`
      - 目录宽度边界常量：`--toc-w: 256px;`、`--toc-w-min: 160px;`、`--toc-w-max: 420px;`
      - 字体栈：`--font-sans`（系统 UI 无衬线栈）与 `--font-mono`（`'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace`）
    - 定义 `:root, :root[data-theme="dark"]` 与 `:root[data-theme="light"]` 两套完整 MD3 色彩角色（`primary`、`on-primary`、`primary-container`、`on-primary-container`、`secondary`、`on-secondary`、`secondary-container`、`on-secondary-container`、`tertiary`、`on-tertiary`、`tertiary-container`、`on-tertiary-container`、`error`、`on-error`、`error-container`、`on-error-container`、`surface`、`surface-dim`、`surface-bright`、`surface-container-lowest`、`surface-container-low`、`surface-container`、`surface-container-high`、`surface-container-highest`、`on-surface`、`on-surface-variant`、`outline`、`outline-variant`、`inverse-surface`、`inverse-on-surface`、`inverse-primary`、`scrim`）以及编辑器专用语义令牌 `--pane-bg`（暗色 `#121318`，亮色 `#ffffff`）、`--editor-active-line`（半透明色阶，暗色 `rgba(227, 226, 233, 0.05)`，亮色 `rgba(26, 27, 32, 0.04)`）、`--selection-bg`（暗色 `rgba(180, 197, 255, 0.32)`，亮色 `#dbe1ff`）与 `--focus-ring: var(--md-sys-color-primary)`。
  - `frontend/src/style.css`（首行 `@import './tokens.css';`）：
    - 不包含 Fluent 令牌、亚克力 `backdrop-filter: blur` 或旧版 `.resize-handle` 样式
    - **Layer 0 外壳基底**：`#app` 采用 `background: var(--md-sys-color-surface-container)` 纵向弹性布局；非最大化时主工作区内边距 `0 8px 8px`，最大化（`#app.maximised`）时缩减外围边距适配全屏
    - **Layer 2 单层 MD3 Top App Bar（`.top-app-bar`，高 `48px`，`--app-region: drag`）**：
      - 左区（`.app-bar-leading`）：目录开关圆形图标按钮（`#toc-collapse`，`--app-region: no-drag`）、文档标题（`#title`）与状态胶囊徽标（`.status`，含 `.stealth` 静默态、`.unsaved` 使用 `tertiary-container`/`on-tertiary-container` 胶囊态、`.error` 使用 `error-container`/`on-error-container` 胶囊态）
      - 中区（`.app-bar-center`，`--app-region: no-drag`）：MD3 全圆角分段按钮组（`.seg`，高 `32px`，`border: 1px solid var(--md-sys-color-outline)`，`border-radius: var(--md-sys-shape-corner-full)`；选中项 `.active` 使用 `secondary-container` 底色与 `on-secondary-container` 文本及勾选前导指示）
      - 右区（`.app-bar-trailing`，`--app-region: no-drag`）：标准 `36px` 全圆角图标按钮簇（`.icon-btn`：`#btn-new`、`#btn-open`、`#btn-theme`、`#btn-save`、`#btn-export`、`#btn-settings`，悬停/按压采用 `color-mix` 8%/12% MD3 状态层）、垂直细分隔线与窗口控制按钮（`.win-btn`：`.win-min`、`.win-max`、`.win-close`，其中 `.win-close:hover` 采用 `error`/`on-error`）
    - **Layer 1 & 2 主工作区（`.pane`）**：
      - 目录侧边抽屉（`.toc-sidebar`）：背景 `var(--md-sys-color-surface-container-low)`，圆角 `var(--md-sys-shape-corner-large)`（`16px`），折叠态 `.collapsed` 隐藏抽屉与紧邻 `.toc-splitter`；目录项 `.toc-row` 采用 `36px` 高全圆角胶囊悬停/激活层，含 `.toc-toggle` 折叠钮、`.toc-link` 文本与 `.toc-badge` 色调标签；分隔手柄 `.toc-splitter` 宽 `8px` 居中内嵌 `4px x 32px` MD3 拖拽胶囊指示条
      - 编辑面板（`.editor-col`）与预览面板（`.preview-col`）：均采用 `background: var(--pane-bg)` 与 `border-radius: var(--md-sys-shape-corner-large)`（`16px`）独立卡片面，`overflow: hidden`；`.preview-col` 保持 `position: relative`，空状态 `.placeholder` 保持 `position: absolute` 居中覆盖层，确保 `iframe.preview-frame` 永不卸载
      - 分栏模式（`.pane` 无 `editor-only`/`preview-only` 类时）：`.editor-col` 与 `.preview-col` 等比并排，中间由 `8px` `gap` 露出底层 `surface-container` 色阶
    - **CodeMirror 6 MD3 覆盖契约**：保留 `:root[data-theme] .cm-editor { background: var(--pane-bg); }`、`font-family: var(--font-mono)`、`.cm-activeLine { background: var(--editor-active-line); }`、`:root[data-theme] .cm-editor.cm-focused .cm-selectionLayer .cm-selectionBackground { background: var(--selection-bg); }` 高优先级选区可见性及行号居中样式
    - **Layer 3 MD3 对话框（`#close-dialog`、`#settings-dialog`、`#export-dialog`）**：
      - `margin: auto`、`border: none`、`border-radius: var(--md-sys-shape-corner-extra-large)`（`28px`）、`background: var(--md-sys-color-surface-container-high)`、`color: var(--md-sys-color-on-surface)`、`::backdrop { background: var(--md-sys-color-scrim); }`
      - 实现标准 MD3 Switch 开关样式（`52px x 32px` 全圆角轨道，选中态 `primary` 轨道配 `on-primary` `24px` 滑块，未选中态 `surface-container-highest` 配 `outline` 描边与 `16px` 滑块）、MD3 Outlined Text Field（`#set-preview-font`）、对话框内 MD3 分段按钮（`.theme-segmented`、`.export-segmented`）以及底部右对齐的 MD3 Text Button 与 Filled Button（`height: 40px`，`border-radius: 9999px`）
    - **全局无障碍焦点环**：统一使用 `:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }` 覆盖全部交互控件。
- **Acceptance Criteria**：
  - `frontend/src/tokens.css` 与 `frontend/src/style.css` 无语法错误，通过 `esbuild` CSS 打包校验
  - 样式表中不存在 `#0078d4`、`--fluent-`、`backdrop-filter` 或 `.resize-handle`

---

## Phase 3：前端模块化重构与全功能装配

### TASK-007：创建双环境运行时桥接模块 `frontend/src/bridge.ts` 与 MD3 图标模块 `frontend/src/icons.ts`

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-004, TASK-006
- **Executor**：主线
- **Description**：新建 `frontend/src/bridge.ts` 统一封装 `mygo-runtime` 与 `frontend/src/mygo.ts` 调用，支持桌面宿主与常规/无头浏览器双环境运行；新建 `frontend/src/icons.ts` 收敛全部 Material Design 3 风格矢量图标。
- **Details**：
  - `frontend/src/bridge.ts`：
    - 导入 `isMyGo`, `currentWindow`, `onFileDrop`（来自 `mygo-runtime`）及 `App`, `events`, `type Settings`（来自 `./mygo`）
    - 导出 `type Settings` 及统一宿主接口对象 `host`：
      - 当 `isMyGo()` 为 `true` 时：业务方法委托给 `App.*`（`loadFile`、`saveFile`、`render`、`getCSS`、`getThemeCSS`、`getSettings`、`setTheme`、`setWrap`、`setMath`、`setPreviewFont`、`setWindowSize`、`setWindowMaximized`、`showWindow`、`setClipboard`、`getStartupFile`、`setDirty`、`forceQuit`、`openFileDialog`、`saveFileDialog`、`saveHtmlFileDialog`、`saveHtmlFile`）；窗口控制委托给 `currentWindow.minimize()`、`currentWindow.maximize()`、`currentWindow.unmaximize()`、`currentWindow.isMaximized()`、`currentWindow.setTitle(title)`；事件订阅委托给 `onFileDrop`、`events.requestClose.on`、`events.openFile.on`
      - 当 `isMyGo()` 为 `false`（在普通浏览器直接预览静态页）时：提供安全内存默认回退（默认深色设置、空启动文件、基础 HTML 转义回退渲染、无操作窗口控制与 `navigator.clipboard.writeText` 回退），保证不因缺少 `window.mygo` 抛出未捕获异常中断初始化
  - `frontend/src/icons.ts`：
    - 提供统一 20px/24px Material Symbols Outlined 光学网格 SVG 常量：侧栏展开/收起（`ICON_DRAWER_OPEN` / `ICON_DRAWER_CLOSE`）、新建（`ICON_NEW`）、打开（`ICON_OPEN`）、主题切换（`ICON_THEME`）、保存（`ICON_SAVE`）、导出（`ICON_EXPORT`）、设置（`ICON_SETTINGS`）、分段按钮选中勾号（`ICON_CHECK`）、目录节点折叠箭头（`ICON_EXPAND_MORE` / `ICON_CHEVRON_RIGHT`）、对话框关闭（`ICON_CLOSE`）及窗口最小化/最大化/还原/关闭图标。
- **Acceptance Criteria**：
  - `frontend/src/bridge.ts` 与 `frontend/src/icons.ts` 通过 `cd frontend && npm run typecheck` 检查
  - 业务模块无需直接导入 `wailsjs` 或散落判断 `isMyGo()`

### TASK-008：重构 `frontend/index.html` 与 `frontend/src/dom.ts` 构建 MD3 页面骨架与三座模态框

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-007
- **Executor**：主线
- **Description**：重写 `frontend/index.html` 中的三座原生 `<dialog>` 为标准 MD3 对话框语义结构；新建 `frontend/src/dom.ts` 声明式构建单层 MD3 顶栏、可调宽目录抽屉与双栏工作区，并导出强类型 DOM 引用集合。
- **Details**：
  - `frontend/index.html`：
    - 保持 `<html lang="zh-CN" data-theme="dark">`、`<link rel="stylesheet" href="./app.css" />`、`<div id="app"></div>` 与末尾同步脚本 `<script src="./app.js"></script>`
    - 重构三座原生 `<dialog>` 为统一 MD3 对话框结构（复用统一 `.md3-dialog`、`.md3-dialog-header`、`.md3-dialog-body`、`.md3-dialog-actions` 组件类名）：
      1. `#close-dialog`（`aria-labelledby="close-dialog-title"`）：标题“未保存的更改”，正文说明，底部 `form[method="dialog"]` 含 `button[value="cancel"]`（取消）、`button[value="no"]`（不保存）、`button[value="yes"]`（保存，实心主按钮）
      2. `#settings-dialog`（`aria-labelledby="settings-dialog-title"`）：含关闭图标按钮 `.settings-close-btn`、外观主题 MD3 分段按钮 `.theme-segmented`（`#set-theme-dark`、`#set-theme-light`，带 `aria-pressed`）、编辑器自动换行 MD3 Switch（`input#set-wrap`）、LaTeX 公式渲染 MD3 Switch（`input#set-math`）、预览字体 MD3 Outlined Text Field（`input#set-preview-font`，`maxlength="100"`）及底部完成按钮
      3. `#export-dialog`（`aria-labelledby="export-dialog-title"`）：`form.export-form[method="dialog"]`，含关闭图标按钮 `.export-close-btn`、导出主题 MD3 分段按钮 `#export-theme-seg`（`data-theme="light"` 默认选中 `aria-pressed="true"`，`data-theme="current"` `aria-pressed="false"`）、页面边距 MD3 分段按钮 `#export-margin-seg`（`data-margin="std"` 20mm、`data-margin="compact"` 10mm、`data-margin="wide"` 30mm），底部 `button[value="cancel"]`（取消）与 `button[value="export"]`（导出，实心主按钮）
  - `frontend/src/dom.ts`：
    - 构建 `header.top-app-bar`：
      - 左区：`button#toc-collapse`（`aria-label="展开侧栏"`，`aria-expanded="false"`，`aria-controls="toc-tree"`）、`span#title`（初始文本 `Mado`）、状态胶囊 `.status.stealth`（含 `.dot` 与 `span#status-text` 初始文本 `就绪`）
      - 中区：`.seg[role="tablist"]`，严格按序渲染三个模式分段按钮：`button#tab-editor[data-mode="editor"][role="tab"][aria-selected="true"]`（编辑）、`button#tab-preview[data-mode="preview"][role="tab"][aria-selected="false"]`（预览）、`button#tab-split[data-mode="split"][role="tab"][aria-selected="false"]`（分栏）
      - 右区：按序渲染 6 个操作按钮 `#btn-new`、`#btn-open`、`#btn-theme`、`#btn-save`、`#btn-export`、`#btn-settings`（均带中文 `title` 与 `aria-label`），以及窗口控制簇 `.win-controls`（`.win-min`、`.win-max`、`.win-close`）
    - 构建 `main.pane.editor-only`：
      - `aside#toc-sidebar.toc-sidebar.collapsed[aria-label="文档目录"]`（含头部标题“目录”与 `button#toc-toggle-all`“全部收起”、`nav#toc-tree.toc-tree`、`div#toc-empty.toc-empty`“当前文档暂无标题”）
      - 紧邻兄弟节点 `div#toc-splitter.toc-splitter[role="separator"][aria-label="调整目录宽度"][aria-orientation="vertical"][aria-valuemin="160"][aria-valuemax="420"][aria-valuenow="256"][aria-valuetext="256 像素"][tabindex="0"]`
      - `section#editor-col.editor-col[role="tabpanel"][aria-labelledby="tab-editor"]`（内含 `div#editor-host.editor-wrap`）
      - `section#preview-col.preview-col[role="tabpanel"][aria-labelledby="tab-preview"]`（内含 `iframe#preview.preview-frame[sandbox="allow-same-origin"][title="预览"]` 与 `div#preview-empty.placeholder[hidden]`“暂无预览内容”）
    - 导出 `mountAppShell(root: HTMLElement)` 返回全部强类型元素引用。
- **Acceptance Criteria**：
  - `frontend/index.html` 与 `frontend/src/dom.ts` 包含全部既有无障碍属性（`role="tablist"`、`role="tab"`、`role="tabpanel"`、`role="separator"`、`aria-labelledby`、`aria-expanded`、`aria-pressed`）与表单 `submitter` 值
  - 无重复手写对话框外壳，`cd frontend && npm run typecheck` 零报错

### TASK-009：拆分创建编辑器模块 `frontend/src/editor.ts` 与沙箱预览模块 `frontend/src/preview.ts`

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-008
- **Executor**：主线
- **Description**：将 CodeMirror 6 编辑器配置与沙箱预览 iframe 管理拆分为独立的 `frontend/src/editor.ts` 与 `frontend/src/preview.ts`，完整保留双向行号定位跳转、KaTeX 公式缓存渲染、代码块复制与预览滚动偏移记忆。
- **Details**：
  - `frontend/src/editor.ts`：
    - 封装 CodeMirror 6 实例创建与控制接口：`getDoc()`、`replaceDoc(content: string)`（内部维护 `isLoading` 抑制程序化加载触发脏标记）、`applyTheme(theme: 'dark' | 'light')`、`applyWrap(wrap: boolean)`、`scrollToLine(line: number)`（`EditorView.scrollIntoView(..., { y: 'start' })` 不篡改光标选区）、`jumpAndFocusLine(line: number)`（供目录跳转编辑模式使用）、`syncMeasure()`（供从预览切回时同步刷新视口测量）、`focus()`
    - 构建契合 MD3 色彩令牌的深色（基于 `oneDark` 语法高亮配 MD3 `--pane-bg` 底色）与浅色编辑器主题扩展
    - 绑定全部快捷键：`Ctrl-s`（保存）、`Ctrl-o` / `Ctrl-Shift-p`（打开）、`Ctrl-n`（新建）、`Ctrl-p` / `Ctrl-Shift-e`（打开导出弹窗）、`Tab` 缩进、历史撤销重做与键盘代码折叠（不渲染折叠箭头以免侵占行号跳转槽）
    - 在 `scrollDOM` 上绑定左键点击 `.cm-gutters` 行号槽事件，解析行号并回调预览跳转函数
  - `frontend/src/preview.ts`：
    - 封装沙箱预览 `iframe` 生命周期：首次渲染通过 `srcdoc` 引导骨架（引用 `./katex/katex.min.css`），后续编辑原地更新 `<style>` 与 `<article id="md-content">`，空文档时显式展示 `#preview-empty` 覆盖层且不隐藏 `iframe`
    - 维护 500 条目上限的 `mathCache` 与 `renderMathInRoot(root)`（同时导出供独立 HTML 导出管线复用）
    - 在 `iframe` 文档点击委托中完整处理三类交互：
      1. `.copy-code-btn` 点击：提取代码文本（去除末尾单个换行），调用 `host.setClipboard`，切换 `.copied` 类与 `"已复制"` 标签并在 1200ms 后自动复位（`WeakMap` 管理定时器防重入）
      2. `#md-content` 左外侧行号区点击：扫描首个底部大于 `clientY` 的 `[data-line]` 块并回调 `editor.scrollToLine(hit.line)`
      3. `a[href]` 点击：`preventDefault()` 阻止导航破坏沙箱文档，对 `#fragment` 执行 `decodeURIComponent` 容错解码并平滑滚动至目标标题
    - 封装 `captureScrollBeforeHide()` 与 `restoreScrollAfterShow()` 方法，确保预览列从可见切至隐藏再恢复可见时，精确还原 `scrollingElement.scrollTop`。
- **Acceptance Criteria**：
  - `frontend/src/editor.ts` 与 `frontend/src/preview.ts` 职责独立且通过 `cd frontend && npm run typecheck`
  - 编辑器行号点击、预览左缘行号点击、锚点平滑跳转、代码块复制与 KaTeX 渲染逻辑无任何遗漏

### TASK-010：提取创建目录抽屉视图控制器 `frontend/src/tocView.ts` 与模态框控制器 `frontend/src/modals.ts`

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-008, TASK-009
- **Executor**：主线
- **Description**：新建 `frontend/src/tocView.ts` 封装大纲目录树渲染、展开状态保持与拖拽/键盘调宽；新建 `frontend/src/modals.ts` 封装未保存确认、偏好设置与独立 HTML 导出三座模态框的交互闭环。
- **Details**：
  - `frontend/src/tocView.ts`（复用纯模型 `frontend/src/toc.ts` 不变）：
    - 支持在编辑、预览与分栏全部三种视图模式下按用户意愿展开或收起 MD3 侧边导航抽屉（启动默认折叠 `collapsed`）
    - 实现大纲签名比对防冗余重绘、`restoreTocExpansion` 跨编辑展开态恢复、隐藏态延迟渲染标记 `tocDirty`、父节点单项折叠/展开、“全部收起 / 全部展开”按钮联动及空态提示
    - 实现 `#toc-splitter` 的 `setPointerCapture` 指针拖拽调宽与 `ArrowLeft`/`ArrowRight` 键盘 `±16px` 步进调宽（钳制于 `[160, 420]` 像素，实时更新 `flexBasis`、`aria-valuenow` 与 `aria-valuetext`）
    - 实现 `#toc-collapse` 点击切换抽屉显隐，同步更新图标、`title`、`aria-label`（`"展开侧栏"` / `"折叠侧栏"`）与 `aria-expanded`
  - `frontend/src/modals.ts`：
    - `askUnsaved()`：管理 `#close-dialog` 的 `submit` / `cancel` / `close` 事件单次结算，返回 `'yes' | 'no' | 'cancel'`，防重入重复 `showModal`
    - 设置弹窗控制器：绑定 `#btn-settings` 打开、关闭按钮与遮罩区域外点击关闭、深浅主题分段按钮切换（同步 `aria-pressed` 与 `.active`）、自动换行开关、LaTeX 开关，以及基于 `createFontCommitter` 的预览字体单飞串行提交（`change` 与 `Enter` 触发，拦截 `Enter` 防止触发表单默认提交关闭弹窗，保存失败显示 `"预览字体无效"` 错误状态并回滚输入框值）
    - 导出 HTML 弹窗控制器：绑定 `#btn-export` 与全局 `Ctrl+P` / `Ctrl+Shift+E` 快捷键打开、遮罩外点击关闭、导出主题（浅色/当前）与打印边距（20mm/10mm/30mm）分段按钮 `aria-pressed` 切换，以及提交导出流程（按钮禁用显示 `"生成中..."`，并行调用 `host.render` 与主题 CSS 获取，经 `exportToHtmlData` 离屏渲染数学公式后调用 `host.saveHtmlFileDialog` 与 `host.saveHtmlFile`，成功后关闭弹窗并在状态栏提示 `"已导出为 HTML: <文件名>"`，失败提示 `"导出失败"`）。
- **Acceptance Criteria**：
  - `frontend/src/tocView.ts` 与 `frontend/src/modals.ts` 通过 `cd frontend && npm run typecheck`
  - 全部 5 个纯逻辑 `.test.ts` 自检文件（`fontCommit.test.ts`、`gutter.test.ts`、`tocGutter.test.ts`、`renderScheduler.test.ts`、`htmlExporter.test.ts`）逐一执行全部通过

### TASK-011：重写顶层协调器 `frontend/src/main.ts` 并删除 `frontend/wailsjs/` 遗留目录

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-009, TASK-010
- **Executor**：主线
- **Description**：重写 `frontend/src/main.ts` 为精简的顶层应用协调器，串联文件读写、拖放打开、脏状态边沿同步、关闭拦截流、窗口状态记忆与无闪烁启动展示；彻底删除 `frontend/wailsjs/` 目录。
- **Details**：
  - 删除 `frontend/wailsjs/` 整个目录（含旧版生成的 Go 绑定与 runtime 文件）。
  - 在 `frontend/src/main.ts` 首行保持 `import './style.css';`（使得 `esbuild --outfile=dist/app.js` 在产出 `dist/app.js` 的同时原生伴生产出 `dist/app.css`，与 `index.html` 的 `<link rel="stylesheet" href="./app.css" />` 及 `copy-assets.mjs` 精确闭合），装配各子模块并实现顶层协调逻辑：
    - **状态管理**：维护 `currentFile`、`dirty`（边沿触发：`if (dirty === v) return;` 仅在状态翻转时调用 `host.setDirty(v)`）、`currentTheme`、`currentPreviewFont`、`renderVersion`（防异步乱序覆盖）、`previewCss` 缓存与 `previewStale`（在纯编辑模式下跳过隐藏预览渲染，首次切换至预览或分栏时自动补渲染并刷新 CSS）
    - **状态胶囊更新辅助函数**：统一管理 `.status` 的 `.stealth`、`.unsaved`、`.error` 类切换与中文文案（`就绪`、`未保存`、`已保存`、`打开失败`、`保存失败`、`渲染失败`、`导出失败`、`预览字体无效`）
    - **文件流转**：实现 `newFile()`、`openFile()`、`openPath(path)`、`saveCurrent()`、`confirmDiscard()`（未保存时弹 `askUnsaved()`，选保存但保存失败或取消另存为时返回 `false` 阻断后续动作）
    - **宿主事件接入**：
      - `host.onFileDrop`：过滤 `/\.(md|markdown|mdown|txt)$/i` 后调用 `openPath`
      - `host.onOpenFile`：接收运行期系统文件关联打开事件并调用 `openPath`
      - `host.onRequestClose`：接收 Alt+F4 / 系统关闭拦截事件，通过 `closePending` 重入锁串行执行 `handleCloseFlow()`（确认保存/不保存 -> `flushWindowState()` -> `host.forceQuit()`）
    - **窗口控制与状态持久化**：绑定顶栏最小化、最大化/还原、拖拽区双击切换最大化、关闭按钮（`requestClose()`）；监听 `window.resize` 防抖查询 `host.isMaximized()` 同步 `.maximised` 样式类与按钮图标，并在非最大化状态下以 `window.innerWidth` / `window.innerHeight` 记忆大于等于 `720x520` 的正常窗口 DIP 宽高至 `host.setWindowSize` / `host.setWindowMaximized`
    - **无闪烁启动序列 `init()`**：并行发起 `host.getSettings()` 与 `host.getStartupFile()`，应用持久化主题、换行、预览字体与初始最大化状态类后，等待 `document.readyState === "complete"` 立即调用 `host.showWindow()` 显现窗口，随后再读取启动文件（无启动文件则执行 `newFile()`，读取失败回退空白文档并置 `"打开失败"` 错误状态），最后聚焦编辑器；保持 `document.readyState === "loading"` 与已加载双路径入口。
- **Acceptance Criteria**：
  - `frontend/wailsjs/` 目录已完全删除
  - `cd frontend && npm run typecheck` 零错误通过
  - `cd frontend && ./node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty >/dev/null` 零错误通过
  - `cd frontend && npm run build` 成功生成 `frontend/dist/app.js`、`frontend/dist/app.css`（esbuild 处理 CSS 导入伴生产物）、`frontend/dist/index.html` 与 `frontend/dist/katex/`

---

## Phase 4：测试矩阵对齐、CI 流水线迁移与文档维护

### TASK-012：重构 `frontend/tests/uiContract.test.mjs` 与三项 Chrome 无头冒烟检查脚本

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-011
- **Executor**：主线
- **Description**：重写 `frontend/tests/uiContract.test.mjs` 断言 MD3 令牌体系、`mygo.ts` 生成契约、模块化源码契约与 MyGo 窗口启动协议；更新 `startup.check.mjs`、`modeScroll.check.mjs` 与 `export.check.mjs` 将旧版 Wails 全局桩替换为 `window.mygo` 运行时模拟桩。
- **Details**：
  - `frontend/tests/uiContract.test.mjs`：
    - 读取 `src/tokens.css`、`src/style.css`、`index.html`、`src/mygo.ts`、`src/` 下各业务 TS 模块、`../internal/theme/assets/theme/*` 与 `../main.go`
    - 断言 `src/mygo.ts` 包含生成的 `export const App`（含 `showWindow`、`saveHtmlFileDialog`、`saveHtmlFile` 等方法）与 `export const events`（含 `requestClose` 与 `openFile`），且 `bridge.ts` 与之一一对应
    - 断言 MD3 核心色彩角色（深浅两套 `primary`、`secondary-container`、`tertiary-container`、`error-container`、`surface`、`surface-container-*`、`on-surface`、`outline`、`outline-variant`、`scrim`）、形状圆角令牌（`4px`/`8px`/`12px`/`16px`/`28px`/`9999px`）与排印字阶令牌均已定义并被实际引用
    - 断言旧版 Fluent 令牌（`--fluent-brand`、`#0078d4`、`backdrop-filter`、`.resize-handle`、`wailsjs`）零残留
    - 断言后端 `main.go` 隐藏窗口配置 `light-dark(#eeedf4, #1e1f25)` 与前端 `tokens.css` 浅色/深色 `surface-container` 令牌严格一致，且包含 `Hidden: true` 与前端 `showWindow()` 启动揭示闭环
    - 断言预览深浅色令牌文件与 `base.css` 保持令牌注释头、滚动条、选区、代码块复制按钮显隐及无 `@media print` 契约
    - 断言 CodeMirror 活动行半透明色阶与高优先级选区层选择器、空预览覆盖层不隐藏 `iframe`、全局 `:focus-visible` 焦点环、三座 MD3 对话框 `aria-labelledby`/`submitter`、三视图模式顺序（`editor` 默认选中）、中文状态文案、边沿触发 `dirty` 同步以及目录分隔条 `setPointerCapture` 与 `16` 像素键盘步进契约
  - 更新 `frontend/tests/startup.check.mjs`、`frontend/tests/modeScroll.check.mjs` 与 `frontend/tests/export.check.mjs`：
    - 将注入页面的模拟宿主对象由旧版 `window.go` / `window.runtime` 迁移为符合 `mygo-runtime` `Runtime` 接口的 `window.mygo` 对象（实现 `call(method, ...args)` 路由 `App.*` 方法、`on`/`once` 事件总线、`window` 窗口控制桩、`platform: 'win32'`、`locale: 'zh-CN'`、`dir: 'ltr'`、`preferences`），保持所有启动不闪烁揭示顺序、最大化启动图标同步、慢速文件不阻塞窗口展示、预览模式切换滚动位置保持、编辑器重现测量同步以及独立 HTML 导出参数与失败回退断言完全不变。
- **Acceptance Criteria**：
  - `cd frontend && npm test`（依次运行 `fontCommit`、`gutter`、`tocGutter`、`renderScheduler`、`htmlExporter`、`uiContract` 共 6 项自检）全部通过
  - `cd frontend && npm run build && node tests/startup.check.mjs && node tests/modeScroll.check.mjs && node tests/export.check.mjs` 全部无头浏览器冒烟测试通过（测试完毕无残留进程与临时目录）

### TASK-013：迁移 `.github/workflows/build.yml` 与 `.github/workflows/release.yml` 至 MyGo 构建链路

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-004, TASK-011
- **Executor**：主线
- **Description**：将 GitHub Actions Windows 构建工作流与发版工作流从 `wails build` 迁移至纯 Go `CGO_ENABLED=0` 的 `mygo build`，对齐便携版可执行文件、NSIS 用户级安装包产物路径及安装/卸载冒烟校验脚本。
- **Details**：
  - `.github/workflows/build.yml`：
    - `actions/setup-go@v5` 的 `go-version` 更新为 `"1.27.x"`，全局或步骤级设置 `CGO_ENABLED: "0"`
    - 移除 `Install Wails CLI` 步骤；保留 NSIS 安装步骤以供 `mygo build` 调用 `makensis`
    - 包含前端校验步骤（`cd frontend && npm ci && npm run typecheck && npm test`）与后端单测步骤（`go test ./...`）
    - 构建步骤改为：`go run github.com/egoist/mygo/cmd/mygo@v0.7.4 build -platform windows/amd64`
    - 更新安装器存在性校验与静默安装/卸载冒烟脚本：
      - 安装包路径匹配 `dist/windows-amd64/mado-setup-*-amd64.exe`，便携可执行文件路径为 `dist/windows-amd64/Mado.exe`
      - 安装目标目录仍为 `$env:LOCALAPPDATA\Programs\Mado`，验证安装后存在 `Mado.exe` 与 `Uninstall.exe`
      - 卸载注册表键对齐 MyGo 规范：`HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\io.github.mado.editor`，校验 `DisplayName -eq 'Mado'`
      - 执行 `Uninstall.exe /S` 后验证安装目录、注册表键、开始菜单快捷方式与桌面快捷方式全部清理干净
    - 更新 `actions/upload-artifact@v4` 上传路径为 `dist/windows-amd64/Mado.exe` 与 `dist/windows-amd64/mado-setup-*-amd64.exe`
  - `.github/workflows/release.yml`：
    - `go-version` 更新为 `"1.27.x"`，设置 `CGO_ENABLED: "0"`，移除 Wails CLI 安装步骤
    - 从 Git tag 提取版本号注入 `mygo.json` 的 `version` 字段（取代原 `wails.json` 的 `info.productVersion`）
    - 执行前端 `npm ci && npm run typecheck && npm test`、后端 `go test ./...` 及 `go run github.com/egoist/mygo/cmd/mygo@v0.7.4 build -platform windows/amd64`
    - 使用 `gh release create` 发布 `dist/windows-amd64/Mado.exe` 与 `dist/windows-amd64/mado-setup-${VERSION}-amd64.exe`。
- **Acceptance Criteria**：
  - `.github/workflows/build.yml` 与 `.github/workflows/release.yml` 中无任何 `wails` 或 `build/bin/` 旧路径残留
  - YAML 语法合法，产物文件名、注册表路径与 `mygo.json`（`slug: "mado"`, `name: "Mado"`, `identifier: "io.github.mado.editor"`）严格一致

### TASK-014：执行全链路回归验证并同步更新 `.docs/Project.md`

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-012, TASK-013
- **Executor**：主线
- **Description**：运行前后端全套静态检查、单元测试、竞态检测、生产构建与无头浏览器冒烟测试；按重构后的 MyGo + Material Design 3 真实代码库状态全面更新 `.docs/Project.md`。
- **Details**：
  - 依次执行完整本机验证链：
    1. `cd frontend && npm run typecheck`
    2. `cd frontend && ./node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty >/dev/null`
    3. `cd frontend && npm test`
    4. `cd frontend && npm run build`
    5. `cd frontend && node tests/startup.check.mjs && node tests/modeScroll.check.mjs && node tests/export.check.mjs`
    6. `CGO_ENABLED=0 go vet ./... && CGO_ENABLED=0 go test -race ./...`
    7. 执行 `CGO_ENABLED=0 go run github.com/egoist/mygo/cmd/mygo@v0.7.4 generate` 确认生成的 `frontend/src/mygo.ts` 无未同步差异，清理临时测试目录
  - 重构更新 `.docs/Project.md`（整体重写保持连贯，不打局部补丁）：
    - 更新概述与视觉体系说明（由 Fluent 2 + Wails v2 更新为 Material Design 3 + MyGo 纯 Go WebView 模式）
    - 更新环境与运行章节（Go 1.27.3+、`CGO_ENABLED=0`、`mygo generate` / `mygo build`、`npm run typecheck`、本机验证链与云端 CI `dist/windows-amd64/` 产物说明）
    - 更新目录结构树（体现 `mygo.json`、`frontend/tsconfig.json`、移除 `wails.json` 与 `package.json.md5`、前端模块化 `src/tokens.css`、`src/bridge.ts`、`src/icons.ts`、`src/dom.ts`、`src/editor.ts`、`src/preview.ts`、`src/tocView.ts`、`src/modals.ts`、`src/mygo.ts` 等真实结构）。
- **Acceptance Criteria**：
  - 上述全部本机静态检查、单测、竞态测试与无头浏览器检查退出码均为 0
  - 全仓搜索 `wails`（排除 `.docs/` 历史归档与 git 历史）无残留引用
  - `.docs/Project.md` 描述的目录结构、命令、依赖与实际代码库 100% 一致

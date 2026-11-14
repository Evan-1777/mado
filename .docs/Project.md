# Project

> 项目的单一事实来源，供 Agent 动手前建立全局认知。定位与设计原则见 `SCOPE.md`，工作流规则见 `AGENTS.md`。

## 概述

- **定位**：本地运行的 Windows 原生 Markdown 查看器/编辑器，轻量低占用，编辑与渲染分离，默认支持 HTML 渲染。宿主为 MyGo 纯 Go WebView 模式（零 CGO），界面为 Material Design 3。
- **阶段**：开发中（宿主框架迁移至 MyGo + 前端 MD3 模块化重构已完成：类型化服务绑定与事件通道、隐藏标题栏窗口、原生文件对话框与文件关联、便携化配置迁移、GFM/LaTeX/源行号渲染管线、可调宽目录抽屉、沙箱增量预览与公式缓存、独立 HTML 导出（浅色/当前主题 × 20/10/30mm 页边距，内嵌 MD3 样式表 + 同源 KaTeX CDN 外链 + 声明式 CSP）、Win32 原生剪贴板历史管道、窗口尺寸与最大化状态记忆、未保存修改闭环守卫、MyGo 内置 NSIS 用户级安装打包；导出弹窗经 dev-only 无头冒烟全覆盖）
- **非目标**：多标签页、插件系统、Mermaid 图表（详见 `SCOPE.md` 设计原则）

## 环境与运行

- **平台**：Windows 10/11（目标平台，依赖系统 Edge WebView2 Runtime）；Linux x86_64（开发环境）
- **Shell**：bash
- **运行时**：Go 1.27.3+（`go.mod` 声明 `go 1.27.3`，本机 `go` 为 1.27.0，由 `GOTOOLCHAIN=auto` 自动切到已缓存的 go1.27.3 工具链，属正常现象）；Node.js 24 + npm 11（前端构建）
- **版本管理**：git；`main` 为稳定主分支，无复杂分支策略
- **桌面宿主**：`github.com/egoist/mygo v0.7.4`（`mygo.json` 声明 name/slug/identifier/version、`frontendDist`、`buildCommand` 与 md/markdown/mdown 文件关联）
- **运行**：
  - 本机验证链（最小占用，产物均 gitignored）：
    1. `cd frontend && npm install --include=dev`
    2. 类型检查：`npm run typecheck`（tsc 5.8.3，含 src 与 tests）
    3. 零产物语法检查：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`
    4. 前端自检：`npm test`（fontCommit、gutter、tocGutter、renderScheduler、htmlExporter、uiContract 共 6 项）
    5. `npm run build`（esbuild 打包 `dist/app.js` 并伴生 `dist/app.css`，随后 `copy-assets` 产出 `dist/index.html` 与 `dist/katex/`）
    6. `CGO_ENABLED=0 go vet ./...` + `CGO_ENABLED=0 go test ./...`
    7. 竞态：`go test -race ./...`（Linux 上 `-race` 与 `CGO_ENABLED=0` 互斥，故本机不带该变量执行；CI runner 不跑 race）
    8. 契约再生成校验：`CGO_ENABLED=0 go run github.com/egoist/mygo/cmd/mygo@v0.7.4 generate`（应输出 "frontend/src/mygo.ts is up to date"）
    9. dev-only 无头检查：`npm run build && node tests/startup.check.mjs`、`node tests/modeScroll.check.mjs`、`node tests/export.check.mjs`（不接入 npm test/CI；以 `--headless=new` 启动本机 `google-chrome`，可用 `CHROME_BIN` 覆盖；需要交互式浏览器操作时按 SCOPE 连接用户提供的 9222 实例）
  - 云端 CI：`.github/workflows/build.yml`（windows-latest，Go 1.27.x + `CGO_ENABLED=0`，安装 NSIS 后执行 `go run github.com/egoist/mygo/cmd/mygo@v0.7.4 build -platform windows/amd64`，产物 `dist/windows-amd64/Mado.exe` 与 `dist/windows-amd64/mado-setup-<version>-amd64.exe`；构建后在 runner 上静默安装、校验 `Mado.exe`/`Uninstall.exe` 与 HKCU 卸载键 `io.github.mado.editor`、静默卸载并确认目录/注册表/快捷方式清理）；发布流程见 `.github/workflows/release.yml`（tag `v*` 触发，从 tag 注入 `mygo.json` 的 `version` 后构建并同时发布便携 exe 与安装器）
- **测试**：`go test ./...`（覆盖根包/filesys/mdrender/settings/theme 5 个包）；`go test -race ./...`；零依赖前端自检 `cd frontend && npm test`（Node 原生 type-stripping，无外部测试框架）；dev-only 无头冒烟见上；交互行为手动验收
- ★ 路径含空格或中文时加引号；`settings.json` 持久化于 exe 所在目录（便携化），`%APPDATA%/Mado/` 仅为旧配置的一次性迁移源目录，应用不再向其写入；安装版位于 `%LOCALAPPDATA%\Programs\Mado`，目录可写，继续沿用同一存储模型
- ★ 本开发环境 `NODE_ENV=production` 且 `omit=dev`，安装依赖必须执行 `npm install --include=dev`，否则 esbuild/typescript 会被静默跳过
- ★ 零产物语法检查必须带 `--loader:.css=empty`，否则 `import './style.css'` 会直接报错；禁止使用 `--outfile=/dev/null` 导致在工作区遗留字面文件 `nul.css`
- ★ `frontend/dist/` 是 `mygo build` 编译期 overlay 注入的嵌入源（生成 `mygo_frontend_gen.go` 调用 `SetFrontend`），源码中不再手写 `go:embed`；HTML 内引用资源必须写相对路径 `./app.js`/`./app.css`；构建产物禁止提交 git
- ★ 事件循环就绪前调用对话框、主题源或剪贴板等原生接口会 panic，所有原生调用必须以 `a.win != nil` 为边界守卫
- ★ 测试不污染真实环境：settings/filesys 经包级 `storePath` 变量覆写隔离至 `t.TempDir()`；根包启动副作用用例 `TestStartupCreatesNoWelcomeDoc` 通过 `t.Setenv` 同时设置 `APPDATA` 与 `XDG_CONFIG_HOME` 隔离 `os.UserConfigDir()`；`TestSaveHtmlFileDialog` 通过 `App.saveFileDialog` 函数字段注入，禁止目录占位

## 结构

```
mado/
├─ go.mod / go.sum          # Go 模块依赖（goldmark、mygo v0.7.4、chroma 等）
├─ mygo.json                # MyGo 应用描述：应用标识、版本、前端产物、构建命令、文件关联
├─ main.go                  # MyGo 入口：类型化事件（request-close / open-file）、主题源预设、服务绑定、隐藏标题栏窗口、关闭拦截
├─ main_test.go             # 根包测试：配置迁移、启动副作用、持久化失败、并发绑定与关闭一致性
├─ app.go                   # App 绑定层：聚合各 internal 模块并导出前端 IPC 方法，读写锁守护状态，原生能力经 win 守卫
├─ app_windows.go           # Win32 原生剪贴板管道（绑定前台宿主 HWND 写入，触发 Win+V 剪贴板历史）
├─ app_other.go             # 非 Windows 平台剪贴板无操作回退桩
├─ internal/filesys/        # 文件读写与原子保存，以及 lastfile 只写记录
├─ internal/mdrender/       # goldmark 渲染管线：GFM、LaTeX 数学扩展、源行号锚点及脚本/refresh 净化
├─ internal/settings/       # 偏好持久化（主题、换行、数学渲染、字体、窗口尺寸与最大化）
├─ internal/theme/          # 内嵌预览深浅色 MD3 令牌与排版 CSS（go:embed）
├─ frontend/                # 前端工程：TypeScript 源码、MD3 令牌样式、自检脚本与资产构建
│  ├─ index.html            # 外壳文档与三座 MD3 原生 <dialog>（未保存确认 / 设置 / 导出）
│  ├─ tsconfig.json         # 静态类型检查配置（strict，含 src 与 tests）
│  ├─ src/tokens.css        # MD3 系统令牌：色彩角色（深浅两套）、字阶、形状、动效、目录宽度
│  ├─ src/style.css         # 外壳样式：单层顶栏、目录抽屉、双栏卡片画布、28px 圆角模态与 MD3 控件
│  ├─ src/bridge.ts         # 双环境宿主桥接（MyGo 运行时 + 生成客户端 / 浏览器内存回退）
│  ├─ src/mygo.ts           # mygo generate 生成的类型化客户端（仓库跟踪，须与 Go 导出方法同步）
│  ├─ src/icons.ts          # Material Symbols 风格矢量图标常量
│  ├─ src/dom.ts            # 外壳骨架构建器，导出强类型元素引用与视图模式类型
│  ├─ src/editor.ts         # CodeMirror 6 封装：文档读写、主题/换行舱、行号跳转、快捷键
│  ├─ src/preview.ts        # 沙箱 iframe 预览：原地更新、公式缓存、复制/行号/锚点交互、滚动记忆
│  ├─ src/tocView.ts        # 目录抽屉视图：大纲重绘、展开态恢复、拖拽与键盘调宽
│  ├─ src/modals.ts         # 三座模态控制器：未保存确认、偏好设置、独立 HTML 导出
│  ├─ src/main.ts           # 顶层协调器：文件流转、脏状态、模式切换、窗口记忆、无闪烁启动
│  ├─ src/toc.ts            # Markdown ATX 标题解析与折叠状态映射
│  ├─ src/renderScheduler.ts# 尾随 80ms 节流渲染调度器
│  ├─ src/fontCommit.ts     # 预览字体提交串行化控制
│  ├─ src/gutter.ts         # 预览双向跳转行号二分查找定位
│  ├─ src/htmlExporter.ts   # 独立 HTML 文档组装（内嵌主题 CSS、KaTeX CDN 链接与 CSS Paged Media）
│  ├─ scripts/copy-assets.mjs # 共享前端静态资源拷贝（index.html、KaTeX CSS 与 woff2 字体）
│  └─ tests/                # Node 原生自检（5 项 .test.ts + uiContract.test.mjs）、共享 mygo 运行时桩、node-shim.d.ts 与 3 项无头检查
├─ dist/                    # mygo build 产物（dist/windows-amd64/，gitignored）
└─ docs/                    # 用户相关说明文档
```

- **数据流**：
  - **启动**：`main.go` 调 `app.initState()` 读取 exe 目录 `settings.json`（含旧配置目录一次性迁移，只读不创建配置目录），据持久主题预设 `mygo.Theme.SetSource`，注册 `App.OnOpenFile` 并 `mygo.Bind(app)`；`App.WhenReady` 中创建 `Hidden: true` + `TitleBarHidden` + `HideWindowButtons` 主窗口（宽高/最大化取自持久设置，背景 `light-dark(#eeedf4, #1e1f25)`），注册 `win.OnClose` 拦截。页面加载 `app.js` 后 `main.ts` 并行发起 `GetSettings` 与 `GetStartupFile`，应用主题/换行/字体与最大化状态，等 `document.readyState === "complete"` 调 `ShowWindow()` 显现窗口，随后才处理启动文件：有文件则 `LoadFile` 渲染一次；无文件走 `newFile()` 空白态，Editor 模式下跳过 `Render`/`GetCSS`，首次激活预览时补一次渲染。窗口第一可见帧即完整界面。
  - **编辑与渲染**：CodeMirror 变化由 `renderScheduler` 尾随 80ms 节流并配合 Promise 背压合并最新请求 → 并行调用 `Render(md)` 与 `GetCSS()` → 预览更新：首帧 `srcdoc` 引导骨架，后续在 iframe 内原地更新样式文本或 `article` innerHTML（保留滚动位置）；渲染版本号丢弃乱序响应。公式由 Go 输出带 `data-tex` 的占位元素，前端父上下文用 KaTeX 回填（500 条缓存）。
  - **偏好持久化**：设置模态内修改主题、换行、公式开关或预览字体（经 `fontCommit` 串行校验）时调用 Go 导出方法；全部经 `App.persist`（副本更新，磁盘写入成功才赋回内存快照）保持内存与磁盘强一致；主题变更同时 `Theme.SetSource` 同步原生对话框、DWM 边框与 `prefers-color-scheme`。
  - **代码复制与剪贴板**：围栏代码块由包装渲染器输出紧凑复制按钮，iframe 文档 click 委托读取同级 `pre` 文本后调用 `SetClipboard`，经 Win32 `GetForegroundWindow`/`OpenClipboard` 写入前台根 HWND 触发 Win+V 历史；宿主调用失败时回退 `navigator.clipboard`。
  - **聚焦目录与双向跳转**：成功渲染后由 `toc.ts` 解析 ATX 大纲（跳过围栏），`tocView.ts` 以胶囊行渲染；编辑/预览/分栏三种模式下均可展开或折叠抽屉（启动默认折叠），折叠时延迟渲染（`tocDirty`）。编辑器行号槽点击二分定位对应块并在预览平滑置顶；预览左缘行号点击按坐标换算行号并回跳编辑器（不篡改光标选区）。
  - **窗口控制与状态记忆**：顶栏拖拽区由 `--app-region: drag` 声明，窗口缩放走原生八向边缘；最小化/最大化/还原/关闭按钮经 mygo-runtime `window` 控制，关闭按钮与 Alt+F4 统一进入未保存守卫。监听 `window.resize` 250ms 防抖写入 DIP 尺寸并分离记录最大化状态，退出前 `flushWindowState` 强制刷盘。
  - **保存与关闭确认**：保存时写入同目录临时文件、继承原权限、`Sync()` 刷盘后原子 `Rename` 替换；exit 或新建未保存文件时前端弹原生 `<dialog>` 三态确认；Go 侧 `win.OnClose` 在脏状态时 `PreventDefault` 并 emit `request-close`，前端保存后调 `ForceQuit`。
  - **文档导出为 HTML**：标题栏导出按钮或快捷键（Ctrl+P / Ctrl+Shift+E）唤出导出模态（浅色/当前主题、标准 20mm/紧凑 10mm/宽松 30mm 边距）→ 点击「导出」进入加载禁用态 → 并行获取 `Render(md)` 与目标主题完整 CSS（`GetThemeCSS(exportTheme)`）→ 在纯内存未挂载容器内回填 KaTeX 并提取 innerHTML → 组装自包含 HTML5 文档（`<title>` 安全转义、内嵌 MD3 主题样式表、同源 KaTeX CDN 样式外链、声明式 CSP、`@page` A4 边距、打印防断页/防代码裁断/色彩保真与复制按钮隐藏规则）→ 调用 `SaveHtmlFileDialog`（契约 `(string, error)`，区分用户取消与宿主异常）→ `SaveHtmlFile` 经 `filesys.WriteFile` 原子落盘，成功后状态栏提示「已导出为 HTML: <文件名>」，取消静默复位，异常提示「导出失败」。
- **依赖方向**：`internal/*` 禁止相互依赖（filesys 与 settings 仅通过共享 JSON 文件松耦合）；`main.go` 与 `app.go` 是唯一允许引用 internal 的外层包；前端仅通过 `frontend/src/bridge.ts`（转调 `mygo-runtime` 与生成的 `mygo.ts` 客户端）与后端通信，业务模块禁止直接依赖运行时；`mdrender`、`theme`、`filesys`、`settings` 为纯 Go 包，测试不依赖 GUI。

## 约定

- **命名**：Go 标准（导出 PascalCase，包内 camelCase/snake_case，internal 包名与目录一致）；前端 TypeScript camelCase；CSS 类名 kebab-case 并优先使用 MD3 语义类名（`md3-dialog`、`toc-row`、`seg`）；Git 提交采用 Conventional Commits（英文类型前缀 + 中文详细描述）
- **语言**：用户可见文本（界面提示、模态对话框、文档、README）用中文；代码注释、日志与提交类型前缀用英文
- **错误处理**：Go 导出方法返回 error，由前端捕获并以应用内状态栏提示（如 `打开失败`）或对话框反馈，不向控制台抛出未捕获异常；Go 方法内 panic 由 MyGo 恢复并作为调用错误上报
- **日志**：无外部日志框架，`println` 仅限于 `main.go` 启动致命失败时输出

## 约束与决策

- 2026-11-14 宿主框架由 Wails v2 迁移至 MyGo v0.7.4 纯 Go WebView 模式——理由：保持零 CGO、单二进制与轻量定位，原生窗口/对话框/剪贴板边界/文件关联/NSIS 打包与类型化 IPC 一体化，并退役全部 Wails 配置与前端手工缩放胶水层；替代方案 Tauri 被 SCOPE 的「不使用 Rust」排除
- 2026-11-14 `go.mod` 声明 `go 1.27.3` 以匹配 MyGo 的模块要求——本机 go1.27.0 由 `GOTOOLCHAIN=auto` 自动切到缓存的 1.27.3 工具链，无需手工安装
- 2026-11-14 隐藏标题栏 + 隐藏原生窗口按钮（`TitleBarHidden` + `HideWindowButtons`），由页面自绘 MD3 顶栏——保留 Windows 11 原生阴影、圆角与含顶边的八向缩放，彻底删除旧版 60 行手写 resize 热区补丁，关闭按钮直接进入统一脏状态守卫
- 2026-11-14 前端静态资源改由 `mygo build` 的编译期 overlay 注入（生成 `mygo_frontend_gen.go` 调 `mygo.SetFrontend`）——避免源码双份嵌入，并让后端单测无需前置构建前端产物即可独立运行
- 2026-11-14 新增 `bridge.ts` 作为唯一宿主接缝（`isMyGo()` 检测 + 浏览器内存回退）——业务模块不散落环境判断，同一 bundle 可直接跑无头冒烟；替代方案：在各模块内部分支（违反单一职责）
- 2026-11-14 窗口背景色 `light-dark(#eeedf4, #1e1f25)` 与 `tokens.css` 的浅/深 `surface-container` 成对维护并由 uiContract 断言——窗口底色与页面表面色必须逐字节一致，否则启动瞬间露出色差
- 2026-11-14 原生对话框/主题源/剪贴板调用以 `a.win != nil` 为守卫——事件循环就绪前调用这些接口会 panic，且离线单测不得等待主线程
- 2026-11-14 `SetTheme` 持久化成功后同步 `mygo.Theme.SetSource`——同时更新 Windows 原生文件对话框、DWM 边框、`light-dark()` 窗口底色与 WebView2 `prefers-color-scheme`
- 2026-11-14 窗口尺寸记忆使用 `window.innerWidth`/`window.innerHeight`（DIP）而非新增原生尺寸查询绑定——MyGo 隐藏标题栏模式下页面铺满窗口，CSS 像素即 DIP；`WindowControls` 也不提供尺寸查询
- 2026-11-14 关闭拦截改为 `win.OnClose` + `CloseEvent.PreventDefault()` + 类型化事件 `request-close`——与 Wails 的 `OnBeforeClose` 语义等价，但走 MyGo 原生事件与绑定
- 2026-11-14 类型化 IPC 由 `mygo generate` 产出 `frontend/src/mygo.ts` 并纳入仓库——新增/修改 Go 导出方法后必须重新 generate 并提交，前端 `bridge.ts` 与其一一对应（uiContract 逐方法断言，`setStartupFile`/`setTitle` 为已声明的宿主侧例外）
- 2026-11-14 `saveFileDialog` 测试注入签名改为 `func(defaultFilename string) (string, error)`——去掉框架耦合的 opts 结构体，测试可断言默认文件名契约
- 2026-11-14 `startup(ctx)` 重写为无参 `initState()`——MyGo 绑定无 Wails context，启动职责收敛为迁移 + 读取设置
- 2026-11-14 前端视觉体系整体切换为 Material Design 3（`tokens.css` 全套色彩角色/字阶/形状/动效令牌 + 色调表面层级）——取代 Fluent 硬编码色值与亚克力模糊；深度由容器色阶与圆角表达，不再依赖投影与毛玻璃
- 2026-11-14 单层 48px MD3 顶栏取代旧「标题栏 + 工具栏」双行结构——目录开关、状态胶囊、三态分段按钮与操作图标同处一条视觉轴，纵向释放主画布空间
- 2026-11-14 预览样式表的 12px 圆角即 MD3 medium 形状步进，与外壳令牌同源但写作字面量——预览是独立文档，字面量由 base.css 注释标注并由 uiContract 锁定两处（`pre`、`table`）
- 2026-11-14 目录抽屉在编辑/预览/分栏三种模式下均可展开，折叠态整段隐藏并同时隐藏分隔条——抽屉是导航层而非模式附属；折叠期间结构变化只置 `tocDirty`，展开时再渲染
- 2026-11-14 目录抽屉调宽（160–420px）用 `setPointerCapture` 指针拖拽 + 方向键 ±16px——与旧实现一致的可访问性与稳定性，钳制范围由令牌与 TS 共享
- 2026-11-14 编辑器主题舱（深/浅）与换行舱由 `editor.ts` 拥有，预览滚动记忆与数学缓存由 `preview.ts` 拥有——模块边界即生命周期边界，顶层协调器只做编排
- 2026-11-14 模式切换先捕获预览滚动、切换类名后再回写——`display:none` 会销毁 iframe 视口并把 scrollTop 钳制为 0
- 2026-11-14 编辑列切回可见态时同步执行 `view.measure()`（带 `requestMeasure` 降级）——CodeMirror 异步 ResizeObserver 有静默延时，同步测量消除 0x0 几何真空期
- 2026-11-14 空文档在 Editor 模式下跳过渲染并置 `previewStale`，首次切到预览/分栏补一次渲染——避免为不可见画布付出 IPC 与渲染成本
- 2026-11-14 偏好写入统一收敛至 `App.persist`（副本 mutate → 保存成功才赋回内存快照）——保证配置内存状态与磁盘强一致，避免写盘失败导致状态分流
- 2026-11-14 文档保存采用同目录临时文件 + 原权限 + `Sync` + 原子 `Rename` 替换并先解析符号链接——防止崩溃写入损坏原文档
- 2026-11-14 剪贴板管道保持 Win32 `GetForegroundWindow`/`OpenClipboard` 原生写入前台根 HWND——确定性触发 Win+V 历史捕获，非 Windows 平台降级为空操作桩（两文件本次零改动）
- 2026-11-14 预览公式采用 Go 解析定界符输出 `data-tex` 占位元素 + 前端父上下文 KaTeX 回填并 500 条缓存——维持 iframe sandbox 安全模型（无 allow-scripts），同时离线可用
- 2026-11-14 源行号锚点由 Go ASTTransformer 在顶层块写入 `data-line`，预览 CSS `content: attr(data-line)` 渲染——零 JS 布局开销，行号天然跟随重排
- 2026-11-14 编辑渲染使用单一尾随 80ms 节流调度器 + Promise 背压合并 + 渲染版本号——消除打字高峰卡顿并丢弃乱序响应
- 2026-11-14 目录大纲逻辑保留在 `toc.ts` 纯模型，视图与调宽归 `tocView.ts`——测试与视图共用实现避免假阳性
- 2026-11-14 独立 HTML 导出保留声明式 CSP 与显式 `GetThemeCSS(themeName)`——导出文件脱离应用由外部浏览器打开，需阻断内联脚本并保证暗色主题下导出浅色时令牌完整
- 2026-11-14 导出公式回填使用纯内存未挂载容器——预览全局样式表若注入主文档会给 body 强加内边距并压窄布局
- 2026-11-14 前端自检保持零依赖，Node 内置成员由 `tests/node-shim.d.ts` 局部声明——避免为一个只跑脚本的检查引入 `@types/node`
- 2026-11-14 CodeMirror 活动行背景必须保持半透明、选区层选择器带 `[data-theme]` 前缀——CM6 选区图层位于行元素之下，且 oneDark 的 `(0,5,0)` 需要更高特异性覆盖
- 2026-11-14 原生确认 `<dialog>` 每次 `showModal()` 前清空 `returnValue` 并以 submitter 捕获按钮值——HTMLDialogElement 会保留上次关闭状态
- 2026-11-14 三座模态框必须在 DOM 根部并列放置——嵌套在隐藏父级中的子对话框触发 `showModal` 会导致顶层遮罩捕获点击引发应用假死
- 2026-11-14 前端构建产物目录不得与 `mygo build` 的 embed 生成物同名——`mygo_frontend_gen.go` 与 `mygo_frontend/` 若已存在于包目录会直接报错，禁止手工放置同名文件
- 2026-11-14 Linux 上 `CGO_ENABLED=0 go test -race` 不可用（`-race` 需要 cgo），本机竞态验证以 `go test -race ./...` 执行，CI 仅跑 `go test ./...`
- 2026-11-14 NSIS 安装器由 MyGo 内置模板生成，卸载键为 `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\io.github.mado.editor`，安装目录 `%LOCALAPPDATA%\Programs\Mado`——CI 冒烟脚本按此断言文件、注册表与快捷方式清理

## 术语

- **lastfile** = 上次打开的文件路径，持久化于共享 `settings.json` 的 `lastfile` 字段；当前只写不读，为后续「恢复上次会话」预留
- **预览通道** = 编辑区 → `mdrender` → iframe 内原地更新（样式 + article，首帧 srcdoc 引导）+ 父侧链接拦截（锚点滚动/导航阻断）的渲染链路
- **公式通道** = Go 侧 math 扩展解析定界符输出带 `data-tex` 占位元素 → 前端父上下文 KaTeX `renderToString` 渲染 → 回填预览帧 DOM 的渲染管线
- **源行号锚点** = Go 渲染期写入顶层块元素的 `data-line`，值为该块在 Markdown 源码中的起始行号（1 起算）；预览侧由 CSS 生成行号栏，两侧点击互跳时作为共同坐标
- **行号栏（gutter）** = 编辑区 CodeMirror 行号槽与预览区由 `data-line` 生成的数字列，点击后把目标行在对方栏置顶
- **宿主桥接（bridge / host）** = `bridge.ts` 导出的单例宿主接口：MyGo 环境转调生成的 `mygo.ts` 客户端与 mygo-runtime，浏览器环境回退到内存实现与空操作
- **生成客户端（mygo.ts）** = `mygo generate` 依据 Go 导出服务与 `mygo.NewEvent` 声明产出的类型化 TypeScript 契约（`App` 与 `events`）
- **MD3 色调表面（Tonal Surface）** = 以 `surface-container-*` 色阶与圆角表达层级的深度模型，取代投影与毛玻璃
- **便携版 / 安装版** = 同一 Mado.exe 的两种分发形态；便携版手动放置并沿用 exe 同目录 `settings.json`，安装版由 MyGo 内置 NSIS 用户级安装到 `%LOCALAPPDATA%\Programs\Mado`，卸载时删除程序与偏好数据
- **窗口就绪显示（window ready）** = 窗口以 `Hidden: true` 创建，`main.ts` 在真实 UI、持久主题与页面 `load` 就绪后调用 `ShowWindow()` 显示；第一可见帧即完整界面，不经过启动骨架
- **previewStale** = 预览内容落后于当前文档的标记；Editor 模式空文档新建时置位，首次切到预览/分栏时触发一次补渲染并清除
- **tocDirty** = 目录抽屉折叠期间大纲结构已变化的标记；展开时重绘一次

## 维护

| 变更 | 同步章节 |
|---|---|
| 运行、测试方式或环境前提变化 | 环境与运行 |
| 依赖增删或升级 | 环境与运行；属关键选型时同步「约束与决策」 |
| 模块增删、重构，依赖方向变化 | 结构 |
| Go 导出方法增删（IPC 契约） | 结构（`mygo.ts`）；须重新 `mygo generate` 并同步 `bridge.ts` |
| 命名、语言、日志规范调整 | 约定 |
| 新坑、新约束、选型定型 | 约束与决策 |
| 新增项目特有名词 | 术语 |

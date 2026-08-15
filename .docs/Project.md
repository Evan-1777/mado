# Project

> **本文件是项目的「单一事实来源」**，供 AI Agent 动手前快速建立全局认知。
>
> - **维护原则**：代码库变更后必须同步本文件——对照 §0 维护速查判断要改哪节，而非凭感觉。
> - **边界**：项目定位与设计原则见 `SCOPE.md`，工作流规则见 `AGENTS.md`，本文件不重复，仅在需要处引用。
> - **填写约定**：带 `<!-- 待填 -->` 为占位项，写完即删注释；标 `（可选）` 的节若无内容请**整节删除**（勿留空节）；`★` 标记易错点。

## 0. 维护速查

> 代码库变更后，按下表定位需同步更新的章节。未列出的变更类型默认无需改本文件。

| 变更类型 | 需更新章节 |
|----------|-----------|
| 新增 / 升级 / 移除库依赖 | §2 环境与运行（属关键选型时另记 §8） |
| 新增 / 重构 / 删除模块 | §3 目录结构、§4 架构与数据流 |
| 调整命名 / 编码 / 日志规范 | §5 关键约定 |
| 踩到新坑或确立新约束 | §6 约束与已知坑 |
| 引入 / 切换 / 下线外部服务或脚本 | §7 外部依赖与集成 |
| 关键技术选型定型 | §8 决策记录 |
| 引入项目特有名词 | §9 术语表 |
| 运行 / 启动 / 测试方式变化 | §2 环境与运行 |

## 1. 概述

- **一句话定位**：本地运行的 Windows 原生 Markdown 查看器/编辑器，轻量低占用，编辑与渲染分离，默认支持 HTML 渲染。
- **当前阶段**：开发中（v1.4：Editor/Preview 聚焦模式多层目录侧栏完成，待 Windows 交互验收）
- **非目标（不做什么）**：见 SCOPE.md 设计原则；v1 不做多标签页、插件系统、导出 HTML/PDF、数学公式、Mermaid 图表。

## 2. 环境与运行

- **运行平台**：Windows 10/11（目标平台，依赖系统 Edge WebView2 Runtime）；**开发环境**：Linux x86_64（2026-08-15 迁移）
  - ★ 易错：路径含中文/空格须加引号；`%APPDATA%/Mado/` 为 Windows 状态目录，Linux 下 `os.UserConfigDir()` 解析到 `$XDG_CONFIG_HOME`/`~/.config`
- **Shell**：bash
- **版本管理**：git 仓库（main 分支，无分支策略）
- **语言 / 运行时**：Go 1.25.3（用户级安装于 `~/.local/go`，单版本，会话内 `export PATH=$HOME/.local/go/bin:$PATH`）；Node.js 24 + npm 11（前端构建）
- **依赖管理**：Go → `go.mod`/`go.sum`；前端 → `frontend/package.json` + `package-lock.json`（一律 npm，无 pnpm）
- **如何运行**：
  - 开发：`wails dev`（需 Windows/wails CLI，本机不做）
  - 打包：`wails build` → `build/bin/mado.exe`（云端 CI）
  - **本机验证链**（最小占用，产物均 gitignored）：
    1. `cd frontend && npm install --include=dev`（★ 本环境 `NODE_ENV=production` 且 `omit=dev`，不加 `--include=dev` 会跳过 esbuild）
    2. 零产物语法检查：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（stdout 丢弃；★ 必须带 `--loader:.css=empty`，否则 `import './style.css'` 直接报错，`--outfile=/dev/null` 会遗留字面文件 `nul.css`）
    3. `npm run build` 产出 `dist/`（go:embed 依赖，约 544K）
    4. `go vet ./...` + `go test ./...`
  - **云端 CI**：`.github/workflows/build.yml`（GitHub Actions windows-latest：setup-go 1.25 + Node 22（npm 缓存）+ wails CLI v2.14.0 → 前端 npm 构建 → `go test ./...` → `wails build` → 上传 `mado.exe` artifact）。**发布**：`.github/workflows/release.yml`（tag `v*` 推送或手动触发（可填版本号 input）→ 同一构建链 → 校验版本号格式 → `gh release create`）。验收以云端 workflow 结果为准
- **如何测试**：`go test ./...`（4 个包：filesys/mdrender/settings/theme）；无 GUI 测试框架，交互行为手动验证。★ 测试不污染真实配置目录：隔离用 `t.Setenv` 同设 `APPDATA` + `XDG_CONFIG_HOME`

## 3. 目录结构与模块职责

```
go.mod / go.sum          # Go 依赖（goldmark、wails v2、chroma 等）
main.go                  # Wails 入口：窗口配置（1280×800、Frameless、OnBeforeClose、拖放）
app.go                   # App 绑定对象：LoadFile/SaveFile/Render/GetWelcome/GetCSS/GetSettings/SetTheme 等
wails.json               # Wails 项目配置（frontend:dir、install/build 命令）
internal/filesys/        # 文件读写 + lastfile 持久化（与 settings 共享 %APPDATA%/Mado/settings.json）
internal/mdrender/       # goldmark 渲染：GFM + typographer + HTML(Unsafe) + script 剥离 + Chroma 高亮
internal/settings/       # 主题等用户偏好持久化（共享同一 JSON 文件，顶层字段互不干扰）
internal/theme/          # 亮/暗设计令牌 CSS，go:embed 内嵌（assets/theme/{tokens-dark,tokens-light,base}.css）
frontend/                # 前端：src/main.ts + src/style.css + index.html；构建产物 dist/（app.js/app.css/index.html）
frontend/wailsjs/        # Wails 自动生成的前端绑定（go/main/App.js 等，构建时生成，勿手改）
frontend/dist/           # 构建产物，go:embed 嵌入 exe（FS 根即 dist 内容；gitignored）
build/bin/mado.exe       # 打包输出（~15.6MB）
docs/                    # 用户文档
```

## 4. 架构与数据流

- **核心模块**：
  - `app.go`（App 绑定）→ 前端唯一入口，聚合 filesys/mdrender/settings/theme
  - `mdrender.Render(md) → safe HTML`（script 已剥离）
  - `theme.ThemeCSS(t) → 组合预览 CSS`（tokens + base + theme 特化）
- **数据流**：
  - 启动：main.go 解析 os.Args（Windows「打开方式」以 `mado.exe "%1"` 启动）→ `startupFile` 字段 → 前端 `GetStartupFile()` 优先加载启动文件，否则回退 `GetWelcome`（lastfile 或欢迎文档）
  - 编辑：CodeMirror updateListener（100ms debounce + 80ms 节流）→ `Render(md)` + `GetCSS()`（Promise.all）→ 预览更新：首帧用 srcdoc 写骨架（`<style>` + `<article id="md-content">`），后续仅在 iframe 内原地替换 style 文本与 article innerHTML（★ 禁止重设 srcdoc：会整页重载，预览闪烁且滚动回到顶部）；帧内链接（目录锚点等）由父侧 click 拦截——fragment 链接 preventDefault 后先 `decodeURIComponent`（失败则保留原值），再 getElementById → scrollIntoView，其余链接仅阻断，帧内永不发生导航；监听器挂于帧 document，帧 load 时重挂（srcdoc 重建后自动恢复）
  - 聚焦模式目录：前端在每次成功渲染后从 Markdown ATX 标题构建树（跳过 fenced code），记录标题层级、原文行号与渲染序号；共享侧栏仅在 `editor-only` / `preview-only` 模式显示，默认全部折叠，可逐节点或一键全部展开；侧栏可整栏折叠为 26px 窄条（点击恢复），折叠态悬停窄条浮出同构目录弹层（点击项跳转并收起），Editor/Preview 切换后折叠状态保留；Editor 点击项通过 CodeMirror 行定位并聚焦，Preview 点击项按 iframe 内标题序号 `scrollIntoView`，Split 模式不占空间
  - 脏标记：`dirty` 状态变化（编辑/保存/加载/新建）时前端通过 `SetDirty(bool)` 同步到 Go 侧 App 实例，仅状态翻转时发送（edge-triggered，避免每击键 IPC）
  - 关闭（双路径统一）：自定义关闭钮 → 前端 `requestClose()`（非 dirty 直接 `ForceQuit`）；Alt+F4/任务栏 → Go `OnBeforeClose`（dirty 且未 quitting 时 emit `request-close` 阻止关闭）。前端 `handleCloseFlow()`（`closePending` guard 防重入）弹应用内 `<dialog id="close-dialog">` 三键模态（是/否/取消，Esc=取消，`askUnsaved()` 返回 Promise）→「是」保存（无路径先 `SaveFileDialog` 另存）后 `ForceQuit`；「否」直接 `ForceQuit`；取消不动。新建文件流程的 `confirmDiscard()` 复用同一模态。`quitting` 标志防 OnBeforeClose 二次拦截
  - 保存：`Ctrl+S` → `SaveFile(path, content)` → 写盘 + SetLastFile + 窗口标题联动；未命名文档弹 `SaveFileDialog` 另存
- **模块依赖**：
  - `internal/*` 禁止互相依赖（filesys/settings 仅通过共享 JSON 文件松耦合，禁止 import 对方）
  - `main.go`/`app.go` 是唯一允许 import internal 的包
  - 前端 import `frontend/wailsjs/` 生成的绑定，禁直接调用原生 API
  - ★ 易错：mdrender/theme/filesys 是纯 Go，测试不依赖 GUI，可在无头环境跑

## 5. 关键约定

- **命名约定**：Go 标准（导出驼峰）；前端 TS 驼峰；CSS 类名 kebab-case；internal 包名与目录一致
- **注释 / 文档语言**：用户面（README、欢迎文档、对话）中文；代码注释英文
- **错误处理 / 日志方式**：绑定方法返回 error 由前端捕获；`println` 仅用于 main.go 启动失败（Wails 无日志框架，遵循模板）

## 6. 约束与已知坑

- 「开发环境 2026-08-15 迁移至 Linux x86_64，前端包管理一律 npm，Go 1.25.3 用户级安装于 `~/.local/go`——原因：新环境无 pnpm；wails 全量构建仍由云端 CI 负责，本机仅 vet/test + esbuild 语法检查 + npm run build 产 dist（go:embed 依赖）」
- 「本环境 `NODE_ENV=production` 且 npm `omit=dev`——原因：esbuild 是 devDependency，安装必须 `npm install --include=dev`，否则被静默跳过」
- 「Windows 构建产物验收在云端——原因：SCOPE 约定不占用本机空间做全量构建，CI workflow 产出 exe artifact，由用户在云端触发并下载验收；本机验证限于 go vet/test、零产物 esbuild 语法检查与 npm run build（产物 gitignored）」
- 「wailsjs 生成绑定需与 Go 导出方法同步——原因：`frontend/wailsjs/` 在 `wails dev/build` 时自动重新生成覆盖，但仓库内提交的副本用于本地 esbuild 语法检查；新增 Go 绑定方法（如 SetDirty）时必须同步手补 App.js/App.d.ts 以便本地验证，CI 生成版本以 Go 为准」
- 「`frontend/dist/` 是 go:embed 的 FS 根——原因：`main.go` 用 `//go:embed all:frontend/dist`，HTML 内引用资源必须写 `./app.js`/`./app.css` 而非 `./dist/app.js`」——此为 v1 打包期真实踩坑，修复后写死约定
- 「`frontend/wailsjs/` 由 wails 自动生成，禁止手改——原因：每次 wails dev/build 会重新生成覆盖」
- 「`frontend/dist/` 构建产物禁止提交——原因：每次 npm run build 全量重建，且 go:embed 编译时读取」
- 「goldmark 引擎在 Render 中每次新建——原因：goldmark 实例非并发安全，创建成本 <10µs 可忽略」
- 「mdrender 剥离 `<script>` 标签但保留内联 on* 事件——原因：典型 Markdown 文档不含内联事件，过度过滤会破坏合法 HTML（如 `<div onclick>` 场景罕见）；已知限制，暂不处理」
- 「srcdoc 重建会重置滚动并闪烁——原因：重设 iframe.srcdoc = 整页重新导航，加载完成后滚动位置归零且重建期间白闪；编辑渲染必须走 iframe 内原地更新（换 style 文本 + article innerHTML），srcdoc 仅用于首帧骨架与异常回退（Edge 151 无头实测：原地更新 scrollTop 保留，srcdoc 重载归零）」
- 「srcdoc iframe 内点击锚点链接（目录/TOC）会黑屏或无响应——原因：Chromium 把 `about:srcdoc#fragment` 当作新的 iframe 导航而非同文档锚点滚动，帧文档会被替换；即使阻断导航，goldmark 仍会将中文 href fragment 百分号编码，而标题 DOM id 保持 Unicode，直接 `getElementById(href.slice(1))` 查不到。修复：父侧拦截帧内 click（sandbox 无 allow-scripts 帧内无法自理，allow-same-origin 允许跨帧 DOM），所有链接 preventDefault；fragment 先 `decodeURIComponent`（畸形编码回退原值）再 getElementById + scrollIntoView；★ 帧内事件 target 不能 `instanceof Element`（跨 realm），须用 closest」
- 「多实例限制：应用已运行时再双击关联文件会启动第二个实例——原因：Wails v2 默认多实例，未启用 SingleInstance；v1.2 已知限制，待后续需要时启用 SingleInstance + OnSecondInstanceLaunch 传递路径」
- 「关闭确认由前端统一处理而非 Go 同步回调——原因：保存需要编辑器内容（仅前端 CodeMirror 持有），`OnBeforeClose` 是同步回调无法等待前端异步保存；因此 Go 侧 dirty 时仅 emit `request-close` 事件并阻止关闭，决策权交给前端」
- 「Windows 下 `runtime.MessageDialog` 忽略 `Buttons` 自定义标签且返回英文规范串——原因：wails v2.14 Windows 实现用 `MessageBoxW`，`QuestionDialog` 恒为 MB_YESNO（系统本地化显示“是/否”），返回值映射为英文 `"Yes"/"No"`；曾以中文标签匹配导致点击无响应（恒落 cancel）。禁止在 Windows 依赖自定义按钮/取消键语义；需三态确认时用前端 `<dialog>` 模态（关闭/新建流程已切换，`closePending` guard 防重入）」
- 「goldmark v1.8.5 无 `extra.WithIDGenerator`/`parser.WithIDGenerator`——原因：v2 才有；自定义 id 生成器需实现 `parser.IDs` 接口（Generate + Put）并通过 `parser.WithIDs` 注入 `parser.NewContext`，再以 `parser.WithContext` 传给 Convert；v1 的 `{#custom}` 显式 id 语法需全局开启 attribute 解析（会改变段落/强调渲染），未启用，文档中 `{#id}` 会被当作普通文本」
- 「`os.UserConfigDir()` 平台差异：Windows 读 `APPDATA`，Linux 读 `XDG_CONFIG_HOME`（回退 `~/.config`）——原因：测试若只重写 `APPDATA`，Linux 上会读写真实 `~/.config/Mado/` 并在用例间泄漏状态（曾致 TestGetLastFileFirstRun 失败）；测试隔离须 `t.Setenv` 同设两者（见 filesys/settings 测试）」

## 7. 外部依赖与集成

- **运行时依赖**：系统 Edge WebView2 Runtime（Wails 硬依赖，Windows 10/11 自带；目标平台）
- **本地工具**：`go`（`~/.local/go/bin`，用户级）；`npm` → 前端依赖管理；`esbuild` → 前端打包（frontend/node_modules 内，无需全局装）；wails CLI 仅云端 CI 使用

## 8. 决策记录

- 2026-08-14 选 Wails v2 而非 Tauri——理由：SCOPE 禁 Rust 本机编译，Go 本机已装且性能/体积满足轻量诉求
- 2026-08-14 选 goldmark（CommonMark+GFM+typographer）而非 comrak/markdown-it——理由：Go 原生零跨语言开销，性能强
- 2026-08-14 选 vanilla TS 而非框架——理由：单视图双栏状态简单，零运行时开销
- 2026-08-14 HTML 默认渲染 + script 剥离而非全禁——理由：满足「默认支持 HTML 渲染」需求，剥离 script 阻断 XSS
- 2026-08-14 选 CodeMirror 6 而非 Monaco——理由：Monaco 200KB+ 过重，cm6 增量解析且专业级
- 2026-08-14 选 iframe+srcdoc 首帧骨架 + 内原地更新而非 document.write——理由：隔离 CSS、防弹跳；首帧 srcdoc 引导，后续原地更新保留滚动、无闪烁（2026-08-15 修正：初始实现整体重设 srcdoc 导致编辑时预览闪烁跳顶，实测后改为原地更新，见 §6）
- 2026-08-15 预览锚点链接采用父侧 click 拦截 + URL fragment 解码 + scrollIntoView，而非帧内脚本或放宽 sandbox——理由：sandbox 无 allow-scripts 帧内脚本不可用，allow-same-origin 已允许跨帧 DOM；Chromium 对 about:srcdoc fragment 导航会替换帧文档致黑屏，且 goldmark 对中文 href fragment 百分号编码、标题 id 保持 Unicode，必须解码后才能命中；任何导航都毁掉原地更新模型，故外链一并阻断（外链用系统浏览器打开需新增 Go 绑定，非本 bug 范围，未做）
- 2026-08-18 Editor/Preview 聚焦模式目录采用前端共享树组件与 Markdown ATX 轻量解析，而非新增 Go API 或依赖——理由：原文行号只存在于编辑端，前端一次解析可同时服务 CodeMirror 行定位和 iframe 标题序号定位；功能局限在聚焦模式，Split 布局无需改动
- 2026-08-16 标题 id 采用 GitHub 风格 slug 生成器（中文保留、ASCII 小写、空白转 `-`、全角标点删除、重复加 `-N`）而非 goldmark 内置生成器——理由：内置 `ids.Generate` 丢弃全部非 ASCII，中文标题 id 退化，目录链接（如 `#一先搞清楚-wsl-是什么`）永远查不到；实测 GitHub 对 `动手学深度学习（Dive into Deep Learning，D2L.ai）` 生成 `动手学深度学习dive-into-deep-learningd2lai`，规则与用户手写目录格式一致；纯 ASCII 标题在新旧规则下产物相同，无兼容性变化
- 2026-08-15 测试配置目录隔离采用 t.Setenv 同设 APPDATA + XDG_CONFIG_HOME 而非仅重写 APPDATA——理由：os.UserConfigDir 跨平台读取不同环境变量，双设一处覆盖两端，避免 Linux 上测试污染真实 ~/.config
- 2026-08-15 包管理器 pnpm → npm（本地与 CI 一致切换）——理由：新开发环境无 pnpm，统一链路避免双锁文件漂移
- 2026-08-14 关闭确认采用「Go emit request-close → 前端统一处理」而非 Go 同步弹窗——理由：保存需编辑器内容（仅前端持有），旧双弹窗链路（QuitApp→Quit→OnBeforeClose→quitConfirm 二次弹窗且默认取消）导致「点确认关不掉」
- 2026-08-15 关闭确认改用前端原生 `<dialog>` 模态（`askUnsaved()`）而非修复 Go 侧英文返回值映射——理由：wails v2 Windows `MessageDialog` 恒为 MB_YESNO 两键（无取消/X/Esc，误触关闭只能存或丢，有数据丢失风险）且返回英文串曾致中文匹配失效；`<dialog>` 在 WebView2 原生支持 Esc/焦点囚禁/顶层叠放，三态完整，新建流程复用同一组件
- 2026-08-14 Go 侧防抖合并（100ms debounce + 80ms 节流）而非前端逐击解析——理由：打字高峰帧率平稳
- 2026-08-14 字体用本地栈（Cascadia Code/Consolas）而非网络字体——理由：离线可用、无 FOUT

## 9. 术语表

- **lastfile** = 上次打开的文件路径，持久化于共享 settings.json 的 `lastfile` 字段
- **欢迎文档** = 首次启动时自动写入 `%APPDATA%/Mado/welcome.md` 的默认演示文档
- **预览通道** = 编辑区 → mdrender → iframe 内原地更新（style + article，首帧 srcdoc 引导）+ 父侧链接拦截（锚点滚动/导航阻断）的渲染链路

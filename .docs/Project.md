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
- **当前阶段**：开发中（v1.8：09-08-v1 遗留问题修复完成，待 Windows 交互验收）
- **非目标（不做什么）**：见 SCOPE.md 设计原则；v1 不做多标签页、插件系统、导出 HTML/PDF、Mermaid 图表。

## 2. 环境与运行

- **运行平台**：Windows 10/11（目标平台，依赖系统 Edge WebView2 Runtime）；**开发环境**：Linux x86_64（2026-08-15 迁移）
  - ★ 易错：路径含中文/空格须加引号；`settings.json` 持久化于 exe 所在目录（便携化），`%APPDATA%/Mado/` 仅为旧配置的一次性迁移源目录，应用不再向其写入
- **Shell**：bash
- **版本管理**：git 仓库（main 分支，无分支策略）
- **语言 / 运行时**：Go 1.27.0（本机实测，`~/.local/go` 用户级单版本，会话内 `export PATH=$HOME/.local/go/bin:$PATH`；CI 用 `1.25.x`，`go.mod` 声明 `1.25.0`）；Node.js 24 + npm 11（前端构建）
- **依赖管理**：Go → `go.mod`/`go.sum`；前端 → `frontend/package.json` + `package-lock.json`（一律 npm，无 pnpm）
- **如何运行**：
  - 开发：`wails dev`（需 Windows/wails CLI，本机不做）
  - 打包：`wails build` → `build/bin/mado.exe`（云端 CI）
  - **本机验证链**（最小占用，产物均 gitignored）：
    1. `cd frontend && npm install --include=dev`（★ 本环境 `NODE_ENV=production` 且 `omit=dev`，不加 `--include=dev` 会跳过 esbuild）
    2. 零产物语法检查：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（stdout 丢弃；★ 必须带 `--loader:.css=empty`，否则 `import './style.css'` 直接报错，`--outfile=/dev/null` 会遗留字面文件 `nul.css`）
    3. `npm run build`（esbuild 后调用共享 `npm run copy-assets`）产出 `dist/`（go:embed 依赖；当前实测约 2.4MB，KaTeX 样式与 woff2 字体占大头）
    4. `go vet ./...` + `go test ./...`
  - **云端 CI**：`.github/workflows/build.yml`（GitHub Actions windows-latest：setup-go 1.25 + Node 22（npm 缓存）+ wails CLI v2.14.0 → 前端 npm 构建 → `go test ./...` → `wails build` → 上传 `mado.exe` artifact）。**发布**：`.github/workflows/release.yml`（tag `v*` 推送或手动触发（可填版本号 input）→ 同一构建链 → 校验版本号格式 → `gh release create`）。验收以云端 workflow 结果为准
- **如何测试**：`go test ./...`（5 个包/目录：根包/filesys/mdrender/settings/theme）；并发与竞态回归用 `go test -race ./...`；零依赖前端自检 `cd frontend && npm test`（依次跑 `tests/fontCommit.test.ts`、`tests/gutter.test.ts`、`tests/tocGutter.test.ts` 与 `tests/renderScheduler.test.ts`，Node 原生 type-stripping，无测试框架；CI 用 Node 22，需 ≥22.6）；dev-only 无头检查运行 `npm run build && node tests/modeScroll.check.mjs` 与 `node tests/startup.check.mjs`，可用 `CHROME_BIN` 覆盖浏览器路径，不接入 npm test/CI；无 GUI 测试框架，交互行为手动验证。★ 测试不污染真实环境：settings/filesys 经包级 `storePath` 变量覆写隔离到 `t.TempDir()`；根包（App 层）不覆写 `storePath`（它对 main 包不可见），保存失败场景改用 `App.saveSettings` 函数字段注入，启动副作用用例（`TestStartupCreatesNoWelcomeDoc`）用 `t.Setenv` 同设 `APPDATA` + `XDG_CONFIG_HOME` 隔离 `os.UserConfigDir()`；lastfile 失败路径由 `TestLastFileFailureIsBestEffort` 覆盖，目录映射由 `tests/tocGutter.test.ts` 覆盖。

## 3. 目录结构与模块职责

```
go.mod / go.sum          # Go 依赖（goldmark、wails v2、chroma 等）
main.go                  # Wails 入口：窗口配置（1280×800、Frameless、OnBeforeClose、前端拖放运行时开关）
main_test.go             # 根包测试：旧存储迁移、启动副作用、并发绑定与状态一致性
app.go                   # App 绑定对象：LoadFile/SaveFile/Render/GetCSS/GetSettings/SetTheme/SetWrap/SetMath/SetPreviewFont 等；读写锁守护设置/脏/退出状态
wails.json               # Wails 项目配置（frontend:dir、install/build 命令）
internal/filesys/        # 文件读写 + lastfile 只写记录（与 settings 共享 exe 目录下 settings.json；文档保存解析符号链接后在真实目标目录原子替换；无读取方，见 §9）
internal/mdrender/       # goldmark 渲染：GFM + typographer + HTML(Unsafe) + Chroma 高亮 + LaTeX 数学扩展（math.go，渲染器按引擎实例化）+ 源行号锚点（srcline.go）+ script/meta refresh 净化
internal/settings/       # 主题/自动换行/公式渲染偏好持久化（共享同一 JSON 文件，顶层字段互不干扰）
internal/theme/          # 亮/暗设计令牌 CSS，go:embed 内嵌（assets/theme/{tokens-dark,tokens-light,base}.css）
frontend/                # 前端：src/main.ts + src/renderScheduler.ts + src/fontCommit.ts + src/gutter.ts + src/style.css + scripts/copy-assets.mjs + index.html；tests/ 为 Node 原生自检与 dev-only 无头检查；构建产物 dist/（app.js/app.css/index.html/katex/，字体仅 woff2）
frontend/wailsjs/        # Wails 自动生成的前端绑定（go/main/App.js 等，构建时生成，勿手改）
frontend/dist/           # 构建产物，go:embed 嵌入 exe（FS 根即 dist 内容；gitignored）
build/bin/mado.exe       # 打包输出（云端 CI 产物，体积以实际为准）
docs/                    # 用户文档
```

## 4. 架构与数据流

- **核心模块**：
  - `app.go`（App 绑定）→ 前端唯一入口，聚合 filesys/mdrender/settings/theme
  - `mdrender.Render(md, math) → safe HTML`（script 已剥离，公式按开关渲染为占位元素或原样文本）
  - `theme.ThemeCSS(theme, font) → 组合预览 CSS`（tokens + `--preview-font` 字体变量声明 + base；字体名经 settings 校验并由 theme 层转义后注入，固定回退栈追加在后、以 `monospace` 收尾保证 code/kbd 首选字体缺失时不退到比例字体）
  - `app.persist(mutate)` → 偏好写入唯一通道：复制 settings → 副本上 mutate → 保存成功才赋回 `a.settings`；`SetTheme/SetWrap/SetMath/SetPreviewFont` 全部经此，窗口主题 chrome 也在保存成功并解锁后才切换；App 的 `sync.RWMutex` 守护设置、dirty 与 quitting，`Render/GetCSS/GetSettings` 在锁内取快照，`main.go` 通过 `shouldPreventClose()` 读取关闭快照，偏好与 lastfile 的共享 JSON 写入在同一进程内串行化；渲染调度器在 refresh Promise 完成前合并最新请求
- **数据流**：
  - 启动：main.go 解析 os.Args（Windows「打开方式」以 `mado.exe "%1"` 启动）→ `startupFile` 字段 → 前端 `GetStartupFile()` 有路径则 `LoadFile` 加载（读取失败回退空白态并提示 `Open failed`），无路径则直接走 `newFile()` 空白未命名态（与 Ctrl+N 同源）；初始化主题仅应用界面状态、不触发预览，加载/新建在清空旧 timer 并抑制文档监听副作用后显式渲染一次；`startup` 自动检查旧配置目录执行一次性迁移，除此之外启动全程只读，不创建用户配置目录（回归用例 `TestStartupCreatesNoWelcomeDoc`）
  - 编辑：CodeMirror updateListener（尾随 80ms 节流；pending timer 合并，程序性替换先 `cancel()`；refresh Promise 在途时只保留一个最新请求）→ `Render(md)` + `GetCSS()`（Promise.all）→ 预览更新：首帧用 srcdoc 写骨架（`<link katex>` + `<style>` + `<article id="md-content">`），后续仅在 iframe 内原地更新发生变化的 style 文本或 article innerHTML，并仅在 HTML 变化时调用 `renderMathInFrame` 进行父上下文 KaTeX 公式绘制（★ 禁止重设 srcdoc：会整页重载，预览闪烁且滚动回到顶部）；帧内链接（目录锚点等）由父侧 click 拦截——fragment 链接 preventDefault 后先 `decodeURIComponent`（失败则保留原值），再 getElementById → scrollIntoView，其余链接仅阻断，帧内永不发生导航；监听器挂于帧 document，帧 load 时重挂并重绘公式（srcdoc 重建后自动恢复）
  - 公式通道：Go 侧 `MathExtension` 识别 `$...$` 与 `$$...$$` 输出 `<span class="math-inline" data-tex="...">` 与 `<div class="math-block" data-tex="...">` 占位元素 → 前端父上下文 `renderMathInFrame` 遍历帧 DOM 元素并调用 `katex.renderToString` 原地回填公式 HTML，带 `Map` 渲染缓存
  - 设置与偏好：标题栏齿轮按钮唤出 `<dialog id="settings-dialog">` 设置模态；主题（深/浅双选）、自动换行（switch 开关）、公式渲染（switch 开关）、预览字体（text 输入，blur/Enter 提交）受控绑定，变更即时通过 `SetTheme`/`SetWrap`/`SetMath`/`SetPreviewFont` 落盘至 exe 目录 `settings.json` 并实时更新编辑器（CodeMirror Compartment 重配置）与预览区——字体提交经 `fontCommit.ts` 串行化（仅一个在途请求，序号守卫丢弃过期响应，Enter 后失焦同值去重）：四个 setter 在 Go 侧统一走 `persist`（先写副本、保存成功后才赋回 `a.settings`，保存失败不改内存，窗口主题 chrome 亦不切换），前端仅在成功时更新 `currentPreviewFont`、失效 `previewCss` 缓存并触发刷新；失败回填最近一次仍然有效的字体并在状态栏提示 `Preview font rejected`；重开设置模态由 `syncSettingsModalUI` 回填当前生效字体
  - **源行号栏与双向跳转**：`mdrender` 在渲染期用一个 goldmark ASTTransformer（`srcline.go`，优先级 1000，晚于 GFM 表格变换）给 Document 的每个直接子块写入 `data-line="N"`（该块在源码中的起始行号）——仅顶层块，避免列表项与父块数字堆叠；`data-` 前缀属性被 goldmark 的 `RenderAttributes` 无条件放行，无需动任何 AttributeFilter。围栏代码块的 `data-line` 落在 `highlighting.WithWrapperRenderer` 输出的包装层 `<div class="md-line">` 上（Chroma 的 `<pre>` 开标签不受控）；公式块由 `MathBlock.start`（解析期记录的 `$$` 行偏移）换算，在 `renderMathBlock` 手写输出。预览行号栏本身零 JS：帧内 `base.css` 用 `body.md-gutter #md-content > [data-line]::before { content: attr(data-line) }` 把数字画进 body 左内边距，随重排/换行/窗口缩放自动跟随，无需测高或 scroll 同步（规则必须在 theme 的 base.css，父窗口 CSS 管不到 iframe）；可见性由父侧 `syncGutterVisibility()` 切帧 body 的 `md-gutter` 类（预览列可见即显示：Split 与 Preview 单栏），三个调用点为 `writePreview` 末尾、帧 `load` 监听、模式按钮回调。点击互跳：Editor 侧监听 `cm.scrollDOM` 的 mousedown（★ 不能用 `EditorView.domEventHandlers`，它只挂 contentDOM），先按 x 判定落在 `.cm-gutters` 矩形内，再 `cm.posAtCoords` 取行号 → `scrollPreviewToLine` 用 `gutter.ts` 的 `pickBlockIndex`（二分）选中最后一个起始行 ≤ 目标行的块 → `scrollIntoView({block:'start'})`；Preview 侧在帧内 click 入口按 `e.clientX < 内容左边界` 判定命中行号栏，选第一个底边在指针下方的块 → `scrollEditorToLine` 用 `EditorView.scrollIntoView` effect 置顶。跳转只滚动，不改光标/选区/焦点
  - 聚焦模式目录：前端在每次成功渲染后从 Markdown ATX 标题构建多层大纲树（跳过 fenced code），记录标题层级与原文行号；采用无缩进 Flat 结构与六级颜色令牌（`--toc-h1`~`--toc-h6`），支持父节点独立折叠/展开；默认节点全部展开，顶部提供「全部展开/全部收起」动态切换按钮；侧栏默认收起（40px 紧凑导轨），点击展开至 256px；共享侧栏仅在 `editor-only` / `preview-only` 模式显示，通过标题签名与折叠状态映射比对实现增量过滤（无标题结构变化时零 DOM 重排，编辑时保留折叠状态），Split 模式下惰性跳过 DOM 生成，基于单一事件委托分别响应折叠切换与跳转；Editor 点击项通过 CodeMirror 行定位并聚焦，Preview 点击项按渲染块 `data-line` 定位并 `scrollIntoView`
  - 编辑器与模式：CodeMirror 扩展含 `lineNumbers()` + `codeFolding()`（无折叠箭头，折叠仅键盘 `foldKeymap`）——行号栏专用于跳转，不与折叠手势冲突；工具栏模式按钮顺序 Preview / Editor / Split，启动默认 Preview（`pane` 初始类 `pane preview-only`，与默认选中项一致）
  - 窗口全向缩放：前端构建 8 方向顶层透明把手（Fixed Overlay，z-index: 100000），通过 `Object.defineProperty` 冻结 Wails 内部 `enableResize` 冲突逻辑，直接响应 `mousedown` 并发送 `WailsInvoke("resize:" + edge)` 触发 Win32 原生边缘拖拽缩放；彻底杜绝 iframe 与编辑器原生滚动条对右侧及右下角事件的吞没；窗口最大化时把手自动隐藏
  - 脏标记：`dirty` 状态变化（编辑/保存/加载/新建）时前端通过 `SetDirty(bool)` 同步到 Go 侧 App 实例，仅状态翻转时发送（edge-triggered，避免每击键 IPC）
  - 关闭（双路径统一）：自定义关闭钮 → 前端 `requestClose()`（非 dirty 直接 `ForceQuit`）；Alt+F4/任务栏 → Go `OnBeforeClose`（dirty 且未 quitting 时 emit `request-close` 阻止关闭）。前端 `handleCloseFlow()`（`closePending` guard 防重入）弹应用内 `<dialog id="close-dialog">` 三键模态（是/否/取消，Esc=取消，`askUnsaved()` 返回 Promise）→「是」保存（无路径先 `SaveFileDialog` 另存）后 `ForceQuit`；「否」直接 `ForceQuit`；取消不动。新建文件流程的 `confirmDiscard()` 复用同一模态。`quitting` 标志防 OnBeforeClose 二次拦截
  - 拖放：`main.go` 通过 `DragAndDrop.EnableFileDrop` 开启文件路径事件，前端以 `OnFileDrop(onDrop, false)` 接收全窗口拖放；回调筛选 Markdown 文件，打开与拖放统一进入 `openPath()`，先复用 `confirmDiscard()` 再读取，读取失败统一捕获并提示 `Open failed`
  - 保存：`Ctrl+S` → `SaveFile(path, content)` → 同目录临时文件写入、继承原权限、`Sync()`、关闭后改名替换，再 best-effort `SetLastFile` 与窗口标题联动；未命名文档弹 `SaveFileDialog` 另存
- **模块依赖**：
  - `internal/*` 禁止互相依赖（filesys/settings 仅通过共享 JSON 文件松耦合，禁止 import 对方）
  - `main.go`/`app.go` 是唯一允许 import internal 的包
  - 前端 import `frontend/wailsjs/` 生成的绑定，禁直接调用原生 API
  - ★ 易错：mdrender/theme/filesys/settings 是纯 Go，测试不依赖 GUI，可在无头环境跑

## 5. 关键约定

- **命名约定**：Go 标准（导出驼峰）；前端 TS 驼峰；CSS 类名 kebab-case；internal 包名与目录一致
- **注释 / 文档语言**：用户面（README、对话）中文；代码注释英文
- **错误处理 / 日志方式**：绑定方法返回 error 由前端捕获；`println` 仅用于 main.go 启动失败（Wails 无日志框架，遵循模板）

## 6. 约束与已知坑

- 「开发环境 2026-08-15 迁移至 Linux x86_64，前端包管理一律 npm，Go 1.27.0 用户级安装于 `~/.local/go`——原因：新环境无 pnpm；wails 全量构建仍由云端 CI 负责，本机仅 vet/test + esbuild 语法检查 + npm run build 产 dist（go:embed 依赖）」
- 「本环境 `NODE_ENV=production` 且 npm `omit=dev`——原因：esbuild 是 devDependency，安装必须 `npm install --include=dev`，否则被静默跳过」
- 「Windows 构建产物验收在云端——原因：SCOPE 约定不占用本机空间做全量构建，CI workflow 产出 exe artifact，由用户在云端触发并下载验收；本机验证限于 go vet/test、零产物 esbuild 语法检查与 npm run build（产物 gitignored）」
- 「wailsjs 生成绑定需与 Go 导出方法同步——原因：`frontend/wailsjs/` 在 `wails dev/build` 时自动重新生成覆盖，但仓库内提交的副本用于本地 esbuild 语法检查；新增 Go 绑定方法（如 SetDirty）时必须同步手补 App.js/App.d.ts 以便本地验证，CI 生成版本以 Go 为准」
- 「`frontend/dist/` 是 go:embed 的 FS 根——原因：`main.go` 用 `//go:embed all:frontend/dist`，HTML 内引用资源必须写 `./app.js`/`./app.css` 而非 `./dist/app.js`」——此为 v1 打包期真实踩坑，修复后写死约定
- 「`frontend/wailsjs/` 由 wails 自动生成，禁止手改——原因：每次 wails dev/build 会重新生成覆盖」
- 「`frontend/dist/` 构建产物禁止提交——原因：每次 npm run build 全量重建，且 go:embed 编译时读取」
- 「goldmark 引擎在 Render 中每次新建，数学扩展的 parser/renderer 也按引擎实例化——原因：goldmark 与 renderer 的初始化状态不可跨并发调用共享；创建成本低于引入全局锁，保证 Wails 并发 Render 不产生数据竞争」
- 「mdrender 剥离 `<script>` 标签但保留内联 on* 事件——原因：典型 Markdown 文档不含内联事件，过度过滤会破坏合法 HTML（如 `<div onclick>` 场景罕见）；已知限制，暂不处理」
- 「srcdoc 重建会重置滚动并闪烁——原因：重设 iframe.srcdoc = 整页重新导航，加载完成后滚动位置归零且重建期间白闪；编辑渲染必须走 iframe 内原地更新（换 style 文本 + article innerHTML），srcdoc 仅用于首帧骨架与异常回退（Edge 151 无头实测：原地更新 scrollTop 保留，srcdoc 重载归零）」
- 「模式切换隐藏预览列（`display: none`）会重置 iframe 文档滚动——原因：display:none 销毁 iframe 视口，`scrollingElement.scrollTop` 立即归零且隐藏状态下写回被钳制为 0 无效；而普通 overflow 容器（编辑器 `.cm-scroller`）在同样的显隐往返中原样保留偏移，造成"editor 不丢、preview 丢"。修复：模式切换 handler 在改类前捕获 `scrollTop`，类切换完成、预览列重新显示后再写回并清空（2026-08-31 修复）」
- 「模式切换写回与平滑跳转/编辑刷新存在极窄竞态窗口（已知限制）——原因：TOC/行号跳转的 `scrollIntoView({behavior:'smooth'})` 动画与编辑后尾随 80ms 节流在途刷新（异常回退走 srcdoc 整页重建、加载完成滚动归零）都可能在写回之后继续改变 scrollTop；触发需「跳转/编辑后数百 ms 内切模式 + 恰逢重建」叠加，普通原地更新路径浏览器天然保留偏移、写回无害，2026-09-02 评估后接受不治本。若将来需要：写回推迟到下一帧（rAF）并在写入前校验文档版本」
- 「srcdoc iframe 内点击锚点链接（目录/TOC）会黑屏或无响应——原因：Chromium 把 `about:srcdoc#fragment` 当作新的 iframe 导航而非同文档锚点滚动，帧文档会被替换；即使阻断导航，goldmark 仍会将中文 href fragment 百分号编码，而标题 DOM id 保持 Unicode，直接 `getElementById(href.slice(1))` 查不到。修复：父侧拦截帧内 click（sandbox 无 allow-scripts 帧内无法自理，allow-same-origin 允许跨帧 DOM），所有链接 preventDefault；fragment 先 `decodeURIComponent`（畸形编码回退原值）再 getElementById + scrollIntoView；★ 帧内事件 target 不能 `instanceof Element`（跨 realm），须用 closest」
- 「Wails v2 Windows 无边框窗口右/下边缘无法缩放——原因：1. Wails 内置 JS 用 `outerWidth` 判定边缘在 WebView2 下受不可见边框偏差影响恒不成立且会重置光标；2. 右侧与右下角存在 iframe/编辑器原生滚动条（15~17px），Chromium 滚动条不向 DOM 分发事件并在近边缘时触发 mouseleave，使纯坐标计算检测失效。修复：通过 `Object.defineProperty` 永久锁定 `window.wails.flags.enableResize = false`，并在顶层 DOM 挂载 8 方向固定把手层（`z-index: 100000`），四角 10px / 四边 6px 穿透覆盖滚动条，`mousedown` 直接 `WailsInvoke("resize:" + edge)`，最大化状态下自适应隐藏（2026-08-18 深度修复）」
- 「多实例限制：应用已运行时再双击关联文件会启动第二个实例——原因：Wails v2 默认多实例，未启用 SingleInstance；已知限制，待后续需要时启用 SingleInstance + OnSecondInstanceLaunch 传递路径」
- 「关闭确认由前端统一处理而非 Go 同步回调——原因：保存需要编辑器内容（仅前端 CodeMirror 持有），`OnBeforeClose` 是同步回调无法等待前端异步保存；因此 Go 侧 dirty 时仅 emit `request-close` 事件并阻止关闭，决策权交给前端」
- 「Windows 下 `runtime.MessageDialog` 忽略 `Buttons` 自定义标签且返回英文规范串——原因：wails v2.14 Windows 实现用 `MessageBoxW`，`QuestionDialog` 恒为 MB_YESNO（系统本地化显示“是/否”），返回值映射为英文 `"Yes"/"No"`；曾以中文标签匹配导致点击无响应（恒落 cancel）。禁止在 Windows 依赖自定义按钮/取消键语义；需三态确认时用前端 `<dialog>` 模态（关闭/新建流程已切换，`closePending` guard 防重入）」
- 「goldmark v1.8.5 无 `extra.WithIDGenerator`/`parser.WithIDGenerator`——原因：v2 才有；自定义 id 生成器需实现 `parser.IDs` 接口（Generate + Put）并通过 `parser.WithIDs` 注入 `parser.NewContext`，再以 `parser.WithContext` 传给 Convert；v1 的 `{#custom}` 显式 id 语法需全局开启 attribute 解析（会改变段落/强调渲染），未启用，文档中 `{#id}` 会被当作普通文本」
- 「目录解析曾因 `split('\\n')` 字面量反斜杠导致整文档被当单行，正则 `\\s` 同理匹配字面量反斜杠+s——均于 2026-08-16 修复为 `split('\n')` 与 `\s`（commit 2e51927 / 731b3fb）」
- 「`os.UserConfigDir()` 平台差异：Windows 读 `APPDATA`，Linux 读 `XDG_CONFIG_HOME`（回退 `~/.config`）——原因：测试若只重写 `APPDATA`，Linux 上会读写真实 `~/.config/Mado/` 并在用例间泄漏状态（曾致 filesys 首启用例在用例间串状态而失败）；测试隔离须 `t.Setenv` 同设两者——filesys 包在该机制退役后已无需此隔离，现用于根包启动副作用用例」
- 「偏好持久化便携化：共享 settings.json 迁移至 exe 所在目录——原因：便携化需求；启动时若 exe 目录无 settings.json 则单次从旧 APPDATA 位置迁移；若 exe 部署于受写保护目录则持久化不可写为已知限制」
- 「原生 `<dialog>` 必须在 DOM 根部并列放置，禁止嵌套——原因：嵌套在未打开的 `<dialog>` 内的子对话框在 `showModal()` 时，虽然挂入 top layer 但受父级 `display: none` 与渲染流约束不可见，同时激活动态遮罩捕获所有点击，导致应用假死（2026-08-19 修复）」
- 「goldmark 块级公式解析器必须跟踪单行闭合状态（`closed: true`）并在 `Continue` 中直接 `Close`，且剥离尾随空白符——原因：goldmark 的 `Open` 返回节点后仍会在下一行调用该解析器的 `Continue`，若未记录单行闭合状态，后续行会被当作公式块内容继续追加，导致单行公式吞没全文后续 Markdown 内容（2026-08-19 修复）」
- 「KaTeX 静态资源经 Wails 资产服务相对路径加载——原因：srcdoc 帧内以 `<link rel="stylesheet" href="./katex/katex.min.css"/>` 引入样式与字体，继承父文档 baseURL」
- 「`$` 行内公式首尾空格启发式与货币误判防护——原因：`$5 and $10` 首尾含空格或未闭合不构成公式，直接退化为字面文本」
- 「行内公式不支持跨行——原因：语法边界清晰、避免未闭合 `$` 跨段污染渲染」
- 「Preview 字体名注入 CSS 前必须经过 settings.NormalizePreviewFont + theme.cssFontDecl 双重防线——原因：字体名会进入 CSS 变量声明，控制字符/引号/反斜杠/分号/注释符等可逃逸字符串上下文；校验失败时前端回填上一次有效值，不改变后端状态（2026-08-24）。★ 两道防线职责不同：settings 层是唯一拒绝点（返回 error），theme 层无错误路径、只做中和（转义 `\` 与 `"`、丢弃 NUL/CR/LF/FF）——CSS 字符串不允许裸换行，保留它会让该声明退化并使其后内容重新按规则解析」
- 「`--preview-font` 回退栈以 `sans-serif, monospace` 收尾——原因：code/kbd 与正文共用该变量，首选字体缺失时若只以 `sans-serif` 收尾，行内代码会退到比例字体；正文始终先命中 `sans-serif` 通用族，不会落到 `monospace`」
- 「偏好保存失败场景的测试用 `App.saveSettings` 函数字段注入，不得用目录占位 `settings.Path()` 的方式——原因：main 包无法覆写 settings 包未导出的 `storePath`，占位法作用于 `os.Executable()` 同目录；`go test` 下该目录是 `/tmp/go-build*` 侥幸安全，但 `go test -c` 产出的二进制从含 settings.json 的目录运行会直接删除真实配置」
- 「源行号锚点只覆盖 Document 的直接子块，缩进代码块与原始 HTML 块无锚点——原因：goldmark 这两类渲染器忽略节点属性；表现是该块处不显示行号，跳转回退到最近的前序锚点（已知限制）」
- 「跳转粒度是渲染块而非单行——原因：行号只标在顶层块上，多行块内部的行只能把整块置顶（映射粒度固有限制）」
- 「★ 编辑器行号槽的事件必须监听 `cm.scrollDOM`，不能用 `EditorView.domEventHandlers`——原因：后者只挂 `contentDOM`，而 `.cm-gutters` 是它的兄弟节点，行号槽的 mousedown 到不了那里（判定顺序：button≠0 先返回 → x 落在 `.cm-gutters` 矩形外返回 → `posAtCoords` 为 null 返回）」
- 「围栏代码块的 `data-line` 落在包装层 `<div class="md-line">` 上而非 `<pre>`；★ 禁止改用 `chromahtml.PreventSurroundingPre(true)` 自写 `<pre>`——原因：Chroma 的 `<pre>` 开标签不受我们控制，包装层是唯一注入点；而该开关会连带删除行包装 span `<span class="line"><span class="cl">` 并使 `hl_lines`/`linenos` 渲染路径整体失效，Chroma 输出无法保持零变化」
- 「变换器标注围栏块前必须合并 info 串 `{...}` 属性——原因：goldmark-highlighting 的 `getAttributes` 在节点已有属性时完全跳过 info 串解析，先写 `data-line` 会静默丢弃 `{nohl=true}`/`{style=...}`；合并用 goldmark 导出的 `parser.ParseAttributes`，并与上游一致地要求 `{` 下标 > 0」
- 「★ 启用 `highlighting.WithWrapperRenderer` 后，未被 Chroma 高亮的围栏块（无词法分析器或 `{nohl=true}`）的 `<pre><code>` 由包装渲染器补齐，否则代码行会以裸文本直出——原因：上游 `renderFencedCodeBlock` 只在 `WrapperRenderer == nil` 时才写 `<pre><code`，高亮分支由 Chroma 自带 preWrapper 输出；包装渲染器须自行补齐（进出两次调用收到同一个 `CodeBlockContext` 实例，退出时用 `!c.Highlighted()` 判定即可，不要用包级状态记录当前块）」
- 「预览行号栏的 CSS 规则必须写在 `internal/theme/assets/theme/base.css`——原因：行号画在 iframe 文档内，`frontend/src/style.css` 只作用于父窗口；数字落在 body 左内边距（2.75rem）中，4 位以上行号仅视觉溢出，不影响布局」
- 「跨语言常量需成对维护并加联动注释——原因：Go `settings.MaxPreviewFontLen`（按字节）对应 index.html `maxlength="100"`（按 UTF-16 单位），Go `settings.DefaultPreviewFont` 对应 main.ts `DEFAULT_PREVIEW_FONT`；二者无法自动联动，非 BMP 字符的字体名会先撞 Go 的字节上限（仅拒绝该值，无副作用）」

- 「文档保存采用同目录临时文件 + 原文件权限 + `Sync()` + `Rename` 的最佳努力替换，并先解析符号链接真实目标」——原因：写入、刷盘或改名失败时清理临时文件并保留旧目标，保存链接不会把链接替换成普通文件；目标目录必须具备创建/改名权限，权限不足时保持失败而不回退到截断覆写；不宣称 Windows 与底层文件系统具备跨平台绝对断电原子性
- 「App 绑定状态由单一 `sync.RWMutex` 守护，关闭回调只能调用 `shouldPreventClose()` 快照，共享 JSON 的 settings/lastfile 写路径在进程内串行化」——原因：Wails 绑定运行在独立 goroutine；跨进程多实例竞争仍是已接受边界
- 「渲染输出剥离 `http-equiv` 值为 refresh 的 meta 标签」——原因：sandbox 允许帧自导航，meta refresh 不经过父侧 click 拦截；净化器按引号边界识别完整标签，保留 `refresh-policy` 与代码块中的转义文本
- 「打开与拖放统一经 `openPath()`，未保存确认发生在 `LoadFile` 之前；读取失败由状态栏显示 `Open failed`」——原因：避免取消确认后标题/lastfile 已产生副作用，并消除拖放 Promise rejection 静默失败；选中文件后先弹确认再暴露读取错误是已接受取舍
- 「KaTeX 构建产物仅复制源目录中的 `.woff2`，复制前清空目标字体目录并按源目录动态对照」——原因：WebView2/Chromium 使用 woff2，删除 ttf/woff 减少嵌入体积，动态对照避免绑定 KaTeX 补丁版本
- 「安全审查接受内联 on* 与 `javascript:` 链接由 sandbox + 父侧全链接拦截双重阻断；远程图片/追踪像素与 `<base href>` 保持默认 HTML 语义；settings.json 非原子写失败回退默认值；跨进程多实例共享配置竞争不处理」——原因：CSP 或额外 HTML 过滤会破坏默认 HTML/远程图片语义，相关治理超出本阶段边界

- 「原生确认 dialog 每次 `showModal()` 前清空 `returnValue`，按钮结果读取 `form submitter.value`，`cancel/close` 处理非按钮关闭」——原因：HTMLDialogElement 会保留上一次关闭结果，取消后的陈旧值会污染下一次打开/拖放确认；提交事件不依赖无头环境的 close 事件时序
- 「前端 build/dev 通过 `scripts/copy-assets.mjs` 共享 index、KaTeX CSS 与 woff2 复制逻辑」——原因：两条入口必须对称创建可运行的 dist 资源，删除重复内联命令以避免资产清单漂移
- 「渲染调度器以 refresh Promise settle 作为尾随请求释放点」——原因：长文档渲染期间只保留最新请求，避免后端继续执行已过期 AST 工作；已开始的 Promise 不伪造取消，仍由 renderVersion 丢弃过期结果

## 7. 外部依赖与集成

- **运行时依赖**：系统 Edge WebView2 Runtime（Wails 硬依赖，Windows 10/11 自带；目标平台）
- **本地工具**：`go`（`~/.local/go/bin`，用户级）；`npm` → 前端依赖管理；`esbuild` → 前端打包（frontend/node_modules 内，无需全局装）；wails CLI 仅云端 CI 使用

## 8. 决策记录

- 2026-09-08 针对 09-08-v1 审计遗留问题采用最短结构修复：meta refresh 在完整标签内按引号状态解析属性并接受 HTML 空白/斜杠分隔；WriteFile 先解析符号链接真实目标，悬空链接失败且不降级为截断覆写；askUnsaved 每次打开清空 dialog returnValue；build/dev 共用 `copy-assets.mjs`；renderScheduler 以 Promise 完成做轻量背压并合并最新请求。未采用 AST 全量重写、跨目录临时文件或权限失败时直接写入：前者改变 raw HTML 语义，后两者分别破坏原子替换或失败不变性
- 2026-09-05 本阶段采用单一尾随 80ms 节流调度器（pending timer 合并，提供 `cancel()`）替代防抖与失效节流叠加；初始化主题只改 UI 状态，程序性文档替换取消旧 timer、抑制 dirty/排程并显式渲染一次；预览 HTML/CSS 独立比较后按变化写入；打开与拖放统一经 `openPath()` 在确认后读取并统一反馈错误；理由是保持单次启动渲染、连续输入可及时更新、主题切换不重建正文。同期采用 App 单一读写锁与关闭快照、同目录临时文件权限继承 + Sync + Rename 的安全保存、meta refresh 精准剥离、KaTeX 字体 woff2-only 动态对照。未采用 Windows 专用原子替换 API、KaTeX 懒加载、预览增量 DOM 架构或 CSP：前者增加平台条件代码，后三者分别扩大加载/状态管理、重构范围或破坏默认 HTML/远程图片语义
- 2026-09-02 历史遗留问题批判性修复采用最短有效差分：拖放改用 `OnFileDrop(onDrop, false)` 关闭 drop-target 限制；打开与拖放在读取成功后、替换编辑内容前复用 `confirmDiscard()`；lastfile 记录改为 best-effort，不阻断读写主流程；节流回调更新时间戳使 80ms 节流生效；TOC 预览跳转改用渲染块 `data-line`，移除易错的标题序号映射；删除无调用方的 Go 拖放绑定、`title` 事件与 `StripScripts` 死代码；mathCache 在写入前超过 500 项时清空；CI 前端安装统一使用 `npm ci`。历史归档目录 `08-16-v4`、`08-16-v5`、`08-24-v2`、`08-29-v1` 的缺件保留为已知豁免，不伪造缺失的 Plan.md；后续归档继续执行 Plan.md 与 Tasks.md 双文件校验。
- 2026-08-31 预览滚动跨模式切换保持采用模式切换 handler 单点保存/恢复（隐藏前捕获 `savedPreviewScroll`、类切换完成后写回），而非改用 `visibility` 等不销毁视口的隐藏方式——理由：该 handler 是唯一改变 `editor-only`/`preview-only` 类的入口，单点即根因处，最短有效差分；写回必须在列重新显示后执行（隐藏状态下写 `scrollTop` 被钳制为 0，实测无效）；编辑器侧不动（浏览器对普通溢出容器天然保留偏移）
- 2026-08-31 新增 dev-only 无头 Chrome 回归检查 `frontend/tests/modeScroll.check.mjs`（内存 http 服务 + Wails 桩 + 真实 dist，驱动模式 tab 断言 4 个切换 cycle 的滚动保留），不接入 `npm test`/CI——理由：该 bug 的机械复现需要真实浏览器对 iframe 视口的语义，纯 Node 无法模拟；CI 为 windows-latest，依赖不保证的 Chrome 与无头行为会破坏构建链，符合项目零依赖自检约定（运行前置：`npm run build` 产 dist）
- 2026-08-29 无文件启动改为直接走 `newFile()` 空白未命名态并整体退役欢迎文档机制（删除 `GetWelcome`/`GetLastFile`/`persistWelcome`/`WelcomeDoc`），而非保留 lastfile 回退或另加开关——理由：需求就是「无文件启动 = 新文档」，空白态与 Ctrl+N 同源可保证空白文档行为只有一份实现；welcome.md 退役后无任何读取方，删除优于留死代码
- 2026-08-29 `lastfile` 记录逻辑保留为只写（打开/保存仍写入，启动不再读取）——理由：为将来「恢复上次会话」选项留数据；因当前无读取方，已在 `filesys.SetLastFile` 与包注释处标注，避免被误判为活跃逻辑
- 2026-08-29 目录名常量以 `settings.AppDir` 为单一来源，`filesys.AppDir` 删除——理由：两包禁止互相 import，跨包重复字面量只能靠常量归一收敛；启动迁移是 AppDir 的唯一引用方
- 2026-08-29 新增根包启动副作用用例 `TestStartupCreatesNoWelcomeDoc`（断言 `os.UserConfigDir()` 下 Mado 目录不存在）——理由：一条断言同时守住「不写 welcome.md」与「启动不创建用户配置目录」，任何启动写入回归都会失败
- 2026-08-29 源行号锚点由 Go 渲染期写入顶层块元素（`data-line`）而非前端解析渲染结果或 Go 另出行号数组——理由：渲染 HTML 无法反推源码行；前端正则会被 raw HTML 破坏顺序，而按序号对齐 DOM 的数组会因「链接定义不产元素、HTML 块可能产多元素」必然错位；goldmark 对 `data-` 前缀属性无条件放行，写入成本仅一个 ASTTransformer
- 2026-08-29 预览行号栏用 CSS `content: attr(data-line)` + 绝对定位，而非父窗口行号列 + JS 测高 + scroll 同步——理由：零 JS 定位，行号随重排/换行/缩放自动跟随，天然随文档滚动；后者需逐块 `getComputedStyle`、每次渲染重建 DOM，且滚动同步易抖动
- 2026-08-29 围栏代码块用包装层 div 承载行号，而非 `PreventSurroundingPre(true)` 自写 `<pre>`——理由：包装层下 Chroma 输出保持零变化（行包装 span 与 `<pre>` 开标签逐字保留），后者会连带删除行包装 span 并让 `hl_lines`/`linenos` 渲染路径失效
- 2026-08-29 行号跳转只滚动，不改光标/选区/焦点——理由：避免在编辑中途丢失光标位置；CodeMirror 的 mousedown 处理器只挂在 contentDOM，行号槽点击本就不会触发选区
- 2026-08-29 启动默认模式改为 Preview，工具栏顺序 Preview / Editor / Split——理由：顺序首位即默认，启动先落阅读态
- 2026-08-29 偏好写入统一收敛到 `App.persist`（副本 mutate → 保存成功才赋回，窗口主题 chrome 亦在保存成功后切换），失败注入改用 `App.saveSettings` 函数字段而非目录占位——理由：四个 setter 此前语义不一致（SetPreviewFont 保存成功才改内存，其余先改内存再保存），保存失败会内存/磁盘分流；函数字段注入无需为测试扩大 settings 包公开 API，也避免删除 exe 目录下真实 settings.json 的破坏性用例
- 2026-08-19 标题栏设置图标规范为 Lucide 风格矢量 SVG——理由：统一 1.8 描边比例与标准对称齿轮，匹配 Windows 11 原生标题栏视觉风格
- 2026-08-19 LaTeX 公式块解析采用 ContextKey 状态追踪与尾随空白剥离——理由：杜绝单行公式解析穿透吞没后续 Markdown 标题与段落
- 2026-08-19 公式渲染采用 Go 解析定界符输出占位元素 + 父上下文 KaTeX 渲染回填帧 DOM——理由：维持 iframe sandbox 安全模型（无 allow-scripts），同时获得 KaTeX 纯客户端高性能渲染
- 2026-08-19 KaTeX 静态资源随构建产物分发（`dist/katex/`）——理由：离线可用、无外部 CDN 依赖
- 2026-08-19 偏好设置与最近文件记录整体迁移至 exe 目录——理由：便携化，启动单次静默迁移旧配置
- 2026-08-18 窗口全向缩放深度重构为顶层 Fixed Overlay 8 方向把手与 Wails 运行时锁定——理由：彻底消除 iframe 与编辑器原生滚动条对右侧与右下角鼠标事件的阻断，保证所有模式下 8 方向边缘/边角原生缩放 100% 触发，同时在最大化时隐藏把手保证右上角关闭热区正常
- 2026-08-18 目录大纲恢复折叠功能并优化默认状态（默认全部展开、顶部全展/全收切换、侧栏默认 40px 收起）——理由：在保持无缩进 Flat 结构排版优势的同时恢复长文档章节折叠能力，默认收起侧栏减少初次加载视觉干扰，顶部一键切换提供全局折叠便利
- 2026-08-18 标题栏动作按钮采用内联 SVG 矢量图标并移除文字标签——理由：与 Win11 系统标题栏视觉统一，Open（文件夹）与 Save（磁盘）图标符合真实功能，纯图标按钮节省水平空间
- 2026-08-18 目录栏采用无缩进 Flat 色彩深度系统（`--toc-h1`~`--toc-h6`）与签名缓存/事件委托优化——理由：消除深层缩进导致的排版压缩与折行，大纲色彩明暗层次直观，编辑非标题内容零 DOM 开销
- 2026-08-14 选 Wails v2 而非 Tauri——理由：SCOPE 禁 Rust 本机编译，Go 本机已装且性能/体积满足轻量诉求
- 2026-08-14 选 goldmark（CommonMark+GFM+typographer）而非 comrak/markdown-it——理由：Go 原生零跨语言开销，性能强
- 2026-08-14 选 vanilla TS 而非框架——理由：单视图双栏状态简单，零运行时开销
- 2026-08-14 HTML 默认渲染 + script 剥离而非全禁——理由：满足「默认支持 HTML 渲染」需求，剥离 script 阻断 XSS
- 2026-08-14 选 CodeMirror 6 而非 Monaco——理由：Monaco 200KB+ 过重，cm6 增量解析且专业级
- 2026-08-14 选 iframe+srcdoc 首帧骨架 + 内原地更新而非 document.write——理由：隔离 CSS、防弹跳；首帧 srcdoc 引导，后续原地更新保留滚动、无闪烁（2026-08-15 修正：初始实现整体重设 srcdoc 导致编辑时预览闪烁跳顶，实测后改为原地更新，见 §6）
- 2026-08-15 预览锚点链接采用父侧 click 拦截 + URL fragment 解码 + scrollIntoView，而非帧内脚本或放宽 sandbox——理由：sandbox 无 allow-scripts 帧内脚本不可用，allow-same-origin 已允许跨帧 DOM；Chromium 对 about:srcdoc fragment 导航会替换帧文档致黑屏，且 goldmark 对中文 href fragment 百分号编码、标题 id 保持 Unicode，必须解码后才能命中；任何导航都毁掉原地更新模型，故外链一并阻断（外链用系统浏览器打开需新增 Go 绑定，非本 bug 范围，未做）
- 2026-08-18 Editor/Preview 聚焦模式目录采用前端共享树组件与 Markdown ATX 轻量解析，而非新增 Go API 或依赖——理由：原文行号只存在于编辑端，前端一次解析可同时服务 CodeMirror 行定位和预览渲染块 `data-line` 定位；功能局限在聚焦模式，Split 布局无需改动
- 2026-08-16 标题 id 采用 GitHub 风格 slug 生成器（中文保留、ASCII 小写、空白转 `-`、全角标点删除、重复加 `-N`）而非 goldmark 内置生成器——理由：内置 `ids.Generate` 丢弃全部非 ASCII，中文标题 id 退化，目录链接（如 `#一先搞清楚-wsl-是什么`）永远查不到；实测 GitHub 对 `动手学深度学习（Dive into Deep Learning，D2L.ai）` 生成 `动手学深度学习dive-into-deep-learningd2lai`，规则与用户手写目录格式一致；纯 ASCII 标题在新旧规则下产物相同，无兼容性变化
- 2026-08-15 测试配置目录隔离采用 t.Setenv 同设 APPDATA + XDG_CONFIG_HOME 而非仅重写 APPDATA——理由：os.UserConfigDir 跨平台读取不同环境变量，双设一处覆盖两端，避免 Linux 上测试污染真实 ~/.config
- 2026-08-15 包管理器 pnpm → npm（本地与 CI 一致切换）——理由：新开发环境无 pnpm，统一链路避免双锁文件漂移
- 2026-08-14 关闭确认采用「Go emit request-close → 前端统一处理」而非 Go 同步弹窗——理由：保存需编辑器内容（仅前端持有），旧双弹窗链路（QuitApp→Quit→OnBeforeClose→quitConfirm 二次弹窗且默认取消）导致「点确认关不掉」
- 2026-08-15 关闭确认改用前端原生 `<dialog>` 模态（`askUnsaved()`）而非修复 Go 侧英文返回值映射——理由：wails v2 Windows `MessageDialog` 恒为 MB_YESNO 两键（无取消/X/Esc，误触关闭只能存或丢，有数据丢失风险）且返回英文串曾致中文匹配失效；`<dialog>` 在 WebView2 原生支持 Esc/焦点囚禁/顶层叠放，三态完整，新建流程复用同一组件
- 2026-08-14 原始 Go 侧防抖合并（100ms debounce + 80ms 节流）而非前端逐击解析——理由：打字高峰帧率平稳
- 2026-08-24 Preview 字体输入边界在 Go 侧统一校验（normalize + 拒绝控制字符/结构分隔符/超长值）并由 theme 层二次转义后用双引号包裹注入 CSS 变量——理由：settings.json 与 Wails 绑定都是信任边界，仅靠前端校验可被绕过；字体名以 `--preview-font` 变量 + 固定回退栈注入，用户字体缺失时自动退化，不探测、不安装
- 2026-08-14 字体用本地栈（Cascadia Code/Consolas）而非网络字体——理由：离线可用、无 FOUT

## 9. 术语表

- **lastfile** = 上次打开的文件路径，持久化于共享 settings.json 的 `lastfile` 字段；当前只写不读（启动不再恢复它），为将来「恢复上次会话」选项保留
- **预览通道** = 编辑区 → mdrender → iframe 内原地更新（style + article，首帧 srcdoc 引导）+ 父侧链接拦截（锚点滚动/导航阻断）的渲染链路
- **公式通道** = Go 侧 math 扩展解析定界符输出带 `data-tex` 占位元素 → 前端父上下文 KaTeX `renderToString` 渲染 → 写入预览帧 DOM 的渲染管线
- **源行号锚点** = Go 渲染期写入顶层块元素的 `data-line`，值为该块在 Markdown 源码中的起始行号（1 起算）；预览侧由 CSS 生成行号栏，两侧点击互跳时作为共同坐标
- **行号栏（gutter）** = 编辑区 CodeMirror 行号槽与预览区由 `data-line` 生成的数字列，点击后把目标行在对方栏置顶

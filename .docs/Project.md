# Project

> 项目的单一事实来源，供 Agent 动手前建立全局认知。定位与设计原则见 `SCOPE.md`，工作流规则见 `AGENTS.md`。

## 概述

- **定位**：本地运行的 Windows 原生 Markdown 查看器/编辑器，轻量低占用，编辑与渲染分离，默认支持 HTML 渲染。
- **阶段**：开发中（自研文档按页分块高保真 PDF 导出管线（方案 B：色彩与边距版面控制，下线失效缩放步进）、窗口尺寸与最大化状态记忆、Win32 原生剪贴板历史管道；导出弹窗与多页导出经 dev-only 无头冒烟全覆盖）
- **非目标**：多标签页、插件系统、导出独立 HTML、Mermaid 图表（详见 `SCOPE.md` 设计原则）

## 环境与运行

- **平台**：Windows 10/11（目标平台，依赖系统 Edge WebView2 Runtime）；Linux x86_64（开发环境）
- **Shell**：bash
- **运行时**：Go 1.25+（本机实测 Go 1.27.0，用户级单版本 `~/.local/go`；CI 用 Go 1.25.x，`go.mod` 声明 `1.25.0`）；Node.js 24 + npm 11（前端构建）
- **版本管理**：git；`main` 为稳定主分支，无复杂分支策略
- **运行**：
  - 本机验证链（最小占用，产物均 gitignored）：
    1. `cd frontend && npm install --include=dev`
    2. 零产物语法检查：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`
    3. `npm run build`（esbuild 打包后调用 `npm run copy-assets`）产出 `dist/`（go:embed 依赖）
    4. `go vet ./...` + `go test ./...`
  - 云端 CI：`.github/workflows/build.yml`（Windows 构建，`wails build` 输出 `build/bin/mado.exe` artifact）；发布流程见 `.github/workflows/release.yml`（tag `v*` 触发创建 Release）
- **测试**：`go test ./...`（覆盖根包/filesys/mdrender/settings/theme 5 个包）；并发与竞态验证使用 `go test -race ./...`；零依赖前端自检 `cd frontend && npm test`（依次执行 fontCommit、gutter、tocGutter、renderScheduler、pdfBuilder 与 uiContract 6 项自检，Node 原生 type-stripping，无外部测试框架）；dev-only 无头检查 `npm run build && node tests/modeScroll.check.mjs`、`node tests/startup.check.mjs` 与 `node tests/export.check.mjs`（不接入 npm test/CI）；交互行为手动验收
- ★ 路径含空格或中文时加引号；`settings.json` 持久化于 exe 所在目录（便携化），`%APPDATA%/Mado/` 仅为旧配置的一次性迁移源目录，应用不再向其写入
- ★ 本开发环境 `NODE_ENV=production` 且 `omit=dev`，安装依赖必须执行 `npm install --include=dev`，否则 esbuild 会被静默跳过
- ★ 零产物语法检查必须带 `--loader:.css=empty`，否则 `import './style.css'` 会直接报错；禁止使用 `--outfile=/dev/null` 导致在工作区遗留字面文件 `nul.css`
- ★ `frontend/dist/` 是 go:embed 的 FS 根，HTML 内引用资源必须写相对路径 `./app.js`/`./app.css` 而非 `./dist/app.js`；构建产物禁止提交 git
- ★ 测试不污染真实环境：settings/filesys 经包级 `storePath` 变量覆写隔离至 `t.TempDir()`；根包启动副作用用例 `TestStartupCreatesNoWelcomeDoc` 通过 `t.Setenv` 同时设置 `APPDATA` 与 `XDG_CONFIG_HOME` 隔离 `os.UserConfigDir()`

## 结构

```
mado/
├─ go.mod / go.sum          # Go 模块依赖（goldmark、wails v2、chroma 等）
├─ main.go                  # Wails 入口：窗口尺寸与最大化预读、窗口配置与拖放开关
├─ main_test.go             # 根包测试：配置迁移、启动副作用、并发绑定与关闭一致性
├─ app.go                   # App 绑定层：聚合各 internal 模块并导出前端 IPC 方法，读写锁守护状态
├─ app_windows.go           # Win32 原生剪贴板管道（绑定前台宿主 HWND 写入，触发 Win+V 剪贴板历史）
├─ app_other.go             # 非 Windows 平台剪贴板无操作回退桩
├─ wails.json               # Wails 项目配置
├─ internal/filesys/        # 文件读写与原子保存，以及 lastfile 只写记录
├─ internal/mdrender/       # goldmark 渲染管线：GFM、LaTeX 数学扩展、源行号锚点及脚本/refresh 净化
├─ internal/settings/       # 偏好持久化（主题、换行、数学渲染、字体、窗口尺寸与最大化）
├─ internal/theme/          # Fluent 2 亮/暗预览设计令牌与排版 CSS（go:embed 内嵌）
├─ frontend/                # 前端工程：TypeScript 源码、设计令牌样式、自检脚本与资产构建
│  ├─ src/main.ts           # 前端交互主入口：编辑器配置、预览调度、模式切换与快捷键
│  ├─ src/toc.ts            # Markdown ATX 标题解析与目录折叠状态映射
│  ├─ src/renderScheduler.ts# 尾随 80ms 节流渲染调度器
│  ├─ src/fontCommit.ts     # 预览字体提交串行化控制
│  ├─ src/gutter.ts         # 预览双向跳转行号二分查找定位
│  ├─ src/pdfBuilder.ts     # 纯 TypeScript 极简 PDF 1.4 组装模块
│  ├─ src/pdfExporter.ts    # 样式/字体注入与按页分块栅格化管线
│  ├─ src/style.css         # 外壳 Fluent 2 设计令牌与组件样式
│  ├─ scripts/copy-assets.mjs # 共享前端静态资源拷贝（KaTeX CSS 与 woff2 字体等）
│  └─ tests/                # Node 原生自检（含 pdfBuilder.test.ts）与无头浏览器检查
├─ frontend/wailsjs/        # Wails 生成的前端绑定（仓库跟踪副本供本地 esbuild 语法检查，新增 Go 导出方法须同步手补）
├─ frontend/dist/           # 前端构建产物（go:embed 嵌入 exe，FS 根目录，gitignored）
├─ build/bin/mado.exe       # Windows 最终打包二进制产物（云端 CI 产物）
└─ docs/                    # 用户相关说明文档
```

- **数据流**：
  - **启动**：`main.go` 预读 exe 目录 `settings.json` 获取窗口宽高与最大化标记，注入 Wails 启动选项并赋给 `app.settings` 快照；检查旧配置目录执行单次迁移；解析启动参数传递文件路径（若有路径则 `LoadFile`，无路径直接走 `newFile()` 空白态，不读 lastfile 且启动只读不创建配置目录）。
  - **编辑与渲染**：CodeMirror 变化由 `renderScheduler` 进行尾随 80ms 节流并配合 Promise 背压合并最新请求 → 并行调用 `Render(md)` 与 `GetCSS()` → 预览更新：首帧用 srcdoc 引导骨架，后续在 iframe 内原地比较并更新 style 文本或 article innerHTML（保留滚动位置）；公式定界符由 Go 解析输出占位元素，在前端父上下文调用 `katex.renderToString` 回填。
  - **偏好持久化**：设置模态内修改主题、换行、公式开关或预览字体（经 `fontCommit` 串行校验）时，前端调用 Go 导出方法；全部通过 `App.persist` 统一执行（在副本上更新，磁盘写入成功才赋回内存快照），保持内存与磁盘强一致。
  - **代码复制与剪贴板**：围栏代码块由包装渲染器输出紧凑复制按钮，iframe 文档 click 委托读取同级 pre 文本后调用 `SetClipboard`，通过 Win32 `GetForegroundWindow` / `OpenClipboard` 写入宿主前台根 HWND，触发 Win+V 剪贴板历史；非 Windows 或异常回退 `ClipboardSetText`。
  - **聚焦目录与双向跳转**：成功渲染后前端从 Markdown ATX 解析大纲树，支持 Flat 结构与六级颜色令牌折叠展开；行号栏由 Go ASTTransformer 在顶层块写入 `data-line`，预览 CSS `content: attr(data-line)` 自动跟随排版渲染；Editor 行号槽点击二分定位对应块并平滑置顶，Preview 行号栏点击按坐标换算行号并在编辑器内平滑滚动置顶。
  - **窗口全向缩放与状态记忆**：顶层 Fixed Overlay 8 方向透明把手响应 mousedown 发送原生 resize 指令，绕过滚动条阻断；前端监听窗口尺寸变化，250ms 尾随防抖写入尺寸并分离记录最大化状态，退出前通过 `flushWindowState` 强制刷盘。
  - **保存与关闭确认**：保存时写入同目录临时文件、继承原权限、`Sync()` 刷盘后原子 `Rename` 替换；退出或新建未保存文件时，前端弹原生 `<dialog>` 三态模态确认，关闭确认由前端接管后调用 `ForceQuit`。
  - **文档导出为 PDF**：标题栏导出按钮或快捷键（Ctrl+P / Ctrl+Shift+E）唤出方案 B 模态弹窗（浅色/当前主题、标准/紧凑/宽松边距，依 YAGNI 退役未证实且与 html2canvas 冲突的缩放步进）→ 点击「导出」呈现加载禁用态与实时分块进度反馈 → 前端显式拉取目标主题完整 CSS（`GetThemeCSS(exportTheme)`）并在离屏隔离 iframe 容器内注入 KaTeX 样式与主题样式，等待 link load 事件与公式回填，确保 `@font-face` 与 `iframe.contentDocument.fonts.ready` 真实就绪且彻底杜绝外壳样式污染 → 按 A4 几何比例与子元素下沿软断页逐页分块绘制至独立 Canvas（单页捕获彻底规避 Chromium 16384px 硬件上限）并重建统一内页边距（标准 20mm/76px、紧凑 10mm/38px、宽松 30mm/114px，深色底色对齐 #1f1f1f） → 纯 TypeScript 自研轻量 PDF 1.4 包装器将多页编码为标准 PDF 二进制并转为 Base64 → 调用 Wails 原生 `SavePdfFileDialog`（契约对齐 `(string, error)`，区分用户取消与宿主异常）调起系统另存为对话框 → 确认后经 `SavePdfFile` 与 `filesys.WriteFile` 完成短写保护原子落盘，成功后更新状态栏，取消静默复位，异常提示「导出失败」。
- **依赖方向**：`internal/*` 禁止相互依赖（filesys 与 settings 仅通过共享 JSON 文件松耦合）；`main.go` 与 `app.go` 是唯一允许引用 internal 的外层包；前端仅通过 `frontend/wailsjs/` 生成的绑定与后端通信，禁止直调原生 API；`mdrender`、`theme`、`filesys`、`settings` 为纯 Go 包，测试不依赖 GUI。

## 约定

- **命名**：Go 标准（导出 PascalCase，包内 camelCase/snake_case，internal 包名与目录一致）；前端 TypeScript camelCase；CSS 类名 kebab-case；Git 提交采用 Conventional Commits（英文类型前缀 + 中文详细描述）
- **语言**：用户可见文本（界面提示、模态对话框、文档、README）用中文；代码注释、日志与提交类型前缀用英文
- **错误处理**：Go 导出方法返回 error，由前端捕获并以应用内状态栏提示（如 `打开失败`）或对话框反馈，不向控制台抛出未捕获异常
- **日志**：无外部日志框架，`println` 仅限于 `main.go` 启动致命失败时输出

## 约束与决策

- 2026-08-14 选用 Wails v2 而非 Tauri——理由：SCOPE 明确禁止 Rust 本机编译，Go 满足轻量桌面要求且性能与体积优异
- 2026-08-14 选用 goldmark（CommonMark + GFM + typographer）而非 comrak/markdown-it——理由：Go 原生零跨语言开销，扩展生态完善
- 2026-08-14 选用 Vanilla TS 与原生 CSS Custom Properties 而非前端框架——理由：单视图桌面编辑器状态清晰，零框架运行时与嵌入体积负担
- 2026-08-14 选用 CodeMirror 6 而非 Monaco——理由：Monaco 体积过重（200KB+），CM6 增量解析且具备专业级编辑能力
- 2026-08-14 采用 iframe 骨架引导与原地更新而非整页重设 srcdoc 或 document.write——理由：CSS 样式隔离，原地更新 style 文本与 innerHTML 保留滚动偏移且杜绝白闪
- 2026-08-14 关闭确认采用前端 `<dialog>` 原生模态而非 Go 侧 MessageBoxW——理由：保存需要前端持有的编辑器文档内容，且 Windows 原生消息框仅支持确定/否双态，无法提供安全的取消与防丢机制
- 2026-08-15 预览锚点链接采用父侧 click 拦截 + URL fragment 解码 + scrollIntoView——理由：iframe sandbox 无 allow-scripts 无法运行脚本，且 Chromium 会将 about:srcdoc fragment 视为新导航导致页面黑屏，中文 ID 经 goldmark 百分号编码后必须解码匹配 DOM
- 2026-08-16 标题 ID 采用 GitHub 风格 slug 生成器（保留中文、ASCII 小写、空白转连字符）——理由：goldmark 默认生成器丢弃所有非 ASCII 字符导致中文目录锚点失效
- 2026-08-18 窗口全向缩放采用顶层 Fixed Overlay 8 方向透明把手并锁定 Wails 内部 enableResize——理由：WebView2 下不可见边框与 Chromium 原生滚动条会阻断边缘鼠标事件，把手层穿透覆盖确保 100% 触发原生缩放
- 2026-08-18 聚焦模式目录大纲采用前端共享树组件与无缩进 Flat 色彩深度系统（--toc-h1~--toc-h6）——理由：一次解析同时服务编辑器与预览跳转，消除深层缩进导致的排版压缩与折行
- 2026-08-19 LaTeX 公式渲染采用 Go 解析定界符输出占位元素 + 前端父上下文 KaTeX 异步回填——理由：维持 iframe sandbox 安全模型（无 allow-scripts），同时实现离线可用与高性能客户端公式渲染
- 2026-08-19 偏好设置与最近文件记录迁移至 exe 所在目录——理由：支持便携化部署，启动单次静默迁移旧 APPDATA 配置
- 2026-08-29 无文件启动直接走 newFile() 空白未命名态并退役欢迎文档机制——理由：统一空白文档模型与 Ctrl+N 语义，消除未使用的读取分支与启动写盘副作用
- 2026-08-29 源行号锚点由 Go 渲染期 ASTTransformer 写入顶层块元素（data-line）并由预览 CSS content:attr(data-line) 渲染——理由：零 JS 布局与同步开销，行号天然跟随重排与文档滚动
- 2026-08-29 偏好写入统一收敛至 App.persist（副本 mutate → 保存成功才赋回内存快照）——理由：保证配置内存状态与磁盘强一致，避免写盘失败导致内存状态分流
- 2026-09-05 编辑渲染采用单一尾随 80ms 节流调度器并配合 Promise 背压合并最新请求——理由：消除打字高峰卡顿，避免在长文档渲染期间堆积过期渲染任务
- 2026-09-09 UI 视觉重构采用 Zinc 灰阶调色板与 Fluent 2 双主题令牌成对维护——理由：iframe 与外壳样式隔离，外壳 CSS 变量与 Go embed 预览样式表需保持双向锁定
- 2026-09-25 启动默认模式设为 Editor，工具栏顺序调整为 Editor / Preview / Split——理由：首位即默认，启动即落编辑态，保证编辑列启动即时可见
- 2026-09-25 目录大纲逻辑抽取至独立模块 toc.ts 并支持同名标题出现序号恢复折叠——理由：测试与目录共用实现避免假阳性，轻量模型避免跨编辑稳定身份系统的复杂性
- 2026-09-30 窗口尺寸与最大化偏好持久化并正交解耦管理——理由：防抖记录常规视口尺寸，最大化仅记录标记，避免窗口还原时被全屏尺寸冲垮
- 2026-09-30 剪贴板管道采用 Win32 GetForegroundWindow/OpenClipboard 原生写入前台根 HWND——理由：确定性触发 Win+V 剪贴板历史捕获，非 Windows 平台降级至标准 ClipboardSetText
- Win32 原生剪贴板通过 needFree 标志追踪内存所有权并在 GlobalLock 或 SetClipboardData 失败时调用 GlobalFree 释放——系统接管后释放所有权，失败分支必须由应用负责释放以防止内存泄漏
- 非 Windows 平台回退桩使用空白标识符入参——消除局部空白赋值死代码，保证多平台构建契约整洁
- wailsjs 本地副本需与 Go 导出方法同步手补——wailsjs 由 wails 生成但仓库内提交的副本用于本地 esbuild 语法检查，新增 Go 导出方法时须同步手补 App.js/App.d.ts 以便本地验证，CI 生成版本以 Go 为准
- 编辑器行号槽事件必须监听 cm.scrollDOM 而非 contentDOM——EditorView.domEventHandlers 仅挂载于 contentDOM，而 .cm-gutters 为兄弟节点，行号槽点击事件无法到达 contentDOM
- iframe 帧内事件 target 跨 realm 判定不能使用 instanceof Element——不同 window 上下文的 Element 构造函数不同，跨 realm 判定恒假，须使用 closest 或 DOM 属性
- 偏好保存失败场景测试必须使用 App.saveSettings 函数字段注入，禁止目录占位——main 包无法覆写 settings 包私有 storePath，目录占位法作用于二进制同目录，带配置运行测试会误删真实配置
- `$` 行内公式首尾空格启发式与货币误判防护——`$5 and $10` 首尾含空格或未闭合不构成公式，直接退化为字面文本
- 行内公式不支持跨行——语法边界清晰，避免未闭合 `$` 跨段污染后续内容渲染
- 打开与拖放统一经 openPath()，未保存确认必须发生在 LoadFile 之前——避免取消确认后标题或 lastfile 已产生副作用，并消除拖放异步 Promise rejection 静默失败
- 目录名常量以 settings.AppDir 为单一来源，两包禁止互相 import——跨包重复字面量靠 settings 单一来源收敛，启动迁移为唯一引用方
- 多实例限制：应用已运行时双击新文件会启动第二实例——Wails v2 默认多实例且未启用 SingleInstance，待后续按需开启
- 源行号锚点仅覆盖顶层块，缩进块与原始 HTML 块无锚点，跳转粒度为渲染块——goldmark 部分渲染器忽略属性，多行块内部行仅能将整块置顶
- 原生模态共享规则必须显式声明 margin: auto——外壳全局 `* { margin: 0 }` 会覆盖浏览器原生 `<dialog>` 默认自动外边距，须恢复以保证模态居中
- 配置文件写保护限制：exe 部署于受写保护目录时持久化不可写——便携化设计将 settings.json 存放在 exe 同目录，写保护属于已知环境限制
- 安全审查立场：接受内联 on* 与远程图片保持默认 HTML 语义——CSP 或额外 HTML 过滤会破坏默认 HTML 与远程图片语义，内联事件由 sandbox 与父侧链接拦截兜底
- Chroma 围栏代码块的 data-line 落在包装层 div 上，禁止改用 chromahtml.PreventSurroundingPre 自写 pre——Chroma 的 pre 开标签不受控，包装层是唯一稳定注入点，修改会破坏行包装 span 与高亮渲染路径
- AST 变换器标注围栏块前必须合并 info 串属性，且未高亮围栏块由包装渲染器补齐 pre/code——goldmark-highlighting 在已有属性时跳过 info 串解析，且包装渲染器接管时上游不再输出默认 pre/code 标签
- 围栏代码块复制按钮仅覆盖 highlighting.WithWrapperRenderer 包裹的 fenced code——四空格缩进代码块由 goldmark 独立路径渲染且无共享包装层，不引入多余包装以保持原有行号边界
- 跨语言常量需成对维护并加联动互指注释（如 Go 字节限制与 TS 字符限制、窗口最小宽高）——两端无法自动联动，非 BMP 字符字体名会先触及后端字节上限
- 直接写 scroller.scrollTop 不被 CodeMirror 视口跟踪——视图由视口行范围与高度估算决定，自动化操作必须经 view.dispatch({selection, scrollIntoView}) 并等待效果落地
- 原生确认 dialog 每次 showModal() 前必须清空 returnValue，并使用 submitter 捕获按钮值——HTMLDialogElement 会保留上一次关闭状态，未清空会导致后续确认流程读到陈旧值
- 编辑列切回可见态时必须在生产端同步执行 view.measure()（带降级 requestMeasure）——CodeMirror 异步 ResizeObserver 具有静默延时，同步测量消除 0x0 几何真空期与自动化用例超时
- goldmark 引擎在 Render 中每次新建，数学扩展 parser/renderer 按引擎实例化——goldmark 初始化状态跨并发共享存在数据竞争，创建轻量实例开销低于引入全局锁
- mdrender 剥离 `<script>` 与 `meta http-equiv="refresh"` 标签但保留内联 on*——script 与 refresh 存在跨域与隐式导航风险，内联事件由 sandbox 与父侧链接拦截兜底
- iframe 预览禁止重设 srcdoc，编辑更新走 style 文本与 innerHTML 原地替换——重设 srcdoc 会触发整页导航并重置滚动位置导致白闪，原地更新天然保留 scrollTop
- 模式切换隐藏预览列前捕获 scrollTop 并在重新显示后写回——display:none 会销毁 iframe 视口导致滚动偏移被浏览器钳制清零
- CodeMirror 活动行背景必须保持半透明（--editor-active-line 约 4%）——CM6 选区层位于行元素背景之下，不透明活动行会彻底遮蔽当前行的文本选取反馈
- 外壳覆盖 CodeMirror 样式必须带 :root[data-theme] 选择器——style-mod 动态注入的 oneDark 规则特异性为 (0,5,0)，外壳选择器须达到 (0,6,0) 配合下游 link 顺序实现稳定覆盖
- 预览 ::selection 仅定义背景色，不覆盖文字颜色——保留代码语法高亮与正文色彩正交性，与 CodeMirror 独立图层选区体验严格对称
- 预览字体名输入必须经 settings.NormalizePreviewFont 拒绝与 theme 层中和双重防线——字体名直接注入 CSS 变量声明，必须阻断引号、换行符与控制字符逃逸
- `--preview-font` 回退栈以 sans-serif, monospace 收尾——code/kbd 与正文共用该变量，首选字体缺失时以 monospace 收尾防止代码退化为比例字体
- 文档保存采用同目录临时文件 + 原权限 + Sync + 原子 Rename 替换并先解析符号链接——防止崩溃写入损坏原文档，并避免将符号链接覆写为普通文件
- App 绑定状态由单一 sync.RWMutex 守护，关闭时仅读取 shouldPreventClose() 快照——Wails 绑定运行在独立 goroutine，防止并发关闭与状态写入竞争
- 原生 `<dialog>` 必须在 DOM 根部并列放置，禁止嵌套——嵌套在隐藏父级中的子对话框触发 showModal 会导致顶层动态遮罩捕获点击引发应用假死
- LaTeX 单行公式解析必须跟踪 closed 状态并在 Continue 中立即关闭——goldmark 解析器在 Open 返回后仍会调用 Continue，未记录闭合会导致单行公式吞没后续所有内容
- KaTeX 构建产物仅分发 woff2 字体——WebView2/Chromium 原生支持 woff2，清理 ttf/woff 显著缩减二进制嵌入体积
- lastfile 记录保持为只写不读——当前无启动恢复会话需求，保留只写记录为将来扩展预留数据
- Windows 文件权限仅区分只读（0444）与可写（0666），且 MoveFileExW 不支持多线程向同一目标并发替换——并发测试必须为各 worker 分配独立保存路径以隔离目标锁定冲突
- 彻底退役系统原生打印并改用自研按页分块 PDF 1.4 导出管线——WebView2 下沙箱 iframe 调用 window.print() 存在宿主 Chromium 模态限制导致请求被丢弃（无任何系统弹窗唤出）；新管线复用实证 100% 可靠的 Wails 原生 SaveFileDialog 通道唤出另存为窗口，从结构根源消除黑盒风险
- 按 A4 页面窗口分块独立渲染规避 Canvas 尺寸上限——超长文档单张长 Canvas 会触及 Chromium 16384px / 2.68 亿像素硬件硬上限导致静默崩溃；遍历子元素下沿软避让断页并在每页独立绘制至 Canvas，重建统一页边距，支持任意长文档稳定导出
- 采用纯 TypeScript 自研轻量 PDF 1.4 编码器而无需大型外部库——组装标准 PDF 字典、交叉引用表（xref）与 DCTDecode 图像流对象代码量不足 150 行，零依赖且生成速度极快；权衡上接受位图页面呈现，在保证公式高保真、语法色彩与字体自包含的同时杜绝 30MB+ 外部 PDF 库与 15MB+ CJK 矢量字体负担
- 彻底移除 base.css 的 @media print 规则块与打印缩放变量——遵循工程纪律，新管线不走系统打印，消除死代码与维护歧义
- 导出 PDF 本地验证由 uiContract、pdfBuilder 自检与 export.check.mjs 无头冒烟共同锁定，物理排版视觉由 Windows 端验收——Linux 开发环境覆盖数据流、DOM 与 PDF 1.4 规范契约，保持最小占用
- SavePdfFileDialog 契约显式返回 (string, error) 区分取消与失败——runtime.SaveFileDialog 在宿主限制或 context 异常时返回 error，原有契约返回空串会与用户取消同构导致静默吞掉报错；返回 error 后前端区分静默退出与状态栏错误告警
- 依据 YAGNI 与最短有效差分退役导出缩放步进控件——html2canvas 白名单不含 zoom 导致放大时右侧被 viewportBox 裁切且测量坐标与捕获坐标断裂；恒定以 100% 真实 A4 物理比例输出消除过度承诺与几何错位
- 导出主题样式经 GetThemeCSS(themeName) 显式按需拉取——GetCSS() 恒按当前应用主题输出，暗色主题下导出浅色若仅覆盖 wrapper 背景会导致代码块/标题等 CSS 变量仍为暗色；显式拉取使目标主题 tokens 与 base 样式完全匹配
- KaTeX 样式表 link 必须显式 await load 事件后再等待字体就绪——document.fonts.ready 仅等待已被布局引用的字体，外部 link 未解析完成时 KaTeX @font-face 尚未进入字体表会导致字体等待空转并降级为回退字体渲染
- 采用离屏隔离 iframe 容器构建导出文档以彻底杜绝样式泄漏至外壳——预览全局样式表注入主文档会导致外壳 body 被强加 36px/64px 内边距并产生 max-width 压窄；离屏 iframe 形成原生物理样式隔离边界，同时使 html2canvas 仅克隆 iframe 内部文档，兼具零外壳重排开销与绝对样式隔离
- PDF 导出页边距按 96 DPI（3.78 px/mm）严格对齐标准 20mm (76px) / 紧凑 10mm (38px) / 宽松 30mm (114px)，深色底色收敛为 #1f1f1f——消除界面文案与实际像素的换算偏差，并彻底消除深色模式下分块内容与 A4 画布底色的接缝
- 移除 100 页静默截断过度防御——分块循环严格单调递增，无死循环风险；静默截断会无提示丢弃长文档内容，属于不当防御
- 收窄 .gitignore 规则至 .codebuddy/*.local.json——确保仓库跟踪的 .codebuddy/agents/* 与 .codebuddy/skills/* 正常纳管与版本追踪，仅忽略本地工作区生成的动态配置
- 导出核心链路通过 dev-only 无头 Chrome 冒烟用例（export.check.mjs）自动化闭环——在 Linux 开发环境无需 GUI 即可验证弹窗唤起、主题拉取、外壳零污染断言、Base64 PDF 1.4 二进制头/尾结构、用户取消与异常处理

## 术语

- **lastfile** = 上次打开的文件路径，持久化于共享 `settings.json` 的 `lastfile` 字段；当前只写不读，为后续「恢复上次会话」预留
- **预览通道** = 编辑区 → `mdrender` → iframe 内原地更新（style + article，首帧 srcdoc 引导）+ 父侧链接拦截（锚点滚动/导航阻断）的渲染链路
- **公式通道** = Go 侧 math 扩展解析定界符输出带 `data-tex` 占位元素 → 前端父上下文 KaTeX `renderToString` 渲染 → 回填预览帧 DOM 的渲染管线
- **源行号锚点** = Go 渲染期写入顶层块元素的 `data-line`，值为该块在 Markdown 源码中的起始行号（1 起算）；预览侧由 CSS 生成行号栏，两侧点击互跳时作为共同坐标
- **行号栏（gutter）** = 编辑区 CodeMirror 行号槽与预览区由 `data-line` 生成的数字列，点击后把目标行在对方栏置顶

## 维护

| 变更 | 同步章节 |
|---|---|
| 运行、测试方式或环境前提变化 | 环境与运行 |
| 依赖增删或升级 | 环境与运行；属关键选型时同步「约束与决策」 |
| 模块增删、重构，依赖方向变化 | 结构 |
| 命名、语言、日志规范调整 | 约定 |
| 新坑、新约束、选型定型 | 约束与决策 |
| 新增项目特有名词 | 术语 |

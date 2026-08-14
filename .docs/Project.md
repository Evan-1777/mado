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
- **当前阶段**：开发中（v1 核心闭环已交付，待用户手动验收 GUI 行为）
- **非目标（不做什么）**：见 SCOPE.md 设计原则；v1 不做多标签页、插件系统、导出 HTML/PDF、数学公式、Mermaid 图表。

## 2. 环境与运行

- **运行平台**：Windows 10/11（依赖系统 Edge WebView2 Runtime，本机 151.0.4129.78 已确认安装）
  - ★ 易错：路径含中文/空格须加引号；`%APPDATA%/Mado/` 为状态目录
- **Shell**：Git Bash（项目终端默认）；打包脚本内部由 Wails 调用 PowerShell
- **版本管理**：git 仓库（main 分支，无分支策略）
- **语言 / 运行时**：Go 1.25.3（go.mod 声明 go 1.24，Wails 模板值）；Node.js 22 + pnpm 10（前端构建）
- **依赖管理**：Go → `go.mod`/`go.sum`；前端 → `frontend/package.json` + `pnpm-lock.yaml`（pnpm 强制，SCOPE 要求）
- **如何运行**：
  - 开发：`wails dev`（wails CLI 在 `$(go env GOPATH)/bin`，需在 PATH 中；本机已 `go install github.com/wailsapp/wails/v2/cmd/wails@latest`）
  - 打包：`wails build` → `build/bin/mado.exe`
  - ★ 易错：`wails build` 会先跑 `frontend:install`（pnpm install）与 `frontend:build`（pnpm build），node_modules 缺失时自动补装
- **如何测试**：`go test ./...`（4 个包：filesys/mdrender/settings/theme）；无 GUI 测试框架，交互行为手动验证（Plan §5 验收走查）

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
frontend/dist/           # 构建产物，go:embed 嵌入 exe（FS 根即 dist 内容）
build/bin/mado.exe       # 打包输出（~15.6MB）
docs/                    # 用户文档
```

## 4. 架构与数据流

- **核心模块**：
  - `app.go`（App 绑定）→ 前端唯一入口，聚合 filesys/mdrender/settings/theme
  - `mdrender.Render(md) → safe HTML`（script 已剥离）
  - `theme.ThemeCSS(t) → 组合预览 CSS`（tokens + base + theme 特化）
- **数据流**：
  - 启动：main.go → wails.Run → 前端加载 → `GetSettings`（主题）→ `GetWelcome`（lastfile 或欢迎文档）→ 编辑器显示
  - 编辑：CodeMirror updateListener（100ms debounce + 80ms 节流）→ `Render(md)` + `GetCSS()`（Promise.all）→ 重建 iframe srcdoc
  - 保存：`Ctrl+S` → `SaveFile(path, content)` → 写盘 + SetLastFile + 窗口标题联动
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

- 「SCOPE.md 禁止本机编译 Go、Rust——原因：本地曾无环境，避免占用空间」——**已过时**：本机已确认 Go 1.25.3 + Rust 1.91.1 已安装，且 Go 方案被用户选定，本机编译 Go 是常态操作。Rust 仍未使用。
- 「`frontend/dist/` 是 go:embed 的 FS 根——原因：`main.go` 用 `//go:embed all:frontend/dist`，HTML 内引用资源必须写 `./app.js`/`./app.css` 而非 `./dist/app.js`」——此为 v1 打包期真实踩坑，修复后写死约定
- 「`frontend/wailsjs/` 由 wails 自动生成，禁止手改——原因：每次 wails dev/build 会重新生成覆盖」
- 「`frontend/dist/` 构建产物禁止提交——原因：每次 pnpm build 全量重建，且 go:embed 编译时读取」
- 「goldmark 引擎在 Render 中每次新建——原因：goldmark 实例非并发安全，创建成本 <10µs 可忽略」
- 「mdrender 剥离 `<script>` 标签但保留内联 on* 事件——原因：典型 Markdown 文档不含内联事件，过度过滤会破坏合法 HTML（如 `<div onclick>` 场景罕见）；已知限制，暂不处理」

## 7. 外部依赖与集成

- **运行时依赖**：系统 Edge WebView2 Runtime（Wails 硬依赖，Windows 10/11 自带，本机 151.0.4129.78）
- **本地工具**：`wails` CLI（GOPATH/bin）→ 构建/开发；`pnpm` → 前端依赖管理；`esbuild` → 前端打包

## 8. 决策记录

- 2026-08-14 选 Wails v2 而非 Tauri——理由：SCOPE 禁 Rust 本机编译，Go 本机已装且性能/体积满足轻量诉求
- 2026-08-14 选 goldmark（CommonMark+GFM+typographer）而非 comrak/markdown-it——理由：Go 原生零跨语言开销，性能强
- 2026-08-14 选 vanilla TS 而非框架——理由：单视图双栏状态简单，零运行时开销
- 2026-08-14 HTML 默认渲染 + script 剥离而非全禁——理由：满足「默认支持 HTML 渲染」需求，剥离 script 阻断 XSS
- 2026-08-14 选 CodeMirror 6 而非 Monaco——理由：Monaco 200KB+ 过重，cm6 增量解析且专业级
- 2026-08-14 选 iframe+srcdoc 重建而非 document.write——理由：隔离 CSS、防弹跳、无闪烁
- 2026-08-14 Go 侧防抖合并（100ms debounce + 80ms 节流）而非前端逐击解析——理由：打字高峰帧率平稳
- 2026-08-14 字体用本地栈（Cascadia Code/Consolas）而非网络字体——理由：离线可用、无 FOUT

## 9. 术语表

- **lastfile** = 上次打开的文件路径，持久化于共享 settings.json 的 `lastfile` 字段
- **欢迎文档** = 首次启动时自动写入 `%APPDATA%/Mado/welcome.md` 的默认演示文档
- **预览通道** = 编辑区 → mdrender → iframe srcdoc 的渲染链路

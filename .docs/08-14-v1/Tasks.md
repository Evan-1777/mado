# Tasks：Mado v1 核心闭环

**关联 Plan**：`Plan.md` —— Mado v1（2026-08-14）
**总计 Task**：14 个（TASK-001~014 全部 DONE；回归结论见 Plan.md 头部）

---

## Phase 1：项目骨架

### TASK-001：初始化 go.mod

- **Status**：DONE
- **Description**：在仓库根创建 `go.mod`，module 名 `mado`，声明 `go 1.24`。
- **Details**：
  - 内容两行：`module mado` + `go 1.24`（Wails v2.10 默认模板值，实际编译时按工具链自动调整）
- **Acceptance Criteria**：
  - `go vet ./...` 退出码 0（无源文件时 vet 通过）

---

## Phase 2：Wails 壳层

### TASK-002：安装 Wails CLI 并通过 doctor 检查

- **Status**：DONE
- **Description**：`go install github.com/wailsapp/wails/v2/cmd/wails@latest`，执行 `wails doctor` 并记录结果。
- **Details**：
  - 安装后 `wails version` 打印版本号
  - `wails doctor` 输出粘贴回主 Agent；**WebView2 runtime 已确认安装（151.0.4129.78），NSIS 可缺省**
- **Acceptance Criteria**：
  - `wails doctor` 输出可见，逐项记录 PASS/FAIL 与版本

### TASK-003：生成模板应用并定制造型

- **Status**：DONE
- **Description**：`wails init -n mado -t vanilla` 生成模板（Git 仓库已存在、已含 go.mod、目录非空，若 init 拒绝则使用 `-d` 或迁移模板），删除模板自带前端源文件，接入业务代码。
- **Details**：
  - 生成后删除 `frontend/src/*` 模板演示文件
  - 校验 `wails build` 可产出 `build/bin/mado.exe`，且能启动、有原生窗口与自定义标题
- **Acceptance Criteria**：
  - `wails build` 退出码 0，`build/bin/mado.exe` 存在且 >5MB

---

## Phase 3：核心业务逻辑（纯 Go 无 UI）

### TASK-004：实现 filesys 包

- **Status**：DONE
- **Description**：新建 `internal/filesys/filesys.go`，实现文件读/写/新文件与持久化 lastfile 记录。
- **Details**：
  - `ReadFile(path)` 读文件内容
  - `WriteFile(path, content)` 写回（磁盘满/权限错误返回 error）
  - `GetLastFile()/SetLastFile(path)` 读写持久化记录（JSON 存储于 `%APPDATA%/Mado/settings.json`）
  - 无 lastfile 时返回默认欢迎文档（**写入磁盘**，供预览使用）
- **Acceptance Criteria**：
  - 单测：读不存在文件 → 错误；写后读回内容一致；无记录时欢迎文档返回非空字符串

### TASK-005：实现 mdrender 包

- **Status**：DONE
- **Description**：新建 `internal/mdrender/mdrender.go`，封装 goldmark 渲染为安全 HTML。
- **Details**：
  - `Render(md string) (html string, err error)` 入口
  - 参数：CommonMark + GFM 扩展 + typographer + `html.WithUnsafe()`
  - **JS 静默剥离**：在 HTML 输出上过滤 `<script>` 开闭标签（转为空串；忽略内联 on* 事件——典型文档不触发）
  - 内置 Chroma 代码高亮（`highlighting.WithClasses(true)`）
- **Acceptance Criteria**：
  - 单测：`**b**` → 含 `<strong>`；`` `x` `` → 含 `<code>`；表格语法 → 含 `<table>`；`<script>alert(1)</script>` → 输出不含 `<script`；`<kbd>` 保留原样

### TASK-006：实现 settings 包

- **Status**：DONE
- **Description**：新建 `internal/settings/settings.go`，JSON 持久化的用户设置。
- **Details**：
  - `Settings{Theme string}` 结构体
  - `Load() (Settings, error)`（默认 Theme="dark"）/ `Save(s)`；文件存 `%APPDATA%/Mado/settings.json`
  - 与 filesys 的 lastfile 字段合并存同一 JSON 文件（顶层字段互不干扰）
- **Acceptance Criteria**：
  - 单测：首启默认 dark；保存后重读一致；文件不存在时 Load 不报错

### TASK-007：实现 theme 包（CSS 设计令牌）

- **Status**：DONE
- **Description**：新建 `internal/theme/theme.go`，内嵌亮/暗两套设计令牌 CSS（`go:embed assets/theme/*.css`），产出组合后的完整预览 CSS。
- **Details**：
  - `ThemeCSS(t string) (string, error)` 返回 `${token:light/dark}\n${base}\n${theme-<t>}` 拼接
  - 静态文件放 `internal/theme/assets/theme/`
  - 覆盖：编辑区 + 预览区背景/文字/边框/链接/表格/代码/引用/标题色
- **Acceptance Criteria**：
  - 单测：ThemeCSS("dark") 含 `--bg` 与 base 内容；无效主题返回错误

### TASK-008：接线应用壳（App 方法与窗口事件）

- **Status**：DONE
- **Description**：修改模板 `app.go` 与 `main.go`，实现全部前端绑定方法与窗口事件。
- **Details**：
  - 绑定：`LoadFile(path)`、`SaveFile(content)`、`Render(md)`、`GetWelcome()`、`GetCSS()`、`GetSettings()`、`SetTheme(theme)`
  - `wails.Run` 选项：`Frameless`（自定义标题栏）、`Title` 动态更新、窗口尺寸 1280×800、`MinWidth/MinHeight`、关闭确认（`OnBeforeClose`）
  - 标题栏三键（最小化/最大化/关闭）通过 `wails runtime` 绑定
- **Acceptance Criteria**：
  - `wails build` 成功；手动验证：无边框窗口、标题联动、关闭弹确认

---

## Phase 4：前端

### TASK-009：搭建前端构建链路（esbuild + npm deps）

- **Status**：DONE
- **Description**：创建 `frontend/package.json`，使用 esbuild 打包 CodeMirror 6 依赖，产出单个 JS 到 `frontend/dist/`（`build.zig` 支持目录，无 Wails 默认嵌入约束）。
- **Details**：
  - devDeps：`esbuild`
  - deps：`@codemirror/state`、`@codemirror/view`、`@codemirror/commands`、`@codemirror/language`、`@codemirror/lang-markdown`、`@codemirror/theme-one-dark`、`@lezer/highlight`
  - `scripts.build`：`esbuild src/main.ts --bundle --minify --outfile=dist/app.js --format=iife`
  - npm 安装失败（网络/供应链）时：报告主 Agent 执行 Plan §4 风险降级（CDN 版 cm6）
- **Acceptance Criteria**：
  - `pnpm install && pnpm build` 后 `frontend/dist/app.js` 存在且 >100KB

### TASK-010：搭建前端页面与编辑区（CodeMirror）

- **Status**：DONE
- **Description**：创建 `frontend/src/`，实现页面结构与 CodeMirror 编辑器。
- **Details**：
  - `index.html`：自定义标题栏（左侧圆点交通灯 + 居中文件名标题、右侧编辑/预览/主题切换按钮）+ 主区双栏
  - `main.ts`：初始化 CodeMirror（markdown 语言支持、one-dark 主题）、IME 正常、updateListener 防抖（100ms）+ 节流（80ms）触发渲染
- **Acceptance Criteria**：
  - 手动：编辑器可输入，语法高亮可见

### TASK-011：实现预览 iframe + HTML 渲染

- **Status**：DONE
- **Description**：实现预览区 iframe，通过 `Render` 绑定获取 HTML 并重建 `srcdoc`（防弹跳/防闪烁）。
- **Details**：
  - iframe `srcdoc = <base href> + theme.css + <article>` 结构
  - 渲染走 `fetch Render` → 主线程 → `iframe.srcdoc` 重建（iframe 重建不闪烁）
- **Acceptance Criteria**：
  - 手动：打字 → 预览更新；iframe 无横向/纵向弹跳；`<kbd>` 等 HTML 被渲染

### TASK-012：CSS 界面设计与主题切换

- **Status**：DONE
- **Description**：按 Plan 的设计令牌实现界面 CSS（现代设计感 + 亮/暗主题），并接入主题切换按钮。
- **Details**：
  - 主界面：居中窄栏布局、编辑/预览切换按钮、圆角、过渡动画
  - 主题切换：调用 `SetTheme` 持久化 + 即时刷新界面与预览
- **Acceptance Criteria**：
  - 手动：切换按钮点击后双区颜色同步变化；重启应用后主题保持

### TASK-013：快捷键与键盘交互

- **Status**：DONE
- **Description**：实现快捷键：`Ctrl+S` 保存、`Ctrl+O` 打开、`Ctrl+N` 新文件、`Ctrl+Shift+P` 打开文件对话框（Wails 内置打开对话框）。
- **Details**：
  - 对话框用 Wails 内置 `runtime.OpenFileDialog`（替代 Go 绑定）
  - 快捷键在 `main.ts` 用 keymap 处理
- **Acceptance Criteria**：
  - 手动：Ctrl+S 弹出保存对话框并写入文件；Ctrl+O 打开文件并显示内容；Ctrl+N 清空并写入默认新文件

---

## Phase 5：归档

### TASK-014：回归测试 + 打包 + 文档归档

- **Status**：DONE
- **Description**：全量回归（Plan §5 验收走查），`wails build` 打包，更新 Project.md，归档 Plan/Tasks 至 `.docs/`。
- **Details**：
  - 逐条走查 Plan §5 验收标准 1-6
  - 更新 Project.md 与代码库同步
  - 归档目录 `.docs/MM-DD-vN/`
- **Acceptance Criteria**：
  - 验收标准 1-6 全部通过；`build/bin/mado.exe` 可启动；`.docs/<归档目录>/` 含 Plan.md 与 Tasks.md，根目录无残留

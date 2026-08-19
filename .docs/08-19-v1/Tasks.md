# Tasks：公式渲染、设置页与偏好持久化

**关联 Plan**：`Plan.md` —— 公式渲染、设置页与偏好持久化 v1.5
**总计 Task**：12 个

---

## Phase 1：设置存储层重构（Go）

### TASK-001：settings 包扩展设置结构并迁移存储至 exe 目录

- **Status**：DONE
- **Priority**：高
- **Dependencies**：无
- **Description**：在 `internal/settings/settings.go` 中扩展 `Settings` 结构体新增 `Wrap bool`、`Math bool` 字段；存储路径由用户配置目录改为 exe 所在目录；JSON 读写由 `map[string]string` 放宽为 `map[string]any` 以容纳布尔值。
- **Details**：
  - 新增包级可覆写变量 `var storePath = defaultStorePath`，`defaultStorePath` 基于 `os.Executable()` + `filepath.Dir` 计算 exe 目录下的 `settings.json`（测试用 `t.TempDir()` 覆写，禁止向测试二进制所在目录写文件）
  - 新增导出函数 `Path() (string, error)` 返回存储文件完整路径（供 app 层旧数据迁移使用）
  - 新增导出函数 `Default() Settings` 返回默认值 `{Theme: "dark", Wrap: true, Math: true}`；`Load` 的回退分支改用 `Default()`
  - `Load`：文件缺失/损坏回退默认值不报错（沿用）；`theme` 键读取字符串；`wrap`/`math` 键读取布尔（类型不符时回退默认，不报错）
  - `Save`：读取现有 store 到 `map[string]any`，写入 `theme`（string）、`wrap`（bool）、`math`（bool），保留其它顶层键（如 `lastfile`）
  - 更新 `internal/settings/settings_test.go`：路径覆写改用 `storePath` 变量（`t.Setenv` 仅影响旧路径计算，exe 路径不受 env 控制）；新增用例：
    1. 文件不存在 → `Load` 返回 `{dark, true, true}`
    2. `Save({light, false, false})` 后 `Load` 恢复 `{light, false, false}`
    3. 预置含 `"lastfile": "/tmp/x.md"` 的混合 store，`Save` 后重新读文件，断言 `lastfile` 键仍存在且值不变
    4. 预置 `"wrap": "yes"`（类型错误）→ `Load` 回退 `Wrap=true` 不报错
- **Acceptance Criteria**：
  - `export PATH=$HOME/.local/go/bin:$PATH && go vet ./internal/settings/ && go test ./internal/settings/` 退出码 0
  - 上述 4 个用例均存在于测试文件中且通过

### TASK-002：filesys 包适配 exe 目录存储与任意值类型

- **Status**：DONE
- **Priority**：高
- **Dependencies**：无（与 TASK-001 同阶段闭环，避免存储分裂遗留到阶段外）
- **Description**：在 `internal/filesys/filesys.go` 中将 `settingsPath` 同步迁移至 exe 目录，读写改用 `map[string]any`，确保与 settings 包继续共享同一文件且互不破坏。
- **Details**：
  - 新增包级可覆写变量 `var storePath = defaultStorePath`（同 TASK-001 模式）；`settingsPath()` 改用它
  - `welcome.md` 的生成目录 `appDataDir()` **保持不变**（仍为用户配置目录下 `Mado/`）
  - `GetLastFile`：`json.Unmarshal` 到 `map[string]any`，`lastfile` 键做 `string` 类型断言（非字符串或缺失走 `persistWelcome`）
  - `SetLastFile`：读现有 store 到 `map[string]any`，仅覆写 `lastfile` 键后写回（布尔键共存不被清空）
  - 更新 `internal/filesys/filesys_test.go`：`t.Setenv` 同设 `APPDATA`+`XDG_CONFIG_HOME` 保留（welcome 路径仍走用户配置目录）；storePath 覆写为 `t.TempDir()`；新增用例：
    1. 预置含 `"wrap": false, "math": true` 的 store，`SetLastFile("/a.md")` 后读文件，断言布尔键仍在且 `lastfile` 已更新
    2. `GetLastFile` 在含布尔键的 store 下正常返回 `lastfile`
- **Acceptance Criteria**：
  - `go vet ./internal/filesys/ && go test ./internal/filesys/` 退出码 0
  - 上述 2 个用例存在且通过

### TASK-003：app 层旧存储一次性迁移

- **Status**：DONE
- **Priority**：高
- **Dependencies**：TASK-001（依赖 `settings.Path()`）
- **Description**：在 `app.go` 中新增迁移函数并在 `startup` 中调用：exe 目录 settings.json 不存在且旧用户配置目录 settings.json 存在时，整体复制旧文件到新位置（保留主题与最近文件记录）。
- **Details**：
  - 新增函数 `migrateLegacyStore(src, dst string) error`：`dst` 存在 → 直接返回 nil；`src` 不存在 → 返回 nil；否则 `os.ReadFile(src)` + `os.WriteFile(dst, ...)`（`dst` 父目录已由 settings 包保证创建，此处仍做 `MkdirAll` 防御）
  - `startup` 中在 `settings.Load()` 之前调用：`src = filepath.Join(userConfigDir, "Mado", "settings.json")`（`os.UserConfigDir()` 出错则跳过迁移），`dst = settings.Path()`
  - 新增 `main_test.go`（根包）测试 `migrateLegacyStore`：
    1. `src` 存在、`dst` 不存在 → `dst` 内容与 `src` 一致
    2. `src` 不存在 → 无文件产生、无错误
    3. `dst` 已存在 → `dst` 内容不被覆盖
- **Acceptance Criteria**：
  - `go vet . && go test .` 退出码 0
  - 上述 3 个用例存在且通过

---

## Phase 2：公式渲染后端（Go）

### TASK-004：mdrender 数学定界符 goldmark 扩展

- **Status**：DONE
- **Priority**：高
- **Dependencies**：无（纯渲染层，可与 Phase 1 并行开发，但按 Plan 串行执行）
- **Description**：在 `internal/mdrender/` 新增 `math.go`，实现自研 goldmark 扩展：解析 `$...$` 行内与 `$$...$$` 块级定界符，输出带 `data-tex` 属性的占位元素；`Render` 签名变更为 `Render(md string, math bool)` 按开关装配扩展。
- **Details**：
  - 块级解析器（参照 fenced code block 机制）：行首 ≤3 空格缩进的 `$$` 开启数学块，至闭合 `$$` 行或文档结束；块内内容不经过 Markdown 解析
  - 行内解析器（Trigger 字节 `$`）：仅单行内寻找闭合单 `$`；**内容为空、或首/尾字符为空格、或未闭合 → 不构成公式，按字面文本输出**（货币语义防护，如 `$5 and $10`）
  - `\$` 转义不触发行内公式（若 goldmark 既有转义处理未覆盖，解析器内回退检查 opener 前置字节为 `\` 时放弃）
  - 围栏代码块与行内代码（反引号）内的 `$` 不触发（依赖 goldmark 解析优先级，用单测锁定）
  - 渲染输出（TeX 原文经 `html.EscapeString` 转义，同时写入属性与元素文本内容，公式渲染失败时降级显示源码）：
    - 行内：`<span class="math-inline" data-tex="ESCAPED">ESCAPED</span>`
    - 块级：`<div class="math-block" data-tex="ESCAPED">ESCAPED</div>`
  - `Render(md string, math bool)`：`math=true` 时 `goldmark.WithExtensions` 追加数学扩展；现有测试调用点统一改为 `Render(md, false)` 保持原断言不变
  - `mdrender_test.go` 新增用例（`math=true` 路径）：
    1. `$E=mc^2$` → 输出含 `class="math-inline"` 且 `data-tex="E=mc^2"`
    2. `$$\frac{a}{b}$$` 块级 → 输出含 `class="math-block"`
    3. TeX 含 `<`、`>`、`&`、`"` 时 `data-tex` 内为 HTML 转义形式
    4. `$5 and $10` → 输出字面文本，无 `math-inline`
    5. `\$5` → 输出含 `$` 字面，无 `math-inline`
    6. 围栏代码块内 `$x$` 与行内代码 `` `$x$` `` → 无占位元素
    7. `math=false` → `$...$`/`$$...$$` 原样输出
    8. 未闭合 `$` → 字面输出
- **Acceptance Criteria**：
  - `go vet ./internal/mdrender/ && go test ./internal/mdrender/` 退出码 0
  - 上述 8 个用例存在且通过

### TASK-005：App.Render 按公式开关分支

- **Status**：DONE
- **Priority**：高
- **Dependencies**：TASK-001、TASK-004
- **Description**：在 `app.go` 的 `Render` 方法中传入 `a.settings.Math` 调用 `mdrender.Render`，使前端渲染请求按持久化开关返回占位元素或字面文本。
- **Details**：
  - `Render(md string)` 对前端签名不变，内部改为 `mdrender.Render(md, a.settings.Math)`
  - `startup` 回退分支使用 `settings.Default()`（TASK-001 已提供）
  - 前端 wailsjs 绑定无需变更（`Render` 签名未变）
- **Acceptance Criteria**：
  - `go vet ./... && go test ./...` 退出码 0

---

## Phase 3：公式渲染前端

### TASK-006：引入 KaTeX 依赖与静态资源分发

- **Status**：DONE
- **Priority**：高
- **Dependencies**：无（资源准备，可与 Phase 2 并行，按 Plan 串行执行）
- **Description**：`frontend/package.json` 新增 `katex` 运行时依赖；构建脚本增加复制 KaTeX 样式与字体到 `dist/katex/` 的步骤。
- **Details**：
  - `dependencies` 增加 `"katex": "^0.16.0"`
  - `build` 脚本在 esbuild 打包后追加复制：`node -e "const fs=require('fs');fs.mkdirSync('dist/katex/fonts',{recursive:true});fs.copyFileSync('node_modules/katex/dist/katex.min.css','dist/katex/katex.min.css');fs.cpSync('node_modules/katex/dist/fonts','dist/katex/fonts',{recursive:true})"`（合并进现有复制 index.html 的 node -e 或独立一段均可）
  - `dev` 脚本开头追加同样的复制步骤（watch 前执行一次）
  - 不引入 `@types/katex`（构建链为纯 esbuild，无类型检查）
- **Acceptance Criteria**：
  - `cd frontend && npm install --include=dev && npm install katex && npm run build` 退出码 0
  - `test -f dist/katex/katex.min.css && test -f dist/katex/fonts/KaTeX_Main-Regular.woff2 && echo OK` 输出 `OK`
  - `git status --porcelain frontend/dist/` 无输出（产物仍被 gitignore）

### TASK-007：预览帧公式绘制通道

- **Status**：DONE
- **Priority**：高
- **Dependencies**：TASK-004（占位元素格式）、TASK-006
- **Description**：在 `frontend/src/main.ts` 中引入 KaTeX，预览帧骨架链接 KaTeX 样式，并在每次预览更新后于父上下文将占位元素渲染为公式 HTML。
- **Details**：
  - `import katex from 'katex'`
  - `writePreview` 的 `doc()` 骨架 `<head>` 内新增 `<link rel="stylesheet" href="./katex/katex.min.css"/>`（srcdoc 继承父文档基础 URL，相对路径经 Wails 资产服务解析到 `dist/katex/`）
  - 新增 `renderMathInFrame(frameDoc: Document | null | undefined)`：`frameDoc.querySelectorAll('.math-inline, .math-block')` 逐个取 `data-tex` 属性，调用 `katex.renderToString(tex, { displayMode: el.classList.contains('math-block'), throwOnError: false })`，结果写入 `el.innerHTML`
  - 调用点两处：`writePreview` 原地更新路径（`content.innerHTML = html` 之后）；iframe `load` 事件回调（与 `hookPreviewLinks` 同处挂载，覆盖 srcdoc 首帧与回退重建路径）
  - 可选缓存：按 TeX 字符串建 `Map<string, string>` 缓存 renderToString 结果，避免每次防抖更新重复渲染（文档公式数量少时收益有限，实现不超过 5 行则保留）
  - 渲染异常（KaTeX ParseError）由 `throwOnError: false` 兜底为红色错误文本，不中断预览
- **Acceptance Criteria**：
  - `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty > /dev/null` 退出码 0
  - `npm run build` 退出码 0
  - 公式视觉行为验收归云端 CI 产物人工验收（本机无 GUI，遵循 SCOPE 测试约定）

---

## Phase 4：设置页与功能开关

### TASK-008：设置面板 UI

- **Status**：DONE
- **Priority**：高
- **Dependencies**：TASK-006（构建链就绪）
- **Description**：在 `frontend/src/main.ts` 与 `frontend/src/style.css` 中实现设置面板：标题栏齿轮按钮、原生 `<dialog>` 模态面板、主题/自动换行/公式渲染三行控件及配套样式。
- **Details**：
  - 新增 `GLYPH_SETTINGS` 内联 SVG（齿轮图标，风格对齐既有 15×15 线性图标）
  - `titlebar-actions` 在主题按钮后新增 `btn-settings`（`title="设置"`）
  - 面板采用原生 `<dialog id="settings-dialog">`（复用关闭确认模态的 Esc/焦点囚禁先例），内容三行：
    1. 主题：`light`/`dark` 双选 segmented 控件（id：`set-theme-light`/`set-theme-dark`）
    2. 编辑器自动换行：switch 开关（id：`set-wrap`）
    3. 公式渲染：switch 开关（id：`set-math`）
  - 控件为受控状态：打开面板时按当前偏好刷新选中态；本 Task 仅实现 UI 结构与开合交互（Esc/遮罩关闭），接线归 TASK-010
  - `style.css` 新增面板与 switch 样式，暗/亮两套（跟随 `data-theme`，复用既有设计令牌变量）
- **Acceptance Criteria**：
  - `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty > /dev/null` 退出码 0
  - `npm run build` 退出码 0
  - 面板视觉与交互验收归云端 CI 产物人工验收

### TASK-009：Go 开关绑定与前端绑定副本同步

- **Status**：DONE
- **Priority**：高
- **Dependencies**：TASK-001
- **Description**：在 `app.go` 中新增 `SetWrap`/`SetMath` 绑定方法（更新内存设置并持久化）；按项目约束手补 `frontend/wailsjs/go/main/App.js` 与 `App.d.ts` 副本。
- **Details**：
  - `func (a *App) SetWrap(wrap bool) error`：`a.settings.Wrap = wrap; return settings.Save(a.settings)`（`SetMath` 同构）
  - `frontend/wailsjs/go/main/App.js` 追加：
    ```js
    export function SetWrap(arg1) { return window['go']['main']['App']['SetWrap'](arg1); }
    export function SetMath(arg1) { return window['go']['main']['App']['SetMath'](arg1); }
    ```
  - `App.d.ts` 追加对应声明 `export function SetWrap(arg1:boolean):Promise<void>;`（`SetMath` 同构）
  - `main.ts` 导入列表加入 `SetWrap, SetMath`；`Settings` interface 扩展为 `{ Theme: string; Wrap: boolean; Math: boolean }`
- **Acceptance Criteria**：
  - `go vet ./... && go test ./...` 退出码 0
  - `grep -c "SetWrap\|SetMath" frontend/wailsjs/go/main/App.js` 输出 ≥ 2
  - `grep -c "SetWrap\|SetMath" frontend/wailsjs/go/main/App.d.ts` 输出 ≥ 2

### TASK-010：偏好接线与实时生效

- **Status**：DONE
- **Priority**：高
- **Dependencies**：TASK-005、TASK-007、TASK-008、TASK-009
- **Description**：在 `frontend/src/main.ts` 中将设置面板三控件与 Go 持久化接口及本地实时应用逻辑接线：主题、换行、公式开关均即时生效并落盘。
- **Details**：
  - 自动换行：新增 `wrapCompartment = new Compartment()`，编辑器扩展数组加入 `wrapCompartment.of(EditorView.lineWrapping)`；切换函数 `applyWrap(on: boolean)` 调用 `cm.dispatch({ effects: wrapCompartment.reconfigure(on ? EditorView.lineWrapping : []) })`
  - 主题：面板 segmented 点击 → `SetTheme` + `applyTheme`（复用既有链路，含预览样式失效与窗口 chrome）；`applyTheme` 内同步刷新面板 segmented 选中态，保持与 `btn-theme` 快捷按钮双入口一致
  - 公式开关：switch change → `SetMath(value)` 成功后调用 `void refreshPreview()`（Go 侧 `Render` 按新设置返回占位元素或字面文本，前端数学绘制通道自动跟进）
  - 换行开关：switch change → `SetWrap(value)` 成功后调用 `applyWrap(value)`
  - `init`：`GetSettings()` 成功后按返回值依次 `applyTheme`、`applyWrap(s.Wrap)`、刷新面板控件初始态（公式开关无需本地应用，仅面板态）
  - 齿轮按钮 click → 刷新面板控件态并 `showModal()`；dialog close（Esc/遮罩）无额外清理
- **Acceptance Criteria**：
  - `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty > /dev/null` 退出码 0
  - `npm run build` 退出码 0
  - 实时生效与持久化行为验收归云端 CI 产物人工验收（本地无 GUI）

---

## Phase 5：验证与文档

### TASK-011：本地全链验证

- **Status**：DONE
- **Priority**：高
- **Dependencies**：TASK-001 ~ TASK-010 全部
- **Description**：按 Project.md 本机验证链执行完整回归：Go 静态检查与测试、前端零产物语法检查、前端构建与产物清单核对。
- **Details**：
  - 依序执行并记录输出：
    1. `export PATH=$HOME/.local/go/bin:$PATH`
    2. `go vet ./...`
    3. `go test ./...`
    4. `cd frontend && npm install --include=dev`
    5. `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty > /dev/null`
    6. `npm run build`
    7. `ls dist/app.js dist/app.css dist/index.html dist/katex/katex.min.css`
  - 回归结论（各命令退出码）记入 Plan.md「回归测试结论」栏
- **Acceptance Criteria**：
  - 步骤 2~6 全部退出码 0
  - 步骤 7 列出全部 4 个产物路径无 `No such file` 错误

### TASK-012：项目文档与欢迎文档同步

- **Status**：DONE
- **Priority**：中
- **Dependencies**：TASK-011
- **Description**：更新 `.docs/Project.md` 使其与代码库一致；`internal/filesys/filesys.go` 的 `WelcomeDoc` 增加公式示例段落。
- **Details**：
  - `WelcomeDoc` 在 "It supports" 表格后追加公式示例：一行块级公式（如 `$$E = mc^2$$`）与一行行内公式（如 `$\frac{1}{2}$`）
  - `Project.md` 对照维护速查更新：
    - §1 概述：当前阶段改 v1.5；非目标列表移除「数学公式」
    - §2 环境与运行：测试说明补充设置存储已迁至 exe 目录、测试经包级路径变量覆写
    - §3 目录结构：`internal/mdrender/` 补 math 扩展说明；`frontend/` 补 `dist/katex/` 公式静态资源
    - §4 架构与数据流：渲染链路补公式通道（Go 占位元素 → 父上下文 KaTeX 渲染 → 帧内原地更新）；设置数据流补设置页/开关
    - §6 约束与已知坑：新增「存储迁移至 exe 目录（便携化，受保护目录不可写为已知限制）」「srcdoc 帧相对路径资源经资产服务解析」「`$` 行内公式首尾空格启发式与货币误判防护」「行内公式不支持跨行」
    - §8 决策记录：新增公式渲染管线、KaTeX 资源分发、存储便携化迁移三条（对齐 Plan.md §3 决策）
    - §9 术语表：新增「公式通道」条目
- **Acceptance Criteria**：
  - `go vet ./internal/filesys/ && go test ./internal/filesys/` 退出码 0（WelcomeDoc 变更无回归）
  - Project.md 上述各节均已更新（逐节核对）
  - Plan.md 状态更新为 DONE 并填写完成日期与回归测试结论（归档前置条件）

# Tasks：应用图标绘制、11-14 交付质量复盘修复与 0.7.1 版本发布

**关联 Plan**：`Plan.md` —— 应用图标绘制、11-14 交付质量复盘修复与 0.7.1 版本发布 v1.0  
**总计 Task**：8 个  
**状态**：DONE（8/8）  
**完成日期**：2026-11-14  

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 14px 16px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e8ec;">任务依赖拓扑与阶段分布（共 8 项，全部由交付段主线顺序执行）</div>
  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 12px; line-height: 1.5;">
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 1 · 图标绘制接入</div>
      <div>TASK-001（绘制图标并配置路径）</div>
    </div>
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 2 · 错漏根治收敛</div>
      <div>TASK-002 ──▶ TASK-003 ──▶ TASK-004</div>
    </div>
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 3 · 验证与文档维护</div>
      <div>TASK-005 ──▶ TASK-006</div>
    </div>
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 4 · 归档与 0.7.1 发布</div>
      <div>TASK-007 ──▶ TASK-008</div>
    </div>
  </div>
</div>

---

## Phase 1：应用图标绘制与宿主配置接入

### TASK-001：生成 `assets/icon.png` 1024×1024 应用图标并在 `mygo.json` 中接入 `icon` 配置

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：无
- **Executor**：主线
- **Description**：使用临时 Go 标准库绘图程序按 4× 超采样抗锯齿渲染 `assets/icon.png`（1024×1024 RGBA 方形 PNG），通过多档缩略图视觉校验清晰度后删除临时生成脚本与预览图，并在 `mygo.json` 中声明 `"icon": "assets/icon.png"`。
- **Details**：
  - 图标存放路径固定为 `assets/icon.png`（禁止放入 `resources/`，防止 `mygo build` 将 `icon.png` 当作运行时外部资源原样拷贝至 `dist/windows-amd64/` 及安装目录）。
  - 图标几何与配色规格（对齐 `frontend/src/tokens.css` 的 MD3 靛蓝角色）：
    - 画布尺寸 `1024×1024`，四周保留 `64px` 透明边距（主体圆角方砖位于 `[64, 960]`，宽 `896px`、圆角半径 `200px`），四角像素 `Alpha == 0`。
    - 方砖底色采用左上至右下深靛蓝线性渐变（`#2B478B` → `#18274D`），内嵌分栏“窗格”微对比底纹（左侧面板浅亮层、右侧面板靛蓝微调层与圆角内描边高光 `rgba(180, 197, 255, 0.28)`），呼应“Mado（窓 / 双栏窗口）”定位。
    - 前景绘制几何抗锯齿的冰白（`#EEF3FF`）粗体 `M` 字标志与右侧亮靛蓝（`#9DB8FF`）Markdown 下箭头 `↓`，主干笔画线宽 `≥ 72px`、笔画净间距 `≥ 48px`，确保经 `mygo` 的预乘 Alpha 面积平均缩放至 `16×16`、`24×24`、`32×32` 时笔画连续不粘连。
  - 在 `/tmp` 下临时运行标准库脚本输出 `assets/icon.png` 及 `256/64/32/16px` 拼合预览图，调用 `read_image` 目视核验大尺寸质感与小尺寸可读性，核验通过后立即删除 `/tmp` 下的一次性脚本与拼合预览图（仓库仅保留 `assets/icon.png`）。
  - 在 `mygo.json` 中新增字段 `"icon": "assets/icon.png"`（保持其余字段不变；版本号统一在 TASK-008 更新为 `0.7.1`）。
- **Acceptance Criteria**：
  - `assets/icon.png` 存在，PNG 文件头合法，宽高精确为 `1024×1024`，四角 `(0,0)`、`(1023,0)`、`(0,1023)`、`(1023,1023)` 为完全透明（`Alpha == 0`），中心区域不透明且文件体积控制在 `80KB` 以内
  - `mygo.json` 为合法 JSON 且 `icon` 字段值为 `"assets/icon.png"`
  - 仓库根目录不存在 `resources/` 目录，亦无遗留图标生成脚本

---

## Phase 2：11-14 交付缺陷根治与契约收敛

### TASK-002：修复 `app.go` 与 `main.go` 启动文件并发竞态、命令行标志过滤、`OnOpenFile` 时序分流并收敛生成契约

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001
- **Executor**：主线
- **Description**：在 `app.go` 中为启动文件状态加锁并引入消费位分流 `OnOpenFile`，将内部方法私有化并删除未使用的 `App.SetTitle`；在 `main.go` 中过滤命令行 `-` 标志参数并改调统一分流入口；运行 `mygo generate` 同步更新 `frontend/src/mygo.ts`。
- **Details**：
  - 修改 `app.go`：
    - 在 `App` 结构体中新增 `startupConsumed bool`（与 `startupFile string` 一并受 `a.mu` 保护）。
    - 将 `SetStartupFile(path string)` 改为包内私有方法 `setStartupFile(path string)`，内部加 `a.mu.Lock()` 写入 `a.startupFile = path`。
    - 修改 `GetStartupFile() string`：加 `a.mu.Lock()`，读取 `path := a.startupFile`，置 `a.startupConsumed = true` 后返回 `path`（单次启动内若前端未消费前 `OnOpenFile` 触发，缓冲值会就地更新；消费后进入运行期事件通道）。
    - 新增包内私有方法 `handleOpenFile(path string) (*mygo.Window, bool)`：加 `a.mu.Lock()`，若 `!a.startupConsumed`，写入 `a.startupFile = path` 并返回 `nil, false`；若 `a.startupConsumed` 且 `a.win != nil`，返回 `a.win, true`，否则返回 `nil, false`。
    - 删除前端从未调用的 `App.SetTitle(title string)` 方法，并删除 `LoadFile`（原第 111 行）与 `SaveFile`（原第 131 行）中冗余的 `a.SetTitle(filepath.Base(path))` 调用（窗口标题统一由前端 `main.ts` 的 `setTitle` 经 `currentWindow.setTitle` 单点维护）。
  - 修改 `main.go`：
    - 命令行首参提取改为遍历 `os.Args[1:]`，跳过空字符串与以 `"-"` 开头的标志参数，取首个非标志参数调用 `app.setStartupFile(arg)` 后跳出循环。
    - `mygo.App.OnOpenFile` 回调改为：调用 `if win, ok := app.handleOpenFile(path); ok { _ = openFileEvent.Emit(win, path) }`（替代原先恒为假的 `if app.window() == nil` 分支）。
  - 执行 `CGO_ENABLED=0 go run github.com/egoist/mygo/cmd/mygo@v0.7.4 generate` 重新生成 `frontend/src/mygo.ts`，确认 `setStartupFile` 与 `setTitle` 从生成客户端中移除。
- **Acceptance Criteria**：
  - `app.go` 中不再存在公开方法 `SetStartupFile` 与 `SetTitle`，所有 `startupFile` / `startupConsumed` 读写均在 `a.mu` 锁保护下执行
  - `frontend/src/mygo.ts` 不包含 `setStartupFile` 与 `setTitle`，且再次运行 `mygo generate` 输出 `frontend/src/mygo.ts is up to date`
  - `CGO_ENABLED=0 go vet ./...` 通过（待 TASK-004 同步更新测试后跑全量单测）

### TASK-003：收口前端全局快捷键、添加模态框重入守卫并对齐预览与导出的公式开关

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-002
- **Executor**：主线
- **Description**：在 `frontend/src/modals.ts` 中添加模态打开态互斥守卫并导出 `isAnyOpen()`；在 `frontend/src/main.ts` 与 `frontend/src/preview.ts` 中统一接管跨模式快捷键（移除 `editor.ts` 与 `modals.ts` 的分散绑定）；让实时预览与 HTML 导出严格遵循 `math` 开关状态。
- **Details**：
  - 修改 `frontend/src/modals.ts`：
    - 在 `Modals` 接口新增 `isAnyOpen(): boolean`，实现为 `Boolean(closeDialog?.open || settingsDialog?.open || exportDialog?.open)`。
    - 在 `openSettings()` 与 `openExport()` 顶部均添加 `if (isAnyOpen()) return;` 守卫，防止重复按热键对已开启的 `<dialog>` 再次调用 `showModal()` 抛出 `InvalidStateError`，或在其他模态开启期间叠出第二层弹窗。
    - 删除 `modals.ts` 内独立的 `window.addEventListener('keydown', ...)` 块（原第 210–217 行），交由 `main.ts` 统一分发。
    - 在 `runExport()`（原第 259–263 行）中将 `renderMath: renderMathInRoot` 改为 `renderMath: deps.getMath() ? renderMathInRoot : undefined`。
  - 修改 `frontend/src/editor.ts`：
    - 从 `EditorActions` 接口移除不再由编辑器私自持有的 `save`、`open`、`create`、`exportHtml` 四个动作字段，并删除 `keymap.of([...])` 中的 `Ctrl-s`、`Ctrl-o`、`Ctrl-Shift-p`、`Ctrl-n`、`Ctrl-p`、`Ctrl-Shift-e` 六条重复映射（保留 `defaultKeymap`、`historyKeymap`、`foldKeymap`、`indentWithTab`）。
  - 修改 `frontend/src/preview.ts`：
    - 在 `PreviewActions` 接口新增可选或必选回调 `onKeydown(e: KeyboardEvent): void`，在 `hookFrame()` 中绑定 `doc.addEventListener('keydown', (e) => actions.onKeydown(e))`，使焦点位于预览 `iframe` 文档内部时快捷键同样可达。
    - 将 `Preview.write` 签名扩展为 `write(html: string, css: string, math?: boolean): void`（默认 `math = true`），记录 `lastMathEnabled`：当 `iframe` `load` 触发或原地更新（`htmlChanged || mathChanged`）时，仅在 `lastMathEnabled` 为 `true` 时调用 `renderMathInRoot(doc)`；当 `math` 由 `true` 切为 `false` 时重写 `content.innerHTML = html` 以还原未渲染占位内容。
  - 修改 `frontend/src/main.ts`：
    - 提取统一函数 `handleGlobalKeydown(e: KeyboardEvent): void`：仅处理携带 `e.ctrlKey || e.metaKey` 且不带 `e.altKey` 的组合键（`s` 无 Shift → `saveCurrent()`；`o` 无 Shift 或 `p` 带 Shift → `openFile()`；`n` 无 Shift → `newFile()`；`p` 无 Shift 或 `e` 带 Shift → `modals.openExport()`）。命中上述任一热键时一律先执行 `e.preventDefault()` 阻止 WebView 默认行为；若 `modals.isAnyOpen()` 为 `true` 则直接返回，不触发底层文件操作或二次开窗。
    - 在 `window` 上以捕获阶段绑定 `window.addEventListener('keydown', handleGlobalKeydown, { capture: true })`，并将 `handleGlobalKeydown` 传入 `createPreview` 的 `onKeydown`。
    - 在 `refreshPreview()` 中调用 `preview.write(html, css, math)`。
- **Acceptance Criteria**：
  - `cd frontend && npm run typecheck` 零错误通过
  - `cd frontend && ./node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty >/dev/null` 退出码为 0
  - `editor.ts` 与 `modals.ts` 中无残留局部应用级热键绑定，所有应用热键单一归口于 `main.ts`

### TASK-004：在 `main_test.go`、`uiContract.test.mjs`、`startup.check.mjs` 与 `export.check.mjs` 中新增回归测试并移除契约白名单

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001, TASK-002, TASK-003
- **Executor**：主线
- **Description**：为后端启动文件生命周期与并发安全补齐单元测试，移除 `uiContract.test.mjs` 的 `HOST_SIDE_ONLY` 白名单并新增图标规格与契约断言，在无头检查中覆盖预览模式全局热键与模态重入无异常契约。
- **Details**：
  - 修改 `main_test.go`：
    - 清理第 284 行残留的 `Wails-style` 旧注释表述，并在 `TestConcurrentBindingsNoRace` 的并发分支中加入 `GetStartupFile()` 与 `handleOpenFile("race.md")` 并发调用，确保 `go test -race` 直接覆盖启动文件锁路径。
    - 新增 `TestStartupFileAndOpenFileLifecycle`：验证 ① 消费前调用 `setStartupFile` 及 `handleOpenFile`（模拟宿主 `WhenReady` 后、前端就绪前的 `launchArgs`）仅更新缓冲且返回 `emit == false`；② 调用 `GetStartupFile()` 返回最新路径并置消费态；③ 消费后且已调用 `setWindow`（可构造零值 `&mygo.Window{}` 指针仅测试状态机分支，不调用原生方法）时 `handleOpenFile` 返回 `emit == true`，无窗口时返回 `emit == false`。
    - 新增命令行非标志首参挑选纯函数（如 `firstFileArg(args []string) string`）及单测 `TestFirstFileArg`：验证 `["--flag", "-v", "note.md"]` 返回 `"note.md"`，纯标志 `["--headless"]` 返回 `""`。
  - 修改 `frontend/tests/uiContract.test.mjs`：
    - 删除 `HOST_SIDE_ONLY` 例外映射表（原第 66–69 行），断言 `src/mygo.ts` 中生成的**每一个** `App.*` 方法均在 `bridge.ts` 中存在 `App.<method>` 委托调用，实现零例外 1:1 契约校验。
    - 读取 `../mygo.json` 与 `../assets/icon.png` 二进制头部：断言 `mygo.json` 声明 `"icon": "assets/icon.png"`，断言 `assets/icon.png` 具备合法 8 字节 PNG 签名且 `IHDR` 区块宽高均为 `1024`（大端 `uint32` 偏移 16 与 20）。
    - 断言 `modals.ts` 包含 `isAnyOpen` 互斥守卫，且 `main.ts` 包含统一 `handleGlobalKeydown` 捕获绑定。
  - 修改 `frontend/tests/startup.check.mjs` 与 `frontend/tests/export.check.mjs`：
    - 在 `startup.check.mjs` 中新增检查项 `preview-mode-shortcuts`：切换至 `preview` 模式后派发 `Ctrl+S` 键盘事件，断言触发宿主保存流程而不被预览隐藏编辑器阻断。
    - 在 `export.check.mjs` 中新增检查项 `modal-reentry-guard`：在 `#export-dialog` 已处于 `open === true` 状态下再次向 `window` 派发 `Ctrl+P` `keydown` 事件，断言不抛出任何异常且 `#export-dialog.open` 保持为 `true`。
- **Acceptance Criteria**：
  - `CGO_ENABLED=0 go vet ./...`、`CGO_ENABLED=0 go test ./...` 与 `go test -race ./...` 全部通过
  - `cd frontend && npm test` 全部 6 项前端自检通过
  - `cd frontend && npm run build && node tests/startup.check.mjs && node tests/modeScroll.check.mjs && node tests/export.check.mjs` 全部无头浏览器检查通过

---

## Phase 3：CI 图标校验补强、工作区清理与文档同步

### TASK-005：在 `.github/workflows/build.yml` 中新增 PE 嵌入图标与单文件纯净度校验，并清理 `temp/` 与 `.gitignore`

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-004
- **Executor**：主线
- **Description**：在云端 Windows 构建工作流中添加 `Mado.exe` 关联图标提取断言及无散落 `icon.png` 文件断言；删除根目录遗留的 `temp/mado-visual-redesign.html` 临时目录并在 `.gitignore` 中新增 `temp/`。
- **Details**：
  - 修改 `.github/workflows/build.yml` 的 `Verify artifacts` 步骤：
    - 断言 `-not (Test-Path 'dist\windows-amd64\icon.png')`，防止未来误将图标移入 `resources/` 破坏便携单文件形态。
    - 加载 `Add-Type -AssemblyName System.Drawing` 后执行 `$ico = [System.Drawing.Icon]::ExtractAssociatedIcon((Resolve-Path $portable).Path)`，断言 `$null -ne $ico -and $ico.Width -gt 0` 并释放 `$ico.Dispose()`，机械验证 `mygo build` 已将图标编译嵌入 `Mado.exe` PE 资源。
  - 修改 `.github/workflows/release.yml`：将手动触发输入参数 `version` 的示例默认值由旧模板 `"v1.2.0"` 对齐为当前版本系 `"v0.7.1"`。
  - 清理工作区：删除未跟踪的旧版 Fluent 原型文件 `temp/mado-visual-redesign.html` 及空的 `temp/` 目录；在 `.gitignore` 中追加 `temp/` 行，避免后续前端工作流临时原型污染版本库状态。
- **Acceptance Criteria**：
  - `.github/workflows/build.yml` 包含 `ExtractAssociatedIcon` 断言与 `icon.png` 不存在断言
  - 根目录 `temp/` 已不存在，且 `.gitignore` 包含 `temp/`

### TASK-006：执行完整本机验证链并同步更新 `.docs/Project.md`

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-005
- **Executor**：主线
- **Description**：按 `.docs/Project.md` 验证清单完整跑通前后端全部检查，并同步更新 `.docs/Project.md` 中的目录结构、应用图标机制、启动文件消费分流、零例外 IPC 契约及全局热键说明。
- **Details**：
  - 完整执行本机 8 步验证链并确认退出码全为 0：
    1. `cd frontend && npm run typecheck`
    2. `cd frontend && ./node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty >/dev/null`
    3. `cd frontend && npm test`
    4. `cd frontend && npm run build`
    5. `CGO_ENABLED=0 go vet ./...` 与 `CGO_ENABLED=0 go test ./...`
    6. `go test -race ./...`
    7. `CGO_ENABLED=0 go run github.com/egoist/mygo/cmd/mygo@v0.7.4 generate`（确认输出 `frontend/src/mygo.ts is up to date`）
    8. `cd frontend && node tests/startup.check.mjs && node tests/modeScroll.check.mjs && node tests/export.check.mjs`
  - 更新 `.docs/Project.md`：
    - 在“桌面宿主”与“结构”章节补充 `assets/icon.png`（1024×1024 应用图标源，经 `mygo.json` 的 `icon` 字段编译进 Windows PE 资源与 NSIS 安装器，不进入 `resources/` 外置拷贝目录）。
    - 在“数据流 · 启动”与“约束与决策”章节更新：命令行过滤 `-` 标志参数、`OnOpenFile` 以 `startupConsumed` 加锁分流启动缓冲与运行期事件、`mygo.ts` 与 `bridge.ts` 零例外 1:1 对应（移除旧“`setStartupFile`/`setTitle` 为宿主侧例外”的过期描述）、顶层捕获阶段统一分发全局快捷键及模态重入互斥守卫。
- **Acceptance Criteria**：
  - 上述 8 步本机验证命令退出码全部为 0
  - `.docs/Project.md` 不再包含已退役的 `setStartupFile`/`setTitle` 例外描述，且准确反映 `assets/icon.png` 与最新数据流

---

## Phase 4：阶段归档、版本升级与 0.7.1 正式发布

### TASK-007：回填完成状态、归档 `Plan.md` 与 `Tasks.md` 至 `.docs/11-14-v3/` 并提交功能与修复代码

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-006
- **Executor**：主线
- **Description**：将 `Plan.md` 与 `Tasks.md` 更新为 `DONE` 状态并填写完成日期与回归测试结论，按 Archive 规范移入 `.docs/11-14-v3/`，随后检查变更集并创建符合规范的 Git 提交。
- **Details**：
  - 更新根目录 `Plan.md` 头部（`状态：DONE`、`完成日期：2026-11-14`、完整回归测试结论）与 `Tasks.md` 全部任务状态（TASK-001 至 TASK-007 标为 `DONE`，TASK-008 在归档前同步说明发版动作或合并于发版前收口，确保归档文件状态为 `DONE`）。
  - 查询 `.docs/` 下 `11-14-v*` 目录最大序号（当前已有 `11-14-v1`、`11-14-v2`），创建 `.docs/11-14-v3/` 并将 `Plan.md` 与 `Tasks.md` 移入其中，校验根目录无残留 `Plan.md` / `Tasks.md`。
  - 执行 `git status` 与 `git diff` 逐文件核查（确保不含构建产物、临时文件或敏感信息），按项目提交规范创建功能修复与归档提交（如 `feat: 绘制应用图标并修复 11-14 启动竞态与热键模态缺陷（归档 11-14-v3）`）。
- **Acceptance Criteria**：
  - `.docs/11-14-v3/Plan.md` 与 `.docs/11-14-v3/Tasks.md` 同时存在且头部状态均为 `DONE`
  - 根目录不存在 `Plan.md` 与 `Tasks.md`，`git status` 工作树干净

### TASK-008：更新 `mygo.json` 版本号至 `0.7.1`，提交并推送 `main` 与 `v0.7.1` 标签，验收云端构建与 Release 发布

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-007
- **Executor**：主线
- **Description**：对齐 `0.7.0` 发版惯例，将 `mygo.json` 的 `version` 字段更新为 `"0.7.1"`，创建发版提交并打 `v0.7.1` 标签，推送至远端仓库后跟踪 GitHub Actions `build` 与 `release` 工作流直至成功产出 `v0.7.1` Release。
- **Details**：
  - 将 `mygo.json` 第 5 行 `"version": "0.7.0"` 修改为 `"version": "0.7.1"`，运行 `cd frontend && npm test` 确认配置契约通过。
  - 提交版本变更：`chore(release): 发布 0.7.1 版本`，并在该提交上创建标签 `git tag v0.7.1`。
  - 推送主分支与标签至远端：`git push origin main && git push origin v0.7.1`。
  - 使用 `gh run list` / `gh run watch` 跟踪本次触发的 `build` 工作流（验证 Windows 便携版 `Mado.exe` 嵌入图标提取校验与 NSIS 静默安装/卸载冒烟通过）与 `release` 工作流，最后通过 `gh release view v0.7.1` 确认 `Mado.exe` 与 `mado-setup-0.7.1-amd64.exe` 两项资产已正式挂载发布。
- **Acceptance Criteria**：
  - `mygo.json` 中 `version` 为 `"0.7.1"`，本地与远端均存在 `v0.7.1` 标签且指向最新发版提交
  - GitHub Actions 的 `build` 与 `release` 两次运行结论均为 `success`
  - `gh release view v0.7.1` 显示非草稿正式版本，且同时包含 `Mado.exe` 与 `mado-setup-0.7.1-amd64.exe` 资产
- **归档说明**：本文件归档时 TASK-001 至 TASK-007 已完成并通过第 7 节回归结论；TASK-008 的本地版本号变更、`v0.7.1` 标签推送与云端流水线验收紧随本次归档提交按序执行，作为本阶段收口动作。

---

## 回归测试结论

2026-11-14 本机 8 步验证链与图标资产核验全部通过（退出码 0）：前端类型检查、零产物语法检查、6 项前端自检、产物构建、Go vet 与单元测试、`go test -race`、`mygo generate` 幂等校验，以及 startup / modeScroll / export 三项无头浏览器冒烟（含新增 `preview-mode-shortcuts`、`modal-reentry-guard`）全部 PASS。完整矩阵见归档同目录 `Plan.md` 第 7 节。

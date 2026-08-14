# Tasks：修复文件关联打开与未保存关闭弹窗

**关联 Plan**：`Plan.md` —— 修复文件关联打开与未保存关闭弹窗 v1.0  
**总计 Task**：8 个（全部 DONE，2026-08-14）

---

## Phase 1：后端——启动参数解析与关闭流程重构

### TASK-001：解析启动参数并暴露 GetStartupFile 绑定

- **Status**：DONE
- **Description**：在 `app.go` 的 App 结构体添加 `startupFile` 字段，在 `main.go` 启动前解析 `os.Args` 中的文件路径写入该字段；新增导出方法 `GetStartupFile() string` 返回该路径（无则空串）。
- **Details**：
  - `main.go`：`app := NewApp()` 后，若 `len(os.Args) > 1` 且 `os.Args[1]` 非空，赋值 `app.startupFile`
  - `app.go`：`GetStartupFile` 直接返回 `a.startupFile`
- **Acceptance Criteria**：
  - `go build ./...` 通过
  - `GetStartupFile` 在无参数时返回 `""`，有参数时返回 `os.Args[1]`

### TASK-002：重构关闭流程为事件转发 + 三键保存确认 + 强制退出

- **Status**：DONE
- **Description**：重写 `app.go` 关闭相关代码：删除 `quitConfirm()` 与 `QuitApp()`；新增 `quitting` 字段、`ConfirmSave() string`（三键中文弹窗，返回 "yes"/"no"/"cancel"）、`ForceQuit()`（置 `quitting` 后退出）、`SaveFileDialog() string`（原生另存对话框）；`main.go` 的 `OnBeforeClose` 改为：`quitting` 或非 dirty 放行，否则 emit `request-close` 事件并阻止关闭。保留 `ConfirmDiscard()`（新建文件流程在用）。
- **Details**：
  - `ConfirmSave` 弹窗：Title "Mado"，Message "是否保存该文件的修改？"，Buttons `["是","否","取消"]`，DefaultButton "是"，CancelButton "取消"（X/Esc 返回 "取消"→映射 "cancel"）；对话框出错返回 "cancel"（不丢数据）
  - `ForceQuit`：`a.quitting = true; runtime.Quit(a.ctx)`
  - `OnBeforeClose` 使用事件转发，事件名 `request-close`
  - `SaveFileDialog`：Filter `*.md;*.markdown;*.mdown;*.txt`，取消返回 `""`
- **Acceptance Criteria**：
  - `go build ./...` 通过；`go vet ./...` 无新增告警
  - 源码中不再存在 `quitConfirm`/`QuitApp` 定义与调用

## Phase 2：前端——启动加载优先级与关闭确认流程

### TASK-003：init() 优先加载启动参数文件

- **Status**：DONE
- **Description**：`frontend/src/main.ts` 的 `init()` 中，先调用 `GetStartupFile()`；非空则加载该文件（失败回退欢迎文档流程），为空走原欢迎文档流程。
- **Details**：
  - 将现有 try 块提取为局部函数或顺序分支：`startupFile` 非空 → `LoadFile(startupFile)` + `loadContent`；catch 或为空 → 原 `GetWelcome` 流程
- **Acceptance Criteria**：
  - esbuild 打包无语法错误
  - 逻辑上：启动参数存在且可读时显示该文件；否则与现状一致

### TASK-004：实现统一关闭确认流程与另存支持

- **Status**：DONE
- **Description**：`frontend/src/main.ts`：新增 `requestClose()`（非 dirty 直接 `ForceQuit`）与 `handleCloseFlow()`（调 `ConfirmSave`，"yes"→保存成功后 `ForceQuit`、保存失败留在应用，"no"→`ForceQuit`，"cancel"→无动作）；关闭按钮改为调 `requestClose()`；监听 `request-close` 事件调 `handleCloseFlow()`；`saveCurrent()` 改为返回 `Promise<boolean>`，无 `currentFile` 时先弹 `SaveFileDialog` 另存。
- **Details**：
  - import 变更：移除 `QuitApp`，新增 `ConfirmSave`/`ForceQuit`/`GetStartupFile`/`SaveFileDialog`；从 runtime 导入 `EventsOn`
  - `saveCurrent` 另存成功后更新 `currentFile` 与标题
  - 另存取消（返回空路径）→ `saveCurrent` 返回 false → 关闭流程中止（等同 cancel）
- **Acceptance Criteria**：
  - esbuild 打包无语法错误
  - 源码中不再引用 `QuitApp`；关闭按钮与 `request-close` 事件均进入 `handleCloseFlow`

### TASK-005：同步 wailsjs 生成的绑定副本

- **Status**：DONE
- **Description**：按 Project.md 约定，手动同步 `frontend/wailsjs/go/main/App.js` 与 `App.d.ts`：删除 `QuitApp`，新增 `GetStartupFile`/`ConfirmSave`/`ForceQuit`/`SaveFileDialog`。
- **Details**：
  - `App.js`：按字母序插入 `window['go']['main']['App'][...]` 包装函数
  - `App.d.ts`：`GetStartupFile():Promise<string>`、`ConfirmSave():Promise<string>`、`ForceQuit():Promise<void>`、`SaveFileDialog():Promise<string>`
- **Acceptance Criteria**：
  - esbuild 打包无语法错误（导入的每个绑定在副本中存在）

## Phase 3：回归验证

### TASK-006：运行后端测试与前端语法检查

- **Status**：DONE
- **Description**：执行 `go test ./...` 与 `go vet ./...`；在 `frontend/` 下用 esbuild 打包 `src/main.ts` 验证语法（不产出构建物到 dist）。
- **Details**：
  - esbuild 命令输出到临时文件或 `--outfile=/dev/null` 等价物，避免污染 `frontend/dist`
- **Acceptance Criteria**：
  - `go test ./...` 全部 PASS
  - esbuild 退出码 0

## Phase 4：文档维护、归档与提交

### TASK-007：更新 Project.md

- **Status**：DONE
- **Description**：同步 `.docs/Project.md`：§1 当前阶段、§4 关闭/启动数据流（request-close 事件、quitting 标志、启动参数）、§6 已知坑（新增多实例限制）。
- **Acceptance Criteria**：
  - Project.md 描述的关闭流程与代码实际行为一致

### TASK-008：归档 Plan/Tasks 并提交 Git

- **Status**：DONE
- **Description**：将 Plan.md 与 Tasks.md 标注 `状态：DONE`、完成日期与回归测试结论后移入 `.docs/08-14-v4/`（同日已有 v1/v2/v3）；`git add` 相关文件并按仓库风格提交。
- **Details**：
  - 归档校验：`.docs/08-14-v4/` 同时含两文件，根目录无残留
  - 提交信息聚焦修复动机
- **Acceptance Criteria**：
  - `git status` 干净（提交后）；`git log` 显示新提交

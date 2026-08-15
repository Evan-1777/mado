# Tasks：修复未保存关闭弹窗点击"是/否"无响应

**关联 Plan**：`Plan.md` —— 修复未保存关闭弹窗点击"是/否"无响应 v1.0
**总计 Task**：7 个

---

## Phase 1：移除 Go 侧失效的原生确认弹窗

### TASK-001：删除 app.go 中 ConfirmSave 与 ConfirmDiscard

- **Status**：DONE
- **Description**：在 `app.go` 中删除 `ConfirmSave()` 与 `ConfirmDiscard()` 两个方法及其注释（两者依赖 Windows 上被忽略的 `Buttons` 语义，属失效代码）。
- **Details**：
  - 删除范围：`ConfirmDiscard` 方法整体、`ConfirmSave` 方法整体；不改动 `SetDirty` / `ForceQuit` / `OnBeforeClose` 链路
  - `errors`、`runtime` 等 import 若仍被其他方法使用则保留
- **Acceptance Criteria**：
  - `go build ./...` 退出码 0
  - `grep -rn "ConfirmSave\|ConfirmDiscard" --include="*.go" .` 无输出

## Phase 2：前端 dialog 模态确认组件与流程接入

### TASK-002：index.html 添加 close-dialog 标记并在 style.css 添加模态样式

- **Status**：DONE
- **Description**：`frontend/index.html` 的 `<div id="app">` 后添加 `<dialog id="close-dialog">`（标题"未保存的修改"、正文"是否保存对该文件的修改？"、`form method="dialog"` 内三按钮 value=`yes`/`no`/`cancel`，"是"为默认焦点）；`frontend/src/style.css` 追加模态卡片、backdrop、按钮组样式。
- **Details**：
  - 按钮文案：是 / 否 / 取消；"取消"与"否"为普通按钮样式，"是"用 `--accent` 强调
  - 样式仅使用既有 design tokens（`--surface`、`--border`、`--radius`、`--text` 等），亮暗主题自动适配
  - 不写 Esc 处理 JS：`<dialog>` 原生 cancel 行为即关闭（resolve 为 cancel）
- **Acceptance Criteria**：
  - esbuild 打包 main.ts 无错误（HTML/CSS 不参与打包，由结构审查确认）
  - dialog 结构含 `aria-labelledby` 指向标题元素

### TASK-003：main.ts 用 askUnsaved() 替代原生确认并加防重入 guard

- **Status**：DONE
- **Description**：`frontend/src/main.ts`：新增 `askUnsaved(): Promise<'yes'|'no'|'cancel'>`（`showModal` + 监听 `close` 取 `returnValue`，空值映射 `'cancel'`，resolve 前移除监听器）；`handleCloseFlow` 外层加 `closePending` guard，confirm 调用从 `ConfirmSave()` 改为 `askUnsaved()`；`confirmDiscard()` 改为复用 `askUnsaved()`（`yes` → `saveCurrent()` 返回值决定，`no` → true，`cancel` → false）；import 中移除 `ConfirmSave`、`ConfirmDiscard`。
- **Details**：
  - `askUnsaved` 对已 open 的 dialog 直接返回 `'cancel'`（双保险，正常路径由 closePending 拦截）
  - 注释更新：close flow 段落说明模态为应用内 `<dialog>`，Esc/取消语义
- **Acceptance Criteria**：
  - `node_modules/.bin/esbuild frontend/src/main.ts --bundle` 退出码 0
  - `grep -n "ConfirmSave\|ConfirmDiscard" frontend/src/main.ts` 无输出

## Phase 3：绑定副本同步与本地验证

### TASK-004：同步 wailsjs 绑定副本（删除两个失效绑定）

- **Status**：DONE
- **Description**：按仓库约定手改 `frontend/wailsjs/go/main/App.js` 与 `App.d.ts`：删除 `ConfirmDiscard`、`ConfirmSave` 的导出与声明，其余保持字母序不变。
- **Acceptance Criteria**：
  - `grep -rn "ConfirmSave\|ConfirmDiscard" frontend/wailsjs/` 无输出
  - App.js 导出函数集合与 app.go 现存导出方法一一对应（`ForceQuit`/`GetCSS`/`GetSettings`/`GetStartupFile`/`GetWelcome`/`LoadFile`/`OnFileDrop`/`OpenFileDialog`/`Render`/`SaveFileDialog`/`SaveFile`/`SetDirty`/`SetTheme`/`SetTitle`）

### TASK-005：全量本地验证

- **Status**：DONE
- **Description**：依次执行 `go build ./...`、`go vet ./...`、`go test ./...`、前端 esbuild bundle 校验，并全仓库 grep 确认无 `ConfirmSave`/`ConfirmDiscard` 残留。
- **Details**：
  - esbuild 命令：`cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --outfile=/dev/null`（不产构建物）
  - GUI 交互（点击是/否/取消、Esc、Alt+F4 防重入）列入云端构建 artifact 人工走查：dirty 编辑后点标题栏 X → 弹模态 → 三个分支与 Esc 各验证一次；模态打开时再按 Alt+F4 无异常
- **Acceptance Criteria**：
  - 四条命令全部退出码 0
  - `grep -rn "ConfirmSave\|ConfirmDiscard" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=08-1*`（在 .docs 归档外）无输出

## Phase 4：文档维护、归档与提交

### TASK-006：更新 Project.md

- **Status**：DONE
- **Description**：同步 `.docs/Project.md`：§1 当前阶段改写为本次修复状态；§4 关闭数据流改为前端 `<dialog>` 模态描述；§6 删除"原生模态对话框阻塞 UI 消息循环"表述，新增 wails MessageDialog Windows 怪癖条目（Buttons 被忽略、返回英文规范串）；§8 决策记录追加本次选型。
- **Acceptance Criteria**：
  - Project.md 关闭流程描述与代码实际行为一致
  - 不再存在"三键原生弹窗"与实现相悖的表述

### TASK-007：归档 Plan/Tasks 并提交 Git

- **Status**：DONE
- **Description**：Plan.md 与 Tasks.md 标注 `状态：DONE`、完成日期与回归测试结论后移入 `.docs/08-15-v1/`；`git add` 全部变更文件并按仓库风格（`fix: ...`）提交。
- **Details**：
  - 提交信息草案：`fix: replace broken native save dialog with in-app confirm modal`
  - 禁止提交 `frontend/dist/` 构建产物
- **Acceptance Criteria**：
  - `.docs/08-15-v1/` 同时含 Plan.md 与 Tasks.md，根目录无残留
  - `git status` 干净（除 gitignore 项），提交不含密钥与构建产物

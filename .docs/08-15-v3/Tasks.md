# Tasks：预览目录链接黑屏修复

**关联 Plan**：`Plan.md` —— 预览目录链接黑屏修复 v1.0
**总计 Task**：7 个（含环境迁移插入任务 TASK-006/007）

---

## Phase 1：修复实现

### TASK-001：在 main.ts 添加预览帧链接拦截

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 的 writePreview 函数之后新增预览链接拦截逻辑并注册帧 load 监听。
- **Details**：
  - 新增函数 `hookPreviewLinks()`：读取 `previewIframe.contentDocument`；为空则返回
  - 在帧 document 上挂 click 监听：取 `event.target` 后用 `closest('a')` 找锚元素（禁用 `instanceof Element`——跨 realm 不成立）
  - 命中 `<a>` 即 `preventDefault()`；`href` 以 `#` 开头且长度 >1 时，`getElementById(href.slice(1))` 查目标并 `scrollIntoView({ behavior: 'smooth' })`，查不到则只阻断不滚动
  - `previewIframe.addEventListener('load', hookPreviewLinks)` 注册重挂点（srcdoc 首帧与回退重建后自动恢复监听）
  - 代码注释英文，说明黑屏根因（about:srcdoc fragment 导航替换文档）
- **Acceptance Criteria**：
  - `frontend/src/main.ts` 含上述函数与监听注册
  - esbuild 语法检查零报错
- **验证记录**：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 通过；`npm run build` 产出 dist（544K，gitignored）成功

---

## Phase 2：本地验证

### TASK-002：执行前端语法检查

- **Status**：DONE
- **Description**：在 `frontend/` 目录运行零产物 esbuild 检查，确认修改后的 main.ts 可正常打包。
- **Details**：
  - 命令：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（stdout 丢弃，不产出文件）
  - 确认无 `dist/` 残留产物
- **Acceptance Criteria**：命令退出码 0，输出无 error
- **验证记录**：通过；★ 本环境 `NODE_ENV=production` 且 `omit=dev`，安装须 `npm install --include=dev`，否则 esbuild（devDependency）被跳过

### TASK-003：执行 Go 回归测试

- **Status**：DONE
- **Description**：运行 `go test ./...` 确认无回归。
- **Details**：
  - 覆盖 4 个包：filesys / mdrender / settings / theme
  - ★ 前置：`frontend/dist` 须存在（go:embed），先 `npm run build`
- **Acceptance Criteria**：全部包测试 PASS，退出码 0
- **验证记录**：`go vet ./...` 与 `go test ./...` 全部通过（依赖 TASK-007 修复测试隔离）

---

## Phase 2 插入：环境迁移（用户指令注入）

### TASK-006：包管理器切换 pnpm → npm，SCOPE.md 匹配新环境

- **Status**：DONE
- **Description**：将前端包管理从 pnpm 全面切换到 npm，并更新 SCOPE.md 与 CI 工作流。
- **Details**：
  - `.docs/SCOPE.md` 备注 3/4 重写：Linux x86_64、npm 唯一、用户级 Go、测试最小占用
  - `frontend/package.json` 删除 `packageManager` 字段；删除 `frontend/pnpm-lock.yaml`；提交 `package-lock.json`
  - `wails.json` 三条 pnpm 命令改 npm；`build.yml` / `release.yml` 删 pnpm/action-setup 步骤，setup-node 缓存改 npm
- **Acceptance Criteria**：仓库内无 pnpm 残留引用（SCOPE/wails.json/workflows/package.json）

### TASK-007：安装本机 Go 并修复测试跨平台隔离

- **Status**：DONE
- **Description**：用户级安装 Go 1.25.3；修复 filesys/settings 测试在 Linux 上不隔离真实配置目录的缺陷。
- **Details**：
  - Go 安装于 `~/.local/go`（单版本，压缩包即删；PATH 按会话导出）
  - 根因：`os.UserConfigDir()` 在 Windows 读 `APPDATA`、Linux 读 `XDG_CONFIG_HOME`，旧测试仅重写 `APPDATA`，Linux 上写入真实 `~/.config/Mado/` 并在用例间泄漏状态
  - `filesys_test.go` 抽出 `setUserConfigDir()`（`t.Setenv` 同设 APPDATA + XDG_CONFIG_HOME，自动恢复）；`settings_test.go` 的 `withTempAPPDATA` 同修并移除多余 `os` 导入
  - 清理已泄漏的 `~/.config/Mado/`
- **Acceptance Criteria**：`go test ./...` 后 `~/.config/Mado` 不被创建

---

## Phase 3：文档维护

### TASK-004：同步 Project.md

- **Status**：DONE
- **Description**：更新 `.docs/Project.md`，记录本次修复与环境迁移相关事实。
- **Details**：
  - §1 当前阶段、§2 环境与运行（npm/Go/验证命令/坑）、§3 目录（package-lock）、§4 数据流（锚点拦截）、§6 已知坑（srcdoc fragment 黑屏、UserConfigDir 平台差异、npm omit=dev）、§8 决策记录
- **Acceptance Criteria**：文档与代码实际状态一致，无过期描述

---

## Phase 4：归档与提交

### TASK-005：归档并提交

- **Status**：DONE
- **Description**：将 Plan.md 与 Tasks.md 移入 `.docs/08-15-v3/`（同日已有 v1/v2；首次误入 v2 已从 HEAD 恢复纠正），git 提交全部变更。
- **Details**：
  - 归档校验：`.docs/08-15-v3/` 同时含 Plan.md 与 Tasks.md，根目录无残留；`.docs/08-15-v2/` 原归档完好
  - 提交信息沿用仓库风格（`fix: ...` 英文祈使句），不提交构建产物与密钥
- **Acceptance Criteria**：归档完整；`git status` 干净（gitignore 项除外）

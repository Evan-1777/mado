# Tasks：批判性修复 09-08-v1 遗留问题

**状态**：DONE
**完成日期**：2026-09-08
**关联 Plan**：`Plan.md` ——批判性修复 09-08-v1 遗留问题 v1.1
**总计 Task**：6 个

**回归测试结论**：通过 `npm install --include=dev`、`go vet ./...`、`go test -race ./...`、前端 esbuild 零产物检查、`npm test`、`npm run build` 与重复构建字体对照、`node tests/modeScroll.check.mjs`、连续 5 次 `node tests/startup.check.mjs`；dev 入口从空 `dist/` 成功创建 `dist/index.html`。

> **环境约定**：本机 Go 位于 `~/.local/go/bin`；前端命令均在 `frontend/` 下执行；npm 安装使用 `npm install --include=dev`；`dist/` 为构建产物，不纳入提交。按编号顺序执行。

---

## Phase 1：安全净化与保存路径不变性

### TASK-001：按 HTML 属性边界移除所有 refresh meta 变体

- **Status**：DONE
- **优先级**：P0
- **依赖**：无
- **Description**：修改 `internal/mdrender` 的 meta 标签净化逻辑，在完整标签匹配后按引号状态读取属性，识别空白或斜杠分隔的 `http-equiv` 属性及精确值 `refresh`。
- **Details**：
  - 覆盖 `<meta/http-equiv="refresh">`、属性间 `/http-equiv`、大小写混合、引号值空白与无引号值。
  - 不将 `refresh-policy`、普通 meta、属性值中的 `/http-equiv=refresh` 或 fenced code 中的转义文本误判为危险标签。
  - 保留现有 `<script>` 净化行为与 quote-aware 完整标签匹配。
  - 在 `internal/mdrender/mdrender_test.go` 增加正向删除与负向保留断言。
- **Acceptance Criteria**：
  - `go test ./internal/mdrender -run 'TestSanitizeMetaRefresh|TestRenderRemovesScriptTags' -v` 通过。
  - 测试输出确认所有 refresh 变体不含 meta 标签，保留样例仍含完整 meta 文本。

### TASK-002：保存符号链接目标并覆盖回归测试

- **Status**：DONE
- **优先级**：P0
- **依赖**：无
- **Description**：修改 `internal/filesys.WriteFile`，当目标为可解析符号链接时将权限读取、临时文件目录与最终 Rename 都定位到真实目标；悬空或无法解析的符号链接直接返回错误。
- **Details**：
  - 用 `Lstat` 区分普通文件与符号链接，避免 `Rename` 直接替换链接本身。
  - 保持临时文件同真实目标目录、权限继承、`Sync`、关闭、改名与失败清理流程。
  - 不在目录无写权限时回退为截断写入，维持“失败不改变旧目标”的不变性。
  - 在 `internal/filesys/filesys_test.go` 增加符号链接内容、链接类型保持及悬空链接失败断言；不支持创建符号链接的平台用可识别的权限错误跳过。
- **Acceptance Criteria**：
  - `go test ./internal/filesys -run 'TestWriteFileAtomic|TestWriteFileSymlink' -v` 通过。
  - 写入链接路径后链接仍为 symlink，真实目标内容更新，目标目录无 `.mado-*` 残留。

## Phase 2：前端生命周期与资源入口

### TASK-003：清空确认对话框返回值并恢复启动检查闭环

- **Status**：DONE
- **优先级**：P0
- **依赖**：无
- **Description**：修改 `askUnsaved()`，每次调用 `showModal()` 前清空 `HTMLDialogElement.returnValue`，并以表单提交按钮的 `submitter.value` 作为 yes/no/cancel 的即时结果，消除取消操作对后续确认的状态污染与无头环境 close 事件时序依赖。
- **Details**：
  - 保持表单 `submitter.value` 作为按钮结果来源，`cancel`/`close` 处理 Esc 或非按钮关闭，并保留现有 yes/no/cancel 语义。
  - 不在 startup 检查中绕过真实 dialog 逻辑或直接修改应用状态。
  - 保留“取消确认后不读取文件”与“下一次选择否后读取失败可见”的连续场景。
- **Acceptance Criteria**：
  - `cd frontend && npm run build && node tests/startup.check.mjs` 输出 `STARTUP ... ALL PASS` 且退出码为 0。
  - 检查结果包含 `cancel-before-read: PASS` 与 `drop-read-failure-feedback: PASS`。

### TASK-004：统一 dev/build 静态资源复制入口

- **Status**：DONE
- **优先级**：P1
- **依赖**：无
- **Description**：提取一个前端 Node 原生资源复制脚本，由 `build` 和 `dev` 两个 npm script 调用，保证两条入口都创建 `dist/index.html`、KaTeX CSS 与仅 `.woff2` 字体。
- **Details**：
  - 脚本先创建/清理目标目录，再复制 index、KaTeX CSS 与源目录全部 `.woff2`。
  - `build` 先打包再复制；`dev` 先准备资源再启动 watch，避免首次运行缺少 index。
  - 删除 package.json 中重复的长内联 Node 复制命令。
- **Acceptance Criteria**：
  - `cd frontend && npm run build` 成功且 `test -f dist/index.html`。
  - `find dist/katex/fonts -type f -name '*.woff2'` 数量等于源目录，`find dist/katex/fonts -type f \( -name '*.ttf' -o -name '*.woff' \)` 数量为 0。
  - `npm run dev` 的前置资源命令可在空 `dist/` 目录创建 `dist/index.html`（验证 watch 进程后终止，不保留一次性产物）。

## Phase 3：异步渲染调度背压

### TASK-005：合并在途渲染请求并覆盖调度生命周期

- **Status**：DONE
- **优先级**：P1
- **依赖**：TASK-003
- **Description**：扩展 `createRenderScheduler` 的渲染契约以识别 Promise，在渲染未完成期间只保留一个最新请求，完成后按 80ms 最小间隔执行尾随渲染。
- **Details**：
  - 同步 callback 继续保持现有定时与合并语义。
  - 异步 callback 运行期间 `schedule()` 不创建额外 timer，只设置 pending request；Promise settle 后释放下一次调度。
  - `cancel()` 清除未开始 timer 与 pending request；已开始的 Promise 不伪造取消，但其结果由现有版本保护逻辑丢弃。
  - `main.ts` 将真实 `refreshPreview` Promise 交给 scheduler，不另建调用点状态。
  - `renderScheduler.test.ts` 增加在途合并、settle 后尾随、cancel 与最小间隔测试。
- **Acceptance Criteria**：
  - `cd frontend && npm test` 输出四组自检全部通过，其中包含 `renderScheduler: ALL PASS`。
  - 测试机械确认一次在途渲染期间最多只有一个后端渲染调用，settle 后最新请求最终执行。

## Phase 4：全链验证、文档与交付

### TASK-006：同步项目文档并完成全链回归归档

- **Status**：DONE
- **优先级**：P0
- **依赖**：TASK-001、TASK-002、TASK-003、TASK-004、TASK-005
- **Description**：根据实际代码更新 `.docs/Project.md` 的测试方式、模块职责、已知边界与决策记录，执行全链验证，完成 Plan/Tasks 状态、归档与 Git 提交。
- **Details**：
  - 明确 atomic replace 需要目标目录创建/改名权限，禁止直接写入回退；记录符号链接保存语义。
  - 记录 meta refresh 斜杠分隔净化、dialog 返回值清洗、统一资源脚本与异步背压调度。
  - 执行 `go vet ./...`、`go test -race ./...`、前端 esbuild 零产物检查、`npm test`、`npm run build`、字体对照、`modeScroll.check.mjs` 与 `startup.check.mjs`。
  - 更新 Plan/Tasks 回归结论并按当前日期归档，提交信息使用英文 Conventional Commits 前缀加中文描述。
- **Acceptance Criteria**：
  - 所有列出的命令退出码为 0，输出无测试失败。
  - `.docs/<MM-DD-vN>/` 同时含 Plan.md 与 Tasks.md，二者状态为 DONE，根目录无残留。
  - `git status --short` 为空，提交已创建且提交信息符合约定。

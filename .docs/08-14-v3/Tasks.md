# Tasks：修复 Split 预览占位符遮挡与模式切换失效

**关联 Plan**：`Plan.md` —— 修复 Split 预览占位符遮挡与模式切换失效 v1.1.2
**总计 Task**：5 个

---

## Phase 1：修复占位符显隐逻辑

### TASK-001：style.css 增加 [hidden] 覆盖规则

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 的 `.placeholder` 规则后新增 `.placeholder[hidden] { display: none; }`。
- **Details**：
  - `.placeholder` 设置了 `display: flex`，覆盖了浏览器对 `hidden` 属性默认的 `display: none`（类选择器特异性高于 UA 规则）
  - 新增规则恢复 `hidden` 属性的显隐控制
  - 不改动 JS 侧 `previewEmpty.hidden = ...` 逻辑
- **Acceptance Criteria**：
  - `frontend/src/style.css` 存在 `.placeholder[hidden]` 规则
  - 预览有内容时（`hidden = true`）占位符不渲染
  - 空文档时（`hidden = false`）占位符可见

---

## Phase 2：修复模式切换事件绑定

### TASK-002：main.ts 修正 querySelectorAll 查询根

- **Status**：DONE
- **Description**：将 `frontend/src/main.ts` 模式标签事件绑定中的两处 `pane.querySelectorAll('.seg button')` 改为 `toolbar.querySelectorAll('.seg button')`。
- **Details**：
  - 根因：`.seg` 按钮组位于 `toolbar` 元素内，而 `toolbar` 与 `pane` 是兄弟节点（`app.append(titlebar, toolbar, pane)`），`pane.querySelectorAll` 返回空 NodeList，事件从未绑定
  - 仅改查询根，`pane.classList` 的 `editor-only`/`preview-only` 操作逻辑保持不变（这些类应加在 pane 上）
- **Acceptance Criteria**：
  - `main.ts` 中 `.seg button` 的查询根均为 `toolbar`
  - 点击 Editor 标签 → pane 增加 `editor-only`，移除 `preview-only`
  - 点击 Preview 标签 → pane 增加 `preview-only`，移除 `editor-only`
  - 点击 Split 标签 → pane 两个类均移除，active 高亮回到 Split

---

## Phase 3：构建验证与文档同步

### TASK-003：前端构建验证

- **Status**：DONE
- **Description**：运行 `npm run build` 验证 esbuild 打包无报错。
- **Details**：
  - 构建命令：`cd frontend && npm run build`
  - 产出 `dist/app.js` + `dist/app.css`（SCOPE 约定本机仅允许前端 esbuild 语法验证，Go 编译验收在云端）
- **Acceptance Criteria**：
  - 命令退出码 0
  - 输出含 `dist/app.js` 与 `dist/app.css` 产物行

### TASK-004：文档同步

- **Status**：DONE
- **Description**：更新 `.docs/Project.md` 当前阶段描述，创建根目录 `Plan.md` / `Tasks.md`。
- **Details**：
  - `Project.md` §1 当前阶段注明「Split 预览占位符与模式切换修复完成，待云端 CI 验收」
- **Acceptance Criteria**：
  - `.docs/Project.md` 阶段描述与本次修复一致
  - 根目录存在 `Plan.md` 与 `Tasks.md`（状态 DONE）

### TASK-005：提交并推送

- **Status**：DONE
- **Description**：提交代码修复与文档，推送到 `origin/main` 触发云端 CI。
- **Details**：
  - 提交信息：`fix: split preview placeholder visibility and mode switching`
  - 提交内容：`frontend/src/main.ts`、`frontend/src/style.css`、`Plan.md`、`Tasks.md`、`.docs/Project.md`
- **Acceptance Criteria**：
  - `git log -1` 显示修复提交
  - `git push` 成功，远端 Actions 出现新的 run

# Tasks：修复目录栏折叠/展开与目录识别为空

**关联 Plan**：`Plan.md` —— 修复目录栏折叠/展开与目录识别为空 v1.0
**总计 Task**：3 个

---

## Phase 1：修复 TOC 解析双反斜杠

### TASK-001：修复 frontend/src/main.ts 中 4 处双反斜杠字面量

- **Status**：DONE
- **Description**：将 `frontend/src/main.ts` 中 L18（`split(/[\\\\/]/)`）、L110（`split('\\\\n')`）、L111（`/^\\\\s*(```|~~~)/`）、L113（`/^(\\\\s{0,3})(#{1,6})\\\\s+(.+?)\\\\s*#*\\\\s*$/`）的 `\\` 字面量恢复为单 `\`，使正则/字符串在运行时按设计工作。
- **Details**：
  - 只改动上述 4 行的转义；不触碰其它逻辑、不改注释
  - 修复后预期：`split(/[\\/]/)`、`split('\n')`、`/^\s*(```|~~~)/`、`/^(\s{0,3})(#{1,6})\s+(.+?)\s*#*\s*$/`
  - 文件其余部分不得出现双反斜杠字面量
- **Acceptance Criteria**：
  - `grep -c '\\\\' frontend/src/main.ts` 输出 `0`
  - `sed -n '113p' frontend/src/main.ts` 显示单 `\s`
  - node 复现 parseToc（对用户样例文档运行）：标题树包含 `结论先行`、`一分钟选型`、`四方案对比`、`方案 A` 等节点，层级正确（h1→h2→h3），代码块内 `#` 不产生节点

---

## Phase 2：目录栏整栏折叠/展开（窄条 + 悬停弹层）

### TASK-002：为目录侧栏添加折叠按钮、折叠窄条与悬停弹层

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 与 `frontend/src/style.css` 中实现目录侧栏整栏折叠：`toc-header` 新增折叠按钮（‹/›）；折叠时侧栏收窄为 ~24px 窄条（仅显示展开按钮），内容区占满；点击窄条或按钮展开恢复；折叠态鼠标悬停窄条时浮出目录弹层（绝对定位浮层，含完整目录树），移开 ~200ms 后收回；点击弹层内目录项跳转并立即收起弹层。
- **Details**：
  - 折叠状态存模块级布尔 `tocCollapsed`，初始 `false`（默认展开）；Editor/Preview 模式切换后保留该状态
  - 折叠时 `.pane.editor-only .toc-sidebar` / `.pane.preview-only .toc-sidebar` 变窄（flex-basis 24px），隐藏 header 与 tree，显示窄条按钮
  - 浮层只复制渲染现有 `toc-tree` 内容（复用 renderToc 输出，不重复构建）；浮层样式用 `--surface`/`--border` 设计令牌，投影清晰
  - 跳转复用 `jumpToTocNode`；浮层内点击后先收起再跳转
  - Split 模式不显示侧栏（沿用现有 CSS 规则），折叠逻辑不参与
- **Acceptance Criteria**：
  - 默认展开：完整目录树可见，header 含"目录"与折叠按钮
  - 点击折叠按钮：侧栏收窄为 ~24px，目录树与 header 隐藏，内容区占满
  - 点击窄条（或窄条内展开按钮）：侧栏恢复完整，目录树回归
  - 折叠态悬停窄条：浮层出现且含完整目录树；移开约 200ms 后浮层消失
  - 浮层内点击目录项：跳转生效且浮层收起
  - Editor ↔ Preview 切换后折叠状态保留；Split 模式无侧栏
  - 空文档（无标题）时折叠/展开行为正常，不报错

---

## Phase 3：验证与文档

### TASK-003：执行验证链并同步 Project.md

- **Status**：DONE
- **Description**：运行本机验证链：零产物 esbuild 语法检查 → `npm run build` → node 复现脚本（用用户样例文档验证 parseToc 修复）→ `go vet ./...` + `go test ./...`；根据结果更新 `.docs/Project.md` 中与目录侧栏相关的描述（如折叠能力）。
- **Details**：
  - esbuild 检查命令：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（stdout 丢弃）
  - 复现脚本临时放 `/tmp`，不进仓库：对用户提供的「网页动画实现方案参考」样例运行修复后的 parseToc，断言输出标题数与层级
  - Project.md 更新点：§4 数据流「聚焦模式目录」描述补充"侧栏可整栏折叠为窄条、悬停浮层查看"；若涉及设计决策另记 §8
- **Acceptance Criteria**：
  - esbuild 语法检查退出码 0 且无报错
  - `npm run build` 退出码 0，`dist/app.js` 产物包含修复后的单 `\s` 正则
  - 复现脚本输出与用户文档实际标题结构一致（h1=1、h2=5、h3≥2，代码块 `#` 不计入）
  - `go vet ./...` 与 `go test ./...` 均退出码 0（无回归）
  - Project.md 目录侧栏描述与代码行为一致

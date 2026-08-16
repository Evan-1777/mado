# Tasks：修复目录栏折叠功能与标题识别

**关联 Plan**：`Plan.md` —— 修复目录栏折叠功能与标题识别 v1.4.1  
**总计 Task**：4 个

---

## Phase 1：定位与修复标题解析 bug

### TASK-001：修正 parseToc 函数中的换行符分割

- **Status**：DONE
- **Description**：将 `frontend/src/main.ts` 中 `parseToc` 函数的 `markdownText.split('\\n')` 修改为 `markdownText.split('\n')`，使用真正的换行符而非字面量字符串。
- **Details**：
  - 定位行：`markdownText.split('\\n').forEach((line, lineIndex) => {`
  - 修改为：`markdownText.split('\n').forEach((line, lineIndex) => {`
  - 影响范围：仅此一处，不改变 parseToc 其他逻辑
- **Acceptance Criteria**：
  - esbuild 语法检查通过
  - npm run build 成功产出 dist/
  - 用户提供的示例文档能正确显示多层目录

---

## Phase 2：添加侧边栏折叠交互

### TASK-002：在侧边栏头部添加折叠按钮 DOM

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 的 `pane.innerHTML` 中，给 `.toc-header` 添加折叠按钮并调整布局。
- **Details**：
  - 在 `<div class="toc-header">` 内部最前面插入：`<button class="toc-collapse-btn" id="toc-collapse" type="button" title="折叠侧栏">‹</button>`
  - 添加 `const tocSidebar` 和 `const tocCollapse` DOM 引用
  - 按钮字符：折叠状态 `‹`，展开状态 `›`
- **Acceptance Criteria**：
  - DOM 结构正确，按钮在头部左侧
  - esbuild 不报错

### TASK-003：实现折叠按钮 CSS 样式与动画

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 中为 `.toc-sidebar.collapsed` 和 `.toc-collapse-btn` 添加样式。
- **Details**：
  - `.toc-sidebar` 添加 `transition: flex-basis 0.2s ease, min-width 0.2s ease;`
  - `.toc-sidebar.collapsed` 设置 `flex-basis: 40px; min-width: 40px;`
  - `.toc-sidebar.collapsed` 时隐藏 `.toc-header > span`、`#toc-expand`、`.toc-tree`、`.toc-empty`
  - `.toc-collapse-btn` 样式：32px 方形按钮，居中对齐，hover 背景色变化，accent 色文本
- **Acceptance Criteria**：
  - 折叠状态下侧边栏宽度为 40px
  - 过渡动画流畅（0.2s ease）
  - 折叠时仅显示按钮，其他内容隐藏

### TASK-004：实现折叠按钮点击事件处理

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中为 `tocCollapse` 按钮添加 click 监听器，切换侧边栏折叠状态。
- **Details**：
  - `tocCollapse.addEventListener('click', () => { ... })`
  - toggle `.toc-sidebar` 的 `collapsed` class
  - 根据状态更新按钮文本：collapsed → `›`，展开 → `‹`
- **Acceptance Criteria**：
  - 点击按钮侧边栏在 40px 和 248px 之间切换
  - 按钮字符同步切换方向
  - 折叠/展开过渡平滑

---

## 验证清单

- [x] `go vet ./...` 通过
- [x] `go test ./...` 通过（4 个包）
- [x] `esbuild` 语法检查通过
- [x] `npm run build` 产出 dist/（527KB + 7.3KB）
- [x] 用户提供的示例文档目录正常显示
- [x] 侧边栏折叠/展开交互流畅
- [x] `.docs/Project.md` 已同步更新（架构与约束章节）

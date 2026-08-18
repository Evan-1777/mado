# Tasks：目录大纲折叠恢复与侧栏默认状态优化

**关联 Plan**：`Plan.md` —— 目录大纲折叠恢复与侧栏默认状态优化 v1.0  
**总计 Task**：4 个  

---

## Phase 1：目录树数据结构与折叠逻辑重构

### TASK-001：重构 parseToc 与目录树状态模型

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中重构 `parseToc` 函数以构建多层树形结构 `TocNode`，各节点默认 `expanded = true`，并在 `updateToc` 中引入基于标题特征的状态保留映射。
- **Details**：
  - 定义 `TocNode` 接口包含 `id`、`level`、`text`、`line`、`ordinal`、`children: TocNode[]`、`expanded: boolean`。
  - 使用基于栈的父子匹配算法解析 ATX 标题行，正确构建嵌套 `children` 数组。
  - 默认每个新节点 `expanded = true`。
  - 在 `updateToc` 中缓存前次节点展开状态映射表，在内容变动后重构树时保留已有节点的展开/折叠状态。
  - 维护 `nodeById` 哈希索引供快速检索。
- **Acceptance Criteria**：
  - H1 下属的 H2、H3 能正确挂载至父节点 `children` 数组。
  - 各节点初始状态均为 `expanded === true`。
  - 编辑内容无结构变化时不重构，有结构变化时保持同名父节点原有的折叠状态。

---

## Phase 2：UI 渲染、折叠切换与侧栏默认收起交互

### TASK-002：实现目录树行渲染、折叠切换与侧栏收起交互

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中实现深度优先平铺行渲染器、行内折叠按钮事件处理、顶部「全部展开/全部收起」动态二态按钮与侧栏默认收起行为。
- **Details**：
  - 在 `pane.innerHTML` 中将 `#toc-sidebar` 初始类名设置为 `toc-sidebar collapsed`，展开按钮初始文字设为 `›`，初始标题提示为 `展开侧栏`。
  - 顶部导航栏右侧添加 `<button class="toc-toggle-all-btn" id="toc-toggle-all" type="button">`。
  - 编写 `updateToggleAllButton` 函数，根据当前是否有父节点处于展开状态，动态设置按钮文本为「全部收起」或「全部展开」。
  - 编写 `renderNode` 深度优先遍历函数：父节点前置折叠切换按钮（展开时显示下箭头 SVG，折叠时显示右箭头 SVG），叶子节点前置等宽空白占位；仅在父节点 `expanded === true` 时递归渲染子节点。
  - 在 `tocTree` 委托点击监听中区分 `.toc-toggle` 点击（切换单个节点展开状态并重新渲染）与行点击（执行 `jumpToTocNode` 跳转）。
  - 为 `#toc-toggle-all` 绑定点击事件，一键切换所有父节点展开状态。
  - 侧栏展开时若有积压更新（`tocDirty === true`）则触发 `renderToc`。
- **Acceptance Criteria**：
  - 应用启动或切换至 Editor/Preview 模式时，目录栏默认保持 40px 收起状态，点击 `›` 展开至 256px。
  - 展开侧栏后，默认显示所有层级标题，父节点带有展开箭头。
  - 点击单个父节点箭头可收起/展开其全部子标题，不触发编辑器或预览区滚动跳转。
  - 点击顶部「全部收起」可收起所有层级仅显示顶级标题，按钮文本变为「全部展开」；再次点击可恢复全量展开。

---

## Phase 3：样式精调与多主题适配

### TASK-003：完善折叠按钮、顶部切换按钮与收起过渡样式

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 中添加与调整 `.toc-toggle`、`.toc-toggle-spacer`、`.toc-toggle-all-btn` 及 `.toc-sidebar.collapsed` 相关样式。
- **Details**：
  - 保持无缩进 flat 排版，利用父节点箭头与叶子节点占位保证各级 `toc-badge` 水平基准线对齐。
  - 为 `.toc-toggle` 提供悬浮高亮与无边框微交互样式。
  - 为 `.toc-toggle-all-btn` 设置紧凑圆角、主题适配文字颜色及悬浮反馈，并在禁用时降低透明度。
  - 确保 `.toc-sidebar.collapsed` 状态下收起侧栏隐藏标题、计数与操作按钮，不产生内容溢出或水平滚动条。
- **Acceptance Criteria**：
  - 侧栏在暗色与浅色主题下箭头与按钮均清晰可见、对比度符合规范。
  - 各行标题与徽章在折叠展开切换时无水平跳动。
  - 侧栏收起状态宽度固定为 40px，展开状态为 256px，平滑过渡。

---

## Phase 4：验证测试与文档归档

### TASK-004：构建验证、测试检查与文档同步

- **Status**：DONE
- **Description**：运行本地 esbuild 语法检查、前端 npm build 构建、Go 单元测试与代码检查，更新 `Project.md` 并完成文档归档与 Git 提交。
- **Details**：
  - 执行 `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 验证语法。
  - 执行 `npm run build` 产出 `dist/`。
  - 执行 `go vet ./...` 与 `go test ./...` 确保无回归。
  - 更新 `.docs/Project.md` 架构与决策记录。
  - 归档 `Plan.md` 与 `Tasks.md` 至 `.docs/08-18-v2/` 并执行 Git commit。
- **Acceptance Criteria**：
  - 所有构建与测试命令退出码为 0。
  - `Project.md` 与实际代码保持同步。
  - Git commit 记录清晰完整。

---

**阶段状态**：DONE  
**完成日期**：2026-08-18  

**回归测试结论**：
- ✓ esbuild 语法检查通过（零产物编译无错误）
- ✓ 前端 npm run build 成功构建（产出 dist/app.js 531.0kb + dist/app.css 9.7kb）
- ✓ Go 单元测试全量通过（4 个 internal 模块无回归）
- ✓ go vet 检查通过（0 警告）
- ✓ Node.js 树形解析与平铺折叠算法用例验证通过

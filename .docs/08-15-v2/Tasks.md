# Tasks：全屏编辑器与预览目录

**关联 Plan**：`Plan.md` —— 全屏编辑器与预览目录 v1.0  
**总计 Task**：4 个  
**完成日期**：2026-08-15  
**回归测试结论**：前端 esbuild 语法检查、npm run build、go vet ./...、go test ./... 全部通过；Windows GUI 交互待云端环境验收。

## Phase 1：目录模型与全屏布局

### TASK-001：添加共享目录侧栏结构与全屏显示规则

- **Status**：DONE
- **Priority**：P0
- **Description**：在前端创建目录侧栏，并仅在 Editor/Preview 全屏模式中显示；侧栏打开时将内容区域向右移动。
- **Details**：复用现有主题变量；提供标题、全部展开按钮、树容器和无标题提示；保留窄屏下的可用布局。
- **Acceptance Criteria**：运行 `npm run build` 成功；Split 模式目录侧栏隐藏；Editor/Preview 模式目录侧栏显示且内容区域位于侧栏右侧。
- **Dependencies**：无

### TASK-002：从 Markdown 构建可折叠多层目录

- **Status**：DONE
- **Priority**：P0
- **Description**：解析 ATX 标题并构建多层级目录节点，跳过 fenced code 中的伪标题。
- **Details**：记录标题级别、文本、编辑器行号和预览定位信息；默认节点全部折叠；标题变化后刷新目录。
- **Acceptance Criteria**：使用包含 H1/H2/H3、重复标题和代码围栏的 Markdown 启动应用，目录层级与标题一致，代码围栏内容不生成目录项。
- **Dependencies**：TASK-001

## Phase 2：折叠交互与双向跳转

### TASK-003：实现目录展开折叠与全部展开操作

- **Status**：DONE
- **Priority**：P0
- **Description**：为目录节点添加折叠控制，并实现“展开全部”按钮。
- **Details**：点击箭头只改变当前节点；点击目录文字执行跳转；无子节点不显示折叠按钮；按钮支持键盘焦点。
- **Acceptance Criteria**：运行应用后默认所有有子节点的节点折叠；点击箭头能显示/隐藏子项；点击“展开全部”后所有层级可见。
- **Dependencies**：TASK-002

### TASK-004：接入编辑器与预览跳转并完成验证

- **Status**：DONE
- **Priority**：P0
- **Description**：将目录项点击接入 CodeMirror 光标定位和 iframe 标题滚动，并执行回归验证、更新 Project.md。
- **Details**：编辑器跳转到标题行并聚焦；预览按渲染后的标题 id 滚动；目录更新不改变原有预览锚点拦截；记录测试结论。
- **Acceptance Criteria**：执行 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`、`npm run build`、`go vet ./...`、`go test ./...` 均返回 0；手动验证两种全屏模式跳转成功。
- **Dependencies**：TASK-003

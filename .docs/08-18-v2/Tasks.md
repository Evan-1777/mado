# Tasks：全向无边框窗口缩放深度修复

**关联 Plan**：`Plan.md` —— 全向无边框窗口缩放深度修复 v1.0  
**总计 Task**：5 个

---

## Phase 1：Wails 内部缩放机制锁定与全向顶层把手系统架构

### TASK-001：定义 8 方向顶层把手 CSS 样式与最大化隐藏规则

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 中新增 `.resize-handle` 基础类与 8 个方向特化类（`.resize-top`、`.resize-bottom`、`.resize-left`、`.resize-right`、`.resize-top-left`、`.resize-top-right`、`.resize-bottom-left`、`.resize-bottom-right`）。
- **Details**：
  - 把手基础样式：`position: fixed; pointer-events: auto; --wails-draggable: none; user-select: none; z-index: 100000;`
  - 四角把手（10px × 10px，`z-index: 100001`）：各 corner 固定于相应边角，设置对应原生 `cursor: nw-resize / ne-resize / sw-resize / se-resize`
  - 四边把手（边缘 6px）：上/下留出左右各 10px 边距，左/右留出上下各 10px 边距，设置对应原生 `cursor: n-resize / s-resize / w-resize / e-resize`
  - 最大化状态规则：`#app.maximised .resize-handle { display: none; }`
- **Acceptance Criteria**：
  - CSS 语法正确
  - 把手覆盖窗口最外层边缘，且四角与四边不重叠冲突

### TASK-002：构建把手 DOM 节点与运行时不可变锁定

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中创建 8 个把手 DOM 元素附加至 `#app`，并通过属性描述符锁定 `window.wails.flags.enableResize` 为 false。
- **Details**：
  - 把手包含 `data-edge` 属性标记方向（`n-resize`、`ne-resize`、`e-resize`、`se-resize`、`s-resize`、`sw-resize`、`w-resize`、`nw-resize`）
  - 对 `window.wails.flags`（若存在）使用 `Object.defineProperty` 定义不可变 getter/setter，防止被 Go 后续脚本覆写
- **Acceptance Criteria**：
  - DOM 树成功挂载 8 个 handle 节点
  - 尝试给 `window.wails.flags.enableResize` 赋值不会改变其 false 状态

---

## Phase 2：缩放控制器交互逻辑与全向原生缩放联动

### TASK-003：实现把手 mousedown 原生缩放调用

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中实现把手事件监听，点击时直接阻止默认事件并向 Go 侧发送 `resize:<edge>`。
- **Details**：
  - 采用事件委托或为每个 handle 注册 `mousedown` 监听器
  - 仅响应鼠标主键（`e.button === 0`）
  - 调用 `e.preventDefault()` 和 `e.stopPropagation()`，防止滚动条或编辑器聚焦冲突
  - 调用 `WailsInvoke("resize:" + edge)`
- **Acceptance Criteria**：
  - 点击任一把手均能触发对应的 `WailsInvoke("resize:" + edge)` 调用
  - 代码逻辑无未捕获异常

---

## Phase 3：最大化状态管理与全链路验证

### TASK-004：实现窗口最大化状态机与全生命周期同步

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中建立 `syncMaximisedState` 状态同步函数，在启动、点击最大化按钮及窗口尺寸变化（`resize`）时统一维护 `#app.maximised` 与标题栏按钮图标。
- **Details**：
  - 调用 `WindowIsMaximised()` 获取系统真实状态
  - 状态为 true 时为 `#app` 添加 `maximised` 类名并切换还原图标；为 false 时移除 `maximised` 类名并切换最大化图标
  - 在 `window.addEventListener('resize')` 中防抖同步状态
- **Acceptance Criteria**：
  - 最大化时把手隐藏，还原时把手恢复
  - 标题栏图标与系统窗口状态保持一致

### TASK-005：全链路验证、测试与语法检查

- **Status**：DONE
- **Description**：运行前端 esbuild 语法检查、npm 构建及 Go 测试套件。
- **Details**：
  - 执行 `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`
  - 执行 `cd frontend && npm run build`
  - 执行 `go vet ./...` 与 `go test ./...`
- **Acceptance Criteria**：
  - esbuild 语法检查零错误
  - `npm run build` 生成 `frontend/dist/`
  - `go vet ./...` 零告警，`go test ./...` 4 个包全部 PASS

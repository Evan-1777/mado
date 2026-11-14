# Tasks：顶栏窗口拖拽区域与双击最大化交互修复

**关联 Plan**：`Plan.md` —— 顶栏窗口拖拽区域与双击最大化交互修复 v1.0  
**总计 Task**：4 个  
**状态**：DONE（4/4）  
**完成日期**：2026-11-14  
**回归测试结论**：全部本机静态检查、单元测试、竞态测试与三项无头浏览器检查退出码均为 0；`mygo generate` 输出无差异；新增 `top-bar-drag-regions` 几何命中检查经负向注入验证可捕获拖拽区回归；详细结论见 `Plan.md` 头部回填

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 14px 16px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e8ec;">任务依赖拓扑（共 4 项，全部由交付段主线顺序执行）</div>
  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 12px; line-height: 1.5;">
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px 12px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 1 · 拖拽继承链路与双击职责归位</div>
      <div>TASK-001（修正顶栏 CSS 拖拽边界） ──▶ TASK-002（移除重复双击监听）</div>
    </div>
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 10px 12px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 4px;">Phase 2 · 契约断言、几何命中验证与文档同步</div>
      <div>TASK-003（新增静态契约与无头几何命中测试） ──▶ TASK-004（全量回归测试与文档同步）</div>
    </div>
  </div>
</div>

---

## Phase 1：顶栏拖拽继承链路与双击职责归位

### TASK-001：重构 `frontend/src/style.css` 中顶栏布局容器与交互控件的 `--app-region` 声明边界

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：无
- **Executor**：主线
- **Description**：移除 `frontend/src/style.css` 中 `.app-bar-leading`、`.app-bar-center`、`.app-bar-trailing` 三个弹性布局容器上的 `--app-region: no-drag;` 声明，并在 `.icon-btn`、`.seg`、`.win-controls` 交互控件选择器上显式添加 `--app-region: no-drag;`。
- **Details**：
  - 保留 `frontend/src/style.css` 第 74–84 行 `.top-app-bar` 的 `--app-region: drag;` 与全部尺寸、弹性对齐属性不变。
  - 删除第 86–109 行中 `.app-bar-leading`（原第 92 行）、`.app-bar-center`（原第 99 行）、`.app-bar-trailing`（原第 108 行）规则块内的 `--app-region: no-drag;`，使左/右弹性空白区、`#title`、`.status` 与 `.app-bar-divider` 自然继承 `.top-app-bar` 的 `--app-region: drag`。
  - 在 `.icon-btn`（原第 173–188 行）、`.seg`（原第 213–220 行）与 `.win-controls`（原第 266–272 行）规则块中添加 `--app-region: no-drag;`，保留 `.win-btn`（原第 284 行）已有的 `--app-region: no-drag;`。
- **Acceptance Criteria**：
  - `.app-bar-leading`、`.app-bar-center`、`.app-bar-trailing` 规则块中均不含 `no-drag`
  - `.top-app-bar` 含 `--app-region: drag`，且 `.icon-btn`、`.seg`、`.win-controls`、`.win-btn` 均含 `--app-region: no-drag`
  - `cd frontend && ./node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty >/dev/null` 退出码为 0

### TASK-002：删除 `frontend/src/main.ts` 中与 MyGo 原生标题栏双击冲突的 `.top-app-bar` `dblclick` 监听

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001
- **Executor**：主线
- **Description**：删除 `frontend/src/main.ts` 中针对 `.top-app-bar` 绑定的 `dblclick` 事件监听器，统一由 MyGo 注入桥接脚本在拖拽区左键二次按下（`e.detail === 2`）时触发宿主原生 `TitleBarDoubleClicked`。
- **Details**：
  - 删除 `frontend/src/main.ts` 第 405–410 行的注释与 `document.querySelector('.top-app-bar')?.addEventListener('dblclick', ...)` 代码块。
  - 保留 `shell.winMax.addEventListener('click', () => { void toggleMaximize(); })` 最大化按钮点击逻辑，以及第 413–425 行 `window.addEventListener('resize', ...)` 中调用 `syncMaximisedState()` 与 `flushWindowState()` 的状态同步链路不变。
- **Acceptance Criteria**：
  - `frontend/src/main.ts` 中不再包含 `dblclick` 字符串
  - `cd frontend && npm run typecheck` 与 `cd frontend && npm run build` 退出码均为 0

---

## Phase 2：契约回归测试、无头几何命中校验与文档同步

### TASK-003：在 `frontend/tests/uiContract.test.mjs` 与 `frontend/tests/startup.check.mjs` 中新增顶栏拖拽契约及真实坐标命中断言

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-002
- **Executor**：主线
- **Description**：在 `frontend/tests/uiContract.test.mjs` 中添加顶栏 `--app-region` 继承边界与无重复 `dblclick` 绑定的静态契约断言；在 `frontend/tests/startup.check.mjs` 中指定 `1280,800` 默认窗口尺寸并添加顶栏空白区与交互控件的真实坐标命中断言。
- **Details**：
  - 在 `frontend/tests/uiContract.test.mjs` 中复用既有 `hasRule`、`hasNot` 辅助函数补充顶栏拖拽契约检查：
    - 使用 `hasRule(style, '.top-app-bar', '--app-region: drag', ...)` 断言顶栏根拖拽声明
    - 对 `['.icon-btn', '.seg', '.win-controls', '.win-btn']` 逐项执行 `hasRule(style, selector, '--app-region: no-drag', ...)`
    - 对 `['.app-bar-leading', '.app-bar-center', '.app-bar-trailing']` 匹配各自规则体并断言不含 `no-drag`
    - 使用 `hasNot(main, 'dblclick', 'native bridge owns title-bar double click')` 断言 `main.ts` 无重复双击监听
  - 在 `frontend/tests/startup.check.mjs` 中：
    - 在启动无头 Chrome 参数数组（第 384–386 行）中加入 `'--window-size=1280,800'`（与 `DEFAULT_SETTINGS` 的 `1280x800` 保持一致，确保左右两侧弹性容器同时具备真实伸展空白带）
    - 新增 `top-bar-drag-regions` 检查项：测量 `.status` 右缘与 `.seg` 左缘之间的左空白中点（断言 `elementFromPoint` 命中 `.app-bar-leading`）、`.seg` 右缘与 `#btn-new` 左缘之间的右空白中点（断言命中 `.app-bar-trailing`）、`#title` 中心点与 `.status` 中心点，校验四处命中元素的 `getComputedStyle(hit).getPropertyValue('--app-region').trim() === 'drag'` 且 `!hit.closest('button,input,textarea,select,a[href]')`；同时测量 `#toc-collapse`、`#tab-editor`、`#btn-new`、`.win-close` 四个交互控件中心点，校验命中元素的计算样式 `--app-region` 均为 `'no-drag'`
- **Acceptance Criteria**：
  - `cd frontend && npm test` 全部 6 项前端自检通过，退出码为 0
  - `cd frontend && npm run build && node tests/startup.check.mjs` 输出包含 `top-bar-drag-regions: PASS` 且整体 `ALL PASS`，退出码为 0

### TASK-004：执行全链路验证并同步更新 `.docs/Project.md`

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-003
- **Executor**：主线
- **Description**：按 `.docs/Project.md` 本机验证链完整执行前后端静态检查、单元测试、竞态测试、绑定生成校验与全部三项无头冒烟检查，并更新 `.docs/Project.md` 中顶栏拖拽与双击控制说明。
- **Details**：
  - 依次执行并核验退出码为 0：
    1. `cd frontend && npm run typecheck`
    2. `cd frontend && ./node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty >/dev/null`
    3. `cd frontend && npm test`
    4. `cd frontend && npm run build`
    5. `CGO_ENABLED=0 go vet ./...` 与 `CGO_ENABLED=0 go test ./...`
    6. `go test -race ./...`
    7. `CGO_ENABLED=0 go run github.com/egoist/mygo/cmd/mygo@v0.7.4 generate`（确认输出 `frontend/src/mygo.ts is up to date`）
    8. `cd frontend && node tests/startup.check.mjs && node tests/modeScroll.check.mjs && node tests/export.check.mjs`
  - 更新 `.docs/Project.md` 数据流“窗口控制与状态记忆”条目，明确记录顶栏根部声明 `--app-region: drag`、左/中/右弹性布局容器透传继承、仅实际交互控件声明 `--app-region: no-drag`，以及顶栏双击缩放由 MyGo 桥接层原生触发 `TitleBarDoubleClicked` 并经 `window.resize` 同步前端状态。
- **Acceptance Criteria**：
  - 上述 8 步验证命令退出码全部为 0，无新增构建残留文件
  - `.docs/Project.md` 与实际代码实现完全一致

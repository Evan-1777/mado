# Tasks：模态居中、编辑区行号居中与代码块复制

**关联 Plan**：`Plan.md` —— 模态居中、编辑区行号居中与代码块复制 v1.0
**总计 Task**：8 个
**状态**：DONE
**完成日期**：2026-09-26
**归档日期**：2026-09-26
**回归测试结论**：自动化回归通过；Windows 原生模态居中、行号视觉居中和复制按钮悬停观感待 Windows 主机核对。

---

## Phase 1：原生模态恢复窗口居中

### TASK-001：对话框共享规则恢复内置自动外边距

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：None
- **Description**：在 `frontend/src/style.css` 的对话框共享规则（`#close-dialog, #settings-dialog`）中恢复自动外边距，抵消文件顶部 `* { margin: 0 }` 对原生模态内置居中的覆盖。
- **Details**：
  - 共享规则内补 `margin: auto;`，两个原生 `<dialog>` 同时生效，不新增按 id 的重复规则
  - 不改动全局重置本身：重置的意图是无处不在的零外边距，只有模态依赖浏览器内置居中
  - 不动 `::backdrop`、玻璃增强 `@supports` 块、尺寸与内边距
- **Acceptance Criteria**：
  - 共享规则含 `margin: auto`，由 UI 契约自检断言（几何量以该声明为根因，不另建页面级夹具）
  - Windows 桌面人工核对：设置与未保存确认两个模态在窗口中水平垂直居中
  - `#close-dialog` 的 `min-width: 340px` 与 submitter 返回值契约不变
  - Esc 取消、焦点捕获、`showModal()` 顶层叠放行为不变

---

## Phase 2：编辑区行号槽数字水平居中

### TASK-002：行号单元改为居中对齐

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：None
- **Description**：在 `frontend/src/style.css` 增加外壳覆盖规则，把 CodeMirror 行号单元从右对齐、非对称内边距改为水平居中。
- **Details**：
  - 选择器以 `:root[data-theme] .cm-editor .cm-lineNumbers .cm-gutterElement` 提升特异性，压过 baseTheme 的 `.cm-lineNumbers .cm-gutterElement` 默认值（`padding: 0 3px 0 5px; min-width: 20px; text-align: right`）
  - 内边距改为左右对称（`0 4px`），文本对齐改为 `center`；不设 `min-width`，数字左右各留 4px 的对称内边距即是居中所要求的全部几何，无需再用固定列宽
  - 不改行号槽的右边界与既有跳转命中判定
- **Acceptance Criteria**：
  - UI 契约自检断言该覆盖规则的 `text-align: center` 与左右对称内边距
  - Windows 桌面人工核对：行号数字在行号槽内视觉居中，多位行号不抖动

---

## Phase 3：围栏代码块复制

### TASK-003：渲染层在围栏包装层输出复制按钮

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：None
- **Description**：在 `internal/mdrender/mdrender.go` 的 `renderCodeWrapper` 退出分支中，于包装层内、`</div>` 之前输出复制按钮标记，使每个围栏代码块自带复制入口。
- **Details**：
  - 按钮为世界可交互标记，但因帧无脚本执行权限，其点击由父侧委托处理（见 TASK-005）；按钮用 `type="button"` 避免任何隐式表单语义
  - 仅围栏代码块具备该按钮：缩进代码块与原始 HTML 块无包装层（同 `data-line` 的既有边界），本次确认不覆盖
  - `data-line` 仍只出现在包装层上；Chroma 输出（`<pre class="chroma">`、`<span class="line"><span class="cl">`）与 `{nohl=true}` 路径逐字不变
  - 文案使用中文界面语言（`aria-label="复制代码"`）
- **Acceptance Criteria**：
  - `go test ./internal/mdrender` 新增断言通过：带语言、无语言、未知语言及 `{nohl=true}` 围栏的输出均含复制按钮，且 `data-line` 计数仍为 1
  - Chroma `<pre>` 开标签与行包装 span 逐字保持

### TASK-004：预览样式表新增复制按钮视觉

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-003
- **Description**：在 `internal/theme/assets/theme/base.css` 中新增复制按钮样式：默认隐身，代码块悬停或按钮获得键盘焦点时出现；使用既有预览令牌，不引入字面色。
- **Details**：
  - 定位：`div.md-line { position: relative }`，按钮绝对定位于代码块右上角内缘
  - 显隐：默认 `opacity: 0` 且不可命中；`.md-line:hover` 与 `.md-line:focus-within` 时 `opacity: 1`
  - 视觉：令牌化的表面、边框、圆角与次级文字色，尺寸与预览字阶协调（不改 `pre` 既有内边距与滚动行为）
  - 复制成功的回显由父侧写入按钮状态类触发（见 TASK-005），样式一并覆盖该状态
- **Acceptance Criteria**：
  - 浅深双主题下按钮可读、Hover/Active 状态清晰
  - 按钮出现不改变代码块尺寸与横向滚动区域
  - 规则全部位于预览样式表（帧内文档无法继承外壳样式）

### TASK-005：前端帧内委托复制与「已复制」回显

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-003, TASK-004
- **Description**：在 `frontend/src/main.ts` 的帧内委托点击监听中追加复制分支：命中复制按钮时取同包装层代码文本写入系统剪贴板，并把按钮文案切换为「已复制」后还原。
- **Details**：
  - 复用既有帧 document 委托点击监听（`hookPreviewLinks`）：它已处理行号栏与链接分支，跨 `innerHTML` 更新存活，无需新增监听或重挂逻辑
  - 复制源为同包装层内 `pre` 的 `textContent`，去除末尾换行后写入 `ClipboardSetText`（Wails 运行时既有绑定，零新增依赖）
  - 回显：按钮文案切换为「已复制」，短延时后还原为「复制代码」；重复点击不叠加定时器
  - 写入失败静默返回，不改变界面结构；按钮分支须在主按钮判定之前返回，避免被链接分支拦截
- **Acceptance Criteria**：
  - dev-only 无头用例（stub `ClipboardSetText`，见 TASK-006）：点击后剪贴板文本等于代码块内容去尾随换行；按钮文案短暂变为「已复制」后还原
  - 复制分支不影响行号栏点击跳转与锚点链接滚动
  - 编辑后原地更新正文（`innerHTML` 重写）后按钮仍可用

---

## Phase 4：契约测试同步与回归

### TASK-006：同步渲染用例、UI 契约与复制无头用例

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001 至 TASK-005
- **Description**：在 `internal/mdrender/srcline_test.go`（或 `mdrender_test.go`）、`frontend/tests/uiContract.test.mjs` 与 `frontend/tests/startup.check.mjs` 中补齐本轮变更的断言与用例。
- **Details**：
  - Go：围栏包装层含复制按钮、`data-line` 计数仍为 1、Chroma 行包装 span 保留、无语言与 `nohl` 围栏同样带按钮
  - UI 契约：对话框规则含 `margin: auto`；行号单元覆盖规则含 `text-align: center` 且内边距左右对称；预览样式含按钮显隐规则
  - 无头自检（`frontend/tests/startup.check.mjs`）：`window.runtime` 桩补 `ClipboardSetText`（记录写入文本并返回 `true`）；`Render` 桩改为返回一个带复制按钮的围栏包装层；新增 `copy-code-block` 结果项——帧内点击复制按钮后 `window.__clip` 等于代码内容去尾随换行，且按钮文案切换为「已复制」
  - 该文件的头注释同步补一句覆盖范围（它现在也守复制通道），不为一个用例新建平行夹具
  - 不新增测试框架与依赖：复用既有 Wails 桩、HTTP 夹具与 `results.push({ name, ok })` 断言输出格式
- **Acceptance Criteria**：
  - `npm test`（含新增 UI 契约断言）与 `go test ./...` 全部通过
  - `node frontend/tests/startup.check.mjs` 输出 `ALL PASS`，含新增 `copy-code-block` 项
  - 新增断言在回退对应改动时确实失败（非恒真）

### TASK-007：全量回归与无头自检

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-006
- **Description**：执行本机验证链并记录结论。
- **Details**：
  - `cd frontend && npm test`；`GOCACHE=/tmp/mado-go-build-cache go vet ./...`；`go test ./...`
  - `npm run build` 产出 dist（go:embed 依赖）
  - dev-only 无头自检：`node frontend/tests/startup.check.mjs`、`node frontend/tests/modeScroll.check.mjs`
- **Acceptance Criteria**：
  - 全部命令退出码为 0
  - 无头自检输出 `ALL PASS`
  - Windows 原生交互验收项（两个模态居中、行号观感、复制按钮悬停出现与点击反馈）：待 Windows 主机核对（当前环境无 Windows WebView2）
  - 自动化结果：`cd frontend && npm test`、`GOCACHE=/tmp/mado-go-build-cache go vet ./...`、`GOCACHE=/tmp/mado-go-build-cache go test ./...`、`cd frontend && npm run build`、`HOME=/tmp CHROME_BIN=/usr/bin/google-chrome node frontend/tests/startup.check.mjs`、`HOME=/tmp CHROME_BIN=/usr/bin/google-chrome node frontend/tests/modeScroll.check.mjs` 全部退出码 0；两项无头检查输出 `ALL PASS`

### TASK-008：文档同步、归档与提交

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-007
- **Description**：同步 `.docs/Project.md`，归档根目录 `Plan.md` 与 `Tasks.md`，并按 Conventional Commits 中文描述提交。
- **Details**：
  - Project.md：§1 当前阶段、§4 架构与数据流（预览复制通道、行号槽覆盖规则）、§6 约束与已知坑（对话框居中根因、复制按钮受沙箱限制的实现约束）、§8 决策记录（本轮日期条目）
  - 归档目录名 `09-26-v1`（当日无同日目录则从 v1 起）；归档前两文件标注 `状态：DONE`、完成日期与回归结论
  - 提交信息形如 `fix: 修复模态居中与行号对齐并支持代码块复制`
- **Acceptance Criteria**：
  - `.docs/09-26-v1/` 同时含 `Plan.md` 与 `Tasks.md`，根目录无残留
  - `git status` 不含密钥、构建产物与临时文件
  - Project.md 与实际代码一致

---

## 依赖关系

```
TASK-001 ┐
TASK-002 ┼─→ TASK-006 ─→ TASK-007 ─→ TASK-008
TASK-003 ┤
TASK-004 ┤
TASK-005 ┘
```

# Tasks：修复模式切换后 Preview 滚动位置丢失

**关联 Plan**：`Plan.md` —— 修复模式切换后 Preview 滚动位置丢失 v1.0
**总计 Task**：5 个

---

## Phase 1：预览滚动位置跨模式切换保持

### TASK-001：模式切换时保存并在返回预览可见模式时恢复 iframe 文档滚动位置

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 的模式切换 tab handler（`toolbar.querySelectorAll('.seg button')` 的 click 回调）中，于修改 `pane` 类之前捕获预览 iframe 文档的滚动偏移，并在类切换完成、预览列重新显示之后写回该偏移。
- **Details**：
  - 模块级新增一个 `let` 状态变量（如 `savedPreviewScroll`），类型 `number | undefined`，初值 `undefined`，只保存一个方向（离开预览可见模式时写，回到预览可见模式时读并清空）
  - 捕获时机：执行 `pane.classList.remove('editor-only', 'preview-only')` 之前，若预览列当前可见则该变量 = `previewIframe.contentDocument?.scrollingElement?.scrollTop`（帧文档不存在时为 `undefined`）
  - 写回时机：类切换完成之后，若预览列当前可见且保存值非 `undefined`，则 `scrollingElement.scrollTop = 保存值`，随后把保存值清回 `undefined`
  - 预览列可见性判断复用已有函数 `isPreviewVisible()`（`!pane.classList.contains('editor-only')`，约 236 行），不要新造重复函数
  - 每次切换重新获取 `previewIframe.contentDocument?.scrollingElement`，不持有跨切换的陈旧引用
  - 写回必须在类切换之后（列已显示）执行，禁止在隐藏状态下写回（实测被钳制为 0 无效）
  - 恢复值只写回一次：写回后置 `undefined`，避免下一次切到 Editor 时把旧的保存值再次写回
  - 代码注释用英文，说明"iframe 视口在 display:none 时被销毁、滚动偏移归零，而普通溢出容器（编辑器）保留偏移"这一根因，并注明写回须在列重新显示后
- **Acceptance Criteria**：
  - `cd frontend && npm run build` 退出码 0（esbuild 无错误）
  - 审查 diff：改动仅限 `frontend/src/main.ts`，且模式切换 handler 内逻辑与上述捕获/写回时序一致；无新增重复的可见性判断函数
  - 该 Task 的代码变更内不含任何测试文件（测试文件属 TASK-002）

### TASK-002：新增 dev-only 无头 Chrome 回归检查并确认其能区分修复前后

- **Status**：DONE
- **Description**：新增 `frontend/tests/modeScroll.check.mjs`：以 Node 内置 `http` 服务在内存中提供「注入 Wails 桩 + 真实 `dist/` 资源」的 index.html，用无头 Chrome（`--headless=new --dump-dom --virtual-time-budget`）驱动真实 bundle，打印机器可读的 MODESCROLL 结果行并以退出码表达通过/失败。**不接入** `npm test` 与 CI。
- **Details**：
  - 服务：`node:http` 监听 `127.0.0.1:0`（随机端口），`/` 返回内存 HTML（`frontend/index.html` 内容，`<script src="./app.js"></script>` 前注入 Wails 桩脚本、后注入测试 scenario 脚本），其余路径从 `frontend/dist/` 读真实文件（含 katex 子目录），Content-Type 按扩展名映射
  - Wails 桩：`window.wails = { flags: { enableResize: true } }`；`window.go.main.App` 提供 `ForceQuit/GetCSS/GetSettings/GetStartupFile/LoadFile/SaveFile/SaveFileDialog/OpenFileDialog/Render/SetDirty/SetTheme/SetWrap/SetMath/SetPreviewFont/SetTitle`，全部返回 `Promise.resolve(...)`；`GetStartupFile` 返回非空路径（如 `'test.md'`），`LoadFile` 返回一个长文档（约 800 个 `## 标题 N\n\n段落内容 N\n`，保证编辑器与预览都产生可滚动高度）；`Render` 返回约 300 个 `<div data-line="..." style="height:40px">block N</div>`（保证预览 iframe 文档有 ≥4000px 的可滚动内容）；`window.runtime` 提供 main.ts 引用的全部函数（`WindowMinimise` 等为空函数，`WindowIsMaximised` 返回 `Promise.resolve(false)`，`EventsOn/OnFileDrop` 为空函数）
  - Scenario（页面内 async IIFE，结果写入 `<pre id="modescroll-result">`）：
    - 等待启动就绪（轮询直到 `.cm-content` 存在、iframe 内 `#md-content` 与 `[data-line]` 存在，最多 400 次 × 25ms）
    - 三个预览 cycle：`preview→editor→preview`、`split→editor→split`、`preview→split→preview`，每个 cycle：点击起始 tab → wait 60ms → iframe `scrollingElement.scrollTop = 4000` → 记录 `before` → 点击离开 tab → wait 80ms → 断言 pane 类与 `.preview-col` 计算样式（`.display === 'none'` 与否符合该模式预期）→ 记录 `whileHidden` → 点击返回 tab → wait 80ms → 记录 `after`；判定 `ok = 切换确实发生 && before > 0 && after === before`（Split 离开时预览列不隐藏，`expectHidden=false`；Editor 离开时 `expectHidden=true`）
    - 一个 editor cycle：点击 editor tab → wait 60 → `.cm-editor .cm-scroller`（编辑器滚动容器）`scrollTop = 3000` → 记录 `before` → 点击 preview → wait 80 → 点击 editor → wait 80 → 记录 `after`，判定 `before > 0 && after === before`（钉死"编辑器本就不丢"的现状，防将来破坏）
    - 输出：`MODESCROLL <每条: name: before=.. whileHidden=.. after=.. PASS|FAIL | ...> => ALL PASS` 或 `=> FAIL`（含 `=> FAIL` 即失败）；异常时输出 `MODESCROLL ERROR: <message>`
  - Node 侧：spawn Chrome（`CHROME_BIN` 环境变量可覆盖，默认 `google-chrome`），参数 `--headless=new --disable-gpu --no-first-run --virtual-time-budget=20000 --dump-dom <url>`；从 stdout 匹配 `<pre id="modescroll-result">([^<]*)</`；结果含 `=> ALL PASS` 时 `process.exit(0)`，否则 `process.exit(1)` 并打印结果行；Chrome 退出后关闭 http server
  - 文件顶部注释注明：dev-only 自检，运行前需 `npm run build` 产出 `dist/`，不进 `npm test`/CI（CI 为 windows-latest，依赖不保证的 Chrome/无头行为会破坏构建链）
- **Acceptance Criteria**：
  - 在**未修复**代码构建上运行 `node frontend/tests/modeScroll.check.mjs`：输出含 `preview-editor-preview ... FAIL` 与 `split-editor-split ... FAIL`，结果行以 `=> FAIL` 结尾，退出码非 0（且 `preview-split-preview` 与 `editor-preview-editor` 为 PASS——确保不是因自身失效而假红）
  - 在**已修复**（TASK-001）代码构建上运行同一命令：四行全 PASS，结果行以 `=> ALL PASS` 结尾，退出码 0
  - 脚本不修改 `frontend/package.json`（不加入 `test` script）、不创建/修改 `frontend/dist/` 下任何文件（html 在内存中提供）、不引入任何 npm 依赖

---

## Phase 2：验证与文档维护

### TASK-003：跑通本机验证链

- **Status**：DONE
- **Description**：执行本机验证链并记录结论。
- **Details**：
  - `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（stdout 丢弃），退出码 0 视为通过
  - `cd frontend && npm test`（依次跑 fontCommit 与 gutter 自检），退出码 0
  - `go vet ./... && go test ./...`（仓库根目录），退出码 0
  - `node frontend/tests/modeScroll.check.mjs`（TASK-002 产物），退出码 0
- **Acceptance Criteria**：
  - 四条命令全部退出码 0，且本回复/提交信息中记录各命令的实际退出码
  - 验证链输出中无新增的失败/警告（与改动前基线一致）

### TASK-004：同步 Project.md

- **Status**：DONE
- **Description**：按 `.docs/Project.md` 维护速查规则同步本次变更。
- **Details**：
  - §6 约束与已知坑：新增一条「模式切换隐藏预览列会重置 iframe 滚动——原因：display:none 销毁 iframe 视口，滚动偏移归零；普通 overflow 容器（CodeMirror scroller）保留偏移；修复为隐藏前捕获、列重新显示后写回」
  - §8 决策记录：新增 2026-08-31 条目，记录修复位置选择（模式切换 handler 单点）、写回时机（列显示后，隐藏时写回被钳制为 0）、回归检查形态（dev-only 无头 Chrome 自检，不进 npm test/CI 及其原因）
  - 若 §9 术语表或 §4 数据流涉及模式切换的段落描述已过时，一并修正；无新增依赖、无外部服务、无运行方式变化则 §2/§7 不动
- **Acceptance Criteria**：
  - `grep -c "2026-08-31" .docs/Project.md` ≥ 1（决策记录存在）
  - 新增内容与代码实际行为一致：捕获/恢复时序、写回时机、检查脚本不进 npm test 的说明全部与实现相符
  - DB/依赖/服务相关小节（§2/§7）无无关改动

---

## Phase 3：归档与提交

### TASK-005：归档 Plan/Tasks 并 git 提交

- **Status**：DONE
- **Description**：按 Archive 流程归档根目录计划文档，并创建 git 提交。
- **Details**：
  - 先把根目录 `Plan.md` 与 `Tasks.md` 状态改为 `DONE`，填入完成日期（2026-08-31）与回归测试结论（TASK-003 各命令退出码 + modeScroll 全 PASS）
  - 归档目录名：`.docs/08-31-v1/`（查询 `.docs/` 下 08-31 前缀目录取最大 N+1；本计划落盘时无 08-31 目录，若执行阶段已有同日归档则递增）
  - `mkdir -p .docs/08-31-v1 && mv Plan.md Tasks.md .docs/08-31-v1/`，校验两文件均在归档目录、根目录无残留
  - `git add` 全部变更（`frontend/src/main.ts`、`frontend/tests/modeScroll.check.mjs`、`.docs/Project.md`、`.docs/08-31-v1/`），`git commit`
  - 提交信息：`fix: 模式切换后预览滚动回到顶部`（body 说明根因：display:none 销毁 iframe 视口）——使用中文详细描述，前缀为标准 Conventional Commits 类型
- **Acceptance Criteria**：
  - `.docs/08-31-v1/` 同时含 `Plan.md` 与 `Tasks.md`，两者状态均为 DONE 且含完成日期与回归结论；根目录无 `Plan.md`/`Tasks.md`
  - `git status` 输出 clean（无未提交变更、无 untracked）
  - `git log -1 --format=%s` 以 `fix:` 开头且含中文描述
  - 提交不含 `frontend/dist/`（gitignored，确认 `git status` 未列出）

---

---

## 完成结论

**状态**：DONE（2026-08-31 完成）。TASK-001~005 全部通过验收：模式切换 handler 已实现保存/写回（`frontend/src/main.ts`），`frontend/tests/modeScroll.check.mjs` 在未修复构建上 FAIL（退出码 1）、修复后构建全 PASS（`=> ALL PASS`，退出码 0）；esbuild / `npm test` / `go vet` / `go test` / modeScroll 五条验证命令退出码均为 0，详见 Plan.md 回归测试结论。

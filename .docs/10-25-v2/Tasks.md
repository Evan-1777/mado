# Tasks：消除启动黑屏闪烁，窗口在界面就绪后显示

**关联 Plan**：`Plan.md` —— 消除启动黑屏闪烁，窗口在界面就绪后显示 v1.0
**状态**：DONE
**完成日期**：2026-10-25
**总计 Task**：4 个
**回归测试结论**：本地全链通过（2026-10-25）：`go vet ./...`、`go test ./...`、`go test -race ./...`、`GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go vet ./...`、前端 esbuild 零产物语法检查、`npm test` 六项、`npm run build` 均通过；本地 headless Chrome 三项 dev-only 检查全部 ALL PASS。startup 新增 `window-show-ready`（恰一次调用、晚于设置应用、调用时编辑器已存在、主题已生效），时间线为 `show=879.8 editor=845.3 preview=939.8`（headless 虚拟时间，仅用于顺序验证：显示早于启动文件内容渲染）。Windows/WebView2 实际首帧视觉由用户端确认。

> **环境约定**
> - 前端命令在 `frontend/` 执行；缺失依赖时先执行 `npm install --include=dev`。
> - Go 命令在仓库根目录执行；GOCACHE 不可写时使用 `GOCACHE=/tmp/mado-gocache`，验证后清理。
> - 本机 Chrome 可执行（`/usr/bin/google-chrome`），三项 dev-only 检查以本地 headless 运行；不修改产品逻辑迎合测试。
> - 本机不执行 Windows 全量构建；WebView2 实际首帧由用户在 Windows 端验收。
> - 执行顺序即 Task 编号顺序；每完成一项将 Status 置为 DONE。

---

## Phase 1：窗口可见性与界面就绪耦合

### TASK-001：设置窗口默认隐藏

- **Status**：DONE
- **优先级**：P0
- **依赖**：无
- **Executor**：主线
- **Description**：在 Wails 启动选项中设置 `StartHidden: true`，把窗口首次显示的控制权交给前端；窗口背景色按持久主题取 frame 色，避免首帧露出近黑画刷。
- **Details**：
  - `main.go` 的 `options.App` 增加 `StartHidden: true`，与 `WindowStartState` 相邻，注释说明由前端在界面就绪后显示。
  - `BackgroundColour` 由已预读的 `s.Theme` 派生：深色 `#202020`（`--dark-frame`）、浅色 `#f3f3f3`（`--light-frame`），注释标注与 style.css 的联动。
  - 不改动 `Windows.Theme`、`DragAndDrop`、绑定与关闭回调。
- **Acceptance Criteria**：
  - `GOCACHE=/tmp/mado-gocache go vet ./...` 退出码 0。
  - `grep -n 'StartHidden: true' main.go` 命中一次；深/浅两个背景分支存在。
  - `go test ./...` 通过，无既有测试回归。

### TASK-002：退役启动骨架并在界面就绪后显示窗口

- **Status**：DONE
- **优先级**：P0
- **依赖**：TASK-001
- **Executor**：主线
- **Description**：删除 `index.html` 的静态骨架、`preload`、内联启动背景与 load 后注入脚本，恢复 body 末尾常规 `app.js`；`main.ts` 删除骨架清理，导入 `WindowShow`，在持久设置应用并等待页面 `load` 之后显示窗口。
- **Details**：
  - `frontend/index.html`：
    - 删除 `<link rel="preload" as="script" href="./app.js"/>`。
    - 删除 head 中 `html, body { background: #09090b; }` 的内联样式。
    - `#app` 内删除 titlebar/toolbar/pane 静态骨架，恢复为空容器。
    - 删除 `script id="app-bootstrap"`，在 body 末尾恢复 `<script src="./app.js"></script>`。
    - 保留根节点 `data-theme="dark"` 作为设置加载前的默认值；保留三个 dialog 与 `lang`、`title` 等既有属性。
  - `frontend/src/main.ts`：
    - 从 `../wailsjs/runtime/runtime` 导入中增加 `WindowShow`。
    - 删除 `app.replaceChildren(); // drop the static boot shell before building the real UI`。
    - `init` 开头创建 `pageLoaded` Promise：`document.readyState === 'complete'` 时立即 resolve，否则监听一次性 `load`。
    - 在设置 try/catch 之后、启动文件处理之前：`await pageLoaded; WindowShow();`，注释说明窗口保持隐藏直到真实 UI 与持久主题就绪。
    - 保留末尾 `cm.focus()`，使显示后的焦点落在编辑器。
    - 保留 `readyState === 'loading'` 分支；更新其注释，不再提及 load 后注入。
- **Acceptance Criteria**：
  - `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 退出码 0。
  - `grep -n 'app-bootstrap\|rel="preload"\|aria-hidden="true"' frontend/index.html` 无命中；`grep -c '<script src="./app.js"></script>' frontend/index.html` 为 1。
  - `main.ts` 含 `WindowShow` 导入与 `WindowShow();` 调用，且调用位于设置应用之后、`GetStartupFile` 结果消费之前；不再含 `app.replaceChildren`。
  - `cd frontend && npm run build` 成功，`dist/index.html` 不含骨架与延迟加载脚本。

---

## Phase 2：契约与无头检查回归

### TASK-003：同步 uiContract 与三项无头检查的启动契约

- **Status**：DONE
- **优先级**：P0
- **依赖**：TASK-002
- **Executor**：主线
- **Description**：更新 UI 契约与 dev-only 检查：移除骨架/preload/延迟注入断言，新增"窗口默认隐藏 + 前端就绪后显示"，并同步三个检查脚本的注入锚点与运行时桩。
- **Details**：
  - `frontend/tests/uiContract.test.mjs`：
    - 删除 `rel="preload"`、`id="app-bootstrap"`、三处 boot shell 与 `app.replaceChildren` 断言。
    - 新增：`index.html` 含 `<script src="./app.js"></script>`；不含 `app-bootstrap` 与 `rel="preload"`；不含启动骨架标记。
    - 新增：读取 `../main.go`，断言 `StartHidden: true`；`main.ts` 含 `WindowShow` 导入与调用。
    - 保留 `document.readyState === 'loading'`、`void init();` 与既有模式/ARIA/导出断言。
  - `frontend/tests/startup.check.mjs`：
    - 注入锚点改为 `<script src="./app.js"></script>`。
    - `window.__startup` 增加 `showCalls`、`showAt`、`editorAtShow`、`themeAtShow`；`window.runtime` 增加 `WindowShow()`，记录调用次数、时刻、调用时 `.cm-editor` 是否存在与 `data-theme`。
    - 删除 `boot-shell-before-bundle`；新增 `window-show-once`（恰一次）与 `window-show-ready`（`showAt >= settingsDone`、`editorAtShow`、`themeAtShow === 'dark'`）。
    - 时间线输出追加 `show=`；既有 single-render、IPC overlap、复制、模式、取消、拖放、空文档与预览激活断言保持不变。
  - `frontend/tests/modeScroll.check.mjs`、`frontend/tests/export.check.mjs`：注入锚点改回 `<script src="./app.js"></script>`；运行时桩补 `WindowShow(){}`；更新 modeScroll 中"bundle 替换骨架"的过时注释。
- **Acceptance Criteria**：
  - `cd frontend && npm test` 六项全部通过。
  - `cd frontend && node tests/startup.check.mjs` 输出 ALL PASS，含 `window-show-once`、`window-show-ready` 与 `show=` 时间线。
  - `node tests/modeScroll.check.mjs`、`node tests/export.check.mjs` 均 ALL PASS。
  - `npm run build` 产物与 `index.html` 一致，无 `app-bootstrap` 残留。

---

## Phase 3：文档维护、全链回归与归档

### TASK-004：同步 Project.md、执行全链回归并归档提交

- **Status**：DONE
- **优先级**：P0
- **依赖**：TASK-001 ~ TASK-003
- **Executor**：主线
- **Description**：更新 Project.md 的启动链路、阶段、决策与术语；执行本地全链验证；标注 Plan/Tasks DONE 后归档，并按 Conventional Commits 规范提交。
- **Details**：
  - `.docs/Project.md`：
    - 阶段：将"启动骨架先于编辑器 bundle 显示"改为"窗口在真实界面与主题就绪后显示"。
    - 数据流·启动：改为窗口 `StartHidden` 隐藏 → 常规 bundle 构建 UI → init 并发读取设置/启动文件 → 应用主题并等待 `load` → `WindowShow` → 再加载启动文件。
    - 约束与决策：原 2026-10-25 骨架条目标注为被取代，新增本次 `StartHidden + WindowShow` 决策与取舍（可见时刻后移、换取零中间帧），以及窗口背景按主题 frame 色取值。
    - 术语：删除"启动骨架（boot shell）"，补充"窗口就绪显示"的简短定义。
  - 验证链：
    - `GOCACHE=/tmp/mado-gocache go vet ./...`、`go test ./...`。
    - `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`、`npm test`、`npm run build`。
    - `node tests/startup.check.mjs`、`node tests/modeScroll.check.mjs`、`node tests/export.check.mjs`。
    - 记录 startup 的 `fcp/editor/show` 时间线，确认显示晚于设置应用且恰好一次。
  - 清理：删除 `frontend/dist` 之外的临时文件；确认 `git status` 仅含本次变更与用户既有 `.docs/SCOPE.md` 改动（不回退、不提交该用户改动）。
  - 归档：Plan.md/Tasks.md 标注状态 DONE、完成日期与回归结论，移入 `.docs/10-25-v2/`，确认根目录无残留。
  - 提交：英文 Conventional Commits 类型前缀 + 中文描述；只暂存本次相关文件。
- **Acceptance Criteria**：
  - 上述命令全部退出码 0，三项无头检查 ALL PASS。
  - Project.md 无"启动骨架/preload/load 后注入"的现行描述；含 `StartHidden`、`WindowShow` 与新的启动时序。
  - `.docs/10-25-v2/` 同时含 Plan.md 与 Tasks.md；根目录无 Plan.md/Tasks.md。
  - `git log -1` 为一条符合规范的提交，未包含 `.docs/SCOPE.md` 的用户改动。

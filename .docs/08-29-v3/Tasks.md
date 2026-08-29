# Tasks：无文件启动时以新文档打开

**关联 Plan**：`Plan.md` —— 无文件启动时以新文档打开 v1.2
**总计 Task**：5 个（Execute 3 + Test 1 + Document Maintenance 1；Archive 与 Git Commit 由交付链阶段执行）

## 完成结论

- **状态**：全部 DONE
- **完成日期**：2026-08-29
- **回归测试结论**：本机验证链 6 条命令全部通过 —— `npm install --include=dev`（node_modules 已就绪，跳过实装）/ esbuild 零产物语法检查 / `npm test`（fontCommit + gutter 自检通过）/ `npm run build`（dist/ 产出）/ `go vet ./...`（无输出）/ `go test ./...`（5 包全 ok，含新增 `TestStartupCreatesNoWelcomeDoc` 与 `TestSetLastFileCreatesStore`）
- **遗留**：UI 层行为（无文件启动渲染空白文档、标题栏 untitled、读取失败提示 `Open failed`）无 GUI 测试设施，按项目惯例由用户在 Windows 产物上人工验收

---

## Phase 1：启动路径收敛与欢迎文档机制退役

### TASK-001：前端启动分支收敛与读取失败回退

- **Status**: DONE
- **Description**：在 `frontend/src/main.ts` 的 `init()` 中移除 `GetWelcome` 回退：无启动文件时调用 `newFile()` 进入空白未命名状态；启动文件存在但读取失败时同样回退空白态并给出状态提示。
- **Details**：
  - 正常路径分支：`path = await GetStartupFile()`；非空 → `LoadFile(path)` + `loadContent`；为空 → `newFile()`（内部已含 setTitle('untitled')、setDirty(false)、refreshPreview，与 Ctrl+N 同源）。
  - try/catch 保留并定义语义：catch 分支先 `await newFile()` 回退空白态，**再**在状态栏提示 `Open failed`——顺序不可颠倒，newFile() 内部会把状态栏置为 Ready，先写提示会被覆盖。
  - 同步移除 `GetWelcome` import 与 init 中 welcome 字样的日志。
  - 空白分支不写 lastfile、不写盘（沿用 newFile 现有语义）。
- **Acceptance Criteria**：
  - 前置：`frontend/node_modules` 未就绪时先 `npm install --include=dev`（仅首次）。
  - `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 退出码 0。
  - `grep -n "GetWelcome\|welcome" frontend/src/main.ts` 无命中。
- **依赖**：无

### TASK-002：删除 Go 侧欢迎文档机制并归一常量

- **Status**: DONE
- **Description**：在 `internal/filesys/filesys.go` 删除 `GetLastFile`、`persistWelcome`、`appDataDir`、`WelcomeDoc`、`settingsPath`、`AppDir`；在 `app.go` 删除 `GetWelcome` 绑定方法并将启动迁移中的 `"Mado"` 字面量改为 `settings.AppDir`；在 `frontend/wailsjs/go/main/App.js` 与 `App.d.ts` 同步移除 `GetWelcome` 条目。
- **Details**：
  - `settingsPath()` 删除后 `SetLastFile` 直接调用 `storePath()`（内联单调用者包装）。
  - `settings.AppDir` 保持 "legacy directory name" 注释语义：启动迁移（app.go）保留且以 `%APPDATA%/Mado` 为源目录，该常量仍是迁移逻辑的引用目标，注释据实不改。
  - `filesys.go` 包注释与 `SetLastFile` 注释口径对齐：包注释的 "last-file persistence" 改为写盘记录（write-only record），`SetLastFile` 补注释「当前无读取方（启动不再读 lastfile），为将来「恢复上次会话」选项保留」。
  - wailsjs 副本手补同步（CI 生成版以 Go 为准），保证本机 esbuild 检查通过。
- **Acceptance Criteria**：
  - `go vet ./...` 退出码 0。
  - `grep -rni "welcome" app.go internal/ frontend/src frontend/wailsjs` 无命中（Plan.md/Tasks.md 文档除外）。
  - `grep -rn "AppDir" --include="*.go"` 仅命中 settings 包定义与 app.go 启动迁移引用。
  - `grep -n "settingsPath" internal/filesys/filesys.go` 无命中。
- **依赖**：无（与 TASK-001 可并行，串行执行）

### TASK-003：测试收敛与启动副作用回归用例

- **Status**: DONE
- **Description**：在 `internal/filesys/filesys_test.go` 仅删除依赖 GetLastFile 的 3 个用例（TestLastFilePersistence、TestGetLastFileFirstRun、TestGetLastFileWithMixedStore）与 `setUserConfigDir` 助手，**保留** TestPreserveSettingsKeysOnSetLastFile（活测试：全程仅用 SetLastFile + 读 JSON，不触碰退役机制）；在 `main_test.go` 新增 `TestStartupCreatesNoWelcomeDoc`。
- **Details**：
  - filesys 保留用例：读写 roundtrip（现有）；TestPreserveSettingsKeysOnSetLastFile（键保留，原样保留）。
  - filesys 新增 1 条：store 文件不存在时 `SetLastFile` 成功创建文件且含 `lastfile` 键（唯一的新覆盖，不重写已覆盖行为）。
  - `withTempStore` 助手被留存用例使用，不动。
  - `TestStartupCreatesNoWelcomeDoc`：`t.Setenv` 同设 `XDG_CONFIG_HOME` + `APPDATA` 隔离到 `t.TempDir()`，调用 `NewApp().startup(context.Background())`，断言 `os.UserConfigDir()` 下不存在 Mado 目录——startup() 全程只读（Load 只读不写、迁移无源即返回、写 lastfile 的 GetLastFile 已删除），配置目录不应被创建；一条断言同时守住「不写 welcome.md」与「不创建用户配置目录」，任何启动写入回归都会失败。
  - 测试隔离遵循 Project.md §6 既有约定（main 包不覆写 storePath，用环境变量隔离迁移源目录）。
- **Acceptance Criteria**：
  - `go test ./...` 全部通过。
  - `TestStartupCreatesNoWelcomeDoc` 用例体内含 Mado 目录不存在的断言。
  - `grep -n "setUserConfigDir\|GetLastFile\|persistWelcome\|WelcomeDoc" internal/filesys/filesys_test.go` 无命中。
  - `grep -c "TestPreserveSettingsKeysOnSetLastFile" internal/filesys/filesys_test.go` ≥ 1（活测试保留）。
- **依赖**：TASK-002

### TASK-004：全链验证

- **Status**: DONE
- **Description**：按 Project.md §2 本机验证链执行全部验证命令，逐条记录结果。
- **Details**：
  - 前置条件：首次执行前端命令前须 `cd frontend && npm install --include=dev`（本环境 `NODE_ENV=production` 且 npm `omit=dev`，缺 `--include=dev` 会静默跳过 esbuild）；node_modules 已就绪时跳过。
  - 无 GUI 自动化测试设施；交互验收沿用项目惯例（用户在 Windows 产物上人工进行），本任务以可机检命令为准。
- **Acceptance Criteria**（命令 → 期望）：
  1. （前置，仅首次）`cd frontend && npm install --include=dev` → 退出码 0
  2. `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` → 退出码 0
  3. `go vet ./...` → 退出码 0 无输出
  4. `go test ./...` → 全部包 ok
  5. `cd frontend && npm test` → 两个测试文件通过
  6. `cd frontend && npm run build` → 产出 dist/（gitignored，不提交）
  7. 任一命令失败：修复后从第 1 条重跑，禁止跳过
- **依赖**：TASK-001、TASK-002、TASK-003

### TASK-005：文档维护与归档前置

- **Status**: DONE
- **Description**：按 Project.md §0 维护速查更新文档，并完成归档前置标注。
- **Details**：
  - §1 当前阶段；§2 平台事实条目「`%APPDATA%/Mado/` 仅保留欢迎文档 welcome.md」改为「`%APPDATA%/Mado/` 仅为旧配置迁移源目录，应用不再写入」（现状已失真，须改写而非删除）；§2 如何测试（用例变化：filesys 用例收敛、根包新增启动副作用用例）；§3 目录结构 filesys 行职责收窄；§4 启动数据流（无文件启动/读取失败 → 空白新文档；lastfile 只写不读并标注）；§6 测试隔离条目（filesys 不再需要 UserConfigDir 隔离、根包新用例隔离方式）；§8 新增决策记录；§9 删除「欢迎文档」术语。
  - §8 既有历史决策记录为 append-only，不回改。
- **Acceptance Criteria**：
  - `grep -ni "GetWelcome\|欢迎文档\|GetLastFile" .docs/Project.md` 仅允许 §8 历史决策记录区命中，§1-§7 与 §9 无命中。
  - Plan.md / Tasks.md 状态标注 DONE 并含完成日期与回归测试结论（Archive 前置条件）。
- **依赖**：TASK-004

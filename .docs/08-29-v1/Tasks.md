# Tasks：遗留问题批判性修复

**关联计划**：无独立 Plan.md（Quick 工作流，修复项来自代码审读清单）
**总计 Task**：7 个

**状态**：DONE（完成日期 2026-08-29）
**回归测试结论**：`go vet ./...` + `go test ./...` 全绿（5 个包）；`cd frontend && npm test` 三场景全过；`esbuild src/main.ts --bundle --loader:.css=empty` 零报错；`npm run build` 产出 dist 成功。

---

## Phase 1：Go 侧持久化一致性与测试隔离

### TASK-001：抽取 App.persist 统一四个 setter 的「保存成功才赋值」语义

- **Status**：DONE
- **Description**：在 `app.go` 中新增 `persist(mutate func(*settings.Settings)) error`，`SetTheme`/`SetWrap`/`SetMath`/`SetPreviewFont` 全部改走它；`SetTheme` 的 `runtime.WindowSetDarkTheme`/`WindowSetLightTheme` 移到保存成功之后。
- **Details**：
  - `App` 增加 `saveSettings func(settings.Settings) error` 字段，`persist` 内为 nil 时回退 `settings.Save`
  - `persist`：复制 `a.settings` → 对副本执行 mutate → 保存 → 仅成功后赋回 `a.settings`
  - `SetTheme` 校验主题名后调用 `persist`，成功再按主题调用 WindowSetLightTheme/WindowSetDarkTheme
- **Acceptance Criteria**：
  - `go vet ./... && go test ./...` 通过
  - `grep -n "a.settings.Theme = \|a.settings.Wrap = \|a.settings.Math = " app.go` 无输出（赋值只经 persist）
  - 保存失败时 `GetSettings` 返回值不变、窗口主题不切换（由 TASK-002 用例覆盖）

### TASK-002：移除 main_test.go 的破坏性失败注入，改用 saveSettings 覆写

- **Status**：DONE
- **Description**：删除 `TestSetPreviewFontSaveFailureKeepsState` 中的 `os.RemoveAll(settings.Path())` + `os.Mkdir` 占位注入，改为构造 `&App{saveSettings: 返回错误}`；并为 `SetTheme` 增加同语义用例。
- **Details**：
  - 用例不得对 exe 目录（go test 下为 `/tmp/go-build*`）做任何删除/创建
  - 断言：失败后 `a.settings` 各字段保持构造时的值
- **Acceptance Criteria**：
  - `go test ./...` 通过，且测试目录 `os.Executable()` 同目录不再被 RemoveAll
  - `grep -n "os.RemoveAll" main_test.go` 无输出

---

## Phase 2：前端设置模态回填与失败提示

### TASK-003：打开设置模态时回填预览字体输入，并把拒绝提示接到 statusEl

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 的 `syncSettingsModalUI()` 中补写 `setPreviewFontInput.value = currentPreviewFont`；`fontCommitter` 的 `fail` 回调除 `console.error` 外写入 `statusEl.textContent = 'Preview font rejected'`。
- **Details**：
  - `syncSettingsModalUI` 在 `btn-settings` 点击与 `applyTheme` 中均被调用，回填覆盖「重开模态」路径
- **Acceptance Criteria**：
  - `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 零报错
  - `syncSettingsModalUI` 函数体内出现 `setPreviewFontInput`

### TASK-004：清理 main.ts 的常量硬编码与冗余 void

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 顶部新增 `const DEFAULT_PREVIEW_FONT = 'Cascadia Code'`（注释标注与 `settings.DefaultPreviewFont` 同步），替换 init 中两处硬编码；删除 `commitPreviewFont` 调用前的 `void`。
- **Details**：
  - 仅替换 1037/1045 行两处字面量与 987/993 行两处 `void`
- **Acceptance Criteria**：
  - esbuild 语法检查零报错
  - `grep -n "'Cascadia Code'" frontend/src/main.ts` 仅命中常量定义处

---

## Phase 3：主题层注释/转义/回退栈与前端杂项

### TASK-005：修正 theme.go 注释、剥离 CSS 字符串非法字符、回退栈补 monospace

- **Status**：DONE
- **Description**：`internal/theme/theme.go` 的 `cssFontDecl` 注释改为与实现一致（无错误路径、仅转义），并剥离 NUL/CR/LF/FF 等无法存活于 CSS 字符串的字符；`--preview-font` 回退栈尾部追加 `monospace`，使 code/kbd 在首选字体缺失时不再退到比例字体。
- **Details**：
  - 回退栈变更同步修正 `theme_test.go` 中的 `sans-serif; }` 断言
  - `TestPreviewFontNoInjection` 增加两条断言：声明头部（`--preview-font:` 到 `sans-serif, monospace; }` 之前）不含 `}`；换行注入用例同样不含 `}`
- **Acceptance Criteria**：
  - `go test ./internal/theme/` 全绿
  - 注入串 `x"; } body { color: red; } /*` 与 `x\n}\nbody{color:red}` 均无法闭合声明

### TASK-006：补齐前端 test script、index.html 常量联动注释、style.css 多余空行

- **Status**：DONE
- **Description**：`frontend/package.json` 增加 `"test": "node tests/fontCommit.test.ts"`；`frontend/index.html` 的 `maxlength="100"` 增加与 `settings.MaxPreviewFontLen` 联动的 HTML 注释（注明 Go 计字节 / HTML 计 UTF-16 单位）；删除 `frontend/src/style.css` 中 `.settings-text-input:focus` 段落末尾多出的空行。
- **Details**：
  - 不改 index.html 的 maxlength 数值，仅加注释
- **Acceptance Criteria**：
  - `cd frontend && npm test` 通过
  - style.css 无连续两个空行（除文件末尾换行）

---

## Phase 4：文档同步与归档

### TASK-007：同步 Project.md 与本次实现差异

- **Status**：DONE
- **Description**：更新 `.docs/Project.md`：`§2 如何测试` 补 `npm test`（前端自检脚本）与「失败注入用 App.saveSettings 覆写」约定；`§4` 数据流补 persist 语义；`§6` 新增踩坑条目（目录占位注入的破坏性、monospace 尾部回退、常量跨语言重复）。
- **Acceptance Criteria**：
  - Project.md 描述与代码实际状态一致，无过期陈述

# Tasks：修复 Preview 字体设置两个 P1 状态一致性问题

**关联 Plan**：无（Quick 模式跳过 Plan，见 `AGENTS.md` Quick 工作流）  
**总计 Task**：4 个

## Phase 1：Go 侧保存失败不改内存

### TASK-001：SetPreviewFont 改为「复制 → 保存成功后才赋值」并补失败用例

- **Status**：DONE
- **Description**：修改 `app.go` 的 `App.SetPreviewFont`，使其在 `settings.Save` 成功后才把新字体写回 `a.settings`；保存失败时不改变 App 当前设置，错误返回行为保持不变。在 `main_test.go` 增加用例验证保存失败后内存状态不变。
- **Details**：
  - `next := a.settings; next.PreviewFont = name; if err := settings.Save(next); err != nil { return err }; a.settings = next; return nil`
  - 测试通过「在 `settings.Path()` 路径上创建同名目录」强制 `Save` 的 `os.WriteFile` 失败（`Save` 内部 `ReadFile` 失败会跳过读取，`WriteFile` 对目录必报错）
  - 测试断言：`SetPreviewFont("JetBrains Mono")` 返回非 nil 错误后 `a.settings.PreviewFont` 仍为原值 `"Fira Code"`
- **Acceptance Criteria**：
  - 运行 `go test ./...` 退出码 0，且输出包含 `TestSetPreviewFontSaveFailureKeepsState` PASS
  - 运行 `go vet ./...` 退出码 0
  - 单测验证失败路径下 `a.settings.PreviewFont` 未被修改

## Phase 2：前端提交串行化与去重

### TASK-002：抽取纯逻辑提交串行化模块并接入 main.ts

- **Status**：DONE
- **Description**：新增 `frontend/src/fontCommit.ts`（无 DOM 纯逻辑：请求链串行化 + 序号守卫 + 在途值去重），并将 `main.ts` 的 `commitPreviewFont` 改为委托该模块，废除原裸 `await SetPreviewFont` 竞态路径。
- **Details**：
  - 导出 `createFontCommitter(ui)`，`ui` 含 `save/apply/fail/restore/valid` 五个回调；返回 `{ commit(raw) }`
  - 串行化：新请求 `chain = chain.then(save).then(apply).catch(fail+restore).finally(clear pending)`，前一个 settle 后下一个才发出
  - 序号守卫：`id !== seq` 时丢弃 apply/fail（旧请求结果不得覆盖较新的提交）
  - 去重：`value === ui.valid()` 时仅 `restore()` 不保存；`value === pending`（同一值已在途）时直接返回——覆盖「Enter 后失焦 change 重复提交同一值」
  - `main.ts`：`apply` 设置输入框值并调用现有 `applyPreviewFont`（仍失效 `previewCss` + `refreshPreview`）；`fail` 沿用 `console.error`；`restore` 回填 `currentPreviewFont`；不改变其他设置项行为
- **Acceptance Criteria**：
  - 工作目录 `frontend` 运行 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 退出码 0
  - `rg 'createFontCommitter|commitPreviewFont' frontend/src/main.ts` 可见接线；`rg 'await SetPreviewFont' frontend/src/main.ts` 无结果（竞态路径已移除）
  - `frontend/src/fontCommit.ts` 无 DOM 引用（无 `document`/`window`）

### TASK-003：新增零依赖 Node 自检验证竞态消除

- **Status**：DONE
- **Description**：新增 `frontend/tests/fontCommit.test.ts`（Node 原生 type-stripping 直接运行，不引入测试框架/构建产物），用可手动控制 resolve 的 mock `save` 验证：快速连续提交不产生旧请求覆盖新状态、在途重复值不重复保存、最新失败回填最近有效字体、已有效值提交不触发保存。
- **Details**：
  - 场景 A：提交 "Fira Code"（在途）→ 重复 "Fira Code"（模拟 Enter+change）→ 提交 "JetBrains Mono"；断言 A 在途期间 B 未发出、A 成功不 apply、最终 applied 恰为 `["JetBrains Mono"]`、save 恰好两次
  - 场景 B：save reject 时 fail+restore 各一次，valid 不变
  - 场景 C：`valid() === "Cascadia Code"` 时提交 `"  Cascadia Code  "`：save 零调用、restore 一次
  - 失败时 `process.exit(1)`，成功时打印 `font commit self-check: OK`
- **Acceptance Criteria**：
  - 运行 `node frontend/tests/fontCommit.test.ts` 退出码 0 且输出 `font commit self-check: OK`
  - 运行 `git diff --check` 退出码 0

## Phase 3：验证、文档维护与归档

### TASK-004：全量验证、更新 Project.md 并归档提交

- **Status**：DONE
- **Description**：执行 Go 与前端全量验证；按 §0 速查更新 `.docs/Project.md`（§2 测试链、§3 目录结构、§4 数据流——新模块与串行化事实）；归档 Tasks.md 到 `.docs/08-24-v2/` 并 `git commit`。
- **Details**：
  - 验证链：`go vet ./...`、`go test ./...`、`node frontend/tests/fontCommit.test.ts`、`frontend` 内 esbuild 零产物检查、`git diff --check`
  - Project.md：§2「如何测试」追加零依赖自检命令；§3 目录结构补 `fontCommit.ts`/`tests/`；§4「设置与偏好」数据流条目改为「提交串行化 + 序号守卫 + 在途去重；Go 侧保存成功后才写回内存」
  - 归档目录名 `08-24-v2`（当日已有 `08-24-v1`，取最大 N+1）；Quick 模式无 Plan.md，仅归档 Tasks.md（先例 `08-16-v5`）
  - 提交信息采用项目惯例中文 fix 前缀；禁提交 `frontend/dist`、`node_modules` 与测试临时产物
- **Acceptance Criteria**：
  - `go vet ./...`、`go test ./...`、`node frontend/tests/fontCommit.test.ts`、esbuild 零产物检查、`git diff --check` 退出码全部为 0
  - 根目录无 Tasks.md（已归档），`.docs/08-24-v2/Tasks.md` 存在且标注 DONE/完成日期/回归结论
  - `.docs/Project.md` 与代码库实际状态一致（§2/§3/§4 已更新）

---

## 完成记录

- **状态**：DONE
- **完成日期**：2026-08-24
- **回归测试结论**：`go vet ./...` 退出码 0；`go test ./...`（含新增 `TestSetPreviewFontSaveFailureKeepsState`，用目录占位 store 路径强制 Save 失败）全部通过；`node frontend/tests/fontCommit.test.ts` 退出码 0（A/B/C 三场景：串行化+旧响应丢弃+在途同值去重 / 失败回填最近有效字体 / 已有效值不保存）；前端 esbuild 零产物语法检查退出码 0；`git diff --check` 退出码 0。`rg 'await SetPreviewFont' frontend/src/main.ts` 无结果（竞态路径已移除），`frontend/dist` 未变更未提交。

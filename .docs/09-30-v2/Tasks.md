# Tasks：批判性吸收 09-30-v1 审阅报告与遗留修复

**关联审计**：上轮交付（`.docs/09-30-v1/`）的代码审阅报告（资源泄漏、无害死代码、常量联动注释、已知限制记录）  
**总计 Task**：5 个  
**状态**：DONE  
**完成日期**：2026-09-30  
**回归结论**：`GOOS=windows go vet ./...` 与 `GOOS=windows go test -c -o /dev/null .` 编译无错；`go vet ./...` 与 `go test -race ./...` 全部通过；`frontend/npm test` 5 项自检全绿；`npm run build` 成功；`modeScroll.check.mjs` 与 `startup.check.mjs` 无头自检全项 ALL PASS；工作区无未跟踪临时文件。  

---

## Phase 1：缺陷修复与代码清理

### TASK-001：修复 `app_windows.go` 中 `hMem` 在异常路径的资源泄漏

- **Status**：DONE
- **Description**：在 `app_windows.go` 中引入 `procGlobalFree`，通过 `needFree` 标志与 `defer` 确保在 `GlobalLock` 失败或 `SetClipboardData` 失败时正确释放已分配的 `hMem`，仅在 Win32 系统成功接管数据所有权时转移释放责任。
- **Details**：
  - 在 `kernel32` 中引入 `procGlobalFree = kernel32.NewProc("GlobalFree")`；
  - 在 `procGlobalAlloc` 成功分配 `hMem` 后，初始化 `needFree := true` 并设置 `defer func() { if needFree { procGlobalFree.Call(hMem) } }()`；
  - 在 `procSetClipboardData` 返回非零（成功）后，设置 `needFree = false`；
  - 若 `procGlobalLock` 失败或 `procSetClipboardData` 失败，`needFree` 维持 `true`，触发 defer 自动调用 `GlobalFree`。
- **Acceptance Criteria**：
  - `GOOS=windows go vet ./...` 检查通过
  - `GOOS=windows go test -c -o /dev/null .` 编译通过
  - 逻辑覆盖 `GlobalLock` 失败与 `SetClipboardData` 失败两种异常场景的内存释放
- **Dependencies**：无
- **Priority**：P0

### TASK-002：简化 `app_other.go` 非 Windows 回退桩的无操作参数表达

- **Status**：DONE
- **Description**：在 `app_other.go` 中移除无害的 `_ = text` 死代码，采用 Go 习惯用法 `func setNativeClipboard(_ string) error`。
- **Details**：
  - 函数签名调整为 `func setNativeClipboard(_ string) error`；
  - 移除函数体内的 `_ = text` 赋值语句。
- **Acceptance Criteria**：
  - `go vet ./...` 与 `go test ./...` 编译通过
  - 文件中无多余的局部空白赋值
- **Dependencies**：无
- **Priority**：P1

---

## Phase 2：规范对齐与文档维护

### TASK-003：补齐前端与 Go 侧窗口最小尺寸常量的双向联动注释

- **Status**：DONE
- **Description**：遵循 Project.md §6 跨语言联动常量注释约定，在 `frontend/src/main.ts` 与 `internal/settings/settings.go` 中为 `MIN_WINDOW_WIDTH` / `MIN_WINDOW_HEIGHT` 和 `MinWindowWidth` / `MinWindowHeight` 补充互指注释。
- **Details**：
  - 在 `frontend/src/main.ts` 的 `MIN_WINDOW_WIDTH` 上方补充：`// Keep in sync with settings.MinWindowWidth / settings.MinWindowHeight (Go side).`；
  - 在 `internal/settings/settings.go` 的 `MinWindowWidth` 上方补充：`// Linked: frontend/src/main.ts MIN_WINDOW_WIDTH / MIN_WINDOW_HEIGHT`。
- **Acceptance Criteria**：
  - 两侧文件中的常量均带有明确互指注释
  - 零产物 esbuild 检查及 `npm test` 通过
- **Dependencies**：无
- **Priority**：P1

### TASK-004：更新 Project.md §6 约束与 §8 决策记录

- **Status**：DONE
- **Description**：在 Project.md §6 补充 resize 防抖与 `flushWindowState` 退出时序的已知限制说明；在 §8 记录 09-30-v2 对审阅报告的批判性吸收决策。
- **Details**：
  - §6 记录：退出前 `flushWindowState` 刷盘虽与 resize 防抖存在微秒级重叠竞争，但由于写入快照内容对等且幂等，冗余 IPC 属于已接受边界；
  - §8 记录：针对 09-30-v1 审阅报告采用最短有效差分：闭环 Win32 剪贴板异常路径 `hMem` 释放，消除死代码，建立尺寸常量双向注释，并对窗口尺寸独立校验与长 SVG 字符串维持克制设计。
- **Acceptance Criteria**：
  - Project.md 准确反映代码库最新状态，无过期陈述
- **Dependencies**：TASK-001, TASK-002, TASK-003
- **Priority**：P1

---

## Phase 3：全量构建与回归验证

### TASK-005：执行跨平台静态分析与全量回归测试链

- **Status**：DONE
- **Description**：运行所有本地检查与回归验证脚本，确认改动无任何语法、竞态、样式或契约回归。
- **Details**：
  - `GOOS=windows go vet ./...` & `GOOS=windows go test -c -o /dev/null .`
  - `go vet ./...` & `go test -race ./...`
  - `cd frontend && npm test`
  - 零产物 esbuild 语法检查
  - `npm run build && node tests/startup.check.mjs`
- **Acceptance Criteria**：
  - 所有测试与静态检查 100% 通过，退出码为 0
- **Dependencies**：TASK-001 ~ TASK-004
- **Priority**：P0

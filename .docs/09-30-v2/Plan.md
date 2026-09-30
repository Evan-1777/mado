# Plan：批判性吸收 09-30-v1 审阅报告与遗留修复

**状态**：DONE  
**日期**：2026-09-30  
**完成日期**：2026-09-30  
**版本**：v1.0  
**回归测试结论**：`GOOS=windows go vet ./...` 与 `GOOS=windows go test -c -o /dev/null .` 编译通过；`go vet ./...` 与 `go test -race ./...` 全部通过；`frontend/npm test` 5 组自检全绿；`npm run build` 成功；`modeScroll.check.mjs` 与 `startup.check.mjs` 无头自检全项 ALL PASS；工作区无未跟踪临时文件。  

---

## 1. 背景与目标

针对 09-30-v1（窗口状态记忆与剪贴板体验升级）归档交付的代码审阅报告，批判性吸收各项发现，以最短有效差分闭环遗留问题：
1. **修复 Win32 原生剪贴板资源泄漏**：在 `app_windows.go` 中闭环 `GlobalLock` 与 `SetClipboardData` 异常路径的 `hMem` 释放责任，消除中度风险资源泄漏；
2. **清理回退桩死代码**：在 `app_other.go` 中使用 Go 惯用 `func setNativeClipboard(_ string) error`，删除无害局部空白赋值；
3. **补齐跨端常量联动注释**：在 `frontend/src/main.ts` 与 `internal/settings/settings.go` 中为 `MIN_WINDOW_WIDTH` / `MIN_WINDOW_HEIGHT` 和 `MinWindowWidth` / `MinWindowHeight` 添加对称互指注释；
4. **收敛已知限制与决策**：在 `Project.md` §6 记录 resize 防抖与 `flushWindowState` 的极窄重叠写入已知限制，在 §8 记录审阅吸收决策；对窗口尺寸独立校验与长 SVG 字符串维持克制设计。

## 2. 阶段划分

### Phase 1：缺陷修复与代码清理

| 项目 | 内容 |
|------|------|
| **输入** | 09-30-v1 审阅报告、`app_windows.go`、`app_other.go` |
| **输出** | 引入 `procGlobalFree` 并通过 `needFree` + `defer` 治理 `hMem` 所有权；简化非 Windows 回退桩签名 |
| **验收标准** | `GOOS=windows go vet ./...` 与 `go test -c` 通过；Linux `go vet ./...` 与 `go test ./...` 通过 |

### Phase 2：规范对齐与文档维护

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/src/main.ts`、`internal/settings/settings.go`、`Project.md` |
| **输出** | 双端常量联动互指注释；`Project.md` §1 阶段、§6 已知限制与 §8 决策记录更新；清理工作区临时目录 |
| **验收标准** | 零产物 esbuild 检查及 `npm test` 通过；`Project.md` 准确反映系统状态 |

### Phase 3：全量构建与回归验证

| 项目 | 内容 |
|------|------|
| **输入** | 代码库全部变更文件 |
| **输出** | 跨平台静态分析、单元测试、竞态测试、无头浏览器回归自检 |
| **验收标准** | 所有测试与静态检查 100% 通过，退出码为 0 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| Win32 `hMem` 生命周期管理 | `needFree := true` 标志位结合 `defer` 条件调用 `procGlobalFree.Call(hMem)`，`SetClipboardData` 成功后置 `false` | 标准 Win32 资源管理契约；系统接管前任何错误（Lock/Copy/SetClipboardData 失败）均自动释放，系统接管后不重复释放 | 在每处错误分支分别手写 `procGlobalFree` 调用（易遗漏分支且代码重复） |
| 非 Windows 回退桩未使用参数 | `func setNativeClipboard(_ string) error` | Go 习惯语法，编译期消除死代码警告，语义自解释 | 保留 `_ = text`（无害死代码）或命名参数不处理 |
| 跨语言常量联动注释 | 双向添加 `// Keep in sync with ...` / `// Linked: ...` 注释 | 对齐既有 `MaxPreviewFontLen` 与 `DefaultPreviewFont` 维护约定 | 引入代码生成器或动态读取配置（过重且破坏静态常量内联） |
| 窗口尺寸反序列化校验 | 保持当前宽高独立校验，由 App 层 `SetWindowSize` 兜底钳制 | 保持单一字段容错韧性，且运行时输入均受严格钳制，无需过度防御 | 引入双向强绑定回退（增加不必要特判分支） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `procGlobalFree` 在系统接管后被误释放 | 🟢 低 | `needFree = false` 仅在 `procSetClipboardData` 返回非零时执行，defer 严格检查标志位 |
| defer 执行时序与 `CloseClipboard` 颠倒 | 🟢 低 | `defer procCloseClipboard.Call()` 先注册，`defer func() { if needFree ... }` 后注册；Go 的 LIFO 顺序保证释放内存发生在关闭剪贴板之前 |

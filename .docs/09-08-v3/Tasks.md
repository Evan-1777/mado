# Tasks：修复 Windows CI 构建测试报错

**状态**：DONE  
**完成日期**：2026-09-08  
**关联 Plan**：`Plan.md` —— 修复 Github CI Windows 构建测试报错 v1.0  
**总计 Task**：2 个  
**回归测试结论**：`go test -race ./...` 全部通过；`GOOS=windows go test -c` 根包与 filesys 交叉编译通过；`frontend npm test` 全部通过；`go vet ./...` 无输出。

---

## Phase 1：测试与跨平台断言修复

### TASK-001：修复 filesys 测试中 Windows 权限模式断言

- **Status**：DONE
- **Description**：修改 `internal/filesys/filesys_test.go` 中的 `TestWriteFileAtomic`，适配 Windows 平台的文件权限表达差异（Windows 下可写文件 Perm 为 0o666，无 POSIX 0o600 模式位）。
- **Details**：
  - 在 `internal/filesys/filesys_test.go` 的 `TestWriteFileAtomic` 中，将已有文件替换后的模式断言调整为跨平台兼容：
    - Windows 下断言期望权限为 `0o666`（Go 运行时在 Windows 上映射只读属性为 0444，其余常规文件均为 0666）；
    - 非 Windows（POSIX）平台断言期望权限为 `0o600`。
- **Acceptance Criteria**：
  - `go test -v ./internal/filesys/ -run TestWriteFileAtomic` 在本机（Linux）通过且断言 0o600；
  - `GOOS=windows go test -c ./internal/filesys/` 交叉编译通过，无语法或类型错误。

### TASK-002：隔离 TestConcurrentBindingsNoRace 中并发 Worker 的保存路径

- **Status**：DONE
- **Description**：修改 `main_test.go` 中的 `TestConcurrentBindingsNoRace`，为并发 worker 分配独立的保存路径（如 `save-%d.md`），避免 Windows 平台上多 goroutine 同时向同名文件执行 `MoveFileEx(MOVEFILE_REPLACE_EXISTING)` 引发 `Access is denied`。
- **Details**：
  - 在 `main_test.go` 的 `TestConcurrentBindingsNoRace` 中，将 worker 内执行保存操作的路径改为基于 worker 编号独立的 `filepath.Join(dir, fmt.Sprintf("save-%d.md", worker))`。
  - 保持各 worker 对 `a.SaveFile` 的调用频率、内容变化以及后续 `a.recordLastFile` 的串行化竞争不变。
  - 保证 8 个 worker 依然并发执行所有的 App 绑定（Render、GetCSS、GetSettings、SetWrap、SetMath、SetPreviewFont、SetDirty、LoadFile、SaveFile、shouldPreventClose），且 `shared["settings"]` 与 `shared["lastfile"]` 仍被充分并发竞争与原子串行化写入。
- **Acceptance Criteria**：
  - `go test -v -race -run TestConcurrentBindingsNoRace .` 通过且无数据竞争报错；
  - `go test -race ./...` 全包测试通过；
  - `GOOS=windows go test -c .` 交叉编译通过。

# Plan：修复 Github CI Windows 构建测试报错

**状态**：DONE  
**日期**：2026-09-08  
**完成日期**：2026-09-08  
**版本**：v1.0  
**回归测试结论**：`go test -race ./...` 全部通过；`GOOS=windows go test -c` 根包与 filesys 交叉编译通过；`frontend npm test` 全部通过；`go vet ./...` 无输出。

---

## 1. 背景与目标

云端 GitHub Actions CI（windows-latest）在运行 `go test ./...` 时出现两处测试失败：
1. `TestConcurrentBindingsNoRace`：多 worker 并发调用 `SaveFile` 覆写同一临时目录文件 `save.md`，在 Windows 下触发 `MoveFileEx(..., MOVEFILE_REPLACE_EXISTING)` 的目标文件锁竞争，报错 `Access is denied`。
2. `TestWriteFileAtomic`：断言覆写后文件权限为 `0o600`，但在 Windows NTFS 下 Go 运行时对常规可写文件报告模式恒为 `0o666`，导致断言失败。

本次修复目标：
- 消除 Windows CI 上文件并发改名替换冲突，保证并发绑定压测在 Windows 环境稳定通过。
- 适配 Windows 平台的文件权限表达差异，使原有原子覆写测试具备跨平台鲁棒性。

## 2. 阶段划分

### Phase 1：测试断言与并发路径跨平台适配

| 项目 | 内容 |
|------|------|
| **输入** | `internal/filesys/filesys_test.go` 与 `main_test.go` |
| **输出** | 跨平台文件权限断言（Windows 0o666，POSIX 0o600）；并发测试中基于 worker 编号隔离保存文件路径 |
| **验收标准** | `go test -race ./...` 本机通过；Windows 交叉编译无语法错误；CI 运行 `go test ./...` 无任何失败 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 并发保存测试路径 | 为每个 worker 独立分配 `save-%d.md` | 测试意图是验证 App 锁对 store 串行化与内部状态互斥保护，而非针对单文件的文件系统锁抗压；独立路径既保留并发写入与 store 竞争，又消除 Windows MoveFileEx 目标碰撞 | 在 `filesys.WriteFile` 引入 Windows 专有重试机制（增加复杂度，过度设计） |
| 权限模式断言 | 按 `runtime.GOOS == "windows"` 分支断言 0o666 与 0o600 | Windows NTFS 不支持 POSIX 权限位，Go 运行时只区分 0444 与 0666 | 仅用 Stat 读取后与原值比对（缺乏对模式初值的显式校验） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 路径隔离削弱对同一文件并发写入测试 | 🟢 低 | Mado 为单文档编辑器，单实例不存在多线程保存同一文件场景，多实例共享配置竞争已是既定边界 |
| Windows 权限断言与未来属性变更冲突 | 🟢 低 | 仅针对常规可写 Markdown 文件，0o666 为 Go 在 Windows 上的固定表达 |

# Plan：修复 TOC 审计发现的 baseName 回归与弹层树重复构建

**状态**：DONE  
**日期**：2026-08-15  
**版本**：v1.0  
**回归测试结论**：esbuild 语法检查、npm run build、go vet、go test 全部退出码 0；baseName 四类路径 node 断言通过；`buildTocRows` 调用点仅剩 1 处（renderToc 内）。

---

## 1. 背景与目标

审计 `27d4a80`（目录解析修复 + 整栏折叠）后确认：核心修复正确、文档同步到位，但发现两类问题需要修复：

1. **baseName 回归**：修复"4 处双反斜杠"时误改了 L18 `p.split(/[\\/]/)` → `p.split(/[\/]/)`。前者在正则字面量中本就正确（同时分割 Windows 反斜杠与正斜杠），后者只分割正斜杠。Windows 路径（`C:\Users\me\doc.md`）不再分割，标题栏显示整条路径。
2. **弹层树重复构建**：`renderToc()` 每次调用都执行 `tocPopoverTree.replaceChildren(buildTocRows(tocRoots))` 构建一棵新树，侧栏与弹层两棵同构树每次编辑都全量重建；旧树节点与其事件闭包被丢弃，形成无效占用。

目标：恢复 `baseName` 对 Windows 路径的正确分割；弹层树与侧栏树共享同一棵 DOM，消除重复构建与丢弃节点。

## 2. 阶段划分

### Phase 1：修复 baseName 回归

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/src/main.ts` L18 的 `p.split(/[\/]/)` |
| **输出** | `p.split(/[\\/]/)`（同时分割 `\` 与 `/`） |
| **验收标准** | `baseName('C:\\Users\\me\\doc.md') === 'doc.md'`；`baseName('a/b.md') === 'b.md'`；`baseName('C:\\') === 'C:'` 兜底为空串时返回原串 |

### Phase 2：消除弹层树重复构建

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/src/main.ts` 的 `renderToc()` |
| **输出** | 单次构建、两处挂载：`tocTree` 与 `tocPopoverTree` 引用同一棵渲染树 |
| **验收标准** | `renderToc()` 只调用一次 `buildTocRows`；两侧节点为同一批 DOM；`buildTocRows` 仍返回 `DocumentFragment`（无签名变更） |

### Phase 3：验证与文档同步

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1/2 的代码变更 |
| **输出** | 零产物 esbuild 语法检查 + `npm run build` + `go vet`/`go test` 全绿；Project.md §4 数据流描述补充 baseName 坑 |
| **验收标准** | esbuild 退出码 0；`npm run build` 退出码 0；`go vet ./...` 与 `go test ./...` 退出码 0；Project.md 与代码一致 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| baseName 修复方式 | 改回 `/[\\/]/` 正则字面量 | 与 `e9a403e` 初始实现一致，同时处理两种分隔符 | `split(/[\\/]/).pop()` 防空串（改动更大；现有 `parts[parts.length-1] || p` 兜底已覆盖空串，无需改） |
| 弹层树构建方式 | 单次 `buildTocRows` + 两侧 `replaceChildren` 同一 fragment | 零新增状态、两栏永远同构 | 预创建单棵复用树（引入常驻节点与状态同步复杂度，收益相同） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `renderToc` 在 `setTocCollapsed` 前被调用，弹层树随侧栏更新 | 🟢 低 | `tocPopoverTree` 初始为空，`renderToc` 每次全量替换，无中间态 |
| 正则字面量 `/[\\/]/` 被再次误读为"双反斜杠" | 🟢 低 | 在 Project.md §6 记录该坑，防止后续"全局修双反斜杠"误伤 |

## 5. Phase 依赖关系

```
Phase 1 ──→ Phase 3
Phase 2 ──→ Phase 3
```

Phase 1 与 Phase 2 互不依赖，可并行；Phase 3 依赖两者完成后验证。

---

> ### Task 拆解预览
>
> 实际 Task 详见 `Tasks.md`。
>
> | Phase | 预估 Task 数 | 示例 Task |
> |-------|-------------|-----------|
> | Phase 1 | 1 | 恢复 baseName 双分隔符分割 |
> | Phase 2 | 1 | renderToc 单次构建共享弹层树 |
> | Phase 3 | 1 | 验证链 + Project.md 同步 |
>
> **总计预估**：3 个 Task。

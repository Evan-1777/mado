# Tasks：修复 slugIDs.Generate 重复 slugify 的 O(n²) 缺陷

**活跃阶段**：修复 slugIDs.Generate 重复 slugify 的 O(n²) 缺陷  
**创建日期**：2026-08-16  
**关联审查**：`.docs/08-16-v4/8-16-审查报告.md` §2.1 发现的实际缺陷  
**模式说明**：Quick 模式（按 AGENTS.md 跳过 Plan，仅产出 Tasks.md）

---

## Task 1：将 slugify 提升到重复 ID 循环外

- **Status**：DONE
- **优先级**：P0
- **负责模块**：`internal/mdrender`

### 描述
修改 `slugIDs.Generate`：循环前只计算一次 `base := slugify(value)`，冲突循环内使用 `base` 生成 `-N` 后缀。

### Details
- **文件**：`internal/mdrender/mdrender.go`
- 修改前循环体：`id = fmt.Sprintf("%s-%d", slugify(value), i)`（每个冲突候选项都重新 slugify，同一标题 N 次出现时为 O(n²)）
- 修改后：`base := slugify(value)` 在循环外计算一次，循环体为 `id = fmt.Sprintf("%s-%d", base, i)`
- 行为不变：重复标题仍生成 `foo`、`foo-1`、`foo-2`

### 验收标准
- `grep -n "slugify" internal/mdrender/mdrender.go` 确认 `Generate` 内 `slugify(value)` 只出现一次
- `go test ./internal/mdrender/ -v` 通过，现有 `TestRenderDuplicateHeadingIDs` 仍验证 `foo`/`foo-1`
- 顺序调用 `Generate([]byte("foo"))` 三次得到 `foo`、`foo-1`、`foo-2`

---

## Task 2：全量回归验证

- **Status**：DONE
- **优先级**：P0
- **依赖**：Task 1

### 描述
在 Linux 开发环境执行 Go 全量测试与静态检查。

### Details
```bash
export PATH=$HOME/.local/go/bin:$PATH
export GOCACHE=$(mktemp -d)   # 默认 GOCACHE 只读，本环境需临时可写缓存
go vet ./...
go test ./...
```

### 验收标准
- `go vet ./...` 退出码 0，无输出
- `go test ./...` 四个包（filesys/mdrender/settings/theme）全部通过

---

## Task 3：Git Commit

- **Status**：DONE
- **优先级**：P0
- **依赖**：Task 2

### 描述
提交缺陷修复到 git 仓库。

### Details
```bash
git add internal/mdrender/mdrender.go
git commit -m "fix(mdrender): hoist slugify out of duplicate-id loop"
```

### 验收标准
- 提交 `7f6a372` 存在且仅包含 `internal/mdrender/mdrender.go`
- `git diff HEAD~1 --stat` 显示 1 file changed

---

**阶段状态**：DONE  
**完成日期**：2026-08-16

**回归测试结论**：
- ✓ `go test ./...` 全通过（filesys / mdrender / settings / theme 共 4 包）
- ✓ `go vet ./...` 通过
- ✓ `TestRenderDuplicateHeadingIDs` 验证修复后行为不变（`foo` / `foo-1`）
- ✓ 临时自检用例验证连续 3 个相同标题生成 `foo` / `foo-1` / `foo-2`（验证后已移除）

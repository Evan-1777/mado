# Tasks：修复 TOC 审计发现的 baseName 回归与弹层树重复构建

**关联 Plan**：`Plan.md` —— 修复 TOC 审计发现的 baseName 回归与弹层树重复构建 v1.0
**总计 Task**：3 个

---

## Phase 1：修复 baseName 回归

### TASK-001：恢复 baseName 对 Windows 反斜杠与正斜杠的双分隔

- **Status**：DONE
- **Description**：将 `frontend/src/main.ts` L18 的 `p.split(/[\/]/)` 恢复为 `p.split(/[\\/]/)`，使标题栏在 Windows 路径下显示文件名而非整条路径。
- **Details**：
  - 仅改动 L18 一行；不触碰其它逻辑
  - 正则字面量 `/[\\/]/` 中 `\\` 匹配单个反斜杠，`/` 匹配正斜杠——这是 `e9a403e` 初始实现的原样恢复
  - 保留现有 `parts[parts.length - 1] || p` 兜底（空串路径仍返回原串）
- **Acceptance Criteria**：
  - `node -e 'const s="C:\\Users\\me\\doc.md"; console.log(s.split(/[\\/]/).pop())'` 输出 `doc.md`
  - `node -e 'const s="a/b.md"; console.log(s.split(/[\\/]/).pop())'` 输出 `b.md`
  - `node -e 'const s="C:"; console.log(s.split(/[\\/]/).pop())'` 输出 `C:`

## Phase 2：消除弹层树重复构建

### TASK-002：renderToc 单次构建，侧栏与弹层共享同一棵树

- **Status**：DONE
- **Description**：修改 `frontend/src/main.ts` 的 `renderToc()`，只调用一次 `buildTocRows(tocRoots)`，将同一 `DocumentFragment` 同时 `replaceChildren` 到 `tocTree` 与 `tocPopoverTree`。
- **Details**：
  - 删除 `tocPopoverTree.replaceChildren(buildTocRows(tocRoots))` 这一行重复构建
  - 将 `tocPopoverTree.replaceChildren(frag)` 移到 `tocTree.replaceChildren(frag)` 之后
  - `buildTocRows` 签名与返回类型不变（仍返回 `DocumentFragment`）
  - 两侧节点为同一批 DOM，点击/展开行为天然一致
- **Acceptance Criteria**：
  - `grep -n "buildTocRows(tocRoots)" frontend/src/main.ts` 仅 1 处（在 `renderToc` 内）
  - `renderToc()` 中 `tocPopoverTree.replaceChildren(frag)` 与 `tocTree.replaceChildren(frag)` 引用同一 `frag` 变量

## Phase 3：验证与文档同步

### TASK-003：执行验证链并同步 Project.md

- **Status**：DONE
- **Description**：运行本机验证链（esbuild 语法检查 → npm run build → go vet → go test），并将 baseName 反斜杠坑记入 `.docs/Project.md` §6。
- **Details**：
  - esbuild：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（stdout 丢弃），退出码 0 且无报错
  - `npm run build` 退出码 0
  - `go vet ./...` 与 `go test ./...` 退出码 0（无回归）
  - Project.md §6 新增条目：「`baseName` 的 `/[\\/]/` 是正则字面量，双反斜杠是正确写法——原因：正则字面量中 `\\` 匹配单个 `\`，与字符串字面量不同；TOC 修复曾误改导致 Windows 路径不分割（见 27d4a80）」
- **Acceptance Criteria**：
  - 上述四条命令退出码均为 0
  - `grep -c "baseName" .docs/Project.md` ≥ 1，§6 含反斜杠坑记录

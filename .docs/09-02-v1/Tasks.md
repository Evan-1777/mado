# Tasks：批判性修复历史遗留问题

**关联 Plan**：`Plan.md` —— 批判性修复历史遗留问题 v1.0
**总计 Task**：12 个（Phase 1: 3, Phase 2: 5, Phase 3: 3, Phase 4: 1）
**状态**：DONE
**完成日期**：2026-09-02
**回归测试结论**：全部任务已完成；`go vet ./...`、`go test ./...`、前端 `npm test`、`npm run build`、零产物 `esbuild` 语法检查、`npm ci --dry-run` 与 dev-only 无头 Chrome 模式滚动检查全部通过；Chrome 调试协议端到端检查验证脏文档下打开/拖放确认的取消路径保留原内容。9222 用户浏览器实例未监听，无法执行连接式验证；Windows 拖放仍需目标平台手测。

---

## Phase 1：驱动层与死代码清理（Go 侧）

### TASK-001：app.go 拖放与文件名清理

- **Status**：DONE
- **Description**：删除 `app.go` 中 `OnFileDrop` 方法、`file-loaded` 事件发射、`strings` import 与 `filepath.Ext` 相关分支（#6 之 Go 侧）。
- **Details**：
  - 删除 `OnFileDrop(x, y int, paths []string)` 方法（含 `strings.ToLower`/`filepath.Ext` 分支）
  - 删除 `runtime.EventsEmit(a.ctx, "file-loaded", p)` 调用
  - 删除 `"strings"` import（若无其他用途）
- **Acceptance Criteria**：
  - `grep -n "OnFileDrop\|file-loaded\|strings\." app.go` 无匹配
  - `go vet ./...` 通过
  - `go test ./...` 通过

### TASK-002：lastfile 改为 best-effort（#3）

- **Status**：DONE
- **Description**：`app.go` 的 `LoadFile` 与 `SaveFile` 中将 `filesys.SetLastFile` 的错误吞掉（`_ =`），使其不再阻断主操作。
- **Details**：
  - `LoadFile`：`if err := filesys.SetLastFile(path); err != nil { return "", err }` → `_ = filesys.SetLastFile(path)`
  - `SaveFile`：同样处理
  - 保留 `filesys.SetLastFile` 函数与包注释（仍是只写记录）
- **Acceptance Criteria**：
  - `go test ./...` 通过
  - 新增测试 `TestLastFileFailureIsBestEffort`：注入失败的 `storePath`，断言 `LoadFile`/`SaveFile` 仍成功返回
  - 该测试验证：lastfile 失败不再阻断打开/保存主流程

### TASK-003：mdrender StripScripts 死代码清理（#5）

- **Status**：DONE
- **Description**：删除 `internal/mdrender/mdrender.go` 中的 `StripScripts` 函数与对应测试 `TestStripScripts`（#5）。
- **Details**：
  - 删除 `StripScripts` 函数（`strings.ReplaceAll` 实现）
  - 删除 `mdrender_test.go` 中的 `TestStripScripts`（该测试实际测的是 `Render` 的 script 剥离，函数已名不副实）
  - 确认 `Render` 的 script 剥离机制（`scriptRe` 正则）不受影响
- **Acceptance Criteria**：
  - `grep -rn "StripScripts" internal/` 无匹配
  - `go test ./...` 通过（`TestRenderBold` 等仍覆盖 `Render` 行为）
  - 新增或保留一个针对 `Render` 的 script 剥离断言（替换被删除的 `TestStripScripts` 的功能）

---

## Phase 2：前端逻辑修复

### TASK-004：拖放修复（#1）

- **Status**：DONE
- **Description**：`main.ts` 中 `OnFileDrop(onDrop)` 改为 `OnFileDrop(onDrop, false)`，禁用 drop-target 包装（#1）。
- **Details**：
  - 修改 `frontend/src/main.ts:1144` 处调用
  - 不需要 CSS 声明 `--wails-drop-target`（否则不满足设计意图）
  - 保留 `onDrop` 回调逻辑不变
- **Acceptance Criteria**：
  - `grep -n "OnFileDrop" frontend/src/main.ts` 显示第二参数为 `false`
  - `npm run build` 通过
  - 注：无法本机实测拖放（Linux），上述为静态验证；Windows 手测为最终验收（见 Plan §4 R1）

### TASK-005：打开/拖放前检查未保存修改（#2）

- **Status**：DONE
- **Description**：`openFile()` 与 `onDrop` 两条载入路径在 `loadContent` 前加 `if (!(await confirmDiscard())) return;`（#2）。
- **Details**：
  - 两个入口统一在**拿到文件路径之后、`loadContent` 之前**调用 `confirmDiscard()`（对话框被取消/文件读失败时不必打扰用户确认丢弃）
  - `openFile()`：`OpenFileDialog()` 返回路径后、`LoadFile`/`loadContent` 前调用；false 则 return
  - `onDrop`：`LoadFile(p)` 成功后、`loadContent` 前调用；false 则 return（不加载）
  - 复用现有 `confirmDiscard()` 与 `askUnsaved()` 模态（#2 的契约），不新建设计
  - 调用点：`main.ts:860-862`（openFile）、`main.ts:1138`（onDrop）
- **Acceptance Criteria**：
  - `grep -n "confirmDiscard" frontend/src/main.ts` 显示 3 处调用（newFile + openFile + onDrop）
  - `npm run build` 通过；`npm test` 通过
  - 行为验证：脏文档状态下触发 openFile/onDrop，弹出模态；取消则以现有内容继续编辑（这是复用模态的既有契约）

### TASK-006：节流变量补赋值（#4）

- **Status**：DONE
- **Description**：`scheduleRender()` 的 `setTimeout` 回调内补 `lastRenderAt = Date.now()`（#4）。
- **Details**：
  - 修改 `main.ts:556-563` 的 `scheduleRender` 函数
  - 补赋值使 `THROTTLE_MS=80` 生效：`wait = Math.max(0, THROTTLE_MS - (now - lastRenderAt))`
  - 删除后 `wait` 恒为 0，`THROTTLE_MS` 是死配置
- **Acceptance Criteria**：
  - `grep -n "lastRenderAt" frontend/src/main.ts` 显示赋值与读取
  - `npm run build` 通过
  - 数学验证：`Math.max(DEBOUNCE_MS, wait)` 恒 ≥ 100ms（`DEBOUNCE_MS=100` 是最小值）

### TASK-007：TOC 序号错位修复（#7）

- **Status**：DONE
- **Description**：`jumpToTocNode` 的预览定位从 `headings[node.ordinal]` 改为 `scrollPreviewToLine(node.line + 1)`（#7）。
- **Details**：
  - `main.ts:325-331` 的 `jumpToTocNode`：预览分支删掉 `headings` 局部变量与 `headings[node.ordinal]?.scrollIntoView(...)`，改为 `scrollPreviewToLine(node.line + 1)`（该函数已被预览 gutter 跳转使用：按 `data-line` 二分定位块并以 smooth+start 滚动）
  - 原理（已验证）：`srcline.go` 给 Document 顶层块写 1-based `data-line`；`parseToc` 只识别缩进 ≤3 空格的顶层 ATX 标题（不识别 blockquote/列表内标题），因此 TOC 每个节点对应的标题块必带 `data-line`，且 `node.line`（0-based 行索引）+ 1 精确等于该块的 `data-line`。预览定位与编辑定位（`cm.state.doc.line(node.line + 1)`）完全对称
  - 修复后不再依赖预览 DOM 中 h* 的**序号**——setext 标题/raw HTML 块中 h* 会占据预览 DOM 序号但不在 parseToc 中，这正是错位根源；`data-line` 是两侧共同坐标（与 gutter 跳转同源），天然免疫此错位
  - 删除 `jumpToTocNode` 中不再使用的 `headings` 查询（`querySelectorAll('h1..h6')` 只在错位场景下被用到）
  - 保持编辑分支不变；`parseToc` 不修改
- **Acceptance Criteria**：
  - `grep -n "headings\[node.ordinal\]\|querySelectorAll('h1" frontend/src/main.ts` 无匹配（已替换）
  - `grep -n "scrollPreviewToLine" frontend/src/main.ts` 显示 2 处调用（gutter 跳转 + TOC 跳转）
  - `npm run build` 通过
  - 新增零依赖前端测试（`frontend/tests/`，Node type-stripping 风格）：构造含 setext 标题 + raw HTML 块标题 + ATX 标题的混合文档，断言 TOC 节点 `line` 与预期 `data-line` 映射（利用 `previewBlocks` 语义：`scrollPreviewToLine(line)` 定位到正确块）
  - 注：TOC 点击定位不再依赖预览 DOM 序号；setext/HTML 块文档下不再错位


### TASK-008：mathCache 无界增长限制（#8）

- **Status**：DONE
- **Description**：`renderMathInFrame` 中在缓存写入前加 `if (mathCache.size > 500) mathCache.clear()`（#8）。
- **Details**：
  - 修改 `main.ts:588-607` 的 `renderMathInFrame` 函数
  - 在 `mathCache.set(key, rendered)` 前或后加容量检查
  - 阈值 500 为启发式，与个人工具量级匹配（cache 命中与重算成本权衡）
- **Acceptance Criteria**：
  - `grep -n "mathCache" frontend/src/main.ts` 显示 clear 逻辑
  - `npm run build` 通过

---

## Phase 3：文档与工作流修复

### TASK-009：Project.md 拖放描述与实际机制对齐（#9）

- **Status**：DONE
- **Description**：更新 `.docs/Project.md` 使其拖放描述与实际机制一致（#9）。
- **Details**：
  - §3 目录结构：`main.go` 注释中"拖放"改为描述实际机制（`OnFileDrop` 前端回调 + `EnableFileDrop`）
  - §4 架构与数据流：如有 OnFileDrop 处理拖放的描述，改为前端运行时回调（`OnFileDrop(onDrop, false)`）
  - 不新增章节；改动限于描述性文字
- **Acceptance Criteria**：
  - `grep -n "拖放" .docs/Project.md` 无"OnFileDrop 处理文件拖放"字样
  - 描述与 `main.ts` 的实际调用（`OnFileDrop(onDrop, false)`）一致

### TASK-010：CI 改用 npm ci（#11）

- **Status**：DONE
- **Description**：`.github/workflows/build.yml` 与 `.github/workflows/release.yml` 中 `npm install` 改为 `npm ci`（#11）。
- **Details**：
  - `build.yml:33` 与 `release.yml:43`：`npm install && npm run build` → `npm ci && npm run build`
  - 前置条件已验证：`frontend/package-lock.json` 已提交且与 `package.json` 同步（`npm ci --dry-run` 通过）
- **Acceptance Criteria**：
  - `grep -n "npm install" .github/workflows/*.yml` 无匹配
  - 两个 workflow 均使用 `npm ci`

### TASK-011：归档缺件豁免记录（#10）

- **Status**：DONE
- **Description**：确认 4 个缺件归档目录（08-16-v4、08-16-v5、08-24-v2、08-29-v1）状态，标注豁免并写入决策记录（#10）。
- **Details**：
  - 实况：08-16-v4（只有审查报告，无 Plan/Tasks）、08-16-v5（只有 Tasks）、08-24-v2（只有 Tasks）、08-29-v1（只有 Tasks）——均非完整（Plan+Tasks）
  - 选择：不回溯补齐（无法从 git 恢复已不存在的 Plan.md；机械补齐会伪造历史）
  - 在 `.docs/Project.md` §8 决策记录中写入一条：对这些目录标注为已知缺件豁免，后续 Archive 严格执行双文件校验
  - 不修改归档目录本身（除非执行阶段决定写入豁免说明文件——默认不写，仅记录于 Project.md）
- **Acceptance Criteria**：
  - `.docs/Project.md` §8 出现一条"归档缺件豁免"决策记录
  - 归档目录内容不变（git status 确认无新增文件）

---

## Phase 4：汇总回归测试与决策记录

### TASK-012：全量回归测试与决策记录归档

- **Status**：DONE
- **Description**：执行全量验证，更新 Project.md §8 决策记录（#1-#11 的处理决策）。（Phase 4）
- **Details**：
  - 全量验证：`go vet ./...` + `go test ./...` + `cd frontend && npm test` + `npm run build`
  - 更新 Project.md §8：新增 2026-09-02 条目，记录：拖放修复选择 `OnFileDrop(onDrop, false)` 的根因与理由；lastfile best-effort；节流补赋值；TOC 改用 `data-line` 定位（弃用 ordinal）；StripScripts/死事件删除；mathCache 500 阈值；归档缺件豁免；CI 改 npm ci
  - 不修改任何源码或文档（仅记录）
- **Acceptance Criteria**：
  - 全量验证命令全部通过
  - `git status` 显示变更文件清单（与 12 个 Task 对应文件一致，无额外文件）
  - Project.md §8 有 2026-09-02 决策记录

---

## 依赖关系与优先级

| Task | 依赖 | 优先级 |
|------|------|--------|
| TASK-001 | 无 | P1 |
| TASK-002 | TASK-001 | P2 |
| TASK-003 | 无 | P3 |
| TASK-004 | TASK-001（Go 侧清理后，前端调用不变） | P1 |
| TASK-005 | 无 | P1 |
| TASK-006 | 无 | P2 |
| TASK-007 | 无 | P3 |
| TASK-008 | 无 | P3 |
| TASK-009 | TASK-004 | P3 |
| TASK-010 | 无 | P3 |
| TASK-011 | 无 | P3 |
| TASK-012 | 全部 | P4 |

> 注：TASK-012 是纯记录任务，与 TASK-009/011 的 Project.md 更新不冲突（TASK-009/011 更新各自章节，TASK-012 追加决策记录，不重复）。

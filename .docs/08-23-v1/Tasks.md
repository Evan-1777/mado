# Tasks：整理 Project.md

**关联 Plan**：`Plan.md` —— 按 clean-refactoring 理念整理 Project.md v1.0
**总计 Task**：4 个

---

## Phase 1：修正事实错误

### TASK-001：修正 §2 Go 版本与 dist 体积

- **Status**：DONE
- **Description**：在 `Project.md` §2 中，将 Go 运行时版本 `1.25.3` 修正为本机实测 `1.27.0`，并区分写清本机 / CI / go.mod 三处来源；将 `npm run build` 产物体积 `约 1.3MB` 修正为实测 `3.2MB`（KaTeX 1.2M + fonts 1.2M + app.js 796K）。
- **Details**：
  - §2 `语言 / 运行时`：本机 `go1.27.0`（`~/.local/go/bin` 用户级单版本）；CI `1.25.x`（workflow 配置）；`go.mod` 声明最低 `1.25.0`
  - §2 `本机验证链` 第 3 步：`npm run build` 产出 `dist/`，实测 `~3.2MB`（KaTeX 资源占大头）
  - 保留 `~/.local/go` 单版本与 `export PATH` 说明
- **Acceptance Criteria**：
  - 运行 `grep -c "1.25.3\|1.3MB" .docs/Project.md` 输出 `0`
  - 文档同时出现 `1.27.0`（本机）、`1.25.x`（CI）、`1.25.0`（go.mod）三处版本来源
  - 本机验证链步骤数与顺序不变（仍为 4 步）

### TASK-002：修正 §6 目录解析条目日期

- **Status**：DONE
- **Description**：在 `Project.md` §6「目录解析曾因」条目中，将两条修复日期 `2026-08-18` 与 `2025-06-01` 修正为 git 实测的 `2026-08-16`（commit `2e51927` split 修复、`731b3fb` 正则修复）。
- **Details**：
  - git log -S 确认：split 修复 commit `2e51927` 日期 2026-08-16；正则修复 commit `731b3fb` 日期 2026-08-16
  - `2025-06-01` 为跨年笔误（项目 2026-08-14 才开始），整条修正
- **Acceptance Criteria**：
  - 运行 `grep -c "2025-06-01\|2026-08-18.*目录解析" .docs/Project.md` 输出 `0`
  - 条目中两条修复日期均为 `2026-08-16`

---

## Phase 2：精简冗余叙述与过时标注

### TASK-003：压缩 §6 目录解析条目为根因+结论

- **Status**：DONE
- **Description**：将 `Project.md` §6「目录解析曾因」连环叙述条目（split 修复→同次遗漏→补充修复三段流水账）压缩为单条：根因（字面量转义两处，均 2026-08-16 修复）+ 结论（split 与正则均应为 `\n`/`\s`），保留修复 commit 锚点。
- **Details**：
  - 保留核心信息：`split('\\n')` 字面量反斜杠导致整文档单行；正则 `\\s` 匹配字面反斜杠+s 导致 fenced code 检测失败
  - 保留结论：已修复为 `split('\n')` 与 `\s`，日期统一 2026-08-16
  - 删除过程性重复表述（"大量标题不识别""代码块内 # 被误识别"等冗余细化，根因已说明后果）
- **Acceptance Criteria**：
  - 条目长度缩短（对比改动前后行数，删除 ≥2 行）
  - 运行 `git diff` 检查仅 §6 目录解析条目变化，信息无丢失（split/正则/根因/结论/日期均在）

### TASK-004：清理过时标注

- **Status**：DONE
- **Description**：在 `Project.md` 中：§6「多实例限制」条目标注 `v1.2 已知限制` → 改为 `已知限制`（去版本，与当前 v1.5 脱节）；§3 `build/bin/mado.exe` 体积 `~15.6MB` → 改为描述性说明（本机不构建，体积以云端产物为准）。
- **Details**：
  - §6 多实例条目仅删 `v1.2` 前缀，保留全部技术内容
  - §3 目录结构注释中 build/bin 体积改为「打包输出（云端 CI 产物，体积以实际为准）」
- **Acceptance Criteria**：
  - 运行 `grep -c "v1.2 已知限制\|15.6MB" .docs/Project.md` 输出 `0`
  - 两个条目其余内容不变（diff 仅删前缀/换体积描述）

---

## Phase 3：一致性校验

### TASK-005：全文复查一致性与提交

- **Status**：DONE
- **Description**：复查 `Project.md` 全文：日期格式统一（无 2025 年、无将来日期）、无占位注释残留（`待填`）、§0 速查表与章节对应、与 SCOPE.md 无重复；确认 diff 仅含预期变更后执行 git commit。
- **Details**：
  - `grep -c "待填\|<!--"` 为 0（允许保留 `★` 标记说明文字）
  - `git diff --stat` 仅 .docs/Project.md 一个文件
  - commit message 描述「修正版本/日期/体积事实、精简目录解析条目」；本次对话无 commit 历史前缀可循，采用简洁描述
- **Acceptance Criteria**：
  - `grep -c "待填" .docs/Project.md` 输出 `0`
  - `git status` 干净，commit 已创建
  - 运行 `git show --stat HEAD` 确认仅含 .docs/Project.md

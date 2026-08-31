# Plan：修复模式切换后 Preview 滚动位置丢失

**状态**：DONE（2026-08-31 完成）
**日期**：2026-08-31
**版本**：v1.0
**回归测试结论**：通过。esbuild 语法检查 / `npm test`（fontCommit + gutter 自检）/ `go vet ./...` / `go test ./...` / `node frontend/tests/modeScroll.check.mjs` 全部退出码 0；modeScroll 检查在已修复构建上 4 个 cycle 全 PASS（`=> ALL PASS`），在未修复构建上 `preview-editor-preview` 与 `split-editor-split` FAIL、另两 cycle PASS（`=> FAIL`，退出码 1），证明检查对修复前后有区分度

---

## 1. 背景与目标

**现象**：从别的页面（Editor 模式或 Split 模式）点击回到 Preview 页时，预览滚动位置被重置到最上方；而 Editor 模式切换往返不丢滚动位置。

**根因（已实验证实）**：模式切换通过 `pane` 上的 `editor-only` / `preview-only` 类控制隐藏列，隐藏列用 `display: none`。Chromium 对 iframe 文档与普通溢出容器的处理不同：

- 预览滚动在 srcdoc iframe 文档内。列的 `display: none` 会销毁 iframe 的视口，文档滚动偏移立即归零（实测：隐藏瞬间 `scrollTop` 从 4000 → 0，重新显示后仍为 0）。
- Editor 滚动在 CodeMirror 的 `.cm-scroller` 内，是普通 overflow div，`display: none` 往返后 `scrollTop` 原样保留（实测 800 → 显隐往返 → 800）。
- 因此"editor 不丢、preview 丢"的差异不是两处代码不一致，而是浏览器对两种容器滚动状态保留语义不同。

**目标**：Preview/Split/Editor 任一模式切换往返后，预览滚动位置与编辑器滚动位置一样保持不变；无回归。

## 2. 阶段划分

### Phase 1：预览滚动位置跨模式切换保持

| 项目 | 内容 |
|------|------|
| **输入** | 模式切换事件（工具栏三个 tab 的唯一 handler）、预览 iframe 文档 |
| **输出** | 模式切换时预览滚动位置保存/恢复逻辑 + 可机械验证的回归检查 |
| **验收标准** | `node frontend/tests/modeScroll.check.mjs` 输出 `... => ALL PASS` 且退出码 0；该检查在未修复代码上必须输出 FAIL 且退出码非 0 |

### Phase 2：验证与文档维护

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 代码 |
| **输出** | 本机验证链全绿 + Project.md 同步 |
| **验收标准** | esbuild 语法检查、`npm test`、`go vet ./...`、`go test ./...` 全部通过；Project.md 已记录本次变更涉及的架构/已知坑/决策 |

### Phase 3：归档与提交

| 项目 | 内容 |
|------|------|
| **输入** | Phase 2 完成后的根目录 Plan.md / Tasks.md |
| **输出** | 归档目录 + git 提交 |
| **验收标准** | 归档目录同时含 Plan.md 与 Tasks.md 且均标注状态 DONE（含完成日期与回归结论），根目录无残留；提交信息符合 Conventional Commits 中文规范；仓库无未提交变更 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 修复位置 | 模式切换 handler 单点（隐藏前捕获 + 显示后恢复） | 该 handler 是唯一改变 `editor-only`/`preview-only` 类的入口，即唯一让预览列经历 `display:none` 的路径；单点即根因处，符合最短有效差分 | 各调用点打补丁（不存在其他调用点）；改用 `visibility` 等不销毁视口的隐藏方式（改动大、影响布局与行号栏语义） |
| 恢复时机 | 类切换完成后（列已重新显示）再写回 | 实测：隐藏状态（列 `display:none`）下写 `scrollTop` 会被钳制为 0，写入无效；显示后写回精确恢复 | 在隐藏前写回（无效）；异步 rAF 恢复（无必要，同一任务内同步生效） |
| 回归检查形态 | dev-only 无头 Chrome 自检（`frontend/tests/modeScroll.check.mjs`），不进 `npm test` / CI | 仓库无 GUI 测试框架，交互行为历来手动验证；该 bug 的机械复现需要真实浏览器对 iframe 视口的语义，纯 Node 无法模拟；进 CI 会破坏 windows-latest 构建链（无保证的 Chrome 与无头驱动差异） | 加测试框架/CI 依赖（与本项目"最小占用、零依赖自检"约定冲突） |
| 编辑器侧处理 | 不动 | Editor 滚动由浏览器天然保留（普通 div），无需代码；检查中加一个编辑器 cycle 作为不变式钉死，防止将来把它改坏 | 同样保存/恢复编辑器滚动（多余代码，违反 YAGNI） |

**已实测验证的修复形态**（供执行阶段对齐，非代码片段）：离开预览可见模式前记录 iframe 文档 `scrollingElement.scrollTop`；回到预览可见模式后写回并清空记录值。捕获/恢复用同一函数判断"预览列当前是否可见"。修复后 4 个切换 cycle 全部保留滚动；未修复时涉及隐藏预览列的 2 个 cycle 丢滚动、Split 与 editor cycle 本就通过。

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 恢复值大于新内容滚动高度（编辑期间文档变短/删空） | 🟢 低 | 浏览器自动钳制到最大可滚动值，无崩溃无错误；行为等同于正常滚动到底 |
| 预览 iframe 发生 srcdoc 重建（异常回退）期间切换模式 | 🟢 低 | 每次切换重新获取 `scrollingElement` 引用，不持有陈旧引用 |
| 恢复写回到"刚显示但还未完成布局"的视口 | 🟢 低 | 已实测同任务内同步写回生效（无需 rAF）；`scrollTop` 读取/写入会强制布局 |
| 回归检查依赖系统 Chrome 与已构建 dist | 🟡 中 | 脚本为 dev-only，文档注明前置条件（`npm run build` + `CHROME_BIN` 可覆盖）；不进 CI，不阻塞云端构建链 |
| 检查脚本误报（未真正切换模式） | 🟡 中 | 每个 cycle 断言 pane 类与预览列计算样式确实发生了预期的隐藏/显示，未切换即判 FAIL |

## 5. Phase 依赖关系

```
Phase 1 ──→ Phase 2 ──→ Phase 3
```

严格串行，无并行阶段。Phase 1 的验收标准是 Phase 2 的前置条件（Phase 2 的验证链包含 Phase 1 的检查脚本）。

---

> ### Task 拆解预览
>
> | Phase | 预估 Task 数 | 示例 Task |
> |-------|-------------|-----------|
> | Phase 1 | 2 | 模式切换保存/恢复预览滚动、modeScroll 回归检查 |
> | Phase 2 | 2 | 本机验证链、Project.md 同步 |
> | Phase 3 | 1 | 归档与提交 |
>
> **总计预估**：5 个 Task。每个 Task 的验收标准、依赖关系、优先级在 `Tasks.md` 中独立定义。

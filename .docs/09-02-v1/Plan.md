# Plan：批判性修复历史遗留问题

**状态**：DONE
**日期**：2026-09-02
**版本**：v1.0
**回归测试结论**：`go vet ./...`、`go test ./...`、前端 `npm test`、`npm run build`、零产物 `esbuild` 语法检查与 `npm ci --dry-run` 全部通过；dev-only 无头 Chrome 检查 `modeScroll.check.mjs` 通过（4 个模式/滚动 cycle）；CDP（Chrome DevTools Protocol，Chrome 调试协议）端到端检查验证脏文档下打开/拖放会弹出确认，取消后保留内容；新增 `TestLastFileFailureIsBestEffort`、`TestRenderRemovesScriptTags` 与 `frontend/tests/tocGutter.test.ts` 覆盖对应回归。用户准备的 9222 浏览器实例未监听，无法执行连接式验证；拖放仍需 Windows 手测（见 Plan §4 R1）。

---

## 1. 背景与目标

用户呈交一份 11 条问题清单（P1/P2/P3 三档），要求以"批判性修复"方式处理历史遗留问题。本计划对清单逐条独立核实（含对 Wails v2.14.0 运行时源码的静态验证与对用户建议中一处数学错误的修正），以最短有效差分实现修复并同步文档。

**目标**：11 条问题全部关闭或显式标注为不需要修复/已知限制。不引入新抽象、新依赖、跨模块重构；不做清单未要求的功能。

## 2. 阶段划分

### Phase 1：驱动层与死代码清理（Go 侧）

| 项目 | 内容 |
|------|------|
| **输入** | app.go、filesys、mdrender.go、mdrender_test.go |
| **输出** | lastfile 改为 best-effort；死代码清理；测试更新 |
| **验收标准** | `go test ./...` 通过；`go vet` 干净；`app.go` 不再出现 `file-loaded`/`OnFileDrop`/`strings` import |

### Phase 2：前端逻辑修复（拖放、未保存检查、节流、TOC、缓存）

| 项目 | 内容 |
|------|------|
| **输入** | frontend/src/main.ts |
| **输出** | `OnFileDrop(onDrop, false)`；两条载入路径加 `confirmDiscard`；节流补赋值；TOC 修复；mathCache 加塞 |
| **验收标准** | `npm run build` 通过；`npm test` 通过；`esbuild` 语法检查通过 |

### Phase 3：文档与工作流修复（#9 #10 #11）

| 项目 | 内容 |
|------|------|
| **输入** | .docs/Project.md、.github/workflows/*.yml、归档目录 |
| **输出** | Project.md 拖放描述与实际机制一致；缺失归档补齐或豁免；CI 改 `npm ci` |
| **验收标准** | Project.md 与代码库一致；归档目录完整；CI 改动为最小差分 |

### Phase 4：回归测试与决策记录归档

| 项目 | 内容 |
|------|------|
| **输入** | 全部变更 |
| **输出** | 决策记录 + 回退提交 |
| **验收标准** | 全量测试通过；决策记录写入 Project.md §8 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|---------------------|
| 拖放修复（#1） | `OnFileDrop(onDrop, false)` | 与"全窗口任意位置接受拖放"设计意图一致；一行 | `#app { --wails-drop-target: drop; }`（需逐个容器声明，且开发/生产运行时行为不一致；CSS 声明方案仅对首个落点元素生效，覆盖不了子元素） |
| lastfile 错误处理（#3） | `_ = filesys.SetLastFile(path)` | 与 `migrateLegacyStore` 既有约定一致；best-effort 记录不进入主链错误路径 | 文件读写成功时还在错误路径中返回错误（保留现状）——不可取 |
| 节流修复（#4） | 补 `lastRenderAt = Date.now()` | 用户建议与我的数学分析一致，`wait` 恒为 0 是根因 | 删除节流变量（后退）；改调度为 `setTimeout(wait)` 而非 `max`（有风险，改动大于一行） |
| TOC 修复（#7） | 预览侧按标题 id/文本匹配定位，而非序号 | 与预览 DOM 序号的错位是根因 | 改为纯文本解析识别 setext/HTML 块（复杂且 goldmark 渲染结果不可预测）；文档标注已知限制 |
| StripScripts（#5） | 删除函数与测试 | 零调用方、逻辑与 Render 实际机制不符 | 保留死代码（违背清理目标） |
| 死事件（#6） | 删除 `EventsEmit("title")` 与 Go `OnFileDrop`/`file-loaded` | 零订阅者，功能由前端自持 | 保留（违背清理目标） |
| mathCache（#8） | `if (mathCache.size > 500) mathCache.clear()` | 与个人工具量级匹配；一行 | 不处理（可接受但用户明确列出，处理更稳妥） |
| 归档缺件（#10） | 已确认部分归档目录缺失；不回溯补齐，标注为豁免写入决策记录 | 无法从 git 恢复已不存在的 Plan.md；机械补齐会伪造历史 | 从 git 历史恢复（08-16-v4 从未有 Plan.md，无法恢复） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| R1：拖放修复无法在本机（Linux）实测，需 Windows 手测 | 🟡 中 | 静态源码证据链完整；`OnFileDrop(onDrop, false)` 在 prod/dev 运行时均直接调用回调（`runtime_prod_desktop.js` 中 `a.useDropTarget && (o=function(...){...})` 分支在 `false` 时不再包装）；计划注明验收依赖 Windows 手测 |
| R2：节流补 `lastRenderAt` 后，`wait` 可能使 `setTimeout` 延迟 < 100ms？ | 🟢 低 | 数学上 `Math.max(DEBOUNCE_MS, wait)` 恒 ≥ 100ms（DEBOUNCE_MS=100 已是最小值）；`Date.now()` 更新仅让 `wait` 从 0 变为可能非 0 |
| R3：`OnFileDrop(onDrop, false)` 在旧版 wails 运行时无第二参数？ | 🟢 低 | wails v2.14.0 生成的 runtime.d.ts 已声明 `useDropTarget: boolean` 参数；旧版不支持会静默忽略第二参数（降级为当前行为，无回归） |
| R4：TOC 修复按 id 匹配可能因 slug 重复而定位错误？ | 🟢 低 | 逻辑用 `getElementById` 精确匹配，slug 由 goldmark 生成；重复标题后续测试覆盖 |

## 5. Phase 依赖关系

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
```

严格串行；Phase 3 文档修复依赖 Phase 1/2 的实际行为（写实而非写愿）。

---

> ### Task 拆解预览（详见 Tasks.md）
>
> | Phase | 预估 Task 数 | 示例 Task |
> |-------|-------------|-----------|
> | Phase 1 | 3 | app.go 清理、lastfile best-effort、mdrender 测试更新 |
> | Phase 2 | 5 | 拖放修复、未保存检查、节流修复、TOC 修复、mathCache 清理 |
> | Phase 3 | 3 | Project.md 更新、CI 改 npm ci、归档豁免记录 |
> | Phase 4 | 1 | 汇总回归测试与决策记录 |
>
> 每个 Task 的验收标准、依赖关系、优先级在 `Tasks.md` 中独立定义。

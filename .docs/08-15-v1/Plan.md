# Plan：修复未保存关闭弹窗点击"是/否"无响应

**状态**：DONE  
**日期**：2026-08-15  
**版本**：v1.0  
**回归测试结论**：`go build ./...`、`go vet ./...`、`go test ./...`（4 包）与前端 esbuild 零产物验证全部退出码 0；全仓库 grep 确认 `ConfirmSave`/`ConfirmDiscard` 无源码残留（仅旧构建产物 dist/bin 与本文档提及）。GUI 交互行为（是/否/取消/Esc/Alt+F4 防重入）待云端 CI artifact 人工走查。

---

## 1. 背景与目标

用户报告：dirty 状态下关闭程序，确认弹窗点击"是""否"均无反应，程序不退出。

根因（已定位，证据为 wails v2.14.0 源码 `internal/frontend/desktop/windows/dialog.go`）：

- Windows 上 `runtime.MessageDialog` 忽略 `Buttons` 自定义标签，`QuestionDialog` 恒渲染为 `MB_YESNO` 两键系统弹窗（中文系统显示"是/否"）；
- 点击后 Wails 返回**英文规范串** `"Yes"` / `"No"`（由 MessageBox 返回值映射表产生）；
- `app.go` 的 `ConfirmSave()` 以 `case "是"` / `case "否"` 匹配，永不命中，恒落入 `default → "cancel"`，前端收到 cancel 后直接 return——表现为点击无响应。

同根因潜伏 bug：`ConfirmDiscard()` 匹配 `answer == "Discard"`，同样永不成立，dirty 状态下新建文件流程当前必定中止。

目标：

1. 关闭确认恢复三态语义：保存并关闭 / 不保存关闭 / 取消（含 Esc），任一选择均有正确响应；
2. 修复新建文件流程中同根因的确认失效；
3. 移除对 `runtime.MessageDialog` 平台怪癖的依赖，消除此类缺陷来源。

## 2. 阶段划分

### Phase 1：移除 Go 侧失效的原生确认弹窗

| 项目 | 内容 |
|------|------|
| **输入** | `app.go` 中 `ConfirmSave()`、`ConfirmDiscard()`（均依赖被平台忽略的 Buttons 语义） |
| **输出** | 两个方法及关联死代码删除，Go 侧仅保留 `SetDirty` / `ForceQuit` / `OnBeforeClose` 事件转发 |
| **验收标准** | `go build ./...`、`go vet ./...`、`go test ./...` 通过；源码中无两方法的定义与引用 |

### Phase 2：前端 `<dialog>` 模态确认组件与流程接入

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 的代码状态；`frontend/index.html`、`frontend/src/style.css`、`frontend/src/main.ts` |
| **输出** | 原生 `<dialog>` 三键模态（是/否/取消，Esc=取消），关闭流程与新建文件流程统一接入；含防重入 guard |
| **验收标准** | esbuild 打包无语法错误；关闭路径上 ConfirmSave IPC 调用被 `askUnsaved()` 本地 Promise 替代 |

### Phase 3：绑定副本同步与本地验证

| 项目 | 内容 |
|------|------|
| **输入** | Phase 2 完成后的前端代码 |
| **输出** | `frontend/wailsjs/go/main/App.js` / `App.d.ts` 删除两个失效绑定；全量本地验证通过 |
| **验收标准** | `go build ./...`、`go vet ./...`、`go test ./...`、esbuild bundle 全部退出码 0；`grep` 确认 `ConfirmSave`/`ConfirmDiscard` 全仓库无残留引用 |

### Phase 4：文档维护、归档与提交

| 项目 | 内容 |
|------|------|
| **输入** | 全部代码变更 |
| **输出** | Project.md 同步（数据流、已知坑、决策记录）；Plan/Tasks 归档至 `.docs/08-15-v1/`；git 提交 |
| **验收标准** | Project.md 描述与代码一致；归档目录含两文件且根目录无残留；提交信息符合仓库风格 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 确认弹窗实现 | 前端原生 `<dialog>` 元素（`showModal` + `form method="dialog"`） | 三态语义完整（含取消与 Esc），复用应用设计令牌与 Frameless 视觉语言；`<dialog>` 由 WebView2（Chromium）原生支持，焦点囚禁、Esc、backdrop 免费获得 | Go 侧映射 `"Yes"`/`"No"` 修复（MB_YESNO 无取消键，X 与 Esc 均失效，误触关闭只能二选一，存在数据丢失风险；且 ConfirmDiscard 的英文文案配系统"是/否"键，语义错位） |
| 新建文件确认 | 复用同一 `<dialog>` 组件（`askUnsaved()`） | 同一交互场景（未保存变更决策），修复潜伏 bug 零新增组件 | 保留 `ConfirmDiscard` 并修映射（维持两套弹窗路径，且继承两键限制） |
| 防重入 | `closePending` 布尔 guard 包裹 `handleCloseFlow` | 模态打开期间再次 Alt+F4 / 点 X 会二次触发 `request-close`，guard 使重复触发静默忽略 | 无 guard（`showModal` 对已打开 dialog 抛 `InvalidStateError`） |

修复后的关闭决策流：

<div style="font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.7;color:#333;background:#fafafa;border:1px solid #ddd;border-radius:8px;padding:14px;max-width:640px">
<div style="margin-bottom:8px"><b>触发</b>：自定义 X 按钮（requestClose）｜Alt+F4/任务栏（Go emit request-close）</div>
<div style="border-left:2px solid #999;padding-left:12px">
  dirty = false → <code>ForceQuit()</code> 直接退出<br>
  dirty = true → 前端 <code>&lt;dialog&gt;</code> 模态（closePending 置位）
  <div style="border-left:2px solid #bbb;padding-left:12px;margin:4px 0">
    是 → 保存（未命名先另存）→ 成功则 <code>ForceQuit()</code>，失败/取消另存 → 留在编辑器<br>
    否 → <code>ForceQuit()</code><br>
    取消 / Esc → 关闭模态，继续编辑
  </div>
</div>
<div style="margin-top:8px;color:#666">ForceQuit 置 quitting 标志后 OnBeforeClose 放行，进程退出</div>
</div>

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 模态打开期间重复触发关闭事件导致 `showModal` 抛异常 | 🟡 中 | `closePending` guard 在 `handleCloseFlow` 入口拦截 |
| Esc 关闭 `<dialog>` 时 `returnValue` 为空串 | 🟢 低 | resolve 时对空值统一映射为 `'cancel'` |
| 表单提交关闭后 `close` 事件时序 | 🟢 低 | `form method="dialog"` 保证按钮点击先设 `returnValue` 再触发 `close`，单点监听 `close` |
| GUI 行为无法本地自动化验证 | 🟡 中 | 本地执行编译/静态/单测 + esbuild 全套机械验证；交互行为列入云端构建后人工走查清单（见 Tasks TASK-005） |

## 5. Phase 依赖关系

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
```

严格串行：Go 侧先删方法，前端再替换调用点，绑定副本最后同步，避免中间态编译/打包失败。

---

> ### Task 拆解预览
>
> | Phase | 预估 Task 数 | 示例 Task |
> |-------|-------------|-----------|
> | Phase 1 | 1 | 删除 ConfirmSave/ConfirmDiscard |
> | Phase 2 | 2 | dialog 标记与样式；关闭/新建流程改造 |
> | Phase 3 | 2 | 绑定副本同步；全量验证 |
> | Phase 4 | 2 | Project.md 更新；归档提交 |
>
> **总计预估**：7 个 Task，详见 `Tasks.md`。

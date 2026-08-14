# Plan：修复 Split 预览占位符遮挡与模式切换失效

**状态**：DONE
**日期**：2026-08-14
**版本**：v1.1.2
**回归测试结论**：前端 esbuild 构建通过（`npm run build`，dist/app.js 522.8kb 产出正常）；两个修复点均已通过代码走查验证（CSS `[hidden]` 覆盖规则生效；事件绑定目标修正为 `toolbar`）。交互行为待用户本机验收（GUI 无自动化测试框架）。

---

## 1. 背景与目标

v1.1 GUI 修复中发现两个交互 bug：

1. **Split 预览界面下方一直存在 "No preview" 提示**：即使预览有内容，也只有上半部分渲染内容，下半部分被占位符遮挡。
2. **无法切换到除 Split 以外的模式**：点击 Editor / Preview 标签无任何反应，界面永远停留在 Split 模式。

目标：修复两个 bug，恢复模式切换与预览占位符的正确显隐。

## 2. 阶段划分

### Phase 1：修复占位符显隐逻辑

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/src/style.css`（.placeholder 样式）、`frontend/src/main.ts`（writePreview 的 hidden 切换） |
| **输出** | `.placeholder[hidden] { display: none }` 规则 |
| **验收标准** | 预览有内容时占位符隐藏；无内容（空文档）时占位符显示；Split 模式下预览内容占满下半列 |

### Phase 2：修复模式切换事件绑定

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/src/main.ts` 模式标签事件绑定代码 |
| **输出** | `querySelectorAll` 查询根从 `pane` 改为 `toolbar` |
| **验收标准** | 点击 Editor / Preview 标签可切换模式，active 类正确移动，pane 的 editor-only/preview-only 类正确增删 |

### Phase 3：构建验证与文档同步

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1/2 的代码改动 |
| **输出** | 前端构建通过；Plan.md / Tasks.md / Project.md 同步；提交推送 |
| **验收标准** | `npm run build` 无报错；文档与代码一致；推送后云端 CI 触发 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 占位符隐藏方案 | CSS 追加 `.placeholder[hidden] { display: none }` | 一行规则，保留现有 JS 的 hidden 属性切换逻辑；特异性高于 UA 默认规则，覆盖 `display: flex` | JS 改用 classList.toggle + `.placeholder.hidden` 类（需改两处 JS+CSS，diff 更大） |
| 事件查询根 | `toolbar.querySelectorAll('.seg button')` | `.seg` 按钮组位于 toolbar 内（toolbar 与 pane 是兄弟节点），查询根必须指向实际容器 | 全局 `document.querySelectorAll`（作用域过宽，非必要） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `[hidden]` 规则与其他样式冲突 | 🟢 低 | 规则仅作用于 `.placeholder` 类元素，作用域受限；现有 `#preview-empty` 无其他 display 覆盖 |
| 事件绑定修复后其他逻辑依赖原行为 | 🟢 低 | 仅修正查询根，pane classList 操作逻辑未动，无行为变更面 |

## 5. Phase 依赖关系

```
Phase 1 ──→ Phase 3
Phase 2 ──→ Phase 3
```

Phase 1/2 无相互依赖，可并行；Phase 3 依赖两者完成。

---

> ### Task 拆解预览
>
> | Phase | 预估 Task 数 | 示例 Task |
> |-------|-------------|-----------|
> | Phase 1 | 1 | style.css 增加 [hidden] 覆盖规则 |
> | Phase 2 | 1 | main.ts 修正 querySelectorAll 查询根 |
> | Phase 3 | 3 | 构建验证、文档同步、提交推送 |
>
> **总计预估**：5 个 Task。

# Plan：修复编辑时 Preview 闪烁并回到顶部

**状态**：DONE  
**日期**：2026-08-15
**版本**：v1.0
**回归测试结论**：`frontend/node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 退出码 0；`grep -n "srcdoc" frontend/src/main.ts` 仅命中首帧骨架与异常回退两处赋值；`git status --short` 无 frontend/dist 变更。本机 Edge 151 无头实验对照：srcdoc 重载后 scrollTop 归零 vs 原地更新 scrollTop=1500 保留（`scratch/` 实验已删除）。GUI 交互（编辑时滚动不跳顶、无闪烁）待云端 CI artifact 人工走查。

---

## 1. 背景与目标

用户报告：编辑内容时，Preview 界面闪烁并回到最顶端，编辑体验极差。

**根因（本机 Edge 无头实验已实证）**：

- 现实现（`frontend/src/main.ts` 的 `writePreview()`）每次渲染都**整体重设 `iframe.srcdoc`**。srcdoc 赋值 = 整个文档重新导航加载，与 `location.href` 跳转同类：
  - 新文档加载完成后滚动位置恒为 0（回到顶部）；
  - 旧文档销毁 → 新文档解析绘制之间存在短暂空白（闪烁）。
- 触发路径：CodeMirror updateListener → 100ms debounce + 80ms 节流 → `refreshPreview()` → `writePreview()` 重设 srcdoc。**每次击键**（停顿 ≥100ms 后）都整页重载一次。

**目标**：

1. 编辑时 Preview 滚动位置保持（不再跳顶）；
2. 编辑时 Preview 不再闪烁（无整页重载）；
3. 预览内容 / CSS / 主题切换语义保持不变。

**方案（核心决策）**：改为 **iframe 内原地更新**——首帧仍用 srcdoc 搭建骨架，之后只替换 iframe 文档内的 `<style>` 文本与 `<article>` innerHTML。文档本身不重新导航，滚动位置天然保留，无重载无闪烁。本机 Edge 151 无头实验已验证：原地更新后 `scrollTop=1500` 保持不变（srcdoc 重载后为 0）。

**可选优化（不纳入本期）**：原地更新在内容增长时浏览器会尝试保持滚动锚点，用户位于文档中部时新内容增长可能产生轻微位移；消除需逐渲染周期重算 `scrollTop` 并回写（增加抖动风险），价值有限，列为已知限制。

## 2. 阶段划分

### Phase 1：预览通道改造——srcdoc 首帧 + iframe 内原地更新

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/src/main.ts` 的 `writePreview()`；预览 DOM 结构为 `<article>${html}</article>`（由 mdrender 输出的 `safe HTML` 直接内插） |
| **输出** | `writePreview()` 重构：首次（或骨架缺失）用 srcdoc 写骨架（含 `<style>`、`<article id="md-content">`），后续仅替换 style 文本 + article innerHTML；`refreshPreview()` 调整调用 |
| **验收标准** | 首次渲染 srcdoc 一次；后续渲染不再重设 srcdoc；骨架缺失（如初始 preview-empty 状态）可自愈重建；esbuild 零产物验证退出码 0 |

### Phase 2：渲染时序与清理

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 的原地更新 + 既有 renderVersion 乱序守卫 |
| **输出** | 原地更新失败（跨域不可达、骨架异常）时回退到 srcdoc 重建，保证预览通道永不白屏；`renderVersion` 守卫语义保持（过期响应丢弃） |
| **验收标准** | 回退路径存在且可触发；esbuild 零产物验证退出码 0 |

### Phase 3：验证与文档

| 项目 | 内容 |
|------|------|
| **输入** | 改造后的 `frontend/src/main.ts` |
| **输出** | 验证结论 + 文档更新 |
| **验收标准** | 本机 esbuild 零产物验证退出码 0；`grep -n "srcdoc" frontend/src/main.ts` 显示 srcdoc 仅出现在首帧路径；Project.md §4 数据流描述与实际实现一致 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 预览刷新方式 | iframe 内原地更新（换 style 文本 + article innerHTML） | 文档不重新导航，滚动位置天然保留、无重载无闪烁；改动最小（单函数） | ① srcdoc 重建 + 事件恢复滚动：需注入 scroll 事件监听、加载后 restore、长文档闪动仍存在，链路复杂；② 导航时查询串/哈希传 scroll：文档间状态传递脆弱；③ 父页包一层滚动容器：改动架构、破坏"预览隔离"设计 |
| 首帧初始化 | 仍用 srcdoc 写骨架 | 保持"预览通过 srcdoc 与编辑区隔离、仅 allow-same-origin"的既有安全模型不变 | document.write / 直接写 contentDocument：浏览器安全限制（受限沙箱内 document 写入被忽略，实测 W3C 规范） |
| 内容元素 | `<article id="md-content">` | 固定的、可直接定位的更新锚点 | 无 id 用 body.children 探测：脆弱；多个元素拼接：语义不清 |
| 跨域/异常回退 | 原地更新失败 → 重设 srcdoc 重建 | 保证预览通道在异常状态下仍可恢复 | 不处理：异常后预览永远白屏/停留旧内容 |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 用户位于文档中部时新增内容导致滚动锚点轻微位移 | 🟢 低 | 已实证滚动位置保留；残余位移为浏览器锚点行为，列为已知限制，不引入逐周期回写 scrollTop（易抖动） |
| WebView2 老版本对 `contentDocument` 写操作的兼容性 | 🟢 低 | 本机 151.0.4129.78 实测 OK；首次渲染仍走 srcdoc，后续写失败时 Phase 2 回退重建 srcdoc 自愈 |
| 主题切换 `applyTheme()` 内联刷新与新渲染时序竞态 | 🟢 低 | 复用既有 renderVersion 守卫；CSS 文本替换先于内容替换执行 |

## 5. Phase 依赖关系

```
Phase 1 ──→ Phase 2 ──→ Phase 3
```

严格串行，无并行阶段。

---

> ### Task 拆解预览
>
> 以下仅示意 Plan 与 Task 的衔接关系，实际 Task 详见 `Tasks.md`。Plan 在此止步，不再展开具体实施细节。
>
> | Phase | 预估 Task 数 | 示例 Task |
> |-------|-------------|-----------|
> | Phase 1 | 2 | writePreview 重构为骨架+原地更新、refreshPreview 调用调整 |
> | Phase 2 | 1 | 原地更新异常回退 srcdoc 重建 |
> | Phase 3 | 2 | esbuild 零产物验证、Project.md 数据流同步 |
>
> **总计预估**：5 个 Task。

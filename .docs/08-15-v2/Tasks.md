# Tasks：修复编辑时 Preview 闪烁并回到顶部

**关联 Plan**：`Plan.md` —— 修复编辑时 Preview 闪烁并回到顶部 v1.0
**总计 Task**：5 个

---

## Phase 1：预览通道改造——srcdoc 首帧 + iframe 内原地更新

### TASK-001：writePreview 重构为「srcdoc 首帧骨架 + iframe 内原地更新」

- **Status**：DONE
- **Description**：重构 `frontend/src/main.ts` 的 `writePreview(html)`：首次渲染（`previewIframe.srcdoc` 为空或骨架缺失）时用 srcdoc 写入完整骨架（`<style>` + `<article id="md-content">`）；后续渲染仅通过 `previewIframe.contentDocument` 替换 `<style>` 的 textContent 与 `<article id="md-content">` 的 innerHTML，不重设 srcdoc。
- **Details**：
  - 骨架结构：`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${previewCss}</style></head><body><article id="md-content">${html}</article></body></html>`
  - 原地更新逻辑：`const doc = previewIframe.contentDocument;` 后 `doc.head.querySelector('style').textContent = previewCss;` 再 `doc.getElementById('md-content').innerHTML = html;`（CSS 先于内容，避免新内容短暂套旧样式）
  - 骨架缺失判定：`srcdoc` 为空、`contentDocument` 为空、`getElementById('md-content')` 不存在（含 `<article>` 被 mdrender 输出意外清空/替换的情况）任一成立 → 走 srcdoc 重建
  - 保留现有行为：`previewEmpty.hidden` 按 `html.trim().length > 0` 更新
- **Acceptance Criteria**：
  - `grep -n "srcdoc" frontend/src/main.ts` 仅命中首帧重建路径（≤3 处：初始赋值、重建分支）
  - `node_modules/.bin/esbuild frontend/src/main.ts --bundle --loader:.css=empty` 退出码 0

### TASK-002：refreshPreview 调用链适配与主题 CSS 内联刷新兼容

- **Status**：DONE
- **Description**：调整 `refreshPreview()` 中 `writePreview(html)` 的调用时机与 `previewCss` 使用，确保主题切换（`applyTheme()` 内联 `refreshPreview()`）与编辑渲染走同一条原地更新路径，CSS 更新不依赖 srcdoc 重建。
- **Details**：
  - `refreshPreview()` 在 `Promise.all([Render(md), cssForTheme()])` 后先更新 `previewCss` 再调用 `writePreview(html)`（顺序不变，CSS 已先于内容替换）
  - `applyTheme()` 置空 `previewCss` 后调 `refreshPreview()` 的行为保持：`cssForTheme()` 重新取 CSS → 原地替换 style 文本 → 主题即时生效
  - 不新增 IPC、不改变 debounce/节流参数
- **Acceptance Criteria**：
  - `node_modules/.bin/esbuild frontend/src/main.ts --bundle --loader:.css=empty` 退出码 0
  - `grep -n "srcdoc" frontend/src/main.ts` 中 srcdoc 赋值仅存在于首帧/重建路径

## Phase 2：渲染时序与清理

### TASK-003：原地更新异常回退 srcdoc 重建

- **Status**：DONE
- **Description**：`writePreview()` 原地更新路径包裹 try/catch：`contentDocument` 访问或 DOM 更新抛错（跨域/骨架异常）时回退到 srcdoc 整体重建，保证预览通道不白屏；重建后清空缓存引用（每次重建后骨架即为最新）。
- **Details**：
  - 回退路径复用 TASK-001 的骨架字符串构造逻辑（抽为局部函数或同函数内分支）
  - 回退时更新 `previewEmpty.hidden`
  - 无新增状态字段（`renderVersion` 守卫语义不变）
- **Acceptance Criteria**：
  - `node_modules/.bin/esbuild frontend/src/main.ts --bundle --loader:.css=empty` 退出码 0
  - 代码审查确认：原地更新分支与回退分支互斥、回退分支可触发（`contentDocument` 为 null 或 DOM 缺失时进入）

## Phase 3：验证与文档

### TASK-004：本机验证与实验对照

- **Status**：DONE
- **Description**：运行本机可执行验证：esbuild 零产物语法检查退出码 0；对照 `scratch/` 实验页结论（Edge 151 无头：srcdoc 重载 scrollTop 归零 vs 原地更新 scrollTop 保留）在文档中记录；确认 `frontend/dist` 未被本地构建污染。
- **Details**：
  - 验证命令：`node_modules/.bin/esbuild frontend/src/main.ts --bundle --loader:.css=empty > /dev/null`（退出码 0）
  - `git status --short` 确认无 `frontend/dist` 变更
  - 交互行为（编辑滚动不跳顶、无闪烁）列入云端 CI artifact 人工走查清单
- **Acceptance Criteria**：
  - esbuild 验证退出码 0
  - `git status --short` 无 `frontend/dist` 变更
  - Plan.md 回归测试结论字段已填写验证结果

### TASK-005：Project.md 数据流描述同步

- **Status**：DONE
- **Description**：更新 `.docs/Project.md` §4 数据流中「编辑」条目：将「重建 iframe srcdoc」改为「srcdoc 首帧 + iframe 内原地更新（style 文本 + article innerHTML）」；§6 约束与已知坑新增一条：srcdoc 重建会重置滚动并闪烁，编辑渲染禁止重设 srcdoc。
- **Details**：
  - 改动仅限 `.docs/Project.md`，不涉及代码
  - 术语表「预览通道」定义如需同步则一并更新
- **Acceptance Criteria**：
  - `.docs/Project.md` §4 编辑数据流描述与 `frontend/src/main.ts` 实际实现一致
  - `.docs/Project.md` §6 含 srcdoc 重建限制条目

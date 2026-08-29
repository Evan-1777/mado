# Plan：Split 双栏源行号栏与双向跳转

**状态**：DONE
**日期**：2026-08-29
**完成日期**：2026-08-29
**版本**：v1.0
**回归测试结论**：本机验证链六条命令全绿（`npm install --include=dev`、零产物 esbuild 语法检查、`npm run build`、`npm test`、`go vet ./...`、`go test ./...`）。新增 Go 用例 `TestSourceLineBlocks`/`TestSourceLineCodeFence`/`TestSourceLineMathBlock` 与前端 `tests/gutter.test.ts` 均通过；现有 mdrender 用例中 3 处断言因 `data-line` 落地而同步更新（表格/公式块/段落与标题的行号前缀），无功能回归。交互项（两侧点击置顶、Split 与 Preview 单栏均显示行号栏）待 Windows 端手动验收。

**实现偏差记录**：
1. TASK-002 验收用例 `<hr data-line="3">` 需额外机制才能命中：goldmark 的 `ThematicBreak` 无 Lines 与子节点，`blockOffset` 取不到偏移。方案是变换器维护 cursor（上一块结束后的首个非空行偏移），无自身位置的块回退到 cursor，同时作为偏移下界防止块抢占前序块的位置。
2. 启用 `highlighting.WithWrapperRenderer` 后，未被 Chroma 高亮的围栏块（无词法分析器或 `{nohl=true}`）会以裸文本直出——上游 `renderFencedCodeBlock` 只在 `WrapperRenderer == nil` 时写 `<pre><code>`。包装渲染器已补齐该开闭标签，`{nohl=true}` 用例同时验证 `language-go` 未丢失。
3. TASK-001 验收用例 `<h1 data-line="1"` 与实际输出不符：本管线开了 `parser.WithAutoHeadingID()`，`<h1>` 上先有 `id`。用例改为断言 ` data-line="1">H</h1>`。

---

## 1. 背景与目标

v1.5 完成后，Split 模式下两栏缺少位置对应关系：Editor 有行号、Preview 没有任何行号，且两栏无法互相定位。本次改动让「源码行」成为两栏的共同坐标：

1. **模式顺序调整**：工具栏模式切换重排为 Preview / Editor / Split，并以 Preview 为启动默认模式（用户确认：顺序首位即默认）。
2. **Preview 行号栏**：Preview 列增加优雅的源行号栏（Split 与 Preview 单栏均显示），每个顶层块标注其源码起始行。
3. **双向点击跳转**：点击任一栏的行号，对方栏把该行内容滚动到顶端第一行。

**约束（用户追加）**：Editor 的行号栏不再承担代码折叠功能（折叠箭头与点击跳转冲突），折叠槽下线、键盘折叠保留。

## 2. 阶段划分

### Phase 1：渲染层输出源行号锚点（Go / mdrender）

| 项目 | 内容 |
|------|------|
| **输入** | 现有渲染管线（GFM + typographer + Chroma 高亮 + 数学扩展） |
| **输出** | 渲染 HTML 中每个顶层块带 `data-line="N"`（1-based 源码起始行），围栏代码块与公式块一并覆盖 |
| **验收标准** | `go test ./...` 全绿；标题/段落/列表/引用/表格/围栏代码（带语言与不带语言、`{nohl=true}`）/公式块的行号用例逐条命中；代码块 `<pre>` 开标签与行包装 span 与改造前逐字一致，仅外层包装层多带 `data-line` |

### Phase 2：行号映射纯函数与测试（前端）

| 项目 | 内容 |
|------|------|
| **输入** | 「源行号 → 渲染块」的映射需求 |
| **输出** | 不依赖 DOM 的映射模块及其零依赖单测，接入 `npm test` |
| **验收标准** | `cd frontend && npm test` 退出码 0，两个测试文件均输出通过信息 |

### Phase 3：Preview 行号栏视觉

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 的 `data-line` 属性 + 预览主题样式表 |
| **输出** | 由 CSS 生成的预览行号栏，预览列可见时显示（Split 与 Preview 单栏） |
| **验收标准** | 预览样式表新增行号栏规则；切到 Editor 单栏时行号栏消失，Split 与 Preview 单栏均显示；行号栏实现中无 JS 定位与滚动同步代码 |

### Phase 4：双向跳转 + 模式顺序 + 折叠槽下线

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 的锚点、Phase 2 的映射、Phase 3 的可点击区域 |
| **输出** | 双向行号跳转；模式按钮重排且 Preview 为默认；编辑区行号栏去掉折叠槽 |
| **验收标准** | 两侧点击均把目标行置顶；工具栏按钮顺序为 Preview/Editor/Split 且 Preview 初始选中；`src/main.ts` 中无 `foldGutter` |

### Phase 5：文档维护与全链路回归

| 项目 | 内容 |
|------|------|
| **输入** | 前四阶段全部改动 |
| **输出** | 同步后的 Project.md、本机验证链结论、归档与提交 |
| **验收标准** | `go vet ./...`、`go test ./...`、`npm run build`、`npm test`、esbuild 语法检查全通过；`.docs/08-29-v2/` 同时含 Plan.md 与 Tasks.md |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 行号映射来源 | Go 侧 AST transformer 给 Document 直接子块写 `data-line` | 渲染 HTML 无法反推源码行；goldmark 的 `RenderAttributes` 对 `data-` 前缀属性无条件放行，无需改各节点渲染器与属性过滤器 | 前端正则匹配渲染结果（raw HTML 破坏顺序）；Go 另出「行号数组」按序号对齐 DOM（链接定义不产元素、HTML 块可能产多元素，序号必然错位） |
| 标注粒度 | 仅 Document 直接子块 | 一个块一个号，位置唯一不重叠；无需前端去重与最小间距过滤 | 深度优先标注所有块级节点：列表项与其子段落几乎同 y，数字堆叠，必须再写一套去重+间距过滤逻辑 |
| 行号栏渲染方式 | CSS `::before { content: attr(data-line) }` + 绝对定位，样式放在预览主题样式表 | 零 JS 定位；行号随重排/换行/窗口缩放自动跟随；天然随文档滚动，无需 scroll 同步与每次渲染重建 | 父窗口行号列 + JS 测高 + scroll 事件同步：需逐个块 `getComputedStyle`/`getBoundingClientRect`，每次渲染重建 DOM，滚动同步易抖动 |
| 行号栏位置 | 画在预览文档 body 的左内边距内（2.75rem） | 不占额外列，不改动预览列 DOM 结构；Split 下 body 宽度撑满，视觉上就在预览列左缘 | 在预览列内新增固定行号列容器（需包一层 flex 容器，改动 iframe 布局链路） |
| 行号栏显示范围 | 预览列可见即显示（Split 与 Preview 单栏），由帧 body 上的类开关控制 | 用户确认两个模式都显示；Preview 单栏下点击只滚动被隐藏的编辑器，属已知可接受行为 | 仅 Split 显示（用户已否决） |
| 代码块行号覆盖 | 用 `WithWrapperRenderer` 在代码块外输出 `<div class="md-line" data-line="N">` 包装层，**不动任何 chroma 格式化选项** | chroma 的 `<pre>` 开标签不受我们控制，包装层是唯一注入点；外边距折叠使包装层边框盒顶边与 `<pre>` 边框盒顶边重合，行号定位不偏移；Chroma 输出零变化（行包装 span 与 `<pre>` 开标签逐字保持） | 自写 `<pre>` 并配 `PreventSurroundingPre(true)`（该开关同时置位 `preventSurroundingPre`，会连带删除行包装 span `<span class="line"><span class="cl">`，并使 `hl_lines`/`linenos` 的渲染路径失效——「逐字节一致」不可能成立） |
| 代码块 info-string 属性 | 变换器标注围栏块前，先用 goldmark 导出的 `parser.ParseAttributes` 重新解析 info 串的 `{...}` 并合入节点 | goldmark-highlighting 的 `getAttributes` 在节点已有属性时完全跳过 info 串解析，直接写 `data-line` 会静默丢弃 `{nohl=true}`/`{style=...}`；合入只需一次导出函数调用，且可用 `nohl` 用例机械断言 | 记为已知限制（静默破坏现有语法，与零回归目标冲突） |
| 点击命中判定 | 帧内 click 用坐标判定（x 小于内容左边界即行号栏，再按 y 定位块） | 不依赖伪元素是否接收点击，跨版本稳定 | 依赖伪元素命中事件（`::before` 的命中行为跨版本有差异） |
| 点击后滚动方式 | Editor 用 CodeMirror 的 `scrollIntoView` effect（瞬时，自带二次校正）；Preview 用 `scrollIntoView({behavior:'smooth', block:'start'})` | CM 无平滑滚动 API，且视口外行高为估算值，自行算 scrollTop 平滑滚动会落点失准且无法校正 | 自行估算 scrollTop + smooth（长文档换行时落点偏差无法修正） |
| 点击副作用 | 只滚动，不改光标/选区、不改焦点 | 避免在编辑中途丢失光标位置（CM 的 mousedown 处理器只挂在 contentDOM，行号槽点击本就不会触发选区） | 点击同时把光标移到该行：会打断正在输入的位置 |
| 编辑器行号槽事件绑定 | 直接监听 `cm.scrollDOM` 的 mousedown | CM 的 `EditorView.domEventHandlers` 只挂在 `contentDOM`，行号槽是它的兄弟节点，事件根本到不了 | 用 `EditorView.domEventHandlers({ click })` + `closest('.cm-lineNumbers')`（永远不触发） |
| 折叠功能处理 | `foldGutter()` 换为 `codeFolding()`，保留 `foldKeymap` | 满足「行号栏不再承担折叠」，同时不损失键盘折叠能力（`foldGutter` 内部才带 `codeFolding`，两者一起删会让快捷键变成死键） | 同时删除 `foldGutter` 与 `foldKeymap`（无谓地放弃功能） |
| 启动默认模式 | Preview | 用户确认：顺序首位即默认。启动先落阅读态，与「顺序调整」一并交付 | 保持 Split（用户已明确选择 Preview） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `data-line` 覆盖率不完整：goldmark 的 HTML 块与缩进代码块渲染器忽略节点属性 | 🟡 中 | 这两类块不打标，行号栏在该块处跳过，跳转回退到最近的前序锚点；Phase 5 记录为已知限制 |
| 代码块外包一层 div 可能改变块间距 | 🟢 低 | 外边距折叠使包装层边框盒顶边与 `<pre>` 顶边重合；`base.css` 无任何 `>` 子选择器（已核实），间距规则不受影响；单测断言行包装 span 与 `<pre>` 开标签与现状一致，间距在 Windows 端目视确认 |
| 升级 chroma / goldmark-highlighting 后包装层与 `<pre>` 结构漂移 | 🟢 低 | 单测直接断言 `<div class="md-line" data-line>` 后紧跟 `<pre class="chroma">`，结构一变即红 |
| 行号画在 body 左内边距内，超长文档（≥5 位行号）可能溢出 | 🟢 低 | 行号字号 0.78rem，4 位以内完全落在 2.75rem 内边距中；超限仅视觉溢出，不影响布局 |
| 行号与首行文字的垂直对齐受块内边距影响 | 🟢 低 | 行号盒顶对齐块内容盒顶，仅 `pre`/`blockquote` 补偿其上内边距；其余块误差约 2px |
| 跳转粒度是渲染块而非单行 | 🟢 低 | 多行块内部的行只能把整块置顶，属映射粒度固有限制，写入文档 |
| 图片等异步资源改变块高后行号位置会过期 | 🟢 低 | 行号由 CSS 跟随重排，无需重建；下次渲染即修正 |

## 5. Phase 依赖关系

```
Phase 1 ──→ Phase 3 ──┐
                      ├─→ Phase 4 ──→ Phase 5
Phase 2 ──────────────┘
```

- Phase 1 与 Phase 2 相互独立，可并行。
- Phase 3 依赖 Phase 1 的 `data-line`。
- Phase 4 同时依赖 Phase 2（映射）与 Phase 3（可点击区域）。
- Phase 5 收口。

---

> ### Task 拆解预览
>
> | Phase | Task 数 | 示例 Task |
> |-------|---------|-----------|
> | Phase 1 | 3 | 行号 AST 变换与注册、围栏代码块补齐、公式块补齐 |
> | Phase 2 | 2 | gutter 纯函数模块、Node 原生测试 |
> | Phase 3 | 2 | 行号栏样式、Split 显示开关 |
> | Phase 4 | 3 | 模式按钮顺序、折叠槽下线、双向跳转 |
> | Phase 5 | 2 | 更新 Project.md、全链路回归与归档 |
>
> **总计**：12 个 Task，详见 `Tasks.md`。

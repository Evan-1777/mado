# Plan：前端 Fluent 风格完全重构

**状态**：DONE  
**日期**：2026-09-25  
**版本**：v1.4  
**回归测试结论**：`npm test`、`GOCACHE=/tmp/mado-go-build-cache go test ./...` 与 `npm run build` 全部通过；Windows 原生交互 4 项待 Windows 桌面验收。

---

## 1. 背景与目标

当前 Mado 前端界面采用 Zinc 调色板，在 Windows 11 桌面环境下缺乏原生 Fluent 质感与层次。本次重构依据 `fluent-design` 与 `frontend-design` 规范及多轮批判性审阅结论，完全转向 Microsoft Fluent 2 设计体系，重塑排版结构与组件关系。坚决避免过度设计（不层层堆砌复杂材质滤镜，不使用脉冲光晕等冗余动画）与过度安全防御（维持既有安全与 Markdown 渲染契约不变），达成以下目标：

- **两端令牌一致性契约**：在外壳与预览独立样式表中建立统一的 Microsoft 经典品牌蓝（`#0078D4`）、Segoe UI 字阶、4~8px 规整圆角与标准投影；确保两端灰阶与色彩严格一致，由自动化测试守住一致性契约。
- **克制自然的空间排版**：采用克制的 Fluent 2 视觉层级，保持主工作区干净纯粹，消除无增量界面噪声；统一 44px 标题栏与 40px 工具栏。
- **状态渐进呈现与错误保真**：重构状态栏反馈逻辑，就绪/已保存状态极简隐身，未保存（脏状态）以静态警示色显式提示（不增加持续脉冲动画），打开/保存/渲染失败等错误状态保持常驻醒目可见。
- **大纲排版与实用调宽**：目录侧栏标题层级标识（H1~H6）小型化移至每行右上角，消除前置挤压；提供轻量、受控的侧栏宽度鼠标与键盘微调能力（限定范围 160px~420px）。
- **规范控件序列**：标题栏操作按钮严格收敛为用户确认的「新建、打开、主题、保存、设置」标准顺序。
- **轻量零依赖与验证闭环**：维持原生 CSS Custom Properties 方案，不引入外部组件库；结合自动化契约测试与 Windows 手动交互核对，保证构建、测试与桌面交互完全通过。

<div style="border: 1px solid #383838; border-radius: 8px; padding: 14px 16px; margin: 16px 0; background: #202020; font-family: 'Segoe UI', sans-serif; color: #ffffff;">
  <div style="font-weight: 600; font-size: 13.5px; margin-bottom: 10px; color: #479ef5;">Fluent 2 规范化重构重点矩阵</div>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12.5px;">
    <div style="border: 1px solid #383838; border-radius: 4px; padding: 8px; background: #282828;">
      <span style="font-weight: 600; color: #60cdff;">双端令牌严格对齐</span>：暗色画布统一 #1f1f1f / 边框 #383838；浅色画布统一 #ffffff / 边框 #e0e0e0
    </div>
    <div style="border: 1px solid #383838; border-radius: 4px; padding: 8px; background: #282828;">
      <span style="font-weight: 600; color: #60cdff;">标题栏按钮顺序</span>：新建 ➔ 打开 ➔ 主题 ➔ 保存 ➔ 设置（严格匹配用户业务序列）
    </div>
    <div style="border: 1px solid #383838; border-radius: 4px; padding: 8px; background: #282828;">
      <span style="font-weight: 600; color: #60cdff;">状态栏按需显式</span>：平时隐身，未保存静态醒目，错误状态常驻可读
    </div>
    <div style="border: 1px solid #383838; border-radius: 4px; padding: 8px; background: #282828;">
      <span style="font-weight: 600; color: #60cdff;">侧栏大纲与调宽</span>：右上角微缩 H 标 + 160~420px 受控拖拽与键盘微调
    </div>
  </div>
</div>

---

## 2. 阶段划分

### Phase 1：Fluent 2 基础设计令牌与双端一致性契约

| 项目 | 内容 |
|------|------|
| **输入** | `frontend-design` 与 `fluent-design` 规范要求、现有外壳与预览样式文件 |
| **输出** | 规范化且两端完全对称的 Fluent 2 色彩阶、四档深度阴影、标准字阶栈、双主题映射体系 |
| **验收标准** | 消除一切数值自相矛盾；外壳 `--pane-bg`/`--border`/`--selection-bg` 与预览 `--bg`/`--border`/`--selection-bg` 严格完全一致；两端测试断言目标值单一明确 |

### Phase 2：应用外壳（标题栏 / 工具栏 / 目录侧栏）排版重构

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 的设计令牌系统、原生无边框窗口约束、确定的动作按钮序列 |
| **输出** | 重构后的 44px 标题栏（按「新建、打开、主题、保存、设置」排序）、Windows 11 原生风格控制区、40px 命令工具栏、Fluent Pivot 分段控件、渐进式隐身状态指示器、带右上角微标及轻量调宽的目录侧栏 |
| **验收标准** | 标题栏按钮顺序与 DOM id 映射完全正确；状态栏在就绪态隐身、未保存态静态警示、错误态显式可见；侧栏 H 标位于右上角且字阶紧凑；展开态支持 160~420px 范围平滑拖拽与键盘调节，折叠态保持 40px 导轨 |

### Phase 3：主工作区、CodeMirror 编辑器与预览排版重构

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 & 2 的外壳框架、既有 CodeMirror 与 goldmark 渲染结构 |
| **输出** | 纯净规整的工作区容器样式、符合 Fluent 规范的 CodeMirror 表面定制、美观规范的 Markdown 预览排版 |
| **验收标准** | 工作区不添加任何多余装饰性顶栏；活动行与文本选区保持半透明且高对比度；Markdown 标题、引用、表格、代码块具备 Fluent 排版质感；保持 iframe sandbox 与原地更新机制零扰动 |

### Phase 4：模态对话框与 Fluent 交互控件重构

| 项目 | 内容 |
|------|------|
| **输入** | 原生 `<dialog>` 标记、设置与关闭确认交互逻辑 |
| **输出** | Fluent 模态卡片样式、半透明遮罩、Fluent 切换开关、Fluent 分段单选、Fluent 带焦点下划线的输入框 |
| **验收标准** | 对话框保持原生 Esc、Tab 焦点捕获与返回值契约；控件具备明确的 Hover、Active、Focus-visible 状态；视觉细节达到成品级标准 |

### Phase 5：测试契约同步与双端全量回归验证

| 项目 | 内容 |
|------|------|
| **输入** | 重构后的全部前端代码与主题样式、既有自动化测试套件 |
| **输出** | 同步更新的 Go 预览令牌断言、Node 原生 UI 契约自检用例（包含新按钮顺序契约与新调色板断言）、Windows 交互手动检查核对记录 |
| **验收标准** | `npm test` 全部通过；`go test ./...` 全部通过；`npm run build` 打包正常；完成 Windows 窗口拖动、按钮响应与侧栏拖拽的交互验收 |

---

## 3. 架构决策

<div style="border: 1px solid #383838; border-radius: 8px; overflow: hidden; margin: 16px 0;">
  <table style="width: 100%; border-collapse: collapse; font-family: 'Segoe UI', sans-serif; font-size: 13px; color: #d1d1d1; background: #272727;">
    <thead>
      <tr style="background: #202020; border-bottom: 1px solid #383838;">
        <th style="padding: 10px 12px; text-align: left; color: #ffffff;">决策项</th>
        <th style="padding: 10px 12px; text-align: left; color: #ffffff;">选定方案</th>
        <th style="padding: 10px 12px; text-align: left; color: #ffffff;">决策理由</th>
        <th style="padding: 10px 12px; text-align: left; color: #ffffff;">备选方案及未采纳原因</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom: 1px solid #383838;">
        <td style="padding: 10px 12px; font-weight: 600; color: #ffffff;">跨端令牌维护</td>
        <td style="padding: 10px 12px; color: #479ef5;">双端一致性契约 + 自动化断言守护</td>
        <td style="padding: 10px 12px;">客观承认独立 iframe 带来的双样式表物理隔离现实，以严格单测断言守住两端色值对齐，避免为形式上的单源而引入复杂代码生成器</td>
        <td style="padding: 10px 12px;">构建期动态代码生成（过度工程化，增加构建链脆弱性）</td>
      </tr>
      <tr style="border-bottom: 1px solid #383838;">
        <td style="padding: 10px 12px; font-weight: 600; color: #ffffff;">工作区结构范围</td>
        <td style="padding: 10px 12px; color: #479ef5;">纯净卡片表面，不增删虚构元素</td>
        <td style="padding: 10px 12px;">纠正审阅指出的“删除不存在的内嵌工具栏”偏差，聚焦现有容器样式的规整化</td>
        <td style="padding: 10px 12px;">在 DOM 中生造工具栏再写删除逻辑（过度设计且无意义）</td>
      </tr>
      <tr style="border-bottom: 1px solid #383838;">
        <td style="padding: 10px 12px; font-weight: 600; color: #ffffff;">状态反馈呈现</td>
        <td style="padding: 10px 12px; color: #479ef5;">平时隐身，未保存静态警示，错误常驻</td>
        <td style="padding: 10px 12px;">摒弃脉冲动画避免视觉骚扰；未保存采用静态黄色警示；失败信息显式常驻，确保异常可读</td>
        <td style="padding: 10px 12px;">持续脉冲光晕（过度动态表现，与桌面工具沉浸感冲突）</td>
      </tr>
      <tr style="border-bottom: 1px solid #383838;">
        <td style="padding: 10px 12px; font-weight: 600; color: #ffffff;">交互扩展边界</td>
        <td style="padding: 10px 12px; color: #479ef5;">仅保留轻量侧栏拖拽与键盘支持</td>
        <td style="padding: 10px 12px;">落实用户明确标注的“支持拖动调整左右栏比例”，收敛在侧栏范围（160~420px），支持键盘微调</td>
        <td style="padding: 10px 12px;">全面加装多重分栏分割器与重度拖拽框架（破坏 CodeMirror 50% 测算与视口一致性）</td>
      </tr>
      <tr>
        <td style="padding: 10px 12px; font-weight: 600; color: #ffffff;">安全边界契约</td>
        <td style="padding: 10px 12px; color: #479ef5;">严格保持现状，不增加多余防御</td>
        <td style="padding: 10px 12px;">遵循审阅意见，UI 视觉改造不改动 Markdown 渲染与 iframe 安全沙箱，不叠床架屋</td>
        <td style="padding: 10px 12px;">顺带添加额外 CSP 策略或 HTML 二次净化（违反规范克制准则，扩大破坏面）</td>
      </tr>
    </tbody>
  </table>
</div>

---

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 标题栏按钮顺序与令牌值调整导致测试套件红灯 | 🟡 中 | 将 Phase 5 测试契约同步设为关键节点，集中同步更新 `uiContract.test.mjs` 与 `theme_test.go` |
| 侧栏拖拽在鼠标移出窗口或滑入 iframe 时中断 | 🟢 低 | 使用标准 `setPointerCapture` 或在全局 window 上监听 `pointerup`/`pointermove`，不引入复杂侵入式遮罩 |
| 侧栏微缩角标在超长标题行产生文字重叠 | 🟢 低 | 为大纲项设定 `padding-right: 28px`，标题文本声明 `overflow: hidden; text-overflow: ellipsis;` |
| Windows 桌面原生交互（无边框窗口拖动、窗口控制）受 CSS 样式层叠干扰 | 🟢 低 | 维持既有 `--wails-draggable: drag` 与 `--wails-draggable: none` 明确分离，在 Phase 5 纳入明确手动验收项 |

---

## 5. Phase 依赖关系

```
Phase 1: 令牌体系与双端对齐
   │
   ├───────────────┬───────────────┐
   ▼               ▼               ▼
Phase 2: 外壳排版   Phase 3: 内容排版   Phase 4: 模态控件
   │               │               │
   └───────────────┼───────────────┘
                   ▼
         Phase 5: 契约测试同步与双端全体验收
```

- **Phase 1** 为基础，必须首先执行；
- **Phase 2、3、4** 专注于不同视觉区域，依赖 Phase 1 的令牌定义，彼此正交；
- **Phase 5** 依赖所有前端与样式变更完成，统一对齐测试契约，执行自动化测试与 Windows 桌面交互手动检查。

---

### Task 拆解预览

| 阶段 | 任务数 | 覆盖范围 | 核心交付 |
|------|--------|----------|----------|
| Phase 1 | 2 | 基础调色板与语义令牌、预览端令牌同步 | 消除数值冲突，两端双样式表严格对称 |
| Phase 2 | 3 | 标题栏按新序重构、工具栏与状态反馈、目录右上角微标与轻量调宽 | 新按钮序列、状态栏按需显式与错误保真、可访问侧栏调宽 |
| Phase 3 | 2 | 纯净工作区卡片样式、CodeMirror 表面与预览排版 | 无多余噪声，精致 Segoe UI 与 Cascadia Code 呈现 |
| Phase 4 | 2 | Fluent 模态对话框、设置交互表单控件 | 优雅遮罩、标准 Toggle、带焦点线的输入框 |
| Phase 5 | 3 | Go 令牌单测更新、Node 契约自检更新、全量编译与 Windows 交互验收 | 双端测试 100% 通过 + 桌面原生交互闭环 |

**总计精简为**：12 个高内聚原子 Task。具体定义详见 `Tasks.md`。

# Plan：顶栏窗口拖拽区域与双击最大化交互修复

**状态**：DONE  
**日期**：2026-11-14  
**完成日期**：2026-11-14  
**版本**：v1.0  
**回归测试结论**：本机验证链全绿——`npm run typecheck`、零产物 esbuild 语法检查、`npm test`（6 项自检）、`npm run build`、`CGO_ENABLED=0 go vet ./...` 与 `CGO_ENABLED=0 go test ./...`（5 包）、`go test -race ./...`、`mygo generate`（输出 "frontend/src/mygo.ts is up to date"）及三项 dev-only 无头检查（startup 14 项 / modeScroll 4 项 / export 5 项）退出码均为 0；新增 `top-bar-drag-regions` 几何命中检查已通过向构建产物注入 `.app-bar-leading` 反向 `no-drag` 的负向实验确认可捕获回归  

---

## 1. 背景与目标

当前桌面窗口采用隐藏系统标题栏与原生按钮的承载方式，由前端绘制单层顶栏承接窗口拖拽与控制功能。经根因溯源，顶栏无法拖动窗口并伴随潜在双击冲突的结构性原因有两项：

1. **弹性布局容器阻断拖拽属性继承**：宿主运行时通过读取目标元素的计算样式自定义属性判定是否为窗口拖拽区，该属性默认沿文档树向下继承。当前顶栏根容器虽声明为拖拽区，但其下属左、中、右三个弹性布局分组容器均被声明为非拖拽区；由于左、右分组容器通过弹性伸展占满了顶栏除微小间隙外的全部水平空间，且窗口上边缘首段像素归属系统原生纵向缩放热区，导致文档标题、状态徽标与两侧空白区域全部命中非拖拽区，用户无法按住顶栏移动窗口。
2. **顶栏双击缩放存在宿主与前端双重触发**：宿主注入脚本已在拖拽区域的鼠标左键二次按下阶段原生调用系统标题栏双击缩放逻辑，并通过窗口尺寸变化事件通知前端同步图标与边距；前端协调层额外绑定的顶栏双击事件监听在拖拽属性修复后会与宿主原生动作顺序叠加，造成窗口最大化后被异步二次切换立即还原。

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 16px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e8ec;">顶栏命中区域结构对比</div>
  <div style="display: grid; gap: 12px; font-size: 12px; line-height: 1.5;">
    <div style="border: 1px solid #e0b4b4; border-radius: 8px; padding: 12px; background: #fff8f8;">
      <div style="font-weight: 600; color: #9f2d2d; margin-bottom: 6px;">修复前：布局容器整体设为非拖拽，吞没全部空白区域</div>
      <div style="display: flex; gap: 4px; align-items: center; padding: 6px; border: 1px dashed #c8cfd8; border-radius: 6px; background: #eef0f4;">
        <div style="flex: 1; padding: 6px 8px; background: #f8d7da; border: 1px solid #e0b4b4; border-radius: 4px; text-align: center;">左布局组（非拖拽：侧栏钮 + 标题 + 状态 + 左侧整片空白）</div>
        <div style="padding: 6px 10px; background: #f8d7da; border: 1px solid #e0b4b4; border-radius: 4px;">中布局组（非拖拽）</div>
        <div style="flex: 1; padding: 6px 8px; background: #f8d7da; border: 1px solid #e0b4b4; border-radius: 4px; text-align: center;">右布局组（非拖拽：右侧整片空白 + 工具钮 + 窗口钮）</div>
      </div>
    </div>
    <div style="border: 1px solid #b7d7c2; border-radius: 8px; padding: 12px; background: #f6fbf8;">
      <div style="font-weight: 600; color: #1f6b3b; margin-bottom: 6px;">修复后：布局容器透传拖拽继承，仅实际交互控件独立排除</div>
      <div style="display: flex; gap: 6px; align-items: center; padding: 6px; border: 1px solid #86efac; border-radius: 6px; background: #dcfce7;">
        <span style="padding: 4px 8px; background: #ffffff; border: 1px solid #94a3b8; border-radius: 999px;">侧栏钮（非拖拽）</span>
        <span style="flex: 1; text-align: center; color: #166534; font-weight: 500;">标题 · 状态 · 左侧空白（继承拖拽）</span>
        <span style="padding: 4px 10px; background: #ffffff; border: 1px solid #94a3b8; border-radius: 999px;">模式分段组（非拖拽）</span>
        <span style="flex: 1; text-align: center; color: #166534; font-weight: 500;">右侧空白 · 分隔线（继承拖拽）</span>
        <span style="padding: 4px 8px; background: #ffffff; border: 1px solid #94a3b8; border-radius: 999px;">工具钮与窗口钮（非拖拽）</span>
      </div>
    </div>
  </div>
</div>

本次修复目标如下：
- 恢复顶栏全部非交互区域（左右弹性空白区、文档标题、状态胶囊、视觉分隔线）的窗口拖拽与原生双击最大化/还原能力。
- 确保顶栏内所有交互控件（侧栏折叠按钮、视图模式分段控件、工具栏图标按钮、窗口最小化/最大化/关闭按钮）精确排除在拖拽区之外，点击、悬停与键盘聚焦互不干扰。
- 消除顶栏双击最大化的前后端重复处理链路，并补充静态样式契约与无头浏览器真实坐标命中校验，防止回归。

---

## 2. 阶段划分

### Phase 1：顶栏拖拽继承链路与双击职责归位

| 项目 | 内容 |
|------|------|
| **输入** | 现有顶栏样式表与顶层前端协调模块 |
| **输出** | 布局容器透传拖拽属性、交互控件精准声明非拖拽的顶栏样式规则，以及移除重复双击监听后的协调逻辑 |
| **验收标准** | 顶栏空白区域、标题与状态区计算样式均为拖拽态，全部按钮与分段控件计算样式均为非拖拽态；无冗余双击事件绑定；前端静态类型检查与打包构建零错误通过 |

### Phase 2：契约回归测试、无头几何命中校验与文档同步

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 更新后的前端样式、协调逻辑及现有测试套件与项目基准文档 |
| **输出** | 锁定顶栏拖拽继承与无重复双击绑定的静态契约断言、在应用默认窗口尺寸下采样顶栏真实布局坐标验证拖拽/非拖拽命中的无头检查用例，以及同步后的项目说明文档 |
| **验收标准** | 前端全套自检、后端全包静态检查/单元测试/竞态测试、绑定契约生成校验及全部三项无头浏览器检查退出码均为 0 |

---

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| **顶栏拖拽区域划分方式** | 顶栏根部声明拖拽，布局分组容器保持透明继承，仅在图标按钮、模式分段条与窗口控制区声明非拖拽 | 顺应自定义属性的级联继承机制，无需改动文档节点结构即可让标题、状态徽标与全部弹性空白区自然成为拖拽手柄，差分最小且无视觉扰动 | 在布局容器内额外插入占位拖拽节点（增加无语义节点，且标题与状态胶囊仍会形成拖拽死区） |
| **顶栏双击缩放控制权** | 统一交由宿主桥接层的拖拽区原生双击处理，删除前端协调层的手工双击监听 | 宿主桥接在左键二次按下时直接调用原生标题栏双击接口，随后通过既有窗口尺寸变化监听自动同步最大化类名与图标，单一链路无竞态 | 保留前端双击监听并加时间窗去重（违背单一职责原则，人为引入跨层时序耦合与脆弱防抖） |
| **回归防线设计** | 同时在静态契约测试与无头浏览器启动检查中增加断言，并将无头检查视口对齐应用默认窗口宽度 | 静态契约锁定源码级规则不被误改；默认窗口宽度下左右弹性区同时具备真实伸展空白带，坐标命中测试可直接验证弹性容器自身的级联结果 | 仅做源码字符串匹配或在过窄默认视口下测试（右侧弹性容器被压缩至最小内容宽度时无法采样验证右侧空白带） |

---

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| **分段控件边框或按钮内嵌图标误触发窗口拖拽** | 🟡 中 | 在模式分段外框容器、图标按钮及窗口控制簇容器上声明非拖拽属性，使内部矢量图形与文本标签完整继承非拖拽状态，并在无头浏览器中对控件中心点执行坐标命中校验 |
| **移除前端双击监听后最大化图标或外边距未同步** | 🟢 低 | 核实既有窗口尺寸变化监听链路：原生最大化与还原均会触发视口尺寸变更事件，前端在防抖回调中查询宿主最大化状态并更新根容器类名与还原/最大化图标 |
| **窗口上边缘原生纵向缩放热区受影响** | 🟢 低 | 保持宿主窗口隐藏标题栏配置零改动，系统非客户区上边缘缩放命中优先于页面客户区事件分发 |

---

## 5. Phase 依赖关系

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 14px 16px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="display: flex; align-items: center; gap: 12px; font-size: 12px;">
    <div style="flex: 1; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 1 · 拖拽继承链路与双击职责归位</div>
      <div style="color: #4b5563; margin-top: 2px;">修正顶栏样式级联范围并移除冲突双击监听</div>
    </div>
    <div style="color: #6b7280; font-weight: 600;">──▶</div>
    <div style="flex: 1; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 2 · 契约断言、几何命中验证与文档同步</div>
      <div style="color: #4b5563; margin-top: 2px;">验证计算样式与盒模型命中并刷新基准文档</div>
    </div>
  </div>
</div>

Phase 1 与 Phase 2 严格串行：须先完成顶栏样式与事件清理并生成最新前端构建产物，Phase 2 的静态契约测试与无头浏览器真实坐标命中检查方可针对新产物执行验证。

---

## 6. Subagent 协同规划

对照三维效益模型（任务复杂度、任务上下文关联程度、经济与时间效益）评估交付段委托需求：

| 阶段 | 上下文依赖 | 并行收益 | 执行主体 | 决策理由 |
|------|-----------|---------|----------|----------|
| **Phase 1：顶栏拖拽继承与双击归位** | 强（直接依赖宿主桥接级联机制与选择器结构） | 无（改动高度集中，仅涉及两处核心前端实现） | 主线 | 有效差分不足二十行，交付段主线直接修改远低于子代理冷启动读盘成本 |
| **Phase 2：契约回归测试与文档同步** | 强（测试选择器与坐标采样紧耦合 Phase 1 样式规则与构建产物） | 无（严格依赖 Phase 1 构建完成） | 主线 | 串行验证链路短，交付段主线一次性跑通全套静态与无头测试最稳健高效 |

> **协同结论**：本次缺陷修复范围聚焦、跨文件契约紧密且呈严格串行依赖，派发子代理会产生重复加载上下文的额外开销而无并行加速收益，故两阶段全部保留由交付段**主线**顺序执行。

---

> ### Task 拆解预览
>
> 以下仅示意 Plan 与 Task 的衔接关系，实际原子执行单元详见 `Tasks.md`。Plan 在此止步，不再展开具体文件与代码实现细节。
>
> | Phase | 预估 Task 数 | 执行主体 | 核心交付内容概览 |
> |-------|-------------|----------|------------------|
> | Phase 1 | 2 | 主线 | 修正顶栏布局容器与交互控件的拖拽样式属性边界、移除顶层协调器重复的顶栏双击监听 |
> | Phase 2 | 2 | 主线 | 补充静态契约测试与无头浏览器顶栏坐标命中校验、执行全链路回归测试并维护项目文档 |
>
> **总计预估**：4 个 Task。每个 Task 的状态、执行主体、目标路径、实施细节、验收标准与依赖关系在 `Tasks.md` 中独立定义。

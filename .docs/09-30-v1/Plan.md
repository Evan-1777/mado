# Plan：窗口状态记忆与剪贴板体验升级

**状态**：DONE  
**日期**：2026-09-30  
**版本**：v1.13  
**回归测试结论**：全量 Go 单元测试、并发竞态检测（-race）、前端 UI 契约测试与无头端到端回归（startup.check.mjs）100% 通过，零回归与并发竞争，全部 8 项 Task 均已验证通过。

---

## 1. 背景与目标

当前 Mado 作为 Windows 原生轻量 Markdown 编辑器，在日常使用中存在三项体验缺陷：
1. **窗口大小无法记忆**：每次启动均以硬编码 1280×800 开启，用户自定义调整的窗口尺寸或最大化偏好在关闭后丢失，需重复手动调整。
2. **复制内容未进系统剪贴板历史**：代码块点击复制虽然可正常粘贴，但未被 Windows 10/11 的剪贴板历史面板（Win+V）捕获记录，影响跨应用与多段内容协同流转。根因在于底层调用采用无主空句柄写入，被系统剪贴板历史服务过滤。
3. **复制按钮视觉占用过大**：围栏代码块右上角的「复制代码」文字按钮横向占位过长（约 70px），在短代码段或窄视口下容易遮挡代码行，排版不够紧凑克制。

本次演进旨在解决上述体验断点，实现以下目标：
- 完整记忆窗口常规尺寸与最大化状态，启动时精准恢复，且最大化与常规尺寸解耦，还原时不被全屏尺寸冲垮。
- 建立原生应用主窗口句柄归属的剪贴板写入管道，使代码块复制内容自然进入 Windows 剪贴板历史记录。
- 将代码块复制控件升级为 Fluent 2 规范的紧凑 SVG 图标按钮，悬浮显现，大幅降低视觉噪音与空间遮蔽。

---

## 2. 阶段划分

<div style="border: 1px solid #d0d7de; border-radius: 8px; padding: 16px; margin: 16px 0; background: #fafafa; font-family: sans-serif;">
  <div style="font-weight: 600; margin-bottom: 12px; color: #24292f;">实施阶段推进路线（支持并行解耦）</div>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
    <div style="border: 1px solid #0969da; border-radius: 6px; padding: 12px; background: #ddf4ff; color: #0969da;">
      <div style="font-weight: 600; margin-bottom: 4px;">Phase 1（可并行）</div>
      <div style="font-size: 13px; color: #1f2328;">设置模型与后端窗口状态持久化</div>
    </div>
    <div style="border: 1px solid #1a7f37; border-radius: 6px; padding: 12px; background: #dafbe1; color: #1a7f37;">
      <div style="font-weight: 600; margin-bottom: 4px;">Phase 2（可并行）</div>
      <div style="font-size: 13px; color: #1f2328;">剪贴板复制升级（SVG 图标与宿主句柄集成）</div>
    </div>
  </div>
  <div style="display: flex; justify-content: center; margin: 8px 0; font-weight: bold; color: #57606a;">⬇ 汇合流转</div>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
    <div style="border: 1px solid #9a6700; border-radius: 6px; padding: 12px; background: #fff8c5; color: #9a6700;">
      <div style="font-weight: 600; margin-bottom: 4px;">Phase 3（串行汇合）</div>
      <div style="font-size: 13px; color: #1f2328;">前端窗口尺寸感知、防抖与异步退出刷盘</div>
    </div>
    <div style="border: 1px solid #8250df; border-radius: 6px; padding: 12px; background: #fbefff; color: #8250df;">
      <div style="font-weight: 600; margin-bottom: 4px;">Phase 4（最终验收）</div>
      <div style="font-size: 13px; color: #1f2328;">前端交互 Demo、全量自动化验证与回归测试</div>
    </div>
  </div>
</div>

### Phase 1：设置模型与后端窗口状态持久化

| 项目 | 内容 |
|------|------|
| **输入** | 既有偏好设置系统与便携化 JSON 存储协议 |
| **输出** | 扩展窗口常规宽高与最大化标志存储，应用启动前预读并注入原生窗口选项，提供正交独立的尺寸与最大化写入通道 |
| **验收标准** | 偏好文件正确记录与反序列化窗口逻辑尺寸，越界或缺省尺寸平滑回退，既有偏好字段与并发锁不受扰动 |

### Phase 2：剪贴板复制升级（SVG 图标与宿主句柄集成）

| 项目 | 内容 |
|------|------|
| **输入** | Markdown 围栏代码包装层渲染机制、外壳预览样式与底层原生窗口句柄识别 |
| **输出** | 紧凑 26×26px SVG 图标复制控件，关联应用顶级窗口句柄的原生剪贴板写入通道，纯 CSS 驱动的对勾状态与无障碍标签 |
| **验收标准** | 复制按钮由文字精简为图标且悬浮显示，点击即时通过应用顶层句柄触发系统剪贴板写入并唤醒 Win+V 记录入库，1.2 秒后平滑还原 |

### Phase 3：前端窗口尺寸感知、防抖与异步退出刷盘

| 项目 | 内容 |
|------|------|
| **输入** | 窗口 Resize 事件监听流、Phase 1 的独立更新通道与关闭确认交互逻辑 |
| **输出** | 前端防抖窗口逻辑尺寸采集，解耦最大化与常规尺寸更新，退出前异步等待落盘完成防竞态 |
| **验收标准** | 连续拖拽缩放平滑防抖落盘，最大化时不冲垮常规尺寸记忆，退出前即时刷盘无状态遗漏 |

### Phase 4：前端交互 Demo、全量自动化验证与回归测试

| 项目 | 内容 |
|------|------|
| **输入** | 前三阶段全部产物与既有测试套件 |
| **输出** | 静态预览 Demo 文件，更新的无头回归与契约测试用例 |
| **验收标准** | 单元测试、UI 契约测试与无头端到端测试全绿通过，Demo 完整展示交互流程与双主题效果 |

---

## 3. 架构决策

<div style="border: 1px solid #d0d7de; border-radius: 8px; padding: 16px; margin: 16px 0; background: #ffffff; font-family: sans-serif;">
  <div style="font-weight: 600; margin-bottom: 12px; color: #24292f;">核心技术决策对照表</div>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
    <thead>
      <tr style="border-bottom: 2px solid #d0d7de; background: #f6f8fa;">
        <th style="padding: 8px;">决策项</th>
        <th style="padding: 8px;">选择方案</th>
        <th style="padding: 8px;">决策理由</th>
        <th style="padding: 8px;">弃用替代方案及原因</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom: 1px solid #d0d7de;">
        <td style="padding: 8px; font-weight: 600;">窗口配置载体</td>
        <td style="padding: 8px;">复用便携式设置存储</td>
        <td style="padding: 8px;">与既有主题、换行、字体偏好同源，避免引入额外状态文件</td>
        <td style="padding: 8px;">操作系统注册表或单独窗体文件（破坏单文件便携性原则）</td>
      </tr>
      <tr style="border-bottom: 1px solid #d0d7de;">
        <td style="padding: 8px; font-weight: 600;">尺寸与最大化解耦</td>
        <td style="padding: 8px;">正交独立方法更新，仅记录常规逻辑尺寸 + 最大化标志</td>
        <td style="padding: 8px;">API 职责明确无冗余参数；防止全屏尺寸冲垮常规窗口宽高，还原时可精准回到用户预设尺寸</td>
        <td style="padding: 8px;">直接存取当前视口宽高（最大化后还原会导致窗口尺寸变为屏幕全屏大小）；合并单一方法并传死参数（违反接口正交与最小原则）</td>
      </tr>
      <tr style="border-bottom: 1px solid #d0d7de;">
        <td style="padding: 8px; font-weight: 600;">剪贴板历史管道</td>
        <td style="padding: 8px;">Go 侧原生管道绑定应用顶层窗口句柄（HWND）</td>
        <td style="padding: 8px;">溯源根因：Windows 剪贴板历史服务通过窗口句柄识别前台应用身份。获取根窗口句柄开启剪贴板并写入数据，可确定性触发 Win+V 入库</td>
        <td style="padding: 8px;">仅依赖浏览器标准剪贴板接口（Chromium 内部句柄非主窗口，无法被剪贴板历史服务识别）；继续使用原生空句柄写入（被识别为无主写入而过滤）</td>
      </tr>
      <tr>
        <td style="padding: 8px; font-weight: 600;">复制按钮呈现</td>
        <td style="padding: 8px;">Fluent 2 规范双状态内联 SVG 控件</td>
        <td style="padding: 8px;">纯 CSS 控制类名显隐切换，零运行时开销，体积缩减 60%，不遮挡短代码行，避免文本赋值销毁 DOM 节点</td>
        <td style="padding: 8px;">纯文本标签按钮（横向占位过大，遮挡右上角代码文本）；运行时动态替换文本（会破坏子元素树）</td>
      </tr>
    </tbody>
  </table>
</div>

---

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 用户将窗口调整至过小或畸形尺寸被持久化 | 🟡 中 | 在设置模块声明命名常量统一维护基线（≥720×520），读取与写入强校验，越界自动回滚至默认基线 |
| 用户频繁拉伸窗口导致频繁磁盘 IO | 🟡 中 | 前端 Resize 事件引入 250ms 尾随防抖，仅在拖拽停止后单次落盘 |
| 快速关闭窗口时异步保存请求被中断 | 🟡 中 | 退出流程中将关闭动作改造为异步等待未决的窗口状态落盘完成后再执行强制退出，消除时序竞争 |
| 非 Windows 平台（如 Linux 测试环境）缺少 Win32 句柄 API | 🟡 中 | 使用构建标签隔离平台实现，非 Windows 平台提供无操作回退桩，保障开发机测试 100% 编译通过 |
| 历史契约测试与无头用例断言基线不匹配 | 🟡 中 | 同步更新测试用例中对复制控件结构、类名、无障碍属性以及剪贴板 Mock 桩的断言基线 |

---

## 5. Phase 依赖关系

<div style="border: 1px solid #d0d7de; border-radius: 8px; padding: 16px; margin: 16px 0; background: #fafafa; font-family: sans-serif;">
  <div style="font-weight: 600; margin-bottom: 8px; color: #24292f;">阶段依赖拓扑图</div>
  <pre style="background: #ffffff; border: 1px solid #e1e4e8; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 13px; line-height: 1.5;">
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│ Phase 1：设置模型与后端持久化   │       │ Phase 2：剪贴板复制升级与句柄   │
└────────────────┬────────────────┘       └────────────────┬────────────────┘
                 │                                         │
                 └───────────────────┬─────────────────────┘
                                     ▼
                    ┌─────────────────────────────────┐
                    │ Phase 3：前端尺寸感知与异步刷盘 │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │ Phase 4：Demo 产出与全量回归    │
                    └─────────────────────────────────┘
  </pre>
</div>

Phase 1 与 Phase 2 彼此解耦，支持并行实施；Phase 3 汇合两者的后端通道与控件状态；Phase 4 执行全量测试与回归验证。

---

> ### Task 拆解预览
>
> | Phase | 预估 Task 数 | 重点关注 |
> |-------|-------------|---------|
> | Phase 1：设置模型与后端持久化 | 2 | 偏好结构扩展、JSON 数字类型断言、最小尺寸常量 SSOT、启动注入解耦 |
> | Phase 2：剪贴板复制升级 | 3 | 渲染器 SVG 结构输出、base.css 紧凑样式、Win32 宿主根句柄剪贴板管道 |
> | Phase 3：前端尺寸感知与异步刷盘 | 1 | 250ms 防抖同步、逻辑尺寸对齐、禁止 textContent 覆写、退出异步等待 |
> | Phase 4：Demo 产出与全量验证 | 2 | 静态交互 Demo、单测/UI契约/无头回归用例全绿 |
>
> **总计预估**：8 个原子 Task，具体实施步骤详见 `Tasks.md`。

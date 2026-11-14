# Plan：宿主框架迁移至 MyGo 与前端 Material Design 3 重构

**状态**：DONE  
**日期**：2026-11-14  
**完成日期**：2026-11-14  
**版本**：v1.1  
**回归测试结论**：本机验证链全绿——`npm run typecheck`、零产物 esbuild 语法检查、`npm test`（6 项自检）、`npm run build`、`CGO_ENABLED=0 go vet ./...`、`CGO_ENABLED=0 go test ./...`（5 包）、`go test -race ./...`、`mygo generate`（输出 "frontend/src/mygo.ts is up to date"）与三项 dev-only 无头检查（startup 13 项 / modeScroll 4 项 / export 5 项）全部通过、退出码 0；全仓排除 .docs 归档、.git 与工具技能定义后无 wails 残留；`app_windows.go` 与 `app_other.go` 零改动；`frontend/wailsjs/` 已删除；云端 Windows 安装/卸载冒烟由 CI 触发后确认

---

## 1. 背景与目标

当前桌面端架构基于 Wails v2 构建，前端界面采用 Fluent 2 视觉风格并将全部视图结构、事件装配与宿主边缘缩放补丁集中在单一入口模块内。本次改造在不删减任何既有核心功能的前提下完成两项结构性演进：

1. **桌面宿主框架迁移至 MyGo**：移除全部 Wails 依赖、构建配置与前端手工缩放胶水层，切换至纯 Go（零 CGO）的 MyGo WebView 模式、类型化服务绑定与事件通道、原生文件对话框、文件关联及内置 NSIS 用户级安装打包链路。
2. **前端全面重构与 Material Design 3（MD3）视觉重塑**：废弃 Fluent 2 材质与旧式双栏顶栏堆叠结构，基于 MD3 色调表面（Tonal Surface）层级、标准排印字阶、全圆角交互构件与渐进披露原则重构模块化前端代码库，并同步统一编辑器、实时预览与独立 HTML 导出的视觉规范。

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 18px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="font-size: 14px; font-weight: 600; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #e5e8ec;">架构演进与跨层通信拓扑</div>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-size: 12px; line-height: 1.55;">
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 12px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 6px;">1. 纯 Go 桌面宿主层（零 CGO）</div>
      <div style="color: #4b5563;">承载应用生命周期、隐藏标题栏窗口（原生圆角/阴影/八向边缘缩放）、命令行与系统文件关联打开、关闭拦截守卫、原生读写对话框及 Win32 剪贴板历史管道。</div>
    </div>
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 12px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 6px;">2. 类型化 IPC 桥接与领域核心层</div>
      <div style="color: #4b5563;">由代码生成器自动产出双向静态类型契约；聚合原子文件读写、便携化配置迁移与持久化、GFM/LaTeX/源行号渲染管线及预览主题样式合成。</div>
    </div>
    <div style="border: 1px solid #d4d7dd; border-radius: 8px; padding: 12px; background: #ffffff;">
      <div style="font-weight: 600; color: #3949ab; margin-bottom: 6px;">3. MD3 模块化前端表面层</div>
      <div style="color: #4b5563;">按职责拆分为运行时桥接、视图骨架、编辑器封装、沙箱预览管线、可调宽目录抽屉与模态弹窗控制器；支持桌面宿主与无头浏览器双环境自检。</div>
    </div>
  </div>
</div>

### 核心特色功能全量保留矩阵（零删减基线）

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 16px; margin: 16px 0; background: #ffffff; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="font-size: 13px; font-weight: 600; margin-bottom: 10px;">12 项既有核心能力及迁移后承接形态</div>
  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 14px; font-size: 12px; line-height: 1.5;">
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>启动无闪烁就绪展示</strong>：窗口默认隐藏并注入持久化主题底色，待真实 DOM 与主题装配完毕后再行显式展示，慢速文件读取不阻塞首屏显现。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>便携化配置与旧版一次性迁移</strong>：设置与最近文件路径持久化于可执行文件同目录，启动只读且自动迁移旧版用户目录配置，绝不创建欢迎文档。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>三视图模式无损切换</strong>：编辑（默认）、预览、分栏三种模式；切换时精确保存并恢复预览视口滚动偏移，重现编辑器时同步重测视口几何尺寸。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>双向源码行号定位跳转</strong>：点击编辑器行号槽平滑滚动预览至对应块；悬停预览左缘浮现行号并点击回跳编辑器对应行首，不干扰光标选区。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>可折叠与无障碍调宽大纲抽屉</strong>：解析 ATX H1–H6 标题（跳过围栏代码块），跨编辑保持展开态，支持全部展开/收起、指针捕获拖拽与键盘方向键步进调宽。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>沙箱增量预览与公式缓存</strong>：80ms 防抖与渲染版本号防乱序，iframe 原地替换样式与正文不重置滚动条，KaTeX 500 条目缓存渲染与锚点平滑跳转。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>代码块复制与原生剪贴板历史</strong>：代码块悬停/聚焦显现复制按钮与 1.2 秒状态回弹，通过 Win32 前台窗口句柄写入系统剪贴板以激活 Win+V 历史记录。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>高保真独立 HTML 导出管线</strong>：支持浅色（打印推荐）/当前主题及标准 20mm/紧凑 10mm/宽松 30mm 页边距，离屏预渲染数学公式并内嵌打印防截断规则。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>未保存修改闭环守卫</strong>：边沿触发脏状态同步；新建、打开、拖放或点击关闭/Alt+F4 时弹出保存/不保存/取消三态确认，保存失败或取消另存为时中止退出。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>拖放打开与文件关联启动</strong>：支持命令行参数、系统文件关联事件与窗口级文件拖放过滤加载 Markdown/文本文件。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>串行化预览字体与偏好设置</strong>：主题（深/浅）、自动换行、LaTeX 开关与预览字体持久化；字体输入采用单飞串行提交器，回车不误触弹窗关闭，非法值自动回滚。</div>
    <div style="padding: 8px 10px; background: #f6f7f9; border-radius: 6px;"><strong>窗口尺寸与最大化状态记忆</strong>：记录正常态宽高（含最小尺寸钳制）与最大化布尔态，最大化启动不污染已保存的常规窗口尺寸。</div>
  </div>
</div>

### Material Design 3 空间架构与 Z 轴色调表面设计

遵循任务导向的三级优先级模型（P0 主画布、P1 上下文探索与即时模态、P2 低频系统偏好）与 MD3 色调表面（Tonal Elevation）原则，去除旧版双层顶栏与毛玻璃投影，改由紧凑单层顶栏与 5 级容器色阶构建深度：

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 18px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e8ec;">MD3 四层 Z 轴表面色阶与信息分区</div>
  <div style="display: grid; gap: 10px; font-size: 12px; line-height: 1.55;">
    <div style="display: grid; grid-template-columns: 170px 1fr; gap: 12px; align-items: center; background: #eef0f4; padding: 10px 12px; border-radius: 8px;">
      <div style="font-weight: 600;">Layer 0 · 基底框架层<br><span style="font-weight: 400; color: #4b5563;">Surface Container</span></div>
      <div>承载桌面窗口外围框架与紧凑单层顶栏背景，提供整体视觉包裹感，取代传统生硬分割线。</div>
    </div>
    <div style="display: grid; grid-template-columns: 170px 1fr; gap: 12px; align-items: center; background: #ffffff; border: 1px solid #dfe2e8; padding: 10px 12px; border-radius: 8px;">
      <div style="font-weight: 600; color: #3949ab;">Layer 1 · P0 主作业画布<br><span style="font-weight: 400; color: #4b5563;">Surface / Container Lowest</span></div>
      <div>编辑器面板与预览面板采用 16px 大圆角独立内嵌卡片容器；分栏模式下以基底色阶间距自然分离双栏，最大化纵向内容视口高度。</div>
    </div>
    <div style="display: grid; grid-template-columns: 170px 1fr; gap: 12px; align-items: center; background: #f4f5f8; border: 1px solid #dfe2e8; padding: 10px 12px; border-radius: 8px;">
      <div style="font-weight: 600;">Layer 2 · P1 导航与顶栏控件<br><span style="font-weight: 400; color: #4b5563;">Surface Container Low / Pill</span></div>
      <div>单层顶栏按「左侧抽屉开关+文档标题+状态胶囊 / 居中全圆角三态分段按钮 / 右侧高频工具图标簇+窗口控制钮」排布；目录侧栏采用胶囊态激活指示条与可拖拽分隔条。</div>
    </div>
    <div style="display: grid; grid-template-columns: 170px 1fr; gap: 12px; align-items: center; background: #e8eaf0; border: 1px solid #cfd4dc; padding: 10px 12px; border-radius: 8px;">
      <div style="font-weight: 600;">Layer 3 · P1/P2 模态对话框<br><span style="font-weight: 400; color: #4b5563;">Surface Container High + Scrim</span></div>
      <div>设置中心、导出配置与未保存确认均采用 28px 超大圆角 MD3 对话框、32% 暗色遮罩、标准 MD3 胶囊轨道开关、描边文本域及右侧对齐的文本按钮/实心主按钮组合。</div>
    </div>
  </div>
</div>

---

## 2. 阶段划分

### Phase 1：宿主框架迁移与后端契约重构

| 项目 | 内容 |
|------|------|
| **输入** | 现有 Go 后端模块、Wails 入口配置与后端单元测试套件 |
| **输出** | 基于 MyGo 纯 Go 架构的应用入口、项目构建描述配置、类型化绑定服务、关闭请求与外部打开文件事件、原生文件对话框与剪贴板适配、生成的 TypeScript 客户端契约及无 Wails 依赖的后端测试套件 |
| **验收标准** | 零 CGO 环境下后端静态检查、全包单元测试与竞态检测全部通过；代码中无任何 Wails 包引用或配置残留；TypeScript 绑定客户端可由工具链确定性生成 |

### Phase 2：Material Design 3 令牌体系与预览主题重塑

| 项目 | 内容 |
|------|------|
| **输入** | Material Design 3 色彩、字阶、圆角、状态层与动效规范，以及现有前端样式与后端内嵌预览主题资产 |
| **输出** | 完整的深浅双色 MD3 系统级 CSS 自定义属性集（色彩角色、排印字阶、形状圆角、缓动时长、交互状态层）、重构后的前端组件样式表，以及与之色调对齐的后端内嵌预览深浅色令牌与排版样式表 |
| **验收标准** | 所有表层组件与预览样式均引用语义化 MD3 令牌，消除 Fluent 硬编码色值、亚克力模糊与非必要阴影；代码块行内选中态对比度、键盘焦点环、复制按钮显隐及独立导出样式契约完整保持 |

### Phase 3：前端模块化重构与全功能装配

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 生成的类型化绑定客户端与运行时接口、Phase 2 建立的 MD3 令牌与样式体系，以及既有纯逻辑工具模块 |
| **输出** | 职责正交的前端模块群（双环境运行时桥接层、MD3 矢量图标库、DOM 骨架与模态构建器、编辑器模块、沙箱预览模块、目录树视图与调宽控制器、模态交互控制器、顶层状态协调入口），并移除全部旧版 Wails 运行时目录与窗口边缘缩放补丁 |
| **验收标准** | 前端依赖安装（含开发依赖）、TypeScript 类型检查、零产物打包检查与生产静态资源构建全部零错误通过；12 项核心特色功能、快捷键、无障碍属性与三态状态指示全部完整接线 |

### Phase 4：测试矩阵对齐、CI 流水线迁移与文档维护

| 项目 | 内容 |
|------|------|
| **输入** | 前三阶段完成的宿主代码、MD3 前端模块与既有测试/工作流配置 |
| **输出** | 适配 MD3 令牌与 MyGo 契约的前端零依赖自检套件、适配 MyGo 桥接模拟对象的无头浏览器冒烟脚本、迁移至 MyGo 构建与 NSIS 校验链路的云端集成与发布工作流、清理后的构建目录及同步更新的项目基准文档 |
| **验收标准** | 后端全量单测与竞态测试通过，前端全部零依赖自检与无头浏览器启动/滚动记忆/导出冒烟检查通过，工作流配置路径与 MyGo 产物结构严格一致，项目文档与代码库真实状态完全同步 |

---

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| **窗口标题栏与边框模型** | 隐藏系统标题栏并隐藏原生标题栏按钮，由页面自绘紧凑 MD3 顶栏与窗口控制按钮 | 同时保留 Windows 11 原生窗口阴影、圆角与包含顶边在内的八向原生缩放能力，彻底消除旧版 60 行手工边缘拦截补丁，且关闭按钮点击可直接走统一脏状态守卫 | 纯无边框模式（在 Windows 下丢失顶边原生缩放与系统圆角阴影，被迫重造前端缩放热区） |
| **前端构建与框架选型** | 保持零框架原生 TypeScript 模块化架构 + esbuild 极速打包 | 契合个人项目轻量低占用定位，零虚拟 DOM 运行时开销，启动首帧最快，且与既有零依赖 Node 原生自检体系无缝兼容 | 引入 React/Vue 或重型 Web Components 库（增加包体积与抽象层级，且官方 Web MD3 组件库处于维护冻结状态） |
| **前端静态资源嵌入方式** | 依托构建配置声明前端产物目录，由 MyGo 构建器通过编译期覆盖层自动注入嵌入文件 | 避免在源码中手写重复嵌入指令导致生产二进制双倍打包静态资源，同时使日常后端单测无需前置构建前端产物即可独立运行 | 在入口源码常驻嵌入指令（与 MyGo 构建器内置嵌入叠加冲突或造成体积翻倍，且耦合后端单测与前端构建） |
| **宿主与浏览器双环境适配** | 建立极薄运行时桥接模块，运行时检测宿主注入对象，缺省时回退至安全空操作或测试桩 | 生产环境零损耗直连 MyGo 运行时与绑定服务，开发期可直接在常规或无头 Chrome 中运行启动、滚动与导出自动化冒烟脚本 | 在各业务模块散落判断分支（违反工程纪律单一职责原则，导致业务代码充斥防御性判断） |
| **顶栏信息架构重组** | 将旧版「标题栏 + 工具栏」双行结构收敛为单层 48px MD3 顶栏 | 遵循渐进披露原则，将目录抽屉开关、标题状态、三态模式分段按钮与操作图标聚于同一水平视觉轴，纵向释放 36px 主画布空间 | 保留双层顶栏堆叠（挤占编辑与阅读视口，且视觉层次割裂） |
| **窗口尺寸与状态存储源** | 继续以可执行文件同目录的便携化设置文件作为唯一真实数据源（SSOT） | 严格保持既有便携化存储契约、旧目录一次性迁移语义及单元测试隔离机制，避免产生双份状态文件引发同步不一致 | 切换至框架默认用户数据目录下的独立窗口状态文件（破坏便携化单目录模型并与既有设置结构分裂） |

---

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| **构建工具链 Go 版本门槛提升**：MyGo 依赖要求 Go 1.27.3 及以上版本，旧版 CI 配置锁定的 Go 1.25.x 将无法编译 | 🔴 高 | 本机利用已缓存的 Go 1.27.3 工具链执行静态检查与测试；在 Phase 4 同步将云端构建与发布工作流升级至匹配的 Go 1.27.x 版本并显式开启零 CGO 环境变量 |
| **单元测试在事件循环启动前调用宿主 API 触发恐慌**：MyGo 规定在事件循环运行前调用对话框、主题源或剪贴板接口会直接 panic | 🔴 高 | 在绑定服务层以窗口实例非空及应用就绪状态作为调用边界守卫，并保留对话框与持久化函数注入点，确保离线单元测试纯粹走内存与临时目录路径 |
| **NSIS 安装器产物路径与卸载注册表键变化导致 CI 冒烟失败**：MyGo 生成的安装包命名格式及卸载注册表路径基于应用标识符而非固定产品名 | 🟡 中 | 在项目配置中明确锁定应用名称、短标识与反向域名标识符，并在云端安装/卸载验证脚本中精确对齐新的安装包匹配路径、可执行文件名与注册表键路径 |
| **前端静态类型校验配置缺失与锁文件失步**：既有前端工程仅配置打包器而未配置静态类型编译器及编译配置，直接引入类型校验命令或漏更依赖锁文件会导致本地验收与云端严格安装中断 | 🔴 高 | 在 Phase 1 显式补齐锁定的静态类型编译器开发依赖与编译选项配置，并同步刷新依赖锁文件，打通生成契约到业务模块的端到端编译期类型校验 |
| **重构 DOM 结构破坏编辑器选区层级或预览滚动记忆**：CSS 层叠顺序调整或容器显隐切换顺序不当可能掩盖活动行选区或清零 iframe 滚动条 | 🟡 中 | 严格保留活动行半透明色阶与选区图层高优先级选择器契约；在模式切换控制器中先采集可见预览滚动值、切换类名后再回写滚动偏移，并运行无头冒烟脚本逐项核验 |

---

## 5. Phase 依赖关系

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 16px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12px;">
    <div style="flex: 1; min-width: 150px; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 1</div>
      <div style="color: #374151; margin-top: 2px;">宿主迁移与 IPC 契约生成</div>
    </div>
    <div style="color: #6b7280; font-weight: 600;">──▶</div>
    <div style="flex: 1; min-width: 150px; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 2</div>
      <div style="color: #374151; margin-top: 2px;">MD3 令牌与预览主题重塑</div>
    </div>
    <div style="color: #6b7280; font-weight: 600;">──▶</div>
    <div style="flex: 1; min-width: 150px; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 3</div>
      <div style="color: #374151; margin-top: 2px;">前端模块化重构与功能装配</div>
    </div>
    <div style="color: #6b7280; font-weight: 600;">──▶</div>
    <div style="flex: 1; min-width: 150px; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 4</div>
      <div style="color: #374151; margin-top: 2px;">测试对齐、CI 迁移与文档同步</div>
    </div>
  </div>
</div>

Phase 1 产出前端编译所必需的类型化绑定契约；Phase 2 确立全局与预览共享的语义化令牌及类名体系；Phase 3 汇合绑定契约与令牌体系完成模块化前端装配；Phase 4 对齐契约自检、无头浏览器验证、CI 构建脚本与项目文档，四阶段按序推进最为稳健。

---

## 6. Subagent 协同规划

对照三维效益模型（任务复杂度、任务上下文关联程度、经济与时间效益）评估各阶段委托需求：

| 阶段 | 上下文依赖 | 并行收益 | 执行主体 | 决策理由 |
|------|-----------|---------|----------|----------|
| **Phase 1：宿主迁移与契约重构** | 强（决定窗口生命周期、事件名、对话框行为与绑定签名） | 无（全链路前置基石） | 主线 | 后端变更文件集中（不足 6 个文件），直接决定后续全部前端调用契约，主线直改零沟通损耗 |
| **Phase 2：MD3 令牌与预览主题** | 强（宿主启动背景色、外壳 CSS 令牌与预览样式表须严格对齐） | 低（与 Phase 3 选择器及 DOM 结构紧密咬合） | 主线 | 跨层共享色值与选择器契约密集，隔离派发易产生令牌命名偏差与重复读盘开销 |
| **Phase 3：前端模块化重构** | 强（汇聚 Phase 1 绑定接口、Phase 2 样式类名与 12 项既有业务不变量） | 无（核心装配主干） | 主线 | 涉及滚动恢复、防抖乱序守卫、字体单飞提交等精细交互状态，主线保持完整上下文推演最可靠 |
| **Phase 4：测试、CI 与文档维护** | 强（契约测试直接断言前序阶段落地的精确令牌、DOM 属性与构建路径） | 低（收口验证与清理链路短） | 主线 | 测试断言强依赖 Phase 2/3 最终实现细节，由主线一气呵成执行验证与修复效率最高 |

> **协同结论**：本项目体量精悍且跨层契约（宿主背景色 ↔ MD3 表面令牌 ↔ 模块化 DOM 结构 ↔ 静态契约测试 ↔ CI 安装包校验）强耦合、呈串行依赖；子代理冷启动重载上下文的 Token 成本高于潜在并行收益，因此四个阶段统一保留由交付段**主线**顺序执行。

---

> ### Task 拆解预览
>
> 以下仅示意 Plan 与 Task 的衔接关系，实际原子执行单元详见 `Tasks.md`。Plan 在此止步，不再展开具体文件与代码实现细节。
>
> | Phase | 预估 Task 数 | 执行主体 | 核心交付内容概览 |
> |-------|-------------|----------|------------------|
> | Phase 1 | 4 | 主线 | 模块依赖切换与 MyGo 项目配置、应用入口与窗口事件重构、绑定服务与原生能力适配、绑定生成与后端测试更新 |
> | Phase 2 | 2 | 主线 | 内嵌预览深浅色 MD3 主题改造、前端全局 MD3 令牌体系与组件样式表重写 |
> | Phase 3 | 5 | 主线 | 双环境运行时桥接与图标模块、HTML 模态结构与主界面骨架重构、编辑器与沙箱预览模块拆分、目录抽屉模块提取、顶层入口装配与旧文件清理 |
> | Phase 4 | 3 | 主线 | 前端契约测试与无头冒烟脚本适配、GitHub Actions 构建与发布流水线迁移、全量回归验证与项目文档同步 |
>
> **总计预估**：14 个 Task。每个 Task 的状态、执行主体、具体目标路径、接口约定、验收标准与依赖关系在 `Tasks.md` 中独立定义。

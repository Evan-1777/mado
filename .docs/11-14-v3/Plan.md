# Plan：应用图标绘制、11-14 交付质量复盘修复与 0.7.1 版本发布

**状态**：DONE  
**完成日期**：2026-11-14  
**日期**：2026-11-14  
**版本**：v1.0  

---

## 1. 背景与目标

本次工作围绕三项交付目标展开：为桌面可执行文件与安装包绘制并接入高辨识度应用图标；对 11-14 当日全部交付（宿主迁移与 MD3 重构、冗余说明文案清理、0.7.0 发版、顶栏拖拽与双击修复）执行工程质量审计并根治全部错漏；完成全链路回归后发布 0.7.1 正式版本。

### 1.1 11-14 任务质量审计结论（基准：90 / 100 分）

11-14 当日共完成两次工作流归档与两次独立提交，完成了从旧宿主框架到纯 Go 宿主的无 CGO 迁移、Material Design 3 令牌与模块化前端重构、顶栏拖拽级联修复及云端安装/卸载冒烟闭环。对照工程纪律审计，存在以下五项需要根治的实际缺陷与契约遗漏（无吹毛求疵项）：

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 16px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e8ec;">11-14 交付质量审计矩阵与评分构成（总分 90 / 100）</div>
  <div style="display: grid; gap: 10px; font-size: 12px; line-height: 1.55;">
    <div style="display: grid; grid-template-columns: 180px 70px 1fr; gap: 12px; align-items: start; background: #ffffff; border: 1px solid #e5e8ec; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #9f2d2d;">并发安全与启动文件时序</div>
      <div style="font-weight: 600; color: #9f2d2d;">-4 分</div>
      <div>① 启动文件路径字段未加读写锁，主线程打开文件回调与前端异步读取并发访问构成数据竞态；② 宿主就绪流程先创建主窗口再派发命令行文件回调，导致以“窗口是否为空”区分启动期与运行期的分支在启动期恒为假，引发启动事件丢失或重复加载；③ 命令行首参未过滤短横线标志位，传入运行标志时误触发启动打开失败提示。</div>
    </div>
    <div style="display: grid; grid-template-columns: 180px 70px 1fr; gap: 12px; align-items: start; background: #ffffff; border: 1px solid #e5e8ec; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #9f2d2d;">模态重入与全局热键断层</div>
      <div style="font-weight: 600; color: #9f2d2d;">-3 分</div>
      <div>① 设置与导出弹窗开启前未校验模态打开状态，在弹窗已开启时重复按下导出热键会直接再次调用原生模态展示接口并抛出未捕获状态异常，或在未保存确认框之上叠出第二层弹窗；② 新建、打开、保存热键仅绑定在编辑器内部，切换至纯预览模式或焦点位于顶栏/目录侧栏时热键失效。</div>
    </div>
    <div style="display: grid; grid-template-columns: 180px 70px 1fr; gap: 12px; align-items: start; background: #ffffff; border: 1px solid #e5e8ec; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #b45309;">过度设计与契约边界泄漏</div>
      <div style="font-weight: 600; color: #b45309;">-2 分</div>
      <div>后端绑定服务保留了前端从不调用的标题设置导出方法与仅供入口内部调用的启动文件写入导出方法，使生成客户端多出两项死接口，并迫使静态契约测试维护专门的宿主侧例外白名单；此外前期模态曾引入 6 处复述标签的冗余说明文案（已于当日后续提交移除）。</div>
    </div>
    <div style="display: grid; grid-template-columns: 180px 70px 1fr; gap: 12px; align-items: start; background: #ffffff; border: 1px solid #e5e8ec; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #4b5563;">偏好一致性与工作区卫生</div>
      <div style="font-weight: 600; color: #4b5563;">-1 分</div>
      <div>① 关闭公式渲染开关后，预览帧回填与独立 HTML 导出仍无条件扫描数学占位类名；② 宿主迁移后缺失自定义应用图标配置，导致可执行文件与安装包回退至系统默认白框图标；③ 根目录遗留未跟踪的旧版前端视觉原型临时目录且未纳入忽略规则，后端测试残留一处旧框架注释。</div>
    </div>
  </div>
</div>

### 1.2 应用图标视觉与嵌入目标

围绕产品定位（“Mado / 窓”——轻量双栏 Markdown 阅读与编辑器）与现有 Material Design 3 靛蓝主色体系，绘制 1024×1024 超采样抗锯齿方形 PNG 图标资产，并通过宿主构建配置单点驱动 Windows 可执行文件 PE 图标组资源、窗口与任务栏图标、文件关联图标及 NSIS 安装/卸载程序图标：

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 16px; margin: 16px 0; background: #ffffff; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="font-size: 13px; font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e8ec;">Mado 应用图标视觉构成与多档嵌入链路</div>
  <div style="display: grid; grid-template-columns: 140px 1fr; gap: 16px; align-items: center; font-size: 12px; line-height: 1.55;">
    <div style="display: flex; align-items: center; justify-content: center; padding: 10px; background: #f3f5f9; border-radius: 10px; border: 1px solid #dfe3ec;">
      <div style="width: 96px; height: 96px; border-radius: 22px; background: linear-gradient(145deg, #2b478b 0%, #18274d 100%); box-shadow: inset 0 1px 0 rgba(180,197,255,0.45); position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 10px; border-radius: 14px; border: 1.5px solid rgba(180,197,255,0.22); background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.03) 49%, rgba(180,197,255,0.10) 50%, rgba(180,197,255,0.06) 100%);"></div>
        <svg viewBox="0 0 100 100" width="66" height="66" aria-hidden="true" style="position: relative;">
          <path d="M18 72V28h12l14 21 14-21h12v44H58V47L44 67 30 47v25H18z" fill="#eef3ff"/>
          <path d="M78 34v24m-9-8 9 10 9-10" fill="none" stroke="#9db8ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
    <div style="display: grid; gap: 6px;">
      <div><strong>几何与色彩规范</strong>：1024×1024 透明底画布内居中圆角方砖（留白边距防止系统任务栏裁切），底色采用与界面同源的深靛蓝渐变（<code>#2B478B → #18274D</code>）与内缘微高光，内衬左右分栏“窗格”暗纹，前景绘制高对比冰白 <code>M</code> 字主干与亮靛蓝下箭头，主笔画宽度按 16×16 像素缩略后仍保持 ≥ 1.1px 实心像素设计。</div>
      <div><strong>单源编译嵌入链路</strong>：图标资产存放于独立静态资产目录（避开宿主运行时外置资源拷贝目录），构建期自动按预乘 Alpha 面积平均算法生成 16/24/32/48/64/128/256 七档尺寸，一方面写入 COFF 资源对象链接进便携版单文件可执行程序，另一方面生成临时图标注入 NSIS 安装器与卸载器，产物目录不散落任何外部图片文件。</div>
    </div>
  </div>
</div>

---

## 2. 阶段划分

### Phase 1：应用图标绘制与宿主配置接入

| 项目 | 内容 |
|------|------|
| **输入** | 产品 MD3 靛蓝视觉规范与宿主图标编译规则 |
| **输出** | 1024×1024 超采样抗锯齿应用图标资产、接入图标路径的应用构建描述配置，以及针对图标规格与宿主路径引用的自动化契约断言 |
| **验收标准** | 图标满足 PNG 格式、1024×1024 正方形、四角透明圆角与主体像素覆盖率要求，缩略至 16px/32px 笔画清晰无断线；配置引用非外置资源目录路径，不向构建输出目录泄漏裸露图标文件 |

### Phase 2：11-14 交付缺陷根治与契约收敛

| 项目 | 内容 |
|------|------|
| **输入** | 11-14 审计识别的后端并发/启动时序缺陷、IPC 冗余绑定及前端模态/热键/公式开关缺陷 |
| **输出** | 加锁且按消费态分流的启动文件与外部打开生命周期、过滤命令行标志参数的入口逻辑、收敛私有方法后重生成的零例外客户端契约、具备重入互斥守卫的模态控制器、跨编辑/预览/内嵌帧一致的全局热键分发，以及严格遵循公式开关的预览与导出链路 |
| **验收标准** | 后端全部单元测试与竞态检测零告警通过；生成客户端与桥接层达成零白名单例外的逐方法一一对应；重复触发热键零未捕获异常，预览模式下新建/打开/保存热键正常响应；前端自检与无头浏览器冒烟全部通过 |

### Phase 3：CI 图标校验补强、工作区清理与文档同步

| 项目 | 内容 |
|------|------|
| **输入** | 前两阶段完成的代码、图标资产、现有云端构建配置及项目文档 |
| **输出** | 增补可执行文件嵌入图标提取校验与无多余散落文件断言的云端构建配置、清理残留原型后的干净工作区与忽略规则、同步更新图标与架构约束后的项目基准文档 |
| **验收标准** | 全套本机静态检查、单元测试、竞态检测、构建产物校验与三项无头检查退出码均为 0；工作区无临时残留文件；项目基准文档与代码库真实状态完全一致 |

### Phase 4：阶段归档、版本升级与 0.7.1 正式发布

| 项目 | 内容 |
|------|------|
| **输入** | 通过全链路验收的代码库、更新后的基准文档与活跃阶段计划/任务文档 |
| **输出** | 归档完毕的阶段文档目录、更新至 0.7.1 的应用版本配置、符合提交规范的提交记录与版本标签，以及云端流水线构建发布的 0.7.1 便携版可执行文件与安装包 |
| **验收标准** | 根目录无残留阶段计划/任务文件；远端构建流水线与发版流水线双绿通过；GitHub Release 成功挂载 0.7.1 便携版与安装器两项正式资产 |

---

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| **应用图标存放目录** | 存放于独立的静态资产目录并在应用配置中显式指定图标路径 | 宿主构建器会将默认运行时资源目录下的所有常规文件原样拷贝至可执行文件同级目录并打入安装包；使用独立资产目录可让图标仅编译进 PE 资源段与安装器头部，保持单文件便携形态纯粹 | 放入默认运行时资源目录（导致构建目录与用户安装目录多出裸露的外部 PNG 文件） |
| **图标生成与仓库留存策略** | 使用纯标准库矢量超采样一次性渲染落盘 PNG 资产并视觉核验，不在仓库常驻生成脚本 | 图标属静态设计资产，仅保留最终 PNG 文件满足最小仓库体积与零冗余脚本原则，同时支持静态测试校验尺寸与透明通道 | 在仓库长期保留图标生成源码或每次构建动态生成（违反极简原则，增加无意义的构建步骤与维护面） |
| **启动期与运行期外部打开文件分界** | 以“前端是否已首次拉取启动文件”的加锁状态位替代“窗口实例是否为空”判定 | 宿主内部先执行窗口创建回调、再投递启动命令行文件回调，窗口指针在回调触发时已非空；以实际消费状态分流可同时消除数据竞态、事件丢失与二次重复打开 | 在前端做路径时间窗去重（治标不治本，无法消除后端字段无锁竞态与事件早发丢失） |
| **内部方法与生成契约收敛** | 将启动文件注入改为包内私有方法并删除未使用的后端标题导出方法，重生成客户端并移除测试白名单 | 让导出绑定结构体的公开方法集精确等于前端真实 IPC 契约，从源头消除死代码与防御性例外列表 | 保留冗余导出方法并继续维护静态测试例外表（违背单一数据源与最小暴露面原则） |
| **全局快捷键收口位置** | 在顶层协调层以捕获阶段统一接管新建/打开/保存/导出热键，并在预览内嵌帧转发键盘事件，当任一模态开启时阻断底层动作 | 消除编辑器与模态模块各自绑定部分热键造成的预览模式盲区及重复触发风险，单一入口统一管控模态互斥 | 在编辑器、预览帧、目录抽屉分别重复注册热键（多处同步脆弱且易产生双重触发） |

---

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| **小尺寸（16×16 / 24×24）任务栏图标笔画发虚或粘连** | 🟡 中 | 采用高对比双色几何造型，主干线宽在 1024 画布上不低于 68px、间距不低于 48px，生成后在本地同步输出多档缩略预览图并通过视觉检查核验小尺寸清晰度，核验后清理预览临时图 |
| **全局捕获热键拦截了设置输入框内的常规按键或 Esc 关闭行为** | 🟡 中 | 仅匹配带 Ctrl/Command 修饰符的特定功能键组合；当任一原生模态处于打开状态时，仅阻止浏览器默认打印/保存行为而不再派发底层文档或二次弹窗动作，保留原生 Esc 与表单输入完全畅通 |
| **预留的发布版本号标签或远端流水线执行异常** | 🟡 中 | 发版前先核对远端已有标签列表确保无冲突；推送主分支与版本标签后实时跟踪云端构建与发版两条工作流直至全部成功并核实 Release 资产清单 |

---

## 5. Phase 依赖关系

<div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 14px 16px; margin: 16px 0; background: #fafbfc; font-family: system-ui, -apple-system, sans-serif; color: #1f2328;">
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12px;">
    <div style="flex: 1; min-width: 145px; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 1 · 图标绘制接入</div>
      <div style="color: #4b5563; margin-top: 2px;">产出 PNG 图标并配置宿主路径</div>
    </div>
    <div style="color: #6b7280; font-weight: 600;">──▶</div>
    <div style="flex: 1; min-width: 145px; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 2 · 错漏根治收敛</div>
      <div style="color: #4b5563; margin-top: 2px;">修复后端竞态/契约与前端热键/模态</div>
    </div>
    <div style="color: #6b7280; font-weight: 600;">──▶</div>
    <div style="flex: 1; min-width: 145px; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 3 · 验证与文档维护</div>
      <div style="color: #4b5563; margin-top: 2px;">补强 CI 断言、清理残留并同步文档</div>
    </div>
    <div style="color: #6b7280; font-weight: 600;">──▶</div>
    <div style="flex: 1; min-width: 145px; border: 1px solid #3949ab; background: #ffffff; border-radius: 8px; padding: 10px 12px;">
      <div style="font-weight: 600; color: #3949ab;">Phase 4 · 归档与 0.7.1 发布</div>
      <div style="color: #4b5563; margin-top: 2px;">完成阶段归档、打标推送并验收发版</div>
    </div>
  </div>
</div>

Phase 1 至 Phase 4 按序推进：Phase 1 与 Phase 2 共同更新配置与契约基线，Phase 3 在代码定型后统一执行静态契约、无头浏览器验证、CI 脚本补强与基准文档维护，Phase 4 在全量验证通过后执行归档提交与 0.7.1 标签发布。

---

## 6. Subagent 协同规划

对照三维效益模型（任务复杂度、任务上下文关联程度、经济与时间效益）评估本阶段交付委托需求：

| 阶段 | 上下文依赖 | 并行收益 | 执行主体 | 决策理由 |
|------|-----------|---------|----------|----------|
| **Phase 1：应用图标绘制与接入** | 强（需对齐现有 MD3 令牌色值、宿主资源目录排除机制与视觉核验） | 低（单资产生成与配置修改耗时短） | 主线 | 主线直接生成并通过图像工具核验多尺寸效果，链路最短且无上下文传递损耗 |
| **Phase 2：11-14 缺陷修复与契约收敛** | 强（横跨后端绑定、生成客户端、前端协调层与契约测试，共享同一契约面） | 无（修改文件紧密咬合，需同步重生成绑定） | 主线 | 有效代码差分精简但跨层耦合紧密，隔离会话重读全仓开销高于直接修改 |
| **Phase 3：CI 补强、清理与文档维护** | 强（直接验证前两阶段落地的精确行为与配置字段） | 无（严格串行于实现之后） | 主线 | 主线直接运行验证链并更新文档，避免二次同步误差 |
| **Phase 4：阶段归档与 0.7.1 发布** | 强（依赖前序全部验证结论回填、提交历史与远端流水线状态） | 无（收口提交与标签推送严禁并发） | 主线 | 涉及版本变更、归档搬迁与远端发布核验，须由主线原子执行 |

> **协同结论**：本次任务虽涵盖图标、缺陷修复与发版三部分，但变更半径集中且共享应用配置与前端契约测试文件，无实质独立长耗时分支；派发子代理的重载读盘成本大于收益，故四阶段全部由交付段**主线**顺序执行。

---

> ### Task 拆解预览
>
> 以下仅示意 Plan 与 Task 的衔接关系，实际原子执行单元详见 `Tasks.md`。Plan 在此止步，不再展开具体文件与代码实现细节。
>
> | Phase | 预估 Task 数 | 执行主体 | 核心交付内容概览 |
> |-------|-------------|----------|------------------|
> | Phase 1 | 1 | 主线 | 绘制并核验 1024×1024 应用图标资产，接入宿主构建配置 |
> | Phase 2 | 3 | 主线 | 后端启动文件并发安全与生命周期修复及 IPC 契约收敛、前端全局热键收口与模态防重入及公式开关对齐、前后端回归测试补齐 |
> | Phase 3 | 2 | 主线 | 云端构建流水线新增嵌入图标校验与工作区清理、全链路验证与项目文档同步 |
> | Phase 4 | 2 | 主线 | 阶段文档归档与代码提交、更新版本号至 0.7.1 并推送标签完成云端发版验收 |
>
> **总计预估**：8 个 Task。每个 Task 的状态、执行主体、具体目标路径、实施细节、验收标准与依赖关系在 `Tasks.md` 中独立定义。

---

## 7. 回归测试结论

2026-11-14 在本机执行完整 8 步验证链，退出码全为 0：

| # | 验证项 | 结果 |
|---|--------|------|
| 1 | `cd frontend && npm run typecheck` | 通过，零错误 |
| 2 | `esbuild src/main.ts --bundle --loader:.css=empty` | 通过 |
| 3 | `cd frontend && npm test`（6 项自检，含零例外 IPC 契约） | 全部通过 |
| 4 | `cd frontend && npm run build` | 通过 |
| 5 | `CGO_ENABLED=0 go vet ./...` + `go test ./...` | 全部包 ok |
| 6 | `go test -race ./...` | 全部包 ok，零告警 |
| 7 | `mygo generate`（契约再生成校验） | `frontend/src/mygo.ts is up to date` |
| 8 | `startup.check.mjs` / `modeScroll.check.mjs` / `export.check.mjs` | 三脚本 ALL PASS，含新增 `preview-mode-shortcuts` 与 `modal-reentry-guard` |

图标资产核验：`assets/icon.png` 为 1024×1024 RGBA PNG，四角 Alpha 为 0、中心不透明，65984 字节（低于 80KB 上限）；16/24/32/48 档缩略图目视核验笔画连续无断线。

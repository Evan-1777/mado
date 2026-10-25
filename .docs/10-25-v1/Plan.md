# Plan：首次启动提速与 Windows 安装/卸载支持

**状态**：DONE（云端 Windows 安装/卸载与 Release 待推送验收）
**日期**：2026-10-25
**完成日期**：2026-10-25
**版本**：v1.0
**回归测试结论**：本地全链通过（2026-10-25）：`go vet ./...`、`go test ./...`、`go test -race ./...`、前端 esbuild 零产物检查、`npm test` 六项、`npm run build` 均通过；远程 Chrome 9222 隔离上下文的三项 dev-only 检查全部 ALL PASS。startup 三次 FCP 45.2/45.0/44.0ms、编辑器 165.0/161.2/160.7ms、预览 222.0/217.6/218.6ms，FCP 低于基线 426–437ms，编辑器就绪优于基线 406–418ms。云端 Windows 安装/卸载与 Release 版本注入/双资产发布待推送验收。

---

## 1. 背景与目标

Mado 当前以单文件便携 exe 分发，偏好与最近文件记录写在 exe 同目录。启动链路由 Wails 在 WebView2 导航完成后显示窗口，而同步执行的 826KB 前端 bundle 是导航完成前的最后一段阻塞；无启动文件时仍会在隐藏的预览 iframe 中执行一次完整渲染与样式拉取。分发侧没有安装器，用户需要手动放置 exe，也没有卸载入口。

本次同时处理两条线：

1. **首次启动的首屏可见时间**：窗口显示不再被前端 bundle 执行阻塞，先把外壳画出来，再在后台完成编辑器初始化；空文档启动不再为隐藏预览付出渲染成本。
2. **Windows 安装/卸载**：提供 NSIS setup，按用户级安装到可写目录，保留便携 exe；安装器负责 WebView2 运行时检查，卸载器移除程序、快捷方式与注册表项。

目标以应用可控路径为准；WebView2 进程与用户数据目录的首次冷初始化属于系统侧成本，不在本次承诺范围内。

### 非目标

- WebView2 引擎/用户数据目录的冷启动优化，以及在 setup 中静默启动应用做预热。
- 机器级安装（Program Files）、文件关联、协议注册、自动更新。
- KaTeX 懒加载或编辑器 bundle 拆分（实测收益约 15–20ms，见 2.2 节）。
- UI 视觉重设计、应用图标设计、编辑器启动模型变更。
- 改变便携版 settings.json 的存储位置与格式。

## 2. 现状与基线

### 2.1 启动链路

当前启动顺序：

1. Go 侧在创建 WebView2 前同步读取 exe 目录的 settings.json，确定窗口尺寸与最大化状态。
2. Wails 创建窗口与 WebView2；导航完成后才显示窗口。
3. 页面加载 app.css 与同步 bundle；bundle 内同步创建标题栏、工具栏、CodeMirror 编辑器。
4. DOMContentLoaded 后串行发起 GetSettings → GetStartupFile；无启动文件时进入 newFile()，随后发起 Render 与 GetCSS，并首次写入隐藏的预览 iframe。

因此导航完成（窗口可见）被 bundle 下载、解析与执行阻塞；空文档启动仍执行一次完整预览渲染。两者都是应用侧可消除的等待。

<div style="border:1px solid #d4d4d8;border-radius:8px;padding:16px;max-width:780px;font-family:Segoe UI,sans-serif;color:#27272a">
  <div style="font-size:12px;letter-spacing:.08em;color:#71717a">CURRENT</div>
  <div style="display:grid;grid-template-columns:56px 1fr;gap:8px;align-items:center;margin-top:8px">
    <div style="font-size:12px;color:#71717a">现在</div>
    <div style="display:flex;gap:4px;font-size:12px">
      <div style="flex:2;background:#f4f4f5;border-radius:4px;padding:8px">HTML / CSS</div>
      <div style="flex:5;background:#e4e4e7;border-radius:4px;padding:8px">同步 bundle 阻塞 load</div>
      <div style="flex:2;background:#d4d4d8;border-radius:4px;padding:8px">编辑器</div>
    </div>
    <div style="font-size:12px;color:#71717a">之后</div>
    <div style="display:flex;gap:4px;font-size:12px">
      <div style="flex:2;background:#f4f4f5;border-radius:4px;padding:8px">HTML / CSS / 骨架</div>
      <div style="flex:3;background:#fafafa;border:1px dashed #a1a1aa;border-radius:4px;padding:8px">窗口可见</div>
      <div style="flex:5;background:#e4e4e7;border-radius:4px;padding:8px">bundle 在骨架后执行</div>
      <div style="flex:2;background:#d4d4d8;border-radius:4px;padding:8px">编辑器</div>
    </div>
  </div>
  <div style="margin-top:12px;padding-top:10px;border-top:1px solid #e4e4e7;font-size:12px;color:#52525b">
    目标：窗口内容先于 bundle 出现；编辑器就绪时间保持在同一量级，空文档不再为隐藏预览付出成本。
  </div>
</div>

### 2.2 实测基线

测量方法：远程 Chrome 134（Windows，9222 实例）创建隔离 browser context，页面资源由 WSL 本地 HTTP 服务提供；三次运行，单位为导航起点后的毫秒。该测量覆盖渲染路径，不包含进程启动与 WebView2 用户目录初始化。

| 场景 | load（窗口可显示代理） | FCP | 编辑器就绪 | 预览就绪 |
|------|----------------------|-----|-----------|---------|
| 当前实现 | 420–427 | 426–437 | 406–418 | 448–459 |
| 骨架 + preload + load 后注入 bundle（含 init 立即执行的原型） | 356–371 | 351–368 | 412–427 | 436–451 |
| 去掉 KaTeX 的对照 bundle | 399–415 | 404–426 | 387–402 | 424–439 |

结论：

- 静态骨架配合 load 后注入，把窗口可见与首屏内容提前约 60–70ms；编辑器就绪基本不变（约 5–15ms 的测量波动），符合“先看见外壳、再完成初始化”的目标。
- KaTeX 占 bundle 约 32%，去掉后编辑器只提前约 15–20ms，与既有“不拆分”决策一致，本次不引入懒加载或双 bundle。
- Wails v2.14 在 WebView2 的 navigationCompleted（对应 load）后显示窗口，因此同步 bundle 确实位于窗口可见之前；骨架方案正是解除这一阻塞。

### 2.3 安装与分发现状

- release.yml 只上传 mado.exe，没有 setup 或 Add/Remove Programs 入口。
- CI 的 wails build 不生成安装器，Windows 产物验收只有 exe。
- 便携存储要求 exe 目录可写；机器级安装到 Program Files 会让 settings.json 不可写，安装范围必须与存储模型一致。

### 2.4 已查阅的关键文件

- main.go、app.go、wails.json、.gitignore
- frontend/index.html、frontend/src/main.ts、frontend/src/style.css
- frontend/tests/startup.check.mjs、modeScroll.check.mjs、export.check.mjs、uiContract.test.mjs
- .github/workflows/build.yml、.github/workflows/release.yml
- .docs/SCOPE.md、.docs/Project.md、.docs/09-08-v1/Plan.md、.docs/10-12-v1/Plan.md
- Wails v2.14 模块缓存中的 pkg/options/options.go、internal/frontend/desktop/windows/frontend.go、pkg/buildassets/build/windows/installer/project.nsi、wails_tools.nsh

## 3. 阶段划分

### Phase 1：启动首屏链路解耦

| 项目 | 内容 |
|------|------|
| **输入** | 当前同步 bundle 的 index.html 与 main.ts 初始化路径；既有三项 dev-only 无头检查 |
| **输出** | 静态启动骨架、app.js preload、load 后注入执行、main.ts 清理骨架并立即执行 init；三项检查脚本的注入锚点与 UI 契约同步更新 |
| **验收标准** | 页面源码不存在同步 app.js 标签；骨架在 bundle 执行前已存在；npm test、构建与三项无头检查全部通过；远程 Chrome 记录首屏时间线较基线提前 |

### Phase 2：启动期无效工作收敛

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 的延迟 init 路径；当前串行设置/启动文件读取与空文档预览渲染 |
| **输出** | GetSettings 与 GetStartupFile 并发发起；Editor 模式空文档启动跳过 Render/GetCSS，首次激活预览时补渲染；目录树同步清空；startup.check 增加骨架先于 bundle、并发 IPC、空启动零渲染与预览激活一次渲染的断言与时间线输出 |
| **验收标准** | startup.check 全部断言通过；空文档 newFile 不增加 Render/GetCSS 次数；首次切到预览恰好一次渲染；带启动文件仍恰好一次渲染；既有 modeScroll、export 检查不回归 |

### Phase 3：Windows 安装与卸载

| 项目 | 内容 |
|------|------|
| **输入** | wails.json 产品信息、构建/发布工作流、Wails v2.14 NSIS 模板、便携存储约束 |
| **输出** | 用户级 NSIS 安装器（中文界面、Add/Remove Programs 入口、WebView2 运行时检查、默认快捷方式与卸载器）；构建 CI 生成安装器并静默验证安装/卸载；发布流程按 tag 注入版本并同时上传便携 exe 与安装器 |
| **验收标准** | 安装器构建成功；静默安装后目标目录含 mado.exe 与 uninstall.exe，注册表存在 Mado 卸载项；静默卸载后目录、快捷方式与注册表项消失；发布资产同时包含 exe 与 installer |

### Phase 4：文档维护与全链回归

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1–3 的全部变更与验收记录 |
| **输出** | Project.md 的启动、分发、结构与决策章节同步；Plan/Tasks 标注 DONE 并归档；全链验证结论落盘 |
| **验收标准** | go vet、go test、npm test、前端构建、三项无头检查全部通过；Project.md 与代码实际一致；归档目录含 Plan.md 与 Tasks.md，根目录无残留 |

## 4. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 首屏显示 | index.html 放静态骨架；head 中 preload app.js；load 事件后注入 script；main.ts 清空骨架并立即 init | 窗口显示由 load 决定，静态骨架 + 延迟 bundle 把可见内容提前约 60–70ms；无需拆分编辑器 bundle | defer（load 仍等待脚本）、async（实测仍阻塞 load）、StartHidden 后提前 WindowShow（WebView2 尚未绘制，空白窗口）、整包拆分（改动面过大） |
| 编辑器 bundle | 保持单 bundle，不拆 KaTeX | 去 KaTeX 对照仅提前约 15–20ms；双 bundle/加载时序与导出路径复杂度不成比例 | 动态 import/ESM 拆分（改动构建格式与导出依赖）、第二 IIFE bundle（维护两套构建与全局契约） |
| 空文档预览 | 仅在预览可见时渲染；Editor 模式空启动标记 stale，首次切到预览补渲染 | 默认 Editor 模式下预览不可见，空文档渲染纯属无效工作；保留非空文档与分栏/预览模式行为 | 全面懒渲染（目录树依赖渲染结果，需拆分渲染与解析，超出收益） |
| 启动 IPC | GetSettings 与 GetStartupFile 并发发起，各自独立错误处理 | 两个调用互不依赖，串行等待无收益；保留原有的默认值回退 | 合并为单一 Go 方法（扩大绑定面、wailsjs 手补与测试负担） |
| 安装方式 | Wails NSIS + -installscope user，安装到 %LOCALAPPDATA%\Programs\Mado | 目录可写，settings.json 继续与 exe 同目录，便携模型不变；无需管理员权限 | 机器级 Program Files（配置不可写，破坏便携语义）、自研安装器（重复 Wails 已有能力） |
| 安装器模板 | 跟踪一份基于 Wails v2.14 的 project.nsi，改为简体中文并固定卸载键名 | 用户可见安装界面与项目中文约定一致；卸载项显示稳定 | 使用默认英文模板（语言不一致）、运行时切换语言（无必要） |
| 卸载数据 | 卸载器删除安装目录（含 settings.json）与 WebView2 用户数据、快捷方式和注册表项 | 与用户级安装目录模型一致；偏好不是用户文档，不涉及文档丢失 | 把设置迁到 APPDATA（反转便携化决策并引入迁移分支）、保留残留目录（不符合卸载预期） |
| 文件关联 | 本次不注册 .md/.markdown 关联与协议 | 需求只要求安装/卸载；关联会改变系统默认打开方式，超出最小面 | Wails fileAssociations（侵入用户默认应用设置） |
| 安装期预热 | 不在 setup 内启动应用初始化 WebView2 | 安装器静默运行 GUI 应用副作用不可控；首次 profile 初始化属系统侧成本 | 安装后隐藏启动一次（窗口/进程副作用、无法稳定度量收益） |
| 版本元数据 | wails.json 提交 0.0.0 占位；发布工作流从 tag 注入 productVersion 后再构建 | 安装器与 exe 的版本信息随发布一致；日常 CI 不需要伪造版本 | 手工改 wails.json（易漏）、使用固定版本（Release 元数据失真） |
| 安装验证 | GitHub Actions Windows runner 静默安装 + 校验 + 静默卸载 + 校验 | 本机禁止 Windows 全量构建；只有真实安装/卸载能验证 NSIS 行为 | 仅检查安装器文件存在（无法验证卸载器与注册表清理） |

## 5. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| Wails 实际显示窗口的时机与假设不符，骨架方案收益变小 | 🟡 中 | 以 Wails v2.14 源码确认 navigationCompleted 显示窗口；交付段用远程 Chrome 记录 load/FCP/编辑器时间线；若窗口仍被 bundle 阻塞，保留骨架并回退到同步 bundle，不引入更大的拆分 |
| load 后注入导致 init 不执行或时序竞态 | 🟡 中 | init 以 readyState 判断：loading 时挂 DOMContentLoaded，否则立即执行；startup/modeScroll/export 三项检查覆盖启动与交互；失败时保留骨架可见 |
| 三项 dev-only 检查脚本的注入锚点改动引入假失败 | 🟡 中 | 统一以 #app-bootstrap 为锚点；modeScroll 的 preview 元素改为循环内查询；本机 Chrome 启动受限时按 SCOPE 使用 9222 远程实例或包装器，不改产品代码迎合测试 |
| 空文档延迟渲染导致目录树、占位层或主题切换状态不一致 | 🟡 中 | newFile 同步清空 tocRoots 并 renderToc；previewStale 只在成功渲染后清除；切换预览时先 cancel 调度器再补渲染；startup.check 增加空启动与激活场景 |
| 静态骨架与 main.ts 生成的外壳结构漂移 | 🟢 低 | 骨架仅复用 titlebar/toolbar/pane 三个外壳 class，不复制按钮、id 与交互节点；uiContract 断言骨架存在与同步标签缺失；结构调整时一并复核 |
| NSIS 未安装导致 wails build -nsis 静默跳过安装器 | 🔴 高 | CI 安装 NSIS 并写入 PATH；构建后断言 installer 文件存在；upload-artifact 设置 if-no-files-found: error |
| 静默安装/卸载在 runner 上异步退出或残留文件 | 🟡 中 | PowerShell 使用等待与重试循环；卸载后轮询目录与注册表；失败步骤输出目录内容并清理，避免污染后续 |
| 自定义 project.nsi 与未来 Wails 模板漂移 | 🟢 低 | CI 固定 Wails v2.14.0；模板仅改语言与卸载键名，保留默认宏与页面；升级 Wails 时以 diff 复核 |
| 发布版本注入失败或安装器版本与 tag 不一致 | 🟡 中 | 版本正则校验后才 patch；patch 在构建前执行；发布前检查 installer 存在；tag 触发路径与 workflow_dispatch 路径共用同一版本步骤 |
| 卸载删除 settings.json 引发用户预期偏差 | 🟢 低 | Project.md 明确记录；偏好非用户文档；便携版与安装版各自独立 |
| 本机无法执行 Windows 构建与安装验收 | 🟡 中 | 遵循 SCOPE，本地只做静态与 Go/前端验证；安装/卸载以云端 CI 为最终验收，结果回填 Tasks |

## 6. Phase 依赖关系

~~~text
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
~~~

Phase 1 与 Phase 2 共享启动路径与检查脚本，严格串行；Phase 3 的文件面独立，但为保持单一交付链与一次 CI 验证，排在 Phase 2 之后；Phase 4 汇总全部变更。

## 7. Subagent 协同规划

| 阶段 | 上下文关联度 | 并行收益 | 执行主体 | 决策理由 |
|------|-------------|---------|----------|----------|
| Phase 1：首屏链路 | 强（涉及 index.html、main.ts 与三项检查的同一启动时序） | 无（单一串行链） | 主线 | 改动集中在同一调用链，隔离会话需重载全部上下文，收益不足 |
| Phase 2：启动期收敛 | 强（依赖 Phase 1 的注入时序与检查桩） | 无（依赖 Phase 1） | 主线 | 同一文件的连续修改，拆分反而增加合并成本 |
| Phase 3：安装/卸载 | 中（CI、NSIS、wails.json 自包含，但受项目约定与 SCOPE 约束） | 低（可与 Phase 2 并行，但会同时改 CI 与文档） | 主线 | 改动面小，需与 Project.md 口径一致；委托的上下文重载成本高于收益 |
| Phase 4：文档与回归 | 强（需要汇总前三阶段全部事实与验收） | 无（最终串行门禁） | 主线 | 交付链收口，必须由主线掌握完整验证状态 |

**协同结论**：本阶段不派发 Subagent。三项功能改动均在同一启动/分发链路内，任务粒度小且强依赖会话上下文；没有可独立成篇、能形成真实并行收益的子任务。

## 8. Task 拆解预览

| Phase | 预估 Task 数 | 执行主体 | 主要 Task |
|-------|-------------|----------|-----------|
| Phase 1 | 1 | 主线 | 启动骨架、preload、load 后注入与检查脚本锚点 |
| Phase 2 | 1 | 主线 | 并发 IPC、空文档按需预览、startup.check 新场景 |
| Phase 3 | 3 | 主线 | NSIS 配置与中文模板、构建 CI 安装/卸载冒烟、发布版本与资产 |
| Phase 4 | 2 | 主线 | Project.md 同步、全链回归与归档 |

总计 7 个 Task。每个 Task 的文件范围、Details、验收命令与依赖关系见 Tasks.md。

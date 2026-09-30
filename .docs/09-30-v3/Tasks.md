# Tasks：按新规范重构与更新项目单一事实来源文档

**关联 Plan**：`Plan.md` —— 按新规范重构与更新项目单一事实来源文档 v1.1  
**总计 Task**：4 个  

---

## Phase 1：文档骨架重排与概述/环境运行对齐

### TASK-001：重构文档骨架并更新概述与环境运行章节

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：无
- **Description**：按新模板规范更新 `.docs/Project.md` 的文档头、引用说明、概述与环境运行小节，移除所有数字编号，非目标保留内联清单，并规范环境类操作陷阱的星号标注。
- **Details**：
  - 移除原文档头部的 `## 0. 维护速查` 章节及前言内的 `§0` 等章节编号指引，替换为简洁引述 `SCOPE.md` 与 `AGENTS.md` 的前言说明。
  - 调整 `## 概述` 小节：规范字段名称（`定位`、`阶段`、`非目标`）；**非目标保留内联清单**（v1 不做多标签页、插件系统、导出 HTML/PDF、Mermaid 图表），后附 `（详见 SCOPE.md 设计原则）` 引用，避免信息灭失。
  - 重排 `## 环境与运行` 小节：按模板字段规范组织平台、Shell、运行时、版本管理、运行与测试内容。
  - **环境类操作陷阱内联标注（以 `★` 开头标注操作现象）**：
    - ★ 路径含中文/空格须加引号；`settings.json` 持久化于 exe 所在目录（便携化），`%APPDATA%/Mado/` 仅为旧配置的一次性迁移源目录
    - ★ 本开发环境 `NODE_ENV=production` 且 `omit=dev`，安装依赖必须执行 `npm install --include=dev`，否则 esbuild 会被静默跳过
    - ★ 语法检查必须带 `--loader:.css=empty`，且禁止 `--outfile=/dev/null` 遗留 `nul.css`
    - ★ `frontend/dist/` 是 go:embed 的 FS 根，HTML 内引用资源必须写相对路径 `./app.js`/`./app.css` 而非 `./dist/app.js`；构建产物禁止提交 git
    - ★ 测试隔离：settings/filesys 通过包级 `storePath` 变量覆写隔离至 `t.TempDir()`；根包启动副作用用例通过 `t.Setenv` 同时设置 `APPDATA` 与 `XDG_CONFIG_HOME` 隔离 `os.UserConfigDir()`
  - 遵循单一事实来源（SSOT）：环境小节仅记录操作层面的现象与必选参数，其深层技术契约与因果分析归入约束与决策章节单点书写，不在此处展开长篇大论。
- **Acceptance Criteria**：
  - `.docs/Project.md` 头部无数字编号，前言与示例模板格式一致。
  - 概述与环境运行小节字段对齐新模板，非目标内联清单完整保留。
  - 环境类陷阱以 `★` 准确记录在环境与运行小节，无冗长因果重复。

---

## Phase 2：结构与约定章节合并重组

### TASK-002：合并目录与架构为统一结构章节并规范约定

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001
- **Description**：整合原 `## 3. 目录结构与模块职责` 与 `## 4. 架构与数据流` 为统一的 `## 结构` 章节，紧随其后整理 `## 约定` 章节。
- **Details**：
  - 在 `## 结构` 目录下提供核心目录树代码块，对关键目录与核心文件（`main.go`、`app.go`、`app_windows.go`、`app_other.go`、`internal/filesys`、`internal/mdrender`、`internal/settings`、`internal/theme`、`frontend/src`、`frontend/dist` 等）附加单行职责说明。
  - 紧接目录树提取梳理 `- **数据流**：`，按核心链路分类陈述（应用启动流、CodeMirror 编辑与防抖节流更新、公式定界符解析与 KaTeX 回填、偏好持久化通道、剪贴板管道与围栏复制代码块、聚焦模式目录树与双向行号跳转、窗口状态与全向缩放把手、保存与关闭确认模态）。
  - 紧接数据流明确 `- **依赖方向**：`，声明架构红线：`internal/*` 禁止相互依赖、`main.go`/`app.go` 为唯一允许引用 internal 的外层包、前端仅能通过 `frontend/wailsjs/` 生成绑定交互、核心 internal 包保持纯 Go 且测试无 GUI 依赖。
  - 规范 `## 约定` 章节：分项明确命名规范（Go 导出驼峰、前端 TS 驼峰、CSS kebab-case）、语言规范（用户面中文、注释与提交前缀英文）、错误处理机制（Go 返回 error 由前端统一捕获）与日志规范（无日志框架，仅 main.go 启动致命异常使用 println）。
- **Acceptance Criteria**：
  - 目录树关键项均有单行职责说明，无冗余说明。
  - 数据流分类清晰，核心交互链路无遗漏。
  - 依赖方向红线明确陈述。
  - 约定章节各项规则具体明确且可机械执行。

---

## Phase 3：约束决策提炼与术语/维护表重组

### TASK-003：提炼约束与决策并重组术语与维护章节

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-002
- **Description**：整合原有分散的约束、已知坑与历史决策记录，过滤叙事性流水账并保底提取长期实现契约，重构为 `## 约束与决策`、`## 术语` 与 `## 维护` 章节。
- **Details**：
  - **契约提取保底规则**：过滤历次审阅修补的叙事性流水账（如 09-30-v2、09-10-v3 等临时审阅描述），但**条目内确立的长期实现契约必须先全量提取为「规则——原因」或「日期 决策——理由」再清理**。重点提取项包括：
    - `09-30-v2`：Win32 原生剪贴板通过 `needFree` 标志追踪内存所有权，在 `GlobalLock` 或 `SetClipboardData` 失败时确保 `GlobalFree` 释放，系统接管后转移责任；
    - Chroma 包装层四条关键约束（行号落在 wrapper div、禁止 PreventSurroundingPre 破坏行包装、合并 info 属性、未高亮围栏块由包装渲染器补齐 pre/code）；
    - 跨语言常量成对维护与联动互指注释（Go 字节限制与 TS 字符限制等）；
    - 直接写 `scroller.scrollTop` 不被 CodeMirror 视口跟踪限制与通过 dispatch 滚动机制；
    - 原生确认 dialog 每次 `showModal()` 前清空 `returnValue` 并处理非按钮关闭；
    - 模式切换回编辑列时生产端同步执行 `view.measure()` 消除 0x0 几何真空期。
  - **非环境类 ★ 转换**：现行文档中非环境类的 ★ 条目（如事件监听挂 `cm.scrollDOM` 而非 contentDOM、纯 Go 包测试无 GUI、跨 realm target 不能 `instanceof Element`、CM6 选区层位于活动行下需半透明背景、特异性压制等）完整保留契约内容，去除 ★ 符号，统一按「规则——原因」写入约束与决策。
  - **单源去重**：已在环境与运行小节记录的 ★ 现象，本节专注于底层技术因果与设计契约，杜绝两处完全复制。
  - 将长期有效的技术选型按日期与「YYYY-MM-DD 选型决策——理由」格式提炼（Wails v2、goldmark、Vanilla TS、CodeMirror 6、iframe 原地更新、GitHub slug、8方向把手、Flat 目录、KaTeX 回填、便携存储、空白启动、ASTTransformer 行号、App.persist、尾随 80ms 节流、Fluent 2 双主题、Editor 默认模式、窗口尺寸解耦记忆、Win32 HWND 剪贴板管道等）。
  - 确认省略无外部集成的 `## 外部集成` 章节。
  - 整理 `## 术语` 章节，保留 `lastfile`、`预览通道`、`公式通道`、`源行号锚点` 与 `行号栏（gutter）` 等项目核心专有名词。
  - 将维护速查表移入文末 `## 维护` 章节，表头及同步章节名称完全对齐新版无编号章节名称。
- **Acceptance Criteria**：
  - `## 约束与决策` 条目全部符合「YYYY-MM-DD 决策——理由」或「规则——原因」规范。
  - 叙事性流水账彻底剥离，且所有长期物理限制与内存/渲染契约 100% 提炼保留。
  - 完全省略空的外部集成小节。
  - `## 术语` 与 `## 维护` 规范对齐，无旧章节序号引用残留。

---

## Phase 4：文档一致性审计与自检

### TASK-004：文档一致性自检与格式核验

- **Status**：DONE
- **Priority**：P1
- **Dependencies**：TASK-003
- **Description**：对 `.docs/Project.md` 展开全面的一致性检索核验，验证章节完整性与格式规范性。
- **Details**：
  - 全局检索排查旧版章节标识（如 `§0`、`§2`、`§8` 等），确保无遗漏残留。
  - 对照现行 `Project.md` 全文各节核对，确认所有既有契约与陷阱均已归宿妥当，无单点丢失。
  - 校验文档章节结构是否严格遵循 `Project.example.md` 示例（概述、环境与运行、结构、约定、约束与决策、术语、维护）。
  - 验证所有关键技术事实、测试说明与架构契约是否准确完备。
- **Acceptance Criteria**：
  - 全文无任何过时章节编号与断裂符号引用。
  - 章节结构与示例模板 100% 对应。
  - 自检确认全部既有架构契约无遗失，语言客观中立。

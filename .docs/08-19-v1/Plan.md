# Plan：公式渲染、设置页与编辑器自动换行

**状态**：DONE  
**日期**：2026-08-19  
**版本**：v1.5  
**完成日期**：2026-08-19  
**回归测试结论**：`go vet ./...` 零报错；`go test ./...` 4 包全 `ok`；`esbuild --loader:.css=empty` 零报错；`npm run build` 产出 `dist/app.js` + `dist/katex.min.css` + `dist/fonts/` 成功。

---

## 1. 背景与目标

Mado 目前是一个轻量高效的 Windows 原生 Markdown 编辑器。为提升科技/学术文档编辑体验与用户个性化偏好配置能力，本次计划引入 LaTeX 数学公式渲染、原生设置页以及编辑器自动换行与公式渲染功能开关，达成以下目标：

- **公式渲染**：支持行内公式 `$formula$` 与块级公式 `$$formula$$` 语法，基于 KaTeX 进行纯静态安全 HTML 渲染，确保在 sandboxed iframe 零脚本环境下正常显示且样式与明暗主题自适应。
- **设置页**：提供符合 Windows 11 Fluent 设计规范的设置页模态界面（支持标题栏齿轮按钮与 `Ctrl+,` 快捷键唤起），整合自动换行、公式渲染与主题切换等配置项。
- **功能开关与持久化**：支持编辑器自动换行（CodeMirror 6 `lineWrapping` 动态切换）与公式渲染开关，所有用户偏好均实时生效并持久化至 `%APPDATA%/Mado/settings.json`。

## 2. 阶段划分

### Phase 1：数据模型与后端设置持久化扩展

| 项目 | 内容 |
|------|------|
| **输入** | 现有 `internal/settings` 与 `internal/filesys` 结构 |
| **输出** | 扩展后的 `Settings` 模型（`Theme`, `WordWrap`, `Math`）、松耦合 JSON 读写兼容层与 App 绑定 API |
| **验收标准** | `go test ./internal/settings ./internal/filesys` 100% 通过，布尔与字符串字段混合存储不报错，默认值正确回退 |

### Phase 2：后端 Markdown 公式解析与保护

| 项目 | 内容 |
|------|------|
| **输入** | `internal/mdrender` 现有 goldmark 流水线 |
| **输出** | 接入 `goldmark-mathjax` 的公式解析与 AST 保护能力，输出标准 math 结构标签 |
| **验收标准** | `go test ./internal/mdrender` 通过，公式内部 LaTeX 特殊字符（如 `_`、`*`）不被 CommonMark 误解析为斜体/粗体 |

### Phase 3：前端公式渲染引擎与 KaTeX 样式集成

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/package.json`、`dist/` 静态构建流、mdrender 产出的数学标签 |
| **输出** | KaTeX 依赖接入、构建与字体静态资产配置、前端静态 HTML 数学公式渲染管道 |
| **验收标准** | `npm run build` 成功产出，iframe 内数学公式呈现排版美观且无控制台报错 |

### Phase 4：编辑器自动换行能力与设置页 UI 实现

| 项目 | 内容 |
|------|------|
| **输入** | CodeMirror 6 实例、`frontend/src/main.ts`、`frontend/src/style.css` |
| **输出** | `wrapCompartment` 动态换行隔间、Win11 风格设置页模态框（HTML/CSS/TS）、快捷键与按钮事件驱动 |
| **验收标准** | 换行开关即时切换 CodeMirror 排版；设置页支持 `Ctrl+,` 与齿轮按钮呼出与 Esc 关闭；更改设置即时生效并持久化 |

### Phase 5：全链路验证与交付准备

| 项目 | 内容 |
|------|------|
| **输入** | 全项目源码与配置文件 |
| **输出** | 零产物 esbuild 校验、前端构建产物、Go 测试与静态检查结果 |
| **验收标准** | `esbuild --loader:.css=empty` 零报错，`npm run build` 生成 `dist/`，`go test ./...` 与 `go vet ./...` 全部通过 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 数学公式渲染引擎 | KaTeX (纯静态 HTML 转换) | 在父级主线程预先转为静态 HTML 注入 iframe，iframe 保持严格无脚本沙箱（`sandbox="allow-same-origin"`），安全且极速 | MathJax（体积偏大且依赖运行时 JS 引擎）、Go 侧内嵌 JS 引擎（引入 CGo/V8，体积过重） |
| Markdown 公式解析 | Go 侧 `goldmark-mathjax` 扩展 | 原生接入 goldmark 管道，保护 LaTeX 特殊符号，统一由后端控制 AST | 正则前端预处理（极易误匹配代码块与转义符号） |
| 编辑器自动换行 | CodeMirror 6 `EditorView.lineWrapping` + `Compartment` | `@codemirror/view` 原生自带，零额外依赖，通过 Compartment 实现无刷新热切换 | CSS 强行注入 `white-space: pre-wrap`（破坏 CodeMirror 坐标与光标计算） |
| 设置页形态 | 应用内 Win11 Fluent 风格 `<dialog>` 模态卡片 | 与现存关闭确认模态体系对齐，免去多窗口 IPC 复杂度，层级高且天然具备 Esc/焦点管理 | 独立系统窗口（增加资源占用与多窗口同步开销）、原生 Win32 弹窗（无法自定义现代 UI） |
| 配置存储结构 | `settings.json` 采用 `map[string]any` 动态映射 | `filesys` 与 `settings` 松耦合共享同一文件，扩展字段时不发生类型反序列化冲突 | 强类型单独文件（破坏单一配置目录约定）、拆分多个 JSON（增加 I/O 与文件碎片） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `settings.json` 原使用 `map[string]string`，引入布尔型字段会导致反序列化报错 | 🔴 高 | 在 Phase 1 将 `filesys` 与 `settings` 的 JSON 反序列化统一升级为 `map[string]any` / `json.RawMessage`，并添加单测兜底 |
| iframe 严格沙箱无脚本执行权限，导致数学公式无法在帧内动态加载 | 🟡 中 | 由主前端在 `writePreview` 时调用 `katex.renderToString` 生成纯静态 DOM 结构，配合内嵌 KaTeX 样式与字体 |
| 编辑器自动换行切换时可能引起光标与滚动位置跳动 | 🟢 低 | 通过 CodeMirror 6 标准 `Compartment.reconfigure` 调度，保持文档状态与 selection 连续性 |

## 5. Phase 依赖关系

```
Phase 1 (数据模型与设置持久化) ──→ Phase 2 (Go 公式解析) ──┐
                                                           ├──→ Phase 4 (换行与设置页) ──→ Phase 5 (全量验收)
                                 Phase 3 (KaTeX 渲染引擎) ─┘
```

---

> ### Task 拆解预览
> 
> 实际 Task 详见 `Tasks.md`。总计预估 12 个原子 Task，严格对应 Phase 1 ~ Phase 5。

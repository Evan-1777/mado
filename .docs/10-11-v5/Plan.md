# Plan：批判性吸收 Review 审阅报告并修复残留问题（10-11-v5）

**状态**：DONE  
**日期**：2026-10-11  
**版本**：v1.0  
**回归测试结论**：全部测试通过（go vet ./...、go test ./...、go test -race ./...、npm test 6 项零依赖自检、npm run build、export.check.mjs、modeScroll.check.mjs、startup.check.mjs 全绿）。

---

## 1. 背景与目标

针对 10-11-v4 交付的审阅报告（自研按页分块 PDF 导出管线）进行批判性吸收，排查并剔除过度设计与过度安全防御，收敛并修复前面轮次残留的 8 项问题：
- **问题 1（对话框契约）**：修复 `SavePdfFileDialog` 返回 `(string, error)`，消除原生保存对话框失败被静默当作取消吞掉的不可观测性。
- **问题 2（缩放能力与 YAGNI）**：基于工程纪律与 YAGNI，果断下线未证实且与 html2canvas 白名单冲突的 50%~200% 缩放步进控件，导出恒定以 100% 物理比例输出，彻底消除右侧裁剪与坐标系断裂。
- **问题 3（主题模式）**：新增 `GetThemeCSS(themeName)` 接口，导出按用户选择的主题显式拉取完整设计令牌（tokens + base），解决暗色模式下导出「浅色」导致的代码块/标题等令牌黑白割裂问题。
- **问题 4（字体加载时序）**：在注入 KaTeX 样式表后显式 `await` 其 `load` 事件，确保 KaTeX `@font-face` 规则就绪后再回填公式并等待 `document.fonts.ready`。
- **问题 5（长文档克隆性能）**：在 `html2canvas` 捕获选项中配置 `ignoreElements` 阻断对 `#app` 与对话框大型 DOM 树的重复递归克隆，并为多页导出提供进度提示与 100 页上限保护。
- **问题 6（验证完备性）**：补齐 dev-only 无头 Chrome 导出冒烟用例（`export.check.mjs`），拦截验证导出的 PDF 二进制、页数及错误/取消分支。
- **问题 7（交付卫生）**：全面回收生产包残留的 `[ExportDiag]` 临时日志探针。
- **问题 8（规范克制）**：保持整体架构克制，不引入任何重型外部 PDF 库或过度抽象。

## 2. 阶段划分

### Phase 1：契约修正与主题样式拉取
| 项目 | 内容 |
|------|------|
| **输入** | `app.go`、`internal/theme/theme.go`、`frontend/src/main.ts` |
| **输出** | `SavePdfFileDialog` 返回 `(string, error)`，`GetThemeCSS(themeName)` 方法与前端错误感知、目标主题样式拉取 |
| **验收标准** | Go 单元测试通过，前端能区分保存取消与保存失败，暗色下导出浅色时拿到真实浅色 tokens |

### Phase 2：下线缩放控件与回收调试探针
| 项目 | 内容 |
|------|------|
| **输入** | `frontend/index.html`、`frontend/src/style.css`、`frontend/src/main.ts` |
| **输出** | 移除缩放步进 DOM 与样式，回收 `main.ts` 全部 `[ExportDiag]` 日志 |
| **验收标准** | 界面布局整洁美观，无死样式与无用事件绑定，代码库无 `[ExportDiag]` 残留 |

### Phase 3：捕获管线强化（字体、克隆隔离与进度）
| 项目 | 内容 |
|------|------|
| **输入** | `frontend/src/pdfExporter.ts` |
| **输出** | 样式加载时序 await、`html2canvas` 忽略 `#app` 节点、多页导出进度提示与安全页数保护 |
| **验收标准** | 依赖字体确定性等待，避免全文档 DOM 重复克隆，导出进度平稳更新 |

### Phase 4：无头自动化冒烟验证与契约锁定
| 项目 | 内容 |
|------|------|
| **输入** | `frontend/tests/` |
| **输出** | 新建 `export.check.mjs`，更新 `uiContract.test.mjs` |
| **验收标准** | 无头 Chrome 导出冒烟测试通过，UI 契约检查通过 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 对话框契约 | 返回 `(string, error)` | 区分"取消"（空串无错）与"失败"（带 error），从源头消除不可观测性 | 继续返回空串并在前端猜测（无法区分真取消与宿主崩溃） |
| 缩放能力 | 下线 50%~200% 步进控件，恒定 100% 输出 | YAGNI 与最短有效差分；html2canvas 不支持 zoom，模拟 scale 引入额外坐标不一致风险 | 引入 transform scale 与复杂的双重逆矩阵重计算（过度设计） |
| 主题样式提供 | `App.GetThemeCSS(themeName)` | 单一职责正交接口，复用现有 `theme.ThemeCSS`，纯净获取目标主题令牌 | 前端维护或字符串正则替换预览 CSS（脆弱且违背单一数据源） |
| 克隆开销优化 | `ignoreElements: (el) => el.id === 'app' \|\| el.tagName === 'DIALOG'` | 零新抽象，利用 html2canvas 原生选项在克隆根部跳过全部主编辑器与预览 DOM | 重新构建完全独立的 iframe 实例（开销更大且增加通信/样式隔离复杂性） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 移除缩放控件影响界面排版 | 🟢 低 | 检查弹窗间距，保持各选项对齐与 Fluent 2 排版规范一致 |
| KaTeX link 加载失败导致导出死等 | 🟢 低 | `waitForLink` 增加 500ms 超时保护并监听 `error` 事件降级继续 |
| 无头测试在无图形环境下不稳定 | 🟢 低 | 复用 `startup.check.mjs` 的成熟无头 Chrome 注入与等待契约 |

## 5. Phase 依赖关系

Phase 1 ~ Phase 3 逐步落地前后端修复，Phase 4 建立自动化冒烟用例锁定回归验证。

# Plan：审阅报告残留问题修复与安全加固

**状态**：DONE  
**日期**：2026-10-12  
**版本**：v2.0  
**回归测试结论**：Node 6 项自检全绿、headless Chrome 导出/启动/滚动自检全绿、Go 5 包单元测试全绿，零告警零回归。

---

## 1. 背景与目标

根据 Review 审阅报告反馈，修复残留的导出安全性与细节一致性问题，落实工程纪律与批判性吸收要求：
- 弥补导出 HTML 丢失沙箱防护导致的内联事件执行风险，注入声明式 CSP 元标签。
- 剥离导出 HTML 文档标题中多余的 `.md` 扩展名，与默认导出文件名 base 对齐。
- 清理测试脚本中退役的 PDF 1.4 注释并补齐 CSP 断言。
- 同步维护 `Project.md` 决策记录。

## 2. 阶段划分

### Phase 1：导出物 CSP 防护与标题一致性修复

| 项目 | 内容 |
|------|------|
| **输入** | Review 审阅报告结论与既有导出管线 |
| **输出** | 声明式 CSP meta 标签、剥离 `.md` 的标题处理、更新后的测试断言与决策文档 |
| **验收标准** | 导出物含 CSP 防护；title 不含 `.md`；全自动化验证链全绿通过 |

## 3. 决策与取舍

- **导出物 CSP**：采用声明式 `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net;">`，在零外部依赖与零运行时开销下封禁内联脚本与事件处理器，保持预览安全等级。
- **暗色主题打印**：保持 `print-color-adjust: exact` 完整呈现暗色背景，避免打印引擎丢弃深底导致白底浅字不可读；省墨白底打印需求通过导出浅色主题覆盖。
- **过度设计审计处理**：驳回删除 `options.title || 'untitled'`（属可选参数默认回退并非冗余防御）及修改 `exportToHtmlData` 签名的非必要建议。

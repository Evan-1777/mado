# Tasks：审阅报告残留问题修复与安全加固

**关联工作流**：Quick  
**状态**：DONE  
**完成日期**：2026-10-12  
**回归测试结论**：前端自检（6/6 PASS）、无头 Chrome 冒烟（5/5 PASS）、Go 测试（5/5 零告警通过）  
**总计 Task**：4 个 (4/4 DONE)

---

## 任务列表

### TASK-001：在导出 HTML 中添加声明式 CSP 元标签替代沙箱防线

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `frontend/src/htmlExporter.ts` 生成的 `<head>` 内添加 Content-Security-Policy `<meta>` 标签，阻断内联事件处理器与未经允许的脚本执行。
- **Details**：
  - 增加 `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net">`
  - 阻断 `<img onerror=...>` 等内联事件执行，保持与 iframe sandbox 一致的安全基线，同时允许同源 KaTeX CDN 样式与字体外链以及远程图片。
- **Acceptance Criteria**：
  - 生成的 HTML `<head>` 包含上述完整的 CSP `<meta>` 标签。
  - 不引入脚本允许规则，阻止内联 JS 恶意执行。

### TASK-002：剥离导出 HTML 文档标题中的 .md 扩展名

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `frontend/src/main.ts` 中组装导出选项时，将提取自窗口标题的 `docTitle` 剥离 `.md` 后缀。
- **Details**：
  - 将 `titleEl.textContent || 'untitled'` 经 `replace(/\.md$/i, '')` 处理，使浏览器打开导出的 HTML 时标题栏与另存为默认文件名 base 一致。
- **Acceptance Criteria**：
  - 窗口标题为 `notes.md` 时，导出的 HTML `<title>` 为 `notes`。
  - 未命名或无后缀标题时正常回退，无异常行为。

### TASK-003：更新测试断言并清理陈旧 PDF 注释

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `frontend/tests/htmlExporter.test.ts` 与 `frontend/tests/export.check.mjs` 中补充 CSP 断言，并移除测试脚本中残留的陈旧 PDF 注释。
- **Details**：
  - `frontend/tests/htmlExporter.test.ts` 添加对 CSP `<meta>` 标签的断言。
  - `frontend/tests/export.check.mjs` 添加对 CSP `<meta>` 标签的断言，并将 line 132 等处的 "PDF 1.4" 注释修正为 HTML 导出描述。
- **Acceptance Criteria**：
  - `cd frontend && npm test` 全绿通过。
  - `node tests/export.check.mjs` 无头浏览器冒烟全绿通过。
  - 测试脚本内无陈旧 PDF 描述。

### TASK-004：同步维护 Project.md 决策记录

- **Status**：DONE
- **Executor**：主线
- **Description**：在 `.docs/Project.md` 的「约束与决策」中补记导出物 CSP 安全基线及暗色主题打印色彩保真的设计取舍。
- **Details**：
  - 记录导出 HTML 采用声明式 CSP 取代 iframe sandbox，阻断 Markdown 内联事件。
  - 记录暗色主题下 `print-color-adjust: exact` 完整保留暗色背景的设计权衡与考量（防止打印引擎丢失暗底导致白底浅字不可读，浅色打印由导出浅色主题覆盖）。
- **Acceptance Criteria**：
  - `.docs/Project.md` 内容与代码库实际行为一致。

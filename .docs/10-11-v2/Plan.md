# Plan：批判性吸收 Review 审阅报告并修复残留问题

**状态**：DONE  
**日期**：2026-10-11  
**版本**：v1.0  
**回归测试结论**：全部通过（npm test、npm run build、tests/modeScroll.check.mjs、tests/startup.check.mjs、go test ./... 全部通过）  

---

## 1. 背景与目标

针对 10-11-v1（文档导出 PDF 方案 B）审阅报告进行批判性吸收，修复残留问题：
- P1（安全）：离屏导出 iframe 补齐 `sandbox="allow-same-origin"`，与既有主预览 iframe 维持一致的安全模型，阻断内联 `on*` 执行。
- P2（健壮性）：在 `runExport()` 打印同步调用发生异常时立即执行 `cleanup()`，防止离屏 DOM 节点泄漏。
- P3（测试）：在 `uiContract.test.mjs` 中锁定导出 iframe 沙箱与分段器无障碍属性断言。
- P4（无障碍）：为色彩与边距分段器添加并同步 `aria-pressed` 状态。
- P5（过度设计/YAGNI）：剔除静态装饰且暗示虚假预览的 `.sheet-preview-card` 结构与样式。

## 2. 阶段划分

### Phase 1：安全与健壮性修复
- 输出：`frontend/src/main.ts` 补齐沙箱与同步异常清理

### Phase 2：结构精简与无障碍
- 输出：剔除 `.sheet-preview-card`，为分段器增加 `aria-pressed`

### Phase 3：契约测试与文档维护
- 输出：`frontend/tests/uiContract.test.mjs` 锁定契约，更新 `Project.md`

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案 |
|--------|------|------|----------|
| 导出 iframe 沙箱 | `sandbox="allow-same-origin"` | 维持全局沙箱安全契约，阻断 Markdown 原生 HTML 内联 `on*` 脚本 | 无沙箱（存在同源脚本执行风险） |
| 异常清理保障 | 针对同步 print 异常直接 cleanup | 消除节点常驻 DOM 泄漏风险 | 仅依赖 onafterprint（抛错时不触发） |
| 迷你纸张卡片 | 彻底删除（YAGNI） | 纯静态点缀且不承载信息，删除符合极简生产哲学 | 改为复杂动态伪预览（过度设计膨胀） |
| 分段器无障碍 | 同步 `aria-pressed="true"/"false"` | 规范标准的无障碍按钮组状态表达 | 仅依赖视觉类（屏幕阅读器无法感知） |

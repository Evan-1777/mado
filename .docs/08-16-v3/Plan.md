# Plan：修复目录解析正则表达式转义错误

**状态**：DONE  
**开始日期**：2025-06-01  
**完成日期**：2025-06-01  

## 问题定义

用户报告"大量 `#` 标题内容即使存在也显示目录为空"，经 Explore 确认：

- `frontend/src/main.ts:117` fenced code block 检测正则：`/^\\s*(```|~~~)/`
- `frontend/src/main.ts:119` ATX 标题匹配正则：`/^(\\s{0,3})(#{1,6})\\s+(.+?)\\s*#*\\s*$/`

错误使用 `\\s`（字面量反斜杠+s）而非 `\s`（空白字符类），导致：
1. fenced code block 边界检测失败，代码块内的 `#` 被误识别为标题
2. 标题行前导空白与内容分隔符匹配失败，真实标题不被识别

## 实施阶段

### Phase 1：修复正则表达式
- 将 117、119 行所有 `\\s` 替换为 `\s`
- 保留第 18 行 `baseName` 中的 `[\\/]`（路径分隔符，正确）

### Phase 2：验证修复
- 本地语法检查：`esbuild` 零产物编译
- 前端构建：`npm run build` 产出 `dist/`
- 测试真实文档：用户提供的示例 Markdown（含中文标题、HTML、代码块、混合标点）

### Phase 3：文档维护
- 更新 `.docs/Project.md` §6 约束记录：补充正则转义修复

### Phase 4：Git Commit
- 暂存 `frontend/src/main.ts`、`.docs/Project.md`
- 提交信息：`fix(toc): correct regex escape in parseToc - \\s to \s`

## 风险评估

- **低风险**：纯正则修复，向后兼容
- **测试依赖**：需真实 Markdown 文档验证，本地无 GUI 测试框架

## 验收标准

1. 用户提供的示例文档（含中文标题、代码块内 `#`）能正确解析目录
2. `npm run build` 成功产出 `dist/`
3. `esbuild` 语法检查通过

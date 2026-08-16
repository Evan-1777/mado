# Tasks：修复目录解析正则表达式转义错误

**活跃阶段**：修复目录解析正则表达式转义错误  
**创建日期**：2025-06-01  

---

## Task 1：修复 parseToc 函数正则表达式转义

**状态**：TODO  
**优先级**：P0  
**负责模块**：`frontend/src/main.ts`  

### 描述
将 `parseToc` 函数中的两处正则表达式从 `\\s`（字面量反斜杠+s）修改为 `\s`（空白字符类）。

### Details
- **文件**：`frontend/src/main.ts`
- **第 117 行**：`/^\\s*(```|~~~)/` → `/^\s*(```|~~~)/`
- **第 119 行**：`/^(\\s{0,3})(#{1,6})\\s+(.+?)\\s*#*\\s*$/` → `/^(\s{0,3})(#{1,6})\s+(.+?)\s*#*\s*$/`
- **保持不变**：第 18 行 `baseName` 函数的 `/[\\/]/`（路径分隔符，正确）

### 验收标准
- 修改后 `esbuild --bundle src/main.ts --loader:.css=empty` 语法检查通过
- 代码中仅 `baseName` 函数保留 `\\`，`parseToc` 内所有 `\\s` 已替换为 `\s`

---

## Task 2：前端构建验证

**状态**：TODO  
**优先级**：P0  
**依赖**：Task 1  

### 描述
执行完整前端构建流程，确认修复后代码可正常编译并产出 `dist/`。

### Details
```bash
cd frontend
npm run build
```

### 验收标准
- `dist/app.js`、`dist/app.css`、`dist/index.html` 成功生成
- 构建过程无 TypeScript/esbuild 错误

---

## Task 3：真实文档测试（手动）

**状态**：TODO  
**优先级**：P0  
**依赖**：Task 2  

### 描述
使用用户提供的示例文档（含中文标题、代码块内 `#`、全角标点、HTML）验证目录解析修复效果。

### Details
测试文档特征：
- 多层级中文标题（如 `# 网页动画实现方案参考`、`## 结论先行`）
- fenced code block 内含 `#`
- 标题含全角括号、英文混排（如 `动手学深度学习（Dive into Deep Learning，D2L.ai）`）
- 内联 HTML（表格、样式 div）

### 验收标准
- Editor/Preview 聚焦模式下目录侧栏显示所有真实标题
- 代码块内的 `#` 不出现在目录树
- 点击目录项能正确跳转到对应标题（Editor 行定位、Preview iframe 滚动）
- 不显示"当前文档没有标题"空状态

---

## Task 4：更新 Project.md §6 约束记录

**状态**：TODO  
**优先级**：P1  
**依赖**：Task 3  

### 描述
在 `.docs/Project.md` 第 6 章节补充本次修复记录，关联上次 `split('\n')` 修复。

### Details
在 §6 现有条目后追加：
```markdown
- 「`parseToc` 正则使用 `\\s` 导致 fenced code block 检测与标题匹配失败——原因：正则字面量 `/pattern/` 中 `\\s` 匹配字面量反斜杠+s 而非空白字符类，致代码块内 `#` 误识别为标题、真实标题不被识别；已修复为 `\s`（2025-06-01）；同次修复遗漏此处（上次仅改 `split('\n')`）」
```

### 验收标准
- `.docs/Project.md` §6 新增条目格式符合现有风格
- 记录包含：问题、原因、修复、日期

---

## Task 5：Git Commit

**状态**：TODO  
**优先级**：P0  
**依赖**：Task 4  

### 描述
提交修复变更到 git 仓库。

### Details
```bash
git add frontend/src/main.ts .docs/Project.md
git commit -m "fix(toc): correct regex escape in parseToc - \\s to \s

- Replace \\s (literal backslash+s) with \s (whitespace class) in fenced block detection and ATX heading match
- Fixes issue where # inside code blocks were parsed as headings and real headings were ignored
- Update Project.md constraint log"
```

### 验收标准
- `git status` 显示 working tree clean
- `git log -1` 提交信息清晰描述修复内容
- 仅暂存相关文件（`frontend/src/main.ts`、`.docs/Project.md`）


---

**阶段状态**：DONE  
**完成日期**：2025-06-01

**回归测试结论**：
- ✓ Go 测试全通过（4 模块）
- ✓ 正则逻辑验证：5/5 标题识别、代码块内 `#` 正确忽略
- ✓ 前端构建通过（TypeScript 编译 + Vite 打包）
- GUI 交互验证由 Windows 目标平台用户验收

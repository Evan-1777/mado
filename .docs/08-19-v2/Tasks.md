# Tasks：设置面板响应、标题栏图标与公式渲染解析缺陷修复

**关联 Plan**：`Plan.md` —— 设置面板响应、标题栏图标与公式渲染解析缺陷修复 v1.0  
**总计 Task**：6 个

---

## Phase 1：DOM 结构修复与标题栏图标标准化

### TASK-001：修复 index.html 中 close-dialog 闭合标签

- **Status**：DONE
- **Description**：在 `frontend/index.html` 中为 `<dialog id="close-dialog">` 补齐遗漏的 `</dialog>` 闭合标签，消除 `#settings-dialog` 的非法嵌套。
- **Details**：
  - 在 line 26 `</form>` 之后添加 `</dialog>` 闭合标签
  - 确保 `#close-dialog` 与 `#settings-dialog` 在 DOM 树中为同级并列关系
- **Acceptance Criteria**：
  - `frontend/index.html` 语法正确，两个 `<dialog>` 标签互不嵌套
  - 打开设置面板时，模态浮层正常居中展示在页面顶层

### TASK-002：规范 main.ts 中的 GLYPH_SETTINGS 矢量图标

- **Status**：DONE
- **Description**：重构 `frontend/src/main.ts` 中的 `GLYPH_SETTINGS` 常量，采用标准 Lucide 风格的清晰 15x15 矢量齿轮图标。
- **Details**：
  - 采用标准 24x24 viewBox 缩放到 15x15，保持 stroke-width="1.8"、stroke-linecap="round"、stroke-linejoin="round"
  - 统一线条描边与中心圆结构，消除畸变
- **Acceptance Criteria**：
  - 齿轮 8 个齿形对称平整，中心圆形居中
  - 在深色/浅色主题下与打开、保存、新建、主题切换按钮在尺寸与线条粗细上高度一致

---

## Phase 2：LaTeX 公式解析器边界容错与行内兼容

### TASK-003：增强 mathBlockParser 尾随空白清洗与块闭合判定

- **Status**：DONE
- **Description**：在 `internal/mdrender/math.go` 中修改 `mathBlockParser` 的 `Open` 与 `Continue` 方法，引入 `mathBlockData` 上下文状态并剔除行尾空格与制表符后再进行 `$$` 后缀判断。
- **Details**：
  - `Open` 方法中：使用 `bytes.TrimRight(rest[2:], " \t\r\n")` 取得行尾剥离空白后的切片进行 `bytes.HasSuffix(..., []byte("$$"))` 判断，单行闭合时记录 `closed: true`
  - `Continue` 方法中：检查 `data.closed`，若已在单行闭合则直接返回 `parser.Close`，否则剥离尾随空白并在检测到 `$$` 时闭合
  - 提取公式内容时统一使用 `bytes.TrimSpace` 净化内容，杜绝未闭合块逃逸
- **Acceptance Criteria**：
  - 单行 `$$ \text{foo} $$ `（尾随空格/制表符）能立即被判定为 Close 状态
  - 公式下方的 Markdown 标题（`#`）、水平分割线（`---`）、普通段落不受任何影响，正常解析为独立 AST 节点

### TASK-004：扩展 mathInlineParser 支持行内 $$ 定界符

- **Status**：DONE
- **Description**：在 `internal/mdrender/math.go` 中调整 `mathInlineParser`，支持在段落行内解析 `$$...$$` 格式公式。
- **Details**：
  - 识别起始为 `$$` 还是 `$`，动态匹配对应的闭合定界符
  - 维护货币符号和前后空白启发式规则，防止非公式文本误匹配
- **Acceptance Criteria**：
  - 行内 `$$a=b$$` 在段落中正确渲染为 `<span class="math-inline" ...>`
  - 原有单 `$` 规则与转义 `\$` 行为完全保持

---

## Phase 3：自动化测试验证与全链路回归

### TASK-005：编写 mdrender 公式解析与结构隔离单元测试

- **Status**：DONE
- **Description**：在 `internal/mdrender/mdrender_test.go` 中新增测试用例，覆盖尾随空白容错与后续 Markdown 元素隔离。
- **Details**：
  - 测试用例 1：含尾随空格与中文文本的单行公式（复现 `image.png` 场景）
  - 测试用例 2：公式紧跟标题与分割线，断言输出中包含对应的 `<h2>`、`<hr>` 与 `<div class="math-block">`
  - 测试用例 3：行内 `$$...$$` 解析测试
- **Acceptance Criteria**：
  - 新增测试用例全部通过，断言严格匹配预期 HTML 结构

### TASK-006：执行全链路自动化验证与零产物检查

- **Status**：DONE
- **Description**：执行全套 Go 单元测试与前端 esbuild 语法检查，确保无回归。
- **Details**：
  - 运行 `export PATH=$HOME/.local/go/bin:$PATH && go test -count=1 ./...`
  - 运行 `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`
- **Acceptance Criteria**：
  - Go 5 个包测试全部 pass
  - 前端 esbuild 零报错

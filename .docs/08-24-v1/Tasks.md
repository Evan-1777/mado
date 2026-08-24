# Tasks：支持自定义 Preview 字体

**关联 Plan**：`Plan.md` —— 支持自定义 Preview 字体 v1.0  
**总计 Task**：8 个

## Phase 1：偏好模型与持久化

### TASK-001：增加 Preview 字体设置字段与默认值

- **Status**：DONE
- **Description**：在设置模块中增加 Preview 首选字体字段，定义与当前 Preview 字体栈等价的默认首选字体，并让默认设置包含该字段。
- **Details**：
  - 新字段命名为 `PreviewFont`，JSON 顶层键命名为 `previewFont`
  - 默认首选字体为 `Cascadia Code`
  - 保留 `Theme`、`Wrap`、`Math` 的现有默认值和 JSON 键
- **Acceptance Criteria**：
  - 运行 `go test ./internal/settings` 通过
  - 缺失 `previewFont` 的设置文件加载为 `PreviewFont == "Cascadia Code"`
  - 保存后 JSON 同时包含 `theme`、`wrap`、`math`、`previewFont`

### TASK-002：实现 Preview 字体读取、保存与输入校验

- **Status**：DONE
- **Description**：为 Preview 字体设置实现统一的规范化与合法性校验，并确保加载、保存和现有设置字段共用同一 settings.json。
- **Details**：
  - 规范化首尾空白
  - 拒绝空值、超过 100 个字符的值、控制字符、双引号、反斜杠、逗号、分号、换行和 CSS 注释分隔符
  - 旧配置中的非法 `previewFont` 回退默认值
  - `Save` 继续保留 `lastfile` 等无关顶层字段
  - 导出可供 `app.go` 调用的校验/规范化入口，避免 App 层重复规则
- **Acceptance Criteria**：
  - 运行 `go test ./internal/settings` 通过
  - 单测覆盖：合法字体名、首尾空白、空值、超长值、控制字符、CSS 分隔符和类型错误
  - 运行 `rg 'previewFont' internal/settings` 可见读写键，且不存在第二套校验实现

## Phase 2：Preview CSS 字体注入

### TASK-003：让主题 CSS 使用 Preview 字体变量

- **Status**：DONE
- **Description**：修改 Preview 基础样式，使正文、行内代码、代码块和键盘标记的字体从统一 CSS 变量读取，并保留既有固定回退字体。
- **Details**：
  - `base.css` 声明 `--preview-font` 默认回退栈
  - body、code、pre code、kbd 使用该变量
  - 主题 token 文件不重复声明字体
- **Acceptance Criteria**：
  - 运行 `go test ./internal/theme` 通过
  - 生成的亮/暗 CSS 包含 `--preview-font` 和上述选择器的 `font-family: var(--preview-font)`
  - 运行 `rg 'font-family: "Cascadia Code"' internal/theme` 不再出现 Preview 规则中的硬编码字体

### TASK-004：扩展主题 CSS 组合接口并转义字体名称

- **Status**：DONE
- **Description**：扩展主题 CSS 组合逻辑，接收已校验的 Preview 首选字体并安全地生成 CSS 字体变量，同时保持主题校验行为不变。
- **Details**：
  - 将 `ThemeCSS` 扩展为接收 theme 与 preview font 的组合输入，或按现有调用约定增加等价的最小接口
  - 首选字体作为 CSS 字符串时进行必要转义，并追加现有固定回退栈
  - App 的 `GetCSS` 使用当前设置的 `PreviewFont`
  - 更新所有调用点和 theme 单测，不新增依赖
- **Acceptance Criteria**：
  - 运行 `go test ./internal/theme ./...` 通过
  - 亮暗主题输出均包含输入字体名和 `Cascadia Code`/`Consolas` 等回退字体
  - 输入包含 CSS 结构字符时，theme 层测试确认不会形成可执行的额外声明
  - `rg 'ThemeCSS\(' --glob '*.go'` 的调用点全部使用新契约

## Phase 3：设置界面与即时应用

### TASK-005：补齐 Wails 设置模型与字体设置绑定

- **Status**：DONE
- **Description**：将 Go 设置字段同步到前端生成绑定模型，并新增保存 Preview 字体的 App 绑定方法。
- **Details**：
  - `settings.Settings` 的前端模型包含 `PreviewFont`
  - 新增 `SetPreviewFont(font string) error`，复用 settings 模块校验和保存逻辑
  - 手动同步 `frontend/wailsjs/go/main/App.js`、`App.d.ts` 和 `frontend/wailsjs/go/models.ts` 供本地 esbuild 检查使用
- **Acceptance Criteria**：
  - 运行 `rg 'SetPreviewFont|PreviewFont' app.go frontend/wailsjs` 能找到 Go 方法、JS 声明/导出和模型字段
  - 运行 `go test ./...` 通过
  - 运行 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（工作目录 `frontend`，不生成输出文件）通过

### TASK-006：新增设置输入控件并同步初始值

- **Status**：DONE
- **Description**：在设置模态中新增 Preview 字体输入项，并将初始化返回值同步到输入控件。
- **Details**：
  - 输入控件使用 `text` 类型、明确的 `id` 和当前字体值
  - 设置项说明只表达用途，不新增字体发现或安装承诺
  - `Settings` 前端接口包含 `PreviewFont`
  - `init` 与打开设置时均显示当前有效值
- **Acceptance Criteria**：
  - 运行 `rg 'set-preview-font|PreviewFont|Preview 字体' frontend/index.html frontend/src/main.ts` 均有对应实现
  - 运行前端 esbuild 零产物检查通过
  - 静态检查确认输入控件位于 `settings-dialog` 内且不是另一个 dialog 的子节点

### TASK-007：接线字体变更的持久化、失败恢复与 Preview 刷新

- **Status**：DONE
- **Description**：将字体输入控件接入 `SetPreviewFont`，成功后更新当前字体、失效 Preview CSS 缓存并复用原地刷新链路，失败后恢复上一次有效值。
- **Details**：
  - 记录当前有效字体，不在绑定失败时更新状态
  - 变更成功后调用现有 Preview 刷新逻辑，不重设 `srcdoc`
  - 输入失焦或回车提交时处理首尾空白；空值和非法输入显示原值
  - 不改变主题、自动换行和公式开关的行为
- **Acceptance Criteria**：
  - 运行前端 esbuild 零产物检查通过
  - `rg 'SetPreviewFont|previewCss = .|refreshPreview' frontend/src/main.ts` 可见成功路径同时包含保存、缓存失效和刷新调用
  - `rg 'srcdoc =' frontend/src/main.ts` 仅保留现有首帧/异常回退路径，字体变更代码不直接重设 srcdoc

## Phase 4：验证、文档维护与归档

### TASK-008：执行全量验证并同步项目文档

- **Status**：DONE
- **Description**：执行 Go 与前端验证，更新 `.docs/Project.md` 中的设置模型、Preview CSS 数据流和 Wails 绑定事实，完成阶段文档归档。
- **Details**：
  - 按项目约定执行 `go vet ./...`、`go test ./...`
  - 在 `frontend` 执行 `npm install --include=dev`（依赖缺失时）和 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`
  - 必要时执行 `npm run build` 以验证 dist 资产链，但不提交 `frontend/dist`
  - 更新 `.docs/Project.md`：设置字段、Preview 字体 CSS 注入、`SetPreviewFont` 绑定和已知输入约束
  - 在 Plan/Tasks 中记录完成日期与回归测试结论，确认根目录文档移入 `.docs/MM-DD-vN/`
- **Acceptance Criteria**：
  - `go vet ./...` 退出码为 0
  - `go test ./...` 退出码为 0
  - 前端 esbuild 零产物检查退出码为 0
  - `git diff --check` 退出码为 0
  - 归档目录同时包含 `Plan.md` 与 `Tasks.md`，根目录不再有这两个文件
  - `.docs/Project.md` 不再描述 Preview 字体为不可配置的硬编码栈

---

## 完成记录

- **状态**：DONE
- **完成日期**：2026-08-24
- **回归测试结论**：`go vet ./...` 退出码 0；`go test ./...`（含 settings/theme 新用例）全部通过；前端 esbuild 零产物语法检查退出码 0；`npm run build` 成功产出 dist（未提交）；`git diff --check` 退出码 0。旧配置（缺 previewFont 字段）加载回退默认 Cascadia Code；非法字体名（空/超长/控制字符/CSS 分隔符）被 Go 侧校验拒绝且不改变持久化状态。

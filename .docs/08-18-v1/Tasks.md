# Tasks：窗口缩放修复、目录栏性能与色彩层级重构、标题栏图标规范化

**关联 Plan**：`Plan.md` —— 窗口缩放修复、目录栏性能与色彩层级重构、标题栏图标规范化 v1.0  
**总计 Task**：8 个

---

## Phase 1：标题栏动作按钮图标替换与无文字纯图标重构

### TASK-001：替换标题栏动作按钮图标为 SVG 矢量图形并移除文字标签

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中定义符合功能的内联 SVG 图标（Open 文件夹图标、Save 磁盘图标、New 文件新增图标、Theme 对比度图标），替换旧的 Unicode 符号；移除所有动作按钮内部的文本标签（`<span>Open</span>` 等），保留纯图标及完整的 `title` 与 `aria-label` 属性。
- **Details**：
  - 定义 `GLYPH_OPEN`（文件夹轮廓矢量图标）
  - 定义 `GLYPH_SAVE`（软盘/磁盘轮廓矢量图标）
  - 定义 `GLYPH_NEW`（新建文件矢量图标）
  - 定义 `GLYPH_THEME`（暗/亮对比度矢量图标）
  - 将 `titlebar-actions` 内的 HTML 结构简化为纯图标按钮，补齐中文无障碍标签与快捷键提示
- **Acceptance Criteria**：
  - `btn-open`、`btn-save`、`btn-new`、`btn-theme` 按钮内不再包含任何文字文本
  - Open 按钮图标为标准文件夹，Save 按钮图标为标准磁盘
  - 鼠标悬停显示清晰的中英文提示和快捷键提示

### TASK-002：优化标题栏动作按钮样式与紧凑布局

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 中重构 `.icon-btn` 样式，调整为与 Windows 11 标题栏风格一致的正方形/微圆角纯图标按钮，优化间距、尺寸与悬停/激活视觉反馈。
- **Details**：
  - 将 `.icon-btn` 设置为固定尺寸（30px × 30px），`justify-content: center`，`align-items: center`
  - 调整 `.titlebar-actions` 的 `gap` 为 4px~6px
  - 保持 `--wails-draggable: none` 与主题自适应色彩
- **Acceptance Criteria**：
  - 标题栏右侧动作按钮与窗口控制按钮（最小化/最大化/关闭）在视觉高度和风格上协调一致
  - 浅色/深色主题下图标颜色与悬停背景清晰可见

---

## Phase 2：无边框窗口多方向与右下角缩放修复

### TASK-003：实现原生视口全方向窗口缩放边缘控制器

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中禁用 Wails 存在缺陷的内置缩放监听，实现基于 `window.innerWidth` 与 `window.innerHeight` 的视口边缘精准判定控制器，覆盖全方向（8 个方向）的光标切换与 `WailsInvoke("resize:" + edge)` 触发。
- **Details**：
  - 设置 `(window as any).wails.flags.enableResize = false`，防止旧逻辑干扰
  - 设定 6px 边缘检测阈值，通过 `clientX` 与 `clientY` 相对 `innerWidth` / `innerHeight` 精确计算 `n-resize`, `s-resize`, `w-resize`, `e-resize`, `nw-resize`, `ne-resize`, `sw-resize`, `se-resize`
  - 在 `window` 监听 `mousemove`、`mousedown` 与 `mouseleave`
  - 按下鼠标左键时阻断默认行为并发送 IPC 消息给 Go 端触发 Win32 原生边缘拖拽
- **Acceptance Criteria**：
  - 鼠标靠近窗口右侧、底部、右下角时，光标精准变为对应的缩放形状（`e-resize`, `s-resize`, `se-resize`）
  - 按住左键拖拽能正常平滑调整窗口宽度与高度

### TASK-004：接入 Preview Iframe 跨帧鼠标移动与缩放事件代理

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中为 `previewIframe` 的文档内容挂载鼠标事件代理，当鼠标在 iframe 内部靠近窗口外边缘时，无缝识别边缘并支持触发窗口缩放。
- **Details**：
  - 在 `hookPreviewLinks` 或 iframe 内容加载完成后，为 iframe 的 document 绑定 `mousemove`、`mousedown`、`mouseleave`
  - 通过 `previewIframe.getBoundingClientRect()` 将 iframe 内部坐标映射为窗口视口绝对坐标
  - 命中窗口外边缘时同步设置 iframe 文档与父级文档的 cursor，并在点击时触发 `WailsInvoke`
- **Acceptance Criteria**：
  - 鼠标在 Split 模式或 Preview 模式下移动到 iframe 覆盖的右边缘、底边缘或右下角时，能够立即响应缩放光标并支持拖拽调整窗口大小
  - 鼠标离开边缘区域时光标恢复正常

---

## Phase 3：目录栏性能深度优化与无缩进色彩深度层级样式

### TASK-005：重构目录层级为无缩进 Flat 色彩深度系统（Dark/Light 双主题令牌）

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` 与 `frontend/src/main.ts` 中移除目录树的阶梯缩进（`padding-left: calc(var(--toc-level) * ...)` 改为统一扁平对齐），新增 H1~H6 六级深浅颜色设计令牌与字重/徽章样式，适配 Dark 与 Light 双主题。
- **Details**：
  - 移除 `.toc-row` 的基于层级的 padding-left，统一为无缩进平整布局
  - 在 `:root` 与 `:root[data-theme="light"]` 中定义 `--toc-h1` 至 `--toc-h6` 及对应 hover/badge 颜色令牌
  - 为目录项添加 `.toc-level-1` ~ `.toc-level-6` 类或 `data-level` 选择器，分别设置对应颜色与字重（H1 最高对比度/粗体，向后依次柔和递减）
  - 增加精致的 `H1`/`H2` 等层级标签或指示器，确保层级一目了然
- **Acceptance Criteria**：
  - 目录树所有层级左对齐无缩进，长标题不再因深层嵌套而严重折行
  - H1 至 H6 各层级在深色和浅色模式下色彩深度过渡平滑、对比分明且符合可读性要求

### TASK-006：深度优化目录栏性能（签名哈希比对、惰性更新、事件委托、局部展开折叠）

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中重构 TOC 解析与渲染机制，增加标题签名比对避免无变化时的 DOM 重建；Split 模式下惰性跳过 DOM 生成；采用单一事件委托绑定；展开/折叠采用纯 CSS class 局部切换。
- **Details**：
  - 单次正则扫描或高效行处理，构建包含 `signature`（所有标题文本、层级、行号的指纹）的缓存
  - 当且仅当标题签名变化且侧边栏处于可见模式（`editor-only` 或 `preview-only`）时才执行 DOM 重建
  - 在切换至 `editor` / `preview` 模式时按需补齐渲染
  - 使用 `DocumentFragment` 批量构建节点，统一在 `tocTree` 容器上通过事件委托处理跳转与展开折叠
  - 展开/折叠全部时直接切换 DOM 类名或局部更新，不再 `innerHTML = ''` 全量重排
- **Acceptance Criteria**：
  - 编辑非标题内容时，目录栏完全零 DOM 销毁与重建（CPU/内存开销极低）
  - 在大文档（数百行标题）下展开/折叠与跳转操作零卡顿
  - Split 模式下无任何 TOC DOM 渲染开销

---

## Phase 4：全链路验证、文档维护与归档

### TASK-007：执行全链路构建与测试验证

- **Status**：DONE
- **Description**：执行前端语法检查、生产打包与 Go 端单元测试，确保零错误与零回归。
- **Details**：
  - 运行 `node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty` 检查语法
  - 运行 `npm run build` 生成最新 `dist/`
  - 运行 `export PATH=$HOME/.local/go/bin:$PATH && go vet ./... && go test ./...`
- **Acceptance Criteria**：
  - esbuild 语法检查 0 报错
  - npm run build 构建成功
  - go test 4 个包全部 PASS

### TASK-008：同步维护 .docs/Project.md 并执行版本归档与 Git 提交

- **Status**：DONE
- **Description**：将本次架构、约定与已知坑更新至 `.docs/Project.md`；将 `Plan.md` 与 `Tasks.md` 归档至 `.docs/08-18-v1/`；执行 Git 提交。
- **Details**：
  - 更新 Project.md 中关于窗口全向缩放、TOC 扁平色彩系统、标题栏纯图标组件的说明
  - 校验 Plan.md 与 Tasks.md 状态为 DONE，归档至 `.docs/08-18-v1/`
  - 执行 `git status`、`git diff`，撰写清晰 Commit Message 并提交
- **Acceptance Criteria**：
  - 根目录无残留 Plan.md / Tasks.md
  - `.docs/08-18-v1/` 包含完整归档文件
  - Git 仓库工作区干净，提交历史清晰

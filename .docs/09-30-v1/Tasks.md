# Tasks：窗口状态记忆与剪贴板体验升级

**关联 Plan**：`Plan.md` —— 窗口状态记忆与剪贴板体验升级 v1.13  
**总计 Task**：8 个

---

## Phase 1：设置模型与后端窗口状态持久化（可与 Phase 2 并行）

### TASK-001：扩展 settings 包支持窗口宽高与最大化偏好持久化

- **Status**：DONE
- **Description**：在 `internal/settings/settings.go` 中声明窗口最小尺寸与默认尺寸常量，为 `Settings` 结构体新增 `WindowWidth`、`WindowHeight` 与 `WindowMaximized` 字段，妥善处理 JSON `float64` 反序列化与边界钳制，并在 `internal/settings/settings_test.go` 中补齐全量测试用例。
- **Details**：
  - 声明导出常量作为全工程单一事实来源（SSOT）：
    - `MinWindowWidth = 720`
    - `MinWindowHeight = 520`
    - `DefaultWindowWidth = 1280`
    - `DefaultWindowHeight = 800`
  - 新增常量键名：`windowWidthKey = "windowWidth"`、`windowHeightKey = "windowHeight"`、`windowMaximizedKey = "windowMaximized"`
  - `Default()` 返回 `WindowWidth: DefaultWindowWidth`，`WindowHeight: DefaultWindowHeight`，`WindowMaximized: false`
  - 在 `Load()` 中注意 Go 标准库 `json.Unmarshal` 解码至 `map[string]any` 时数值恒为 `float64` 的陷阱：
    - 针对 `windowWidthKey` 必须通过 `.(float64)` 类型断言，判断 `int(w) >= MinWindowWidth` 后转换为 `int` 赋给 `s.WindowWidth`
    - 针对 `windowHeightKey` 同理通过 `.(float64)` 断言，判断 `int(h) >= MinWindowHeight` 后转换为 `int` 赋给 `s.WindowHeight`
    - 针对 `windowMaximizedKey` 通过 `.(bool)` 断言赋值
    - 任何缺失、类型不匹配或越界值（如小于最小尺寸限制）均静默保留默认值，不返回错误
  - 在 `Save()` 中序列化三项新字段，保持便携式 `settings.json` 格式整洁
  - 在 `settings_test.go` 中更新默认值断言、重载测试、边界值回退、float64 反序列化断言与未知键保护用例
- **Acceptance Criteria**：
  - `go test ./internal/settings` 测试通过
  - 空配置文件反序列化返回默认 1280×800 及 `WindowMaximized: false`
  - 异常或畸形尺寸（如 300×200）反序列化后自动回退为默认尺寸而不报错
  - 保存后重新读取能够精确还原自定义逻辑宽高与最大化状态

### TASK-002：在 App 与 main.go 接入窗口尺寸预读、正交 Setter 与 HWND 剪贴板通道

- **Status**：DONE
- **Description**：在 `main.go` 引用 settings 常量并在 `wails.Run` 前预读持久化窗口配置注入启动选项，明确 `app.startup()` 的单次加载时序；在 `app.go` 增加正交的 `SetWindowSize` 与 `SetWindowMaximized` 方法；新增多平台剪贴板通道（Windows 下绑定真实顶级 HWND，非 Windows 优雅回退）；并手补 `frontend/wailsjs/` 对应导出声明。
- **Details**：
  - 在 `main.go` 中：
    - 引用 `settings.MinWindowWidth` 与 `settings.MinWindowHeight` 替代硬编码数值（实现 SSOT）
    - 在 `wails.Run` 调用前执行 `s := settings.Default()`; 若 `loaded, err := settings.Load(); err == nil { s = loaded }`，并将其实例直接赋给 `app.settings`
    - 配置 `options.App.Width = s.WindowWidth` 与 `Height = s.WindowHeight`
    - 若 `s.WindowMaximized` 为 `true`，配置 `WindowStartState: options.Maximised`；否则配置 `WindowStartState: options.Normal`
  - 在 `app.go` 的 `startup()` 中：
    - 保留 `migrateLegacyStore` 一次性迁移
    - 加锁判断若 `a.settings.WindowWidth >= settings.MinWindowWidth` 则保留 `main.go` 预读的快照，避免重复从磁盘读写造成状态不一致
  - 在 `app.go` 中新增两个正交且职责单一的 Setter 方法，彻底消除参数冗余：
    - `SetWindowSize(width, height int) error`：校验入参（小于最小尺寸则钳制为最小值），在 `persist` 中仅更新 `s.WindowWidth` 与 `s.WindowHeight`
    - `SetWindowMaximized(maximized bool) error`：在 `persist` 中仅更新 `s.WindowMaximized`
  - 在 Go 侧建立带真实应用顶层窗口句柄（HWND）的原生剪贴板管道（治本解决 P0 缺陷）：
    - 新增 `app_windows.go`（声明 `//go:build windows`）：
      - 声明 `user32.dll` 与 `kernel32.dll` 的 Win32 过程调用：`GetForegroundWindow`、`GetAncestor`、`OpenClipboard`、`EmptyClipboard`、`SetClipboardData`、`CloseClipboard`、`GlobalAlloc`、`GlobalLock`、`GlobalUnlock`、`lstrcpyW`
      - 通过 `GetForegroundWindow()` 获取前台活动窗口，再通过 `GetAncestor(hwnd, GA_ROOT = 2)` 向上解析至宿主顶层根窗口 HWND
      - 使用该有效 HWND 调用 `OpenClipboard(hwnd)`，清空并放入 `CF_UNICODETEXT` 数据后关闭剪贴板，使系统剪贴板历史服务（`cbdhsvc`）将其作为前台交互成功归档至 Win+V 面板
    - 新增 `app_other.go`（声明 `//go:build !windows`）：提供无操作回退实现，确保 Linux 开发与测试环境编译全绿
    - 在 `app.go` 暴露导出绑定方法 `SetClipboard(text string) error`
  - 在 `frontend/wailsjs/go/main/App.d.ts` 与 `App.js` 中补齐 `SetWindowSize`、`SetWindowMaximized`、`SetClipboard` 的导出签名
  - 在 `main_test.go` 中新增 `SetWindowSize`、`SetWindowMaximized` 以及 `SetClipboard` 的测试用例
- **Acceptance Criteria**：
  - `go test .` 测试通过，无编译警告与竞态
  - `SetWindowSize(1024, 768)` 仅更新常规宽高且落盘成功
  - `SetWindowMaximized(true)` 仅更新最大化标记，常规尺寸不被覆盖
  - 非 Windows 环境编译与测试零报错

---

## Phase 2：剪贴板复制升级与状态机（可与 Phase 1 并行）

### TASK-003：升级 mdrender 围栏代码块复制控件结构为 SVG 图标与无障碍标签

- **Status**：DONE
- **Description**：修改 `internal/mdrender/mdrender.go` 的 `renderCodeWrapper` 退出分支，将原四字文本按钮重构为包含复制图标与成功对勾图标的内联 SVG 控件，明确规格关系，并同步更新 `srcline_test.go`。
- **Details**：
  - 将原本硬编码的 `<button class="copy-code-btn" type="button" aria-label="复制代码">复制代码</button>` 替换为内联矢量结构的图标按钮
  - 按钮外部容器规格为 26×26px，内联两个 14×14 像素规格（内部矢量采用 `viewBox="0 0 16 16"`，居中留白 6px 呼吸空间）的 SVG：
    - `.copy-icon`：双层重叠卡片图标（`stroke-width="1.4"`）
    - `.copied-icon`：对勾成功图标（`stroke-width="1.6"`）
  - 按钮根部声明无障碍属性 `aria-label="复制代码"` 与原生悬浮提示 `title="复制代码"`
  - 更新 `internal/mdrender/srcline_test.go` 中的断言基线，验证新结构、类名、SVG 标签与无障碍属性完整输出
- **Acceptance Criteria**：
  - `go test ./internal/mdrender` 测试通过
  - 渲染围栏代码块输出包含 `.copy-code-btn`、`.copy-icon` 与 `.copied-icon`
  - 四空格缩进代码块保持不被包装的既有约定不变

### TASK-004：更新 base.css 复制控件紧凑图标样式与状态切换

- **Status**：DONE
- **Description**：在 `internal/theme/assets/theme/base.css` 中重构 `.copy-code-btn` 样式，实现 26×26px 紧凑方形图标按钮与纯 CSS 驱动的双态切换，并同步更新 `frontend/tests/uiContract.test.mjs`。
- **Details**：
  - 将 `.copy-code-btn` 重设为尺寸 `width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 5px;`
  - 声明纯 CSS 驱动的双态图标可见性：
    - 默认态：`.copy-code-btn .copied-icon { display: none; }`，`.copy-code-btn .copy-icon { display: block; }`
    - 激活态：`.copy-code-btn.copied .copy-icon { display: none; }`，`.copy-code-btn.copied .copied-icon { display: block; }`
  - 交互材质着色：
    - 悬浮态（`:hover`）应用 `--accent-soft` 背景、`--accent` 边框与 `--fg` 前景
    - 激活态（`.copied`）应用 `--accent` 主题高亮色与 `--accent-soft` 背景
    - 键盘聚焦（`:focus-visible`）应用 2px 实线焦点环（`outline: 2px solid var(--accent); outline-offset: 2px;`）
  - 保持 `.md-line:hover` / `:focus-within` 控制显隐与 `pointer-events` 的既有物理层级契约
  - 在 `frontend/tests/uiContract.test.mjs` 补充对新图标选择器与显示属性的断言守护
- **Acceptance Criteria**：
  - `cd frontend && npm test` 中 `uiContract.test.mjs` 测试通过
  - `.copy-code-btn` 在未悬浮时透明度为 0，悬浮或获焦时为 1
  - `.copy-code-btn.copied` 状态下具备正确的强调色与对勾显示样式

### TASK-005：重构 main.ts 剪贴板复制逻辑接入宿主 HWND 管道与 DOM 状态保护

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中调用 Go 侧 `SetClipboard` 原生管道，彻底删除现有的 `textContent` 字符串覆盖赋值，通过类名与无障碍属性控制双态切换，并更新端到端检查桩。
- **Details**：
  - 从 `../wailsjs/go/main/App` 导入 `SetClipboard`
  - 在 `hookPreviewLinks` 点击委托中：
    - 提取代码文本并剔除尾随换行：`code.replace(/\n$/, '')`
    - 优先调用 `await SetClipboard(...)`，若出现异常则尝试回退 `ClipboardSetText(...)`
    - **严禁使用 `textContent` 赋值**：删除现存的 `copyButton.textContent = '已复制'` 与 `copyButton.textContent = '复制代码'` 两行代码，杜绝任何对内部 SVG 矢量子节点的意外破坏
    - 状态切换改为通过 DOM API 原生驱动：
      - 激活：`copyButton.classList.add('copied')`，`copyButton.setAttribute('aria-label', '已复制')`，`copyButton.setAttribute('title', '已复制')`
      - 重置：维护 1200ms 单定时器（`copyResetTimers` WeakMap），超时后 `copyButton.classList.remove('copied')`，`copyButton.setAttribute('aria-label', '复制代码')`，`copyButton.setAttribute('title', '复制代码')`
  - 更新 `frontend/tests/startup.check.mjs` 中的端到端复制断言与 Mock 桩，补充 `window.go.main.App.SetClipboard`，断言条件改为匹配 `classList.contains('copied')` 与 `getAttribute('aria-label') === '已复制'`
- **Acceptance Criteria**：
  - 点击代码块复制按钮调用 `SetClipboard` 写入系统剪贴板，成功进入 Win+V 历史
  - 点击后 SVG 矢量节点完整保留，对勾图标平滑显现，并在 1.2 秒后复原
  - `node tests/startup.check.mjs` 无头端到端测试全绿通过

---

## Phase 3：前端窗口尺寸感知、防抖与异步退出刷盘

### TASK-006：在前端 resize 与关闭流程接入防抖与异步落盘窗口状态

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 的窗口 `resize` 监听与退出流程中接入 `SetWindowSize` 与 `SetWindowMaximized`，通过 250ms 防抖同步逻辑尺寸并在退出前异步等待落盘完成，消除时序竞争。
- **Details**：
  - 术语与单位严格对齐 Wails 契约：所有视口尺寸均采用**逻辑尺寸**（CSS / 逻辑像素），禁止引入无意义的物理 DPI 缩放换算
  - 在前端维护常规逻辑尺寸内存变量 `lastNormalWidth` 与 `lastNormalHeight`（初始化自 `window.innerWidth` / `innerHeight`，且不低于 `MinWindowWidth` / `MinWindowHeight` 720×520）
  - 扩展 `window.addEventListener('resize')` 回调逻辑：
    - 维护 250ms 防抖定时器 `windowStateTimer`
    - 回调触发时检测 `await WindowIsMaximised()`：
      - 若为最大化：调用 `await SetWindowMaximized(true)`
      - 若为常规状态：调用 `WindowGetSize()` 获取当前逻辑尺寸，更新内存变量并调用 `await SetWindowSize(size.w, size.h)`，随后调用 `await SetWindowMaximized(false)`
  - 改造退出时序防竞态：
    - 将 `requestClose()` 声明为 `async` 函数
    - 若 `windowStateTimer` 尚在等待倒计时中，立即将其 `clearTimeout` 清除，并在执行 `ForceQuit()` 前显式 `await` 执行一次尺寸或最大化落盘操作
    - 在 `handleCloseFlow()` 的「是」与「否」退出分支中同步确保未决的窗口状态刷盘完成后再触发原生退出
- **Acceptance Criteria**：
  - 拖拽缩放窗口后 250ms 触发单次保存，日志与配置文件记录最新逻辑尺寸
  - 最大化后再退出，下次启动恢复最大化；点击还原按钮，视口准确恢复为最大化前所记忆的常规尺寸
  - 用户快速拉伸后立即按快捷键或点击关闭按钮，最新尺寸 100% 写入磁盘，无竞态丢帧

---

## Phase 4：前端交互 Demo、全量自动化验证与回归测试

### TASK-007：更新前端变更交互 Demo

- **Status**：DONE
- **Description**：在项目目录 `temp/demo.html` 更新静态展示 Demo，提供原生浏览器直接运行的 Fluent 2 双主题比对、SVG 复制交互与应用 HWND 句柄架构流程图解。
- **Details**：
  - 包含改造前纯文字按钮与改造后 26×26px 紧凑 SVG 图标按钮的直观对比展示
  - 包含亮/暗主题一键切换与主题令牌实时适配效果
  - 包含真实可交互的复制代码段，演示点击后的类名切换、对勾过渡动效与还原时序，演示无 textContent 覆写安全机制
  - 包含文字与卡片图解系统剪贴板历史接入原理（HWND 根窗口句柄关联机制）与窗口最大化解耦持久化机制
- **Acceptance Criteria**：
  - 文件位于 `temp/demo.html`
  - 浏览器直接双击打开零报错，布局自适应美观，交互闭环完整

### TASK-008：执行全量测试套件验证回归一致性

- **Status**：DONE
- **Description**：依次执行全量 Go 单测、前端无依赖测试套件以及 Chrome 无头端到端回归，确保新增功能与既有特性均无任何破坏或回归。
- **Details**：
  - 执行 `export PATH=$HOME/.local/go/bin:$PATH && go test ./...` 检验 Go 侧包级单元测试
  - 执行 `go test -race ./...` 检验读写锁、持久化与并发数据安全
  - 执行 `cd frontend && npm test` 运行全部 5 项前端自检契约测试
  - 执行 `cd frontend && npm run build && node tests/startup.check.mjs` 验证 WebView 真实渲染与复制反馈
- **Acceptance Criteria**：
  - 全部测试套件 100% PASS，无并发竞态、类型断言错误与控制台告警
  - 零新增外部生产依赖，打包产物规范受控

---

## 依赖关系与执行拓扑

- `TASK-001` ──→ `TASK-002`（Phase 1 内部串行）
- `TASK-003` ──→ `TASK-004` ──→ `TASK-005`（Phase 2 内部串行）
- `Phase 1`（TASK-001/002）与 `Phase 2`（TASK-003/004/005）**完全解耦，支持并行实施**
- `TASK-002` + `TASK-005` ──→ `TASK-006`（Phase 3 汇合接入）
- `TASK-007`（Demo 已就绪）
- `TASK-001` ~ `TASK-006` ──→ `TASK-008`（Phase 4 全量回归验收）

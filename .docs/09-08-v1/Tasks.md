# Tasks：启动速度、运行性能优化与漏洞检索修复

**状态**：DONE
**完成日期**：2026-09-08
**关联 Plan**：`Plan.md` —— 启动/性能/安全治理 v1.0
**总计 Task**：10 个

**回归测试结论**：通过 `go vet ./...`、`go test -race ./...`、前端 esbuild 零产物语法检查、`npm test`、`npm run build`、字体 woff2 动态对照与重复构建、`node tests/modeScroll.check.mjs`、`node tests/startup.check.mjs`。

> **环境约定**：本机 Go 位于 `~/.local/go/bin`（会话内 `export PATH=$HOME/.local/go/bin:$PATH`）；前端命令均在 `frontend/` 下执行；npm 安装须加 `--include=dev`；`dist/` 为构建产物不提交。执行顺序即编号顺序。

---

## Phase 1：Go 侧数据完整性与并发安全

### TASK-001：文件保存改为崩溃安全替换

- **Status**：DONE
- **优先级**：P0
- **依赖**：无
- **Description**：将 `internal/filesys` 的 WriteFile 从「截断覆写」改为「同目录临时文件 + 权限继承 + f.Sync() 刷盘 + 改名替换」，确保进程崩溃或写失败时目标文件保持旧内容不损，任一步骤失败自动清理临时文件。
- **Details**：
  - 在目标文件同目录创建临时文件（如 `.tmp_*`，避免冲突）。
  - 若目标文件已存在，先通过 `os.Stat(path)` 获取原文件权限（`ModePerm`），并在创建/写入临时文件时继承该权限；不存在时默认 `0o644`。
  - 写入内容后调用 `f.Sync()` 确保数据落盘，随后执行 `f.Close()`，最后 `os.Rename` 替换目标文件。
  - 任一步骤（创建、写入、Sync、Close、Rename）失败须立即使用 `os.Remove` 清理临时文件并返回错误；目标文件内容保持不变。
  - 不宣称 Windows 或底层文件系统的跨平台绝对断电原子性，收窄为崩溃安全的最佳努力替换（Crash-resilient Best-effort Save）。
  - 函数签名与调用方（App.SaveFile）不变，错误语义不变。
  - 新增测试 `TestWriteFileAtomic` 至少覆盖：新文件写入后内容完整、覆写已有文件后内容完整、已有文件权限被正确继承、写入/改名失败时旧文件保持原样且目标目录无临时文件残留。
- **Acceptance Criteria**：
  - `go test ./internal/filesys/ -run TestWriteFileAtomic -v` → PASS
  - `go test -race ./...` → 全部 ok
  - `go vet ./...` → 无输出

### TASK-002：App 绑定层并发互斥与关闭快照

- **Status**：DONE
- **优先级**：P0
- **依赖**：无
- **Description**：为 App 增加读写锁，守护设置/脏/退出状态的跨 goroutine 访问，新增加锁只读方法消除 main.go 关闭钩子中的无锁数据竞争，并在单进程内串行化共享 settings.json 的写路径。
- **Details**：
  - App 新增 `sync.RWMutex`。守护范围：设置结构体的读（Render/GetCSS/GetSettings）与写（persist）；dirty 与 quitting 标志（SetDirty/ForceQuit 写）。
  - App 新增供 `main.go` 调用的只读方法 `shouldPreventClose() bool`（持 RLock 返回 `!a.quitting && a.dirty`），`main.go` 的 `OnBeforeClose` 改为调用该方法，彻底消除关闭钩子对字段的无锁直接读取。
  - 串行化范围：persist 内的偏好保存与 LoadFile/SaveFile 内的最近文件记录共用同一把锁的写侧，保证单进程内共享 JSON 的读改写不交叠。跨进程竞争属于既定已接受的多实例限制。
  - 锁持有纪律：不在持锁状态下调用其他加锁的 App 方法；改名替换之外的重活（goldmark 渲染、窗口标题/主题等运行时调用）移出临界区——渲染读取设置改为临界区内快照、临界区外渲染；窗口主题 chrome 调用在保存成功并解锁后进行。`startup` 在绑定建立前运行，无需加锁。
  - 并发测试 `TestConcurrentBindingsNoRace`：8 个 goroutine × 100 次混合操作（Render/GetCSS/GetSettings/SetWrap/SetMath/SetPreviewFont/SetDirty/LoadFile/SaveFile/shouldPreventClose 交替）。
  - 测试桩真实模拟：`saveSettings` 与 `setLastFile` 的注入桩必须共同读写一个非线程安全的共享结构并在操作间模拟微小时延，无锁串行化时能被 `-race` 或 map 并发 panic 机械检出。
- **Acceptance Criteria**：
  - `go test -race ./...` → 全部 ok（含新增用例；未加锁的旧实现在此命令下能检出竞争）
  - `go vet ./...` → 无输出
  - 既有 `TestPersistFailureKeepsState`、`TestLastFileFailureIsBestEffort`、`TestStartupCreatesNoWelcomeDoc` 不回归

### TASK-003：渲染输出精准剥离 meta refresh

- **Status**：DONE
- **优先级**：P1
- **依赖**：无
- **Description**：在 mdrender 输出净化层追加对 `http-equiv` 值为 refresh 的 meta 标签的剥离，支持识别属性引号边界，阻断恶意文档把预览帧静默导航到外部 URL。
- **Details**：
  - 正则模式识别属性双引号/单引号边界（如 `([^>"\']|"[^"]*"|\'[^\']*\')*`），避免属性值中的 `>`（如 `<meta content="x > y" http-equiv="refresh">`）提前截断标签。
  - 精准匹配 `refresh` token（容忍大小写、引号与等号两侧空白），避免误删 `http-equiv="refresh-policy"` 等其他合规 meta。
  - `<meta charset>` 等其他 meta 标签与其余 HTML 原样保留。
  - 剥离发生在 goldmark 输出之后，围栏/行内代码中转义的 `&lt;meta...&gt;` 天然不受影响。
  - 新增测试 `TestSanitizeMetaRefresh` 至少覆盖：裸 HTML 中的 refresh meta 被剥离、属性引号内含 `>` 的 refresh meta 被完整剥离、属性大小写/引号变体被剥离、跨行属性被剥离、`refresh-policy` 等非 refresh meta 保留、代码块内转义形式保留、既有 script 剥离行为不回归。
- **Acceptance Criteria**：
  - `go test ./internal/mdrender/ -run TestSanitizeMetaRefresh -v` → PASS
  - `go test -race ./...` → 全部 ok

---

## Phase 2：前端渲染管线性能

### TASK-004：渲染调度器抽取与节流修复

- **Status**：DONE
- **优先级**：P1
- **依赖**：无
- **Description**：把渲染排程从 main.ts 抽取为独立模块并改为尾随节流：对外暴露 schedule() 与 cancel()，待渲染期间合并后续调度（不重置定时器），按 80ms 最小间隔以最新内容渲染，突发结束 ≤80ms 内渲染末态；修复「连续输入期间预览永不更新」。
- **Details**：
  - 新建 `frontend/src/renderScheduler.ts`：工厂函数 `createRenderScheduler` 接收渲染回调、最小间隔毫秒数，以及可注入的时钟/定时器（now/setTimeout/clearTimeout）；对外仅暴露 `{ schedule(): void, cancel(): void }`。
  - 行为契约：仅管理渲染触发时机（尾随节流，80ms），不耦合 Promise 状态；首次调度按距上次调用的剩余间隔定时；待渲染期间再调度为无操作（挂起定时器到点必以最新内容调用回调）；触发时记录时间戳；`cancel()` 清空在途挂起定时器。异步响应新旧由既有 `renderVersion` 丢弃。
  - main.ts 移除 DEBOUNCE_MS、lastRenderAt、renderTimer 与 scheduleRender，引入 renderScheduler；文档变更监听改调 `scheduler.schedule()`；程序性加载前调用 `scheduler.cancel()`。
  - 新建 `frontend/tests/renderScheduler.test.ts`（Node 原生，注入虚拟时钟），用例至少覆盖：首次调度到点触发；间隔内多次调度合并为一次；距上次渲染超过间隔时调度立即触发；连续高频调度不饿死（相邻触发间隔 ≥ 最小间隔，且最后一次调度后 ≤ 间隔内必有触发）；`cancel()` 正确取消挂起定时器。
  - `package.json` 的 test 脚本追加该测试文件（第 4 项）。
- **Acceptance Criteria**：
  - `cd frontend && node tests/renderScheduler.test.ts` → 全部 PASS，退出码 0
  - `cd frontend && npm test` → 4 个测试文件全过
  - esbuild 零产物语法检查通过：`node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty`（stdout 丢弃）无错误

### TASK-005：预览写入解耦变更检测

- **Status**：DONE
- **优先级**：P1
- **依赖**：TASK-004
- **Description**：预览原地更新前分别比对本次渲染的 HTML 与样式和上次已写入值，HTML 未变跳过正文与公式回填，样式未变跳过 `<style>` 写入，两者未变跳过全部帧内写，消除无变动渲染引发的整帧样式重算与 DOM 重建。
- **Details**：
  - main.ts 维护 `lastWrittenHtml` 与 `lastWrittenCss` 两个独立状态。
  - 原地更新路径：
    - `cssChanged = (previewCss !== lastWrittenCss)`；`htmlChanged = (html !== lastWrittenHtml)`。
    - 均未变：跳过 style 文本与 innerHTML 写入及 KaTeX 回填，仅同步行号栏可见性后直接返回。
    - 仅 CSS 变：仅更新 `style.textContent = previewCss; lastWrittenCss = previewCss;`。
    - 仅 HTML 变：仅更新 `content.innerHTML = html; renderMathInFrame(frameDoc); lastWrittenHtml = html;`。
    - 均变：更新 style、更新 content 并回填公式。
  - srcdoc 骨架重建路径（首帧与异常回退）写入后必须同步更新这两个基准状态，保证后续比较基准正确。
  - 本任务的行为断言由 TASK-007 的检查脚本落地（无变化重渲染零 DOM 变更、仅样式变更正文零 DOM 变更）；本任务验收先保证不回归。
- **Acceptance Criteria**：
  - esbuild 零产物语法检查通过
  - `cd frontend && npm test` → 全过
  - `npm run build` 后 `node tests/modeScroll.check.mjs` → ALL PASS（模式切换滚动回归不破坏）

---

## Phase 3：启动链路收敛

### TASK-006：启动单渲染与零脏标记

- **Status**：DONE
- **优先级**：P1
- **依赖**：TASK-005
- **Description**：启动与加载路径收敛为单次渲染且不产生瞬时脏标记：主题应用不再触发渲染（启动路径）；程序性文档替换前清空旧定时器并抑制文档变更监听器的置脏与排程副作用。
- **Details**：
  - applyTheme 增加是否触发预览刷新的参数（默认刷新，保持现有调用点行为）；初始化的成功与回退两条路径均传「不刷新」，由随后的加载/新建显式渲染一次。
  - main.ts 增加 `isLoading` 标志并在 `loadContent` 与 `newFile` 入口显式调用 `renderScheduler.cancel()` 清理旧定时器；在替换编辑器文档前后置位/复位 `isLoading`，期间 `updateListener` 跳过 `setDirty(true)` 与 `schedule()`；文档替换完成后显式 `await refreshPreview()` 并置净。
  - 目标行为：消除旧 pending timer 污染与编辑后立即新建/打开导致的重复渲染；带启动文件启动全程 Render 恰 1 次、GetCSS 恰 1 次、无任何置脏 IPC；不带启动文件同样成立。
- **Acceptance Criteria**：
  - esbuild 零产物语法检查通过；`cd frontend && npm test` → 全过
  - `npm run build` 后 `node tests/modeScroll.check.mjs` → ALL PASS
  - 行为断言由 TASK-007 脚本落地

### TASK-007：dev-only 启动无头检查脚本

- **Status**：DONE
- **优先级**：P1
- **依赖**：TASK-006
- **Description**：仿照 modeScroll 检查脚本新建 `frontend/tests/startup.check.mjs`（内存 HTTP 服务 + Wails 桩 + 真实 dist + 无头 Chrome），分阶段机械断言启动单渲染、零脏标记、预览写入变更检测与无启动文件单渲染。
- **Details**：
  - 文件头注释注明 dev-only（不接入 npm test 与 CI，运行前置 `npm run build`），支持 CHROME_BIN 覆盖浏览器路径，沿用既有检查脚本的 spawn 错误处理与结果报告（pre 标签 + 退出码）约定。
  - 桩需记录调用：Render 记录入参数列与计数、GetCSS 计数、SetDirty 记录取值序列、LoadFile 记录及调用计数；启动文件桩返回短文档（如 `# word\n`）。
  - 分阶段断言场景：
    - 阶段 1（启动阶段）：初始渲染完成后，断言 Render 恰 1 次且入参为启动文档全文；GetCSS 恰 1 次；SetDirty 序列不含 true（零瞬时脏标记）。
    - 阶段 2（编辑阶段）：在编辑器以 execCommand 插入一个空格，断言此时 SetDirty(true) 发生；Render 计数变为 2；通过 MutationObserver 断言帧内 style 与正文元素零变更（无变化重渲染被跳过）。
    - 阶段 3（打开取消阶段）：记录基准 LoadFile 调用数 $N$，点击打开（对话框桩返回路径）弹出确认弹窗后点击「否」取消，断言 LoadFile 计数仍为 $N$（零新增调用）且弹窗关闭。
  - 结果行以 `STARTUP` 前缀输出，全部通过时含 ALL PASS 并退出码 0。
- **Acceptance Criteria**：
  - `cd frontend && npm run build && node tests/startup.check.mjs` → 输出含 `ALL PASS`，退出码 0
  - 该脚本不改变 `npm test` 与 CI 配置（保持 dev-only 定位）

---

## Phase 4：交互缺陷与分发体积

### TASK-008：统一 openPath 与拖放错误反馈

- **Status**：DONE
- **优先级**：P1
- **依赖**：TASK-007
- **Description**：前端统一抽取引导函数 `openPath`，将未保存确认前移到读取文件之前，消除标题与最近文件过早副作用，补齐拖放读取失败的错误反馈与自动化验收。
- **Details**：
  - 前端抽取 `openPath(path: string)` 单点函数，`openFile` 与 `onDrop` 回调统一复用：取得路径后先执行 `confirmDiscard()`，确认通过后才调用 `LoadFile(path)` 并更新内容；读取失败统一 catch 并设置状态栏「Open failed」。启动路径（无确认环节）不变。
  - 消除拖放回调未捕获 Promise 拒绝与静默失败。
  - startup.check.mjs 扩展断言场景：调用拖放回调且 LoadFile 返回 rejected Promise，断言状态栏更新为 `Open failed`，进程退出码为 0。
- **Acceptance Criteria**：
  - `cd frontend && npm run build && node tests/startup.check.mjs` → 含拖放与取消打开场景在内 ALL PASS，退出码 0
  - esbuild 零产物语法检查通过；`cd frontend && npm test` → 全过

### TASK-009：KaTeX 字体仅分发 woff2

- **Status**：DONE
- **优先级**：P2
- **依赖**：TASK-008
- **Description**：前端构建脚本只复制 woff2 字体到 dist 并在复制前清空字体目录，消除嵌入 exe 的约 850KB 冗余字体；验收与源目录 woff2 集合动态对照。
- **Details**：
  - `package.json` 的 build 与 dev 两条脚本同步修改：先递归删除 `dist/katex/fonts`，再仅复制 `node_modules/katex/dist/fonts/*.woff2` 文件。
  - katex.min.css 中 woff/ttf 回退源保持原样（浏览器按格式支持度只取 woff2，缺失文件不产生请求）；modeScroll 检查脚本的类型表无需变更。
  - 验收标准解耦依赖版本：断言 `dist/katex/fonts/` 下 `.woff2` 文件数量严格等于 `node_modules/katex/dist/fonts/*.woff2` 文件数量（当前锁定版本为 20 个），且不存在 `.ttf` 与 `.woff`；连续两次构建幂等无残留。
- **Acceptance Criteria**：
  - `cd frontend && npm run build && test $(ls dist/katex/fonts/*.woff2 2>/dev/null | wc -l) -eq $(ls node_modules/katex/dist/fonts/*.woff2 2>/dev/null | wc -l)` → 退出码 0
  - `cd frontend && ls dist/katex/fonts | grep -E '\.(ttf|woff)$' | wc -l` → 0
  - 连续执行两次 `npm run build` 后上述断言仍成立（幂等，无残留累积）
  - `node tests/startup.check.mjs` 与 `node tests/modeScroll.check.mjs` → ALL PASS

---

## Phase 5：文档维护

### TASK-010：Project.md 同步与本机全链验证

- **Status**：DONE
- **优先级**：P1
- **依赖**：TASK-001 ~ TASK-009
- **Description**：将本次全部行为与决策同步进 `.docs/Project.md`，并执行本机全链验证作为回归结论。
- **Details**：
  - §2 如何测试：npm test 更新为 4 个自检文件；dev-only 无头检查由 1 项扩充为 2 项（modeScroll + startup），运行前置与 CHROME_BIN 说明。
  - §4 架构与数据流：渲染调度改为尾随节流（80ms）与 cancel 接口的描述；启动/加载单渲染、旧 timer 拔除与加载中抑制；预览写入解耦变更检测；openPath 统一时序。
  - §6 约束与已知坑：新增——App 绑定跨 goroutine 并发，设置/脏/退出状态经 App 读写锁守护，main.go 通过加锁方法读取关闭状态，共享 JSON 单进程写路径串行化；文件保存为同目录临时文件 + 权限继承 + Sync + 改名替换（最佳努力）；渲染输出剥离 refresh 型 meta（支持属性引号边界，代码块内转义形式不受影响）；打开/拖放确认前移（读取失败在确认后才暴露为已知取舍）；KaTeX 字体仅 woff2（动态对照源目录）。
  - §6 已接受边界补记：内联 on* 与 javascript: 链接由 sandbox + 父侧拦截双重阻断；远程图片/追踪像素为默认 HTML 渲染既定语义；`<base href>` 劫持影响面被前者覆盖；偏好文件非原子写自愈为默认值；多实例跨进程并发修改共享配置为已知限制。
  - §8 决策记录：追加 2026-09-05 条目，涵盖尾随节流替代防抖+失效节流、App 单锁+关闭快照方法、安全文件替换、meta refresh 剥离、openPath 统一确认时机、woff2-only 动态对照，以及拒绝项（Windows 专用原子系统调用、KaTeX 懒加载、CSP、增量渲染等）。
  - 全链验证：esbuild 零产物语法检查、`npm run build`、`go vet ./...`、`go test -race ./...`、`npm test`、两项 dev-only 检查全部通过。
- **Acceptance Criteria**：
  - `git diff .docs/Project.md` 显示上述各节更新且与代码实际状态一致
  - 全链验证命令全部退出码 0，结论记录回本文件与 Plan.md 的回归测试结论栏

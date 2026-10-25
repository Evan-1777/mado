# Tasks：首次启动提速与 Windows 安装/卸载支持

**关联 Plan**：Plan.md —— 首次启动提速与 Windows 安装/卸载支持 v1.0
**状态**：DONE
**完成日期**：2026-10-25
**总计 Task**：7 个
**回归测试结论**：本地全链通过（2026-10-25）：`go vet ./...`、`go test ./...`、`go test -race ./...`、前端 esbuild 零产物检查、`npm test` 六项、`npm run build` 均通过；远程 Chrome 9222 隔离上下文的三项 dev-only 检查全部 ALL PASS。startup 三次 FCP 45.2/45.0/44.0ms、编辑器 165.0/161.2/160.7ms、预览 222.0/217.6/218.6ms，FCP 低于基线 426–437ms，编辑器就绪优于基线 406–418ms。云端 Windows 安装/卸载与 Release 版本注入/双资产发布待推送验收。

> **环境约定**
> - 前端命令在 frontend/ 目录执行；node_modules 缺失时先执行 npm install --include=dev。
> - Go 命令在仓库根目录执行。本沙箱默认 GOCACHE 只读，使用 GOCACHE=/tmp/mado-gocache；验证结束后删除该缓存。
> - 浏览器验收按 SCOPE 连接用户提供的 9222 远程 Chrome 实例。dev-only 无头脚本若本机无法直接启动 Chrome，使用远程等价 CDP 流程或带 --no-sandbox、独立 --user-data-dir 的包装器；不得为通过测试而修改产品逻辑。
> - Windows 产物构建与安装验收由云端 CI 负责，本机不执行 wails 全量构建。
> - dist/ 与临时探针文件不得残留；交付前清理 frontend/dist/_*、frontend/src/_*_bench*、临时 profile 与 Go 缓存。
> - 执行顺序即 Task 编号顺序；每完成一项更新 Status 为 DONE。

---

## Phase 1：启动首屏链路解耦

### TASK-001：添加启动骨架、preload 与 load 后注入的 bundle 引导

- **Status**：DONE
- **优先级**：P0
- **依赖**：无
- **Executor**：主线
- **Description**：把首屏可见内容从 826KB bundle 的执行中解耦：index.html 先渲染无交互的静态外壳，head 预加载 app.js，load 事件后注入执行；main.ts 清除骨架、重建真实 UI，并在 readyState 非 loading 时立即执行 init。同步更新三项 dev-only 无头检查的注入锚点与 uiContract 的启动契约断言。
- **Details**：
  - frontend/index.html：
    - 在 #app 内加入静态骨架：titlebar（drag-zone + title「Mado」）、空 toolbar、main.pane.editor-only；仅使用既有 class，不引入任何 id，整体加 aria-hidden="true"，避免与 app.js 生成节点重复。
    - 在 head 的 app.css link 之后加入 link rel="preload" as="script" href="./app.js"，让 bundle 在 HTML 解析期开始拉取，且不阻塞 load。
    - 删除尾部 script src="./app.js" 标签，替换为 script id="app-bootstrap"：注册一次性 load 监听，事件触发后 document.createElement('script')、src='./app.js'、append 到 body；若 document.readyState === 'complete' 则立即执行，覆盖动态注入路径。
  - frontend/src/main.ts：
    - 在 const app = document.getElementById('app')! 之后、构建 UI 之前执行 app.replaceChildren()，清空静态骨架。
    - 末尾的 window.addEventListener('DOMContentLoaded', ...) 改为：document.readyState === 'loading' 时挂一次性 DOMContentLoaded，否则立即 void init()。保留原 init 函数体，不改设置读取与文件加载语义。
  - frontend/tests/startup.check.mjs、modeScroll.check.mjs、export.check.mjs：
    - 注入锚点从 script src="./app.js" 改为 script id="app-bootstrap"：将 stubs 与 scenario 插到该标签之前，保留 loader 本身，使 app.js 仍由页面加载。
    - modeScroll.check.mjs 的 preview 元素改为在等待循环内查询（骨架阶段尚无 iframe），不要在场景开始时一次性 const 捕获为 null。
    - 不改变三项脚本的 dev-only 定位与退出码约定。
  - frontend/tests/uiContract.test.mjs：
    - 将原 has(html, 'src="./app.js"') 改为断言 ./app.js 引用存在（loader 内拼接），并新增：存在 id="app-bootstrap"、rel="preload"、静态 titlebar/toolbar/pane 骨架、aria-hidden="true"；不存在 script src="./app.js" 同步标签。
    - 新增 main.ts 断言：包含 app.replaceChildren()、readyState 分支与 void init()；不再依赖 DOMContentLoaded 作为唯一入口。
- **Acceptance Criteria**：
  - cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty 退出码 0。
  - cd frontend && npm test 六项自检全部通过（uiContract 已更新）。
  - cd frontend && npm run build 成功，dist/index.html 含 id="app-bootstrap" 与 preload，且不含同步 app.js 标签。
  - cd frontend && node tests/startup.check.mjs、node tests/modeScroll.check.mjs、node tests/export.check.mjs 均输出 ALL PASS（按环境约定使用远程 Chrome 或包装器）。
  - 远程 Chrome 隔离上下文 3 次运行记录 load/FCP/编辑器时间线；首屏 FCP 中位数应低于基线（基线 426–437ms），编辑器就绪相对基线不劣化超过 20ms。记录原始值到回归结论；若测试环境不可用，保留行为断言并在 Tasks 说明。

---

## Phase 2：启动期无效工作收敛

### TASK-002：并发启动 IPC 并按需渲染空文档预览

- **Status**：DONE
- **优先级**：P0
- **依赖**：TASK-001
- **Executor**：主线
- **Description**：init 中同时发起 GetSettings 与 GetStartupFile，消除一次串行 IPC 等待；Editor 模式下的空文档 newFile 不再调用 Render/GetCSS 与隐藏 iframe 引导，首次切到预览或分栏时补一次渲染；同步清空目录树与空预览占位状态。扩展 startup.check 锁定这些行为。
- **Details**：
  - frontend/src/main.ts：
    - 新增 let previewStale = true。refreshPreview 仅在版本未被覆盖且 writePreview/updateToc 成功后置 previewStale = false；失败或版本被覆盖时保持原值。
    - newFile：保留现有 scheduler.cancel、文档清空、setDirty(false)、标题与状态栏逻辑。若 isPreviewVisible() 为 true，仍 await refreshPreview()；否则设置 previewStale = true、previewEmpty.hidden = false，并调用 renderToc() 清空目录 DOM（覆盖侧栏折叠时残留旧标题的情况），不调用 refreshPreview。
    - 模式切换处理器：在 pane class 更新、预览滚动位置回写与 syncGutterVisibility 之后，若 isPreviewVisible() && previewStale，先 renderScheduler.cancel() 再 void refreshPreview()，确保首次预览激活恰好一次渲染。
    - init：在等待设置前同时创建两个 Promise：GetSettings 包在 Promise.resolve().then(...) 中由既有 try/catch 处理；GetStartupFile 包在 Promise.resolve().then(...).catch(() => '')。先 await 设置并应用，再 await 启动文件；错误回退与现有行为一致。GetStartupFile 不得晚于 GetSettings 发起。
    - 不改变 loadContent 的渲染路径；带启动文件仍按现有逻辑渲染一次。
  - frontend/tests/startup.check.mjs：
    - 桩中为 GetSettings/GetStartupFile 记录发起与完成时间（如 settingsStart/startupStart/settingsDone/startupDone），保持 20ms 左右的延迟以能观察并发。
    - 新增断言 boot-shell-before-bundle：场景脚本在 loader 前执行，此时 .titlebar 存在且 .cm-editor 不存在。
    - 新增断言 startup-ipc-overlap：两次调用的发起时间差 < 5ms，且两者都在任一完成前发起。
    - 新增断言 empty-new-no-render：在既有编辑/取消/拖放失败场景之后点击新建（如弹出未保存确认则选「不保存」），断言 Render 与 GetCSS 次数不增加；随后点击预览页签，断言 Render 与 GetCSS 各恰好增加一次。
    - 在结果行追加 timings（first-contentful-paint、app.js resource start/end、editor、preview），不把它作为硬阈值，用于交付段对比。
    - 既有 initial-single-render、copy、mode、dialog、drop 等断言不得改变语义。
- **Acceptance Criteria**：
  - cd frontend && npm test 全部通过。
  - cd frontend && npm run build && node tests/startup.check.mjs 输出 ALL PASS，包含 boot-shell-before-bundle、startup-ipc-overlap、empty-new-no-render 三项。
  - 空文档启动/新建后 Render 与 GetCSS 次数保持不变；首次激活预览各 +1；带启动文件启动仍为 Render 1 次、GetCSS 1 次、零瞬时脏标记。
  - cd frontend && node tests/modeScroll.check.mjs 与 node tests/export.check.mjs 均 ALL PASS。
  - esbuild 零产物语法检查通过。

---

## Phase 3：Windows 安装与卸载

### TASK-003：添加 NSIS 安装器配置与中文卸载入口

- **Status**：DONE
- **优先级**：P0
- **依赖**：TASK-002
- **Executor**：主线
- **Description**：为 Wails 构建补充产品元数据与可跟踪的 NSIS 模板：简体中文界面、固定卸载注册表键名、用户级安装目录、默认快捷方式与完整卸载段；调整 .gitignore 仅跟踪 project.nsi，其余构建资产继续忽略。
- **Details**：
  - wails.json：新增 info 对象：companyName "Mado"、productName "Mado"、productVersion "0.0.0"（发布时由 tag 注入）、copyright "Copyright 2026 Mado"、comments "Mado Markdown editor"。保持 name/outputfilename/frontend 配置不变。
  - build/windows/installer/project.nsi：以 Go 模块缓存中 github.com/wailsapp/wails/v2@v2.14.0/pkg/buildassets/build/windows/installer/project.nsi 为底本复制，保留 wails_tools.nsh 引入、MUI 页面、文件安装、快捷方式、WebView2 宏与卸载段。修改：
    - 在 !include "wails_tools.nsh" 之前加入 !define UNINST_KEY_NAME "Mado"，使 Add/Remove Programs 键名稳定，不再拼接 companyName+productName。
    - 将 !insertmacro MUI_LANGUAGE "English" 改为 !insertmacro MUI_LANGUAGE "SimpChinese"。
    - 保留 WAILS_INSTALL_SCOPE 的 user 分支（InstallDir 为 $LOCALAPPDATA\Programs\Mado），保留 Start Menu 与 Desktop 快捷方式、wails.webview2runtime、wails.writeUninstaller、uninstall 段的 RMDir /r $INSTDIR、$AppData\${PRODUCT_EXECUTABLE}、快捷方式删除与注册表清理。
    - 不修改图标路径与页面顺序；不新增文件关联或协议。
  - .gitignore：将 build/ 规则替换为可只跟踪 project.nsi 的规则：
    - build/bin/、build/windows/*、!build/windows/installer/、build/windows/installer/*、!build/windows/installer/project.nsi。
    - 确认 build/windows/icon.ico、wails_tools.nsh、tmp/ 中的 WebView2 bootstrapper 仍被忽略。
  - 不为安装器新增图标；沿用 Wails 自动生成的默认 icon.ico。
- **Acceptance Criteria**：
  - node -e "JSON.parse(require('fs').readFileSync('wails.json','utf8'))" 退出码 0，info 字段齐全。
  - git check-ignore -q build/windows/installer/project.nsi 退出码 1（表示不被忽略）；git check-ignore -q build/windows/icon.ico 退出码 0（仍被忽略）。
  - git status 中只出现 project.nsi 这一项新增的 build/ 文件，不出现 icon.ico、wails_tools.nsh、tmp/ 或 bin/。
  - grep 断言 project.nsi 含 SimpChinese、UNINST_KEY_NAME "Mado"、$LOCALAPPDATA\Programs、wails.writeUninstaller、wails.deleteUninstaller、RMDir /r $INSTDIR。
  - 本机不执行 Windows 构建；模板语法由 TASK-004 的云端 makensis 实际编译验证。

### TASK-004：在构建 CI 中生成安装器并静默验证安装/卸载

- **Status**：DONE
- **优先级**：P0
- **依赖**：TASK-003
- **Executor**：主线
- **Description**：让 .github/workflows/build.yml 在 windows-latest 上安装 NSIS、生成用户级安装器、上传 exe 与 installer 资产，并以静默安装、文件/注册表断言、静默卸载、残留断言验证安装器与卸载器。
- **Details**：
  - 在 Install Wails CLI 之后新增 NSIS 安装步骤：choco install nsis -y --no-progress；把 C:\Program Files (x86)\NSIS 追加到 $env:GITHUB_PATH（使用 Add-Content，避免花括号路径语法）。
  - Build 步骤改为 wails build -nsis -installscope user，保留 GOFLAGS=-buildvcs=false。
  - 在 Build 之后新增 Verify installer exists：Test-Path build/bin/mado-amd64-installer.exe，不存在直接 throw。
  - 新增 pwsh 冒烟步骤（在 artifact upload 之前）：
    - 以 Start-Process -FilePath build/bin/mado-amd64-installer.exe -ArgumentList '/S' -Wait -PassThru 安装；检查 ExitCode。
    - 目标目录为 Join-Path $env:LOCALAPPDATA 'Programs\Mado'；轮询等待 mado.exe 与 uninstall.exe 出现。
    - 在 HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall 下按 DisplayName -eq 'Mado' 查找卸载项，缺失则失败。
    - 以 Start-Process (Join-Path $dir 'uninstall.exe') -ArgumentList '/S' -Wait -PassThru 卸载；轮询等待目录消失与卸载项消失，最长约 15 秒。
    - 失败时输出目标目录内容与相关注册表项；用 try/finally 清理目录、桌面/开始菜单快捷方式和残留卸载键，避免影响 runner。
  - artifact upload：path 同时包含 build/bin/mado.exe 与 build/bin/mado-amd64-installer.exe；设置 if-no-files-found: error。
  - 不改动现有 frontend build、unit tests、checkout 与缓存配置。
- **Acceptance Criteria**：
  - python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build.yml'))" 退出码 0。
  - YAML 中 Build 命令含 -nsis -installscope user，且存在 NSIS 安装/PATH、installer 存在性检查、静默安装/卸载断言步骤。
  - 推送后云端 build workflow 全绿：安装器生成、静默安装成功、卸载后目录与 HKCU 卸载项消失。
  - artifact mado-windows 同时包含 mado.exe 与 mado-amd64-installer.exe。
  - 本地不执行 Windows 构建；云端运行结果回填 TASK-007。
- **验收记录**：YAML 解析通过；NSIS 安装、installer 存在性检查、静默安装/卸载冒烟已写入 build.yml。云端 Windows runner 结果待推送。

### TASK-005：在发布工作流注入版本并附加安装器资产

- **Status**：DONE
- **优先级**：P1
- **依赖**：TASK-003、TASK-004
- **Executor**：主线
- **Description**：调整 .github/workflows/release.yml：在构建前解析并校验 tag/手输版本，将数字版本写入 wails.json 的 info.productVersion，安装 NSIS 并以 -nsis -installscope user 构建，Release 同时上传便携 exe 与安装器。
- **Details**：
  - 将 Determine version 步骤移到 Build 之前，保留 tag push 与 workflow_dispatch 两条来源；继续用 ^v[0-9]+\.[0-9]+\.[0-9]+ 校验，额外输出 numeric（去掉 v 前缀）到 GITHUB_OUTPUT。
  - 新增 Patch product version 步骤（pwsh）：读取 wails.json，设置 .info.productVersion = numeric，ConvertTo-Json -Depth 10 后以 UTF-8 写回；--generate-notes 与 Release 名称继续使用带 v 的原始 version。
  - 在 Build 之前加入与 build.yml 相同的 NSIS 安装与 PATH 步骤。
  - Build 改为 wails build -nsis -installscope user，保留 GOFLAGS=-buildvcs=false。
  - 在 Publish release 之前加入 Test-Path build/bin/mado-amd64-installer.exe 检查。
  - gh release create 命令同时附加 build/bin/mado.exe 与 build/bin/mado-amd64-installer.exe。
  - 不改变权限、触发条件与现有 frontend build/unit tests 顺序。
- **Acceptance Criteria**：
  - python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" 退出码 0。
  - YAML 步骤顺序为：确定版本 → patch wails.json → NSIS 安装 → 构建 → 校验 installer → 发布；release create 同时包含两个资产。
  - 版本正则对 v1.2.3 通过、对 v1.2 或 v1.2.3-beta 拒绝；patch 后 wails.json 的 productVersion 为 1.2.3（数字三段）。
  - 推送 tag 后云端 release workflow 全绿，Release 资产包含 mado.exe 与 mado-amd64-installer.exe，安装器产品版本与 tag 一致。
  - 本地不执行 Windows 构建；云端运行结果回填 TASK-007。
- **验收记录**：YAML 解析通过；版本正则收紧为三段数字，numeric 输出、wails.json patch、NSIS 构建与双资产发布已写入。云端 tag/手动发布待触发。

---

## Phase 4：文档维护与全链回归

### TASK-006：同步 Project.md 的启动与安装事实

- **Status**：DONE
- **优先级**：P1
- **依赖**：TASK-001 ~ TASK-005
- **Executor**：主线
- **Description**：按 Project.md 的维护表更新受影响的章节，使启动链路、分发方式、结构、决策与术语与代码和 CI 实际状态一致。
- **Details**：
  - 概述/阶段：补充 Windows 用户级安装与卸载、启动首屏骨架。
  - 环境与运行：CI Build 改为 wails build -nsis -installscope user；补充 NSIS 依赖、安装器产物路径、静默安装/卸载冒烟；说明浏览器验收连接 9222 远程实例（SCOPE）。
  - 结构：加入 build/windows/installer/project.nsi（受跟踪）与 build/bin/mado-amd64-installer.exe；说明 build/ 其余资产仍为生成物。
  - 数据流·启动：更新为静态骨架 → preload → load 后注入 bundle → init（并发 GetSettings/GetStartupFile）→ 空文档跳过预览，首次激活补渲染。
  - 约束与决策：追加 2026-10-25 条目，覆盖首屏解耦、空文档按需预览、并发 IPC、NSIS 用户级安装、中文模板与固定卸载键名、卸载删除 settings.json/WebView2 数据、不做文件关联与安装期预热、不拆 KaTeX（含实测约 15–20ms 的依据）、Release 版本注入、CI 静默安装/卸载验收。
  - 术语：补充「安装版 / 便携版」「启动骨架」「previewStale（按需预览标记）」。
  - 不新增 docs/README 或其他用户文档文件。
- **Acceptance Criteria**：
  - Project.md 的维护表所列受影响章节全部更新，无“只支持便携 exe / CI 仅输出 exe”等过期表述。
  - grep 确认 Project.md 含 -nsis -installscope user、project.nsi、启动骨架、previewStale、卸载删除 settings.json、不注册文件关联。
  - git diff .docs/Project.md 与代码/CI 实际一致，无自相矛盾。

### TASK-007：执行全链回归、标注完成并归档

- **Status**：DONE
- **优先级**：P0
- **依赖**：TASK-006
- **Executor**：主线
- **Description**：执行可本地运行的完整验证链，收集云端 CI 结果，清理临时产物，将 Plan/Tasks 标注 DONE 与完成日期，按 Archive 规则归档到 .docs/MM-DD-vN/（执行日若无同日目录则为 v1；规划日期为 2026-10-25），并按 Conventional Commits 中文描述提交。
- **Details**：
  - 本地验证：
    - cd frontend && npm test。
    - cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty。
    - cd frontend && npm run build。
    - cd frontend && node tests/startup.check.mjs、modeScroll.check.mjs、export.check.mjs（按环境约定连接远程 Chrome/包装器）。
    - GOCACHE=/tmp/mado-gocache go vet ./...；GOCACHE=/tmp/mado-gocache go test ./...（必要时 -race）。
    - 远程 Chrome 记录 load/FCP/editor/preview 时间线，与 Plan 2.2 节基线对比。
  - 云端正向验证：build workflow 的安装器生成与静默安装/卸载冒烟全绿；tag release workflow 的版本注入与双资产发布全绿。若尚未推送，记录“待推送云端验收”并保留在 Open Issues，不虚报通过。
  - 清理：删除 frontend/dist/_*、frontend/src/_*_bench*、/tmp/mado-gocache、临时 Chrome profile 与探针页面；确认 git status 只含本次预期变更（SCOPE.md 的用户改动按原样保留或单独说明，不回退）。
  - 更新 Plan.md/Tasks.md 状态为 DONE，填写完成日期、回归测试结论与云端结果；按执行日期与同日最大编号归档到 .docs/MM-DD-vN/，确认根目录无残留 Plan.md/Tasks.md。
  - 按项目规范提交：英文 Conventional Commits 类型前缀 + 中文详细描述；不提交密钥/临时产物。
- **Acceptance Criteria**：
  - 上述本地命令全部退出码 0，三项无头检查均 ALL PASS，time line 已记录。
  - 云端 build workflow 安装/卸载冒烟全绿；release workflow（若已触发）双资产与版本正确。
  - git status 无意外文件；无 dist/_*、src/_*_bench*、Go/Chrome 临时缓存残留。
  - Plan.md 与 Tasks.md 均标注状态 DONE、完成日期、回归结论；归档目录同时含 Plan.md 与 Tasks.md，根目录无残留。
  - git log 新增一条符合规范的提交。
- **交付记录**：本地验证与远程 Chrome 检查通过；Plan.md/Tasks.md 已标注 DONE 并归档至 `.docs/10-25-v1/`；云端安装/卸载与 Release 结果待推送回填。

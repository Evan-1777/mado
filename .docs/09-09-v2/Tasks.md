# Tasks：批判性修复本轮遗留问题

**状态**：DONE  
**关联 Plan**：`Plan.md`  
**完成日期**：2026-09-09  
**回归测试结论**：`npm test` 5 组自检全绿通过；`npm run build` 成功；`go test -race ./...` 与 `go vet ./...` 全部通过。  
**总计 Task**：3 个

---

## Phase 1：缺陷修复与契约加固

### TASK-001：替换状态栏残留英文文案并增加契约负向断言

- **Status**：DONE
- **Description**：在 `frontend/src/main.ts` 中将 `loadContent` 与 `newFile` 的状态栏文案替换为中文 `'就绪'`，并在 `frontend/tests/uiContract.test.mjs` 中增加淘汰英文状态词的负向守卫断言。
- **Details**：
  - 修改 `frontend/src/main.ts` 第 863 行与第 926 行，将 `statusEl.textContent = 'Ready';` 改为 `statusEl.textContent = '就绪';`
  - 修改 `frontend/tests/uiContract.test.mjs`，对 `"'Ready'"`, `"'Unsaved changes'"`, `"'Render error'"`, `"'Save failed'"`, `"'Open failed'"` 执行 `hasNot` 校验，杜绝旧文案回潮
- **Acceptance Criteria**：
  - 运行 `grep -n "statusEl.textContent = 'Ready'" frontend/src/main.ts` 无匹配（退出码 1）
  - 运行 `node frontend/tests/uiContract.test.mjs` 退出码为 0，输出含 `ui contract self-check: OK`

### TASK-002：补齐 HTML 根标签默认主题声明与 ARIA 无障碍属性

- **Status**：DONE
- **Description**：在 `frontend/index.html` 的根 `<html>` 标签增加 `data-theme="dark"` 属性；在 `frontend/src/main.ts` 中为分栏 Tab 增加 id 与对应 Tabpanel 角色及关联，并为侧栏折叠按钮补充 `aria-label` 动态切换。
- **Details**：
  - 修改 `frontend/index.html` 第 2 行：`<html lang="zh-CN" data-theme="dark">`
  - 修改 `frontend/src/main.ts`：
    - 模式切换按钮增加 `id="tab-preview"`、`id="tab-editor"`、`id="tab-split"`
    - `#editor-col` 增加 `role="tabpanel" aria-labelledby="tab-editor"`
    - `#preview-col` 增加 `role="tabpanel" aria-labelledby="tab-preview"`
    - `#toc-collapse` 按钮模板增加 `aria-label="展开侧栏"`，并在点击折叠/展开回调中同步设置 `aria-label`
  - 修改 `frontend/tests/uiContract.test.mjs` 增加对 `data-theme="dark"`、`role="tabpanel"` 与 `aria-labelledby` 的契约断言
- **Acceptance Criteria**：
  - 运行 `node frontend/tests/uiContract.test.mjs` 退出码为 0
  - 运行 `grep -n 'data-theme="dark"' frontend/index.html` 成功命中第 2 行

### TASK-003：收敛设计令牌裸色、提升暗色焦点环对比度并统一 iframe 滚动条样式

- **Status**：DONE
- **Description**：在 `frontend/src/style.css` raw palette 中注册 `--white: #ffffff` 并替换所有硬编码 `#ffffff`；定义语义令牌 `--focus-ring` 并提升暗色模式下焦点环对比度；在 `internal/theme/assets/theme/base.css` 中注入与外壳一致的滚动条样式规则。
- **Details**：
  - 修改 `frontend/src/style.css`：
    - 在 `:root` raw palette 声明 `--white: #ffffff;`
    - 在 `:root` 声明 `--focus-ring: var(--blue-400);`（暗色模式高对比度）
    - 在 `:root[data-theme="light"]` 声明 `--focus-ring: var(--blue-600);`
    - 将 `:root[data-theme="light"]` 中 `--pane-bg`、`--surface`、`--toc-badge-h2-bg` 以及 `.win-close:hover`、`.dialog-actions button.primary`、`.theme-segmented button.active`、`.switch input:checked + .slider:before` 中的 `#ffffff` 替换为 `var(--white)`
    - 将所有 `:focus-visible` 规则中的 `outline: 2px solid var(--accent);` 替换为 `outline: 2px solid var(--focus-ring);`
  - 修改 `internal/theme/assets/theme/base.css`：
    - 添加 `::-webkit-scrollbar`、`::-webkit-scrollbar-track`、`::-webkit-scrollbar-thumb`（使用 `--border`、4px 圆角与 `--muted` 悬浮色）、`::-webkit-scrollbar-corner` 样式规则
  - 修改 `frontend/tests/uiContract.test.mjs`：
    - 校验 raw palette 中 `--white: #ffffff;` 注册
    - 校验 `--focus-ring` 在 dark/light 下的语义分配与使用
    - 校验 `base.css` 包含滚动条定制规则
- **Acceptance Criteria**：
  - 运行 `export PATH=$HOME/.local/go/bin:$PATH && go test ./...` 退出码为 0
  - 运行 `cd frontend && npm test` 退出码为 0

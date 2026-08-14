# Tasks：修复云端 CI 构建失败（pnpm version 未指定）

**关联 Plan**：`Plan.md` —— 修复云端 CI 构建失败 v1.1.1
**总计 Task**：3 个

---

## Phase 1：声明 pnpm 版本

### TASK-001：package.json 增加 packageManager 字段

- **Status**：DONE
- **Description**：在 `frontend/package.json` 中新增 `"packageManager": "pnpm@10.19.0"` 字段，与 `"private": true` 同级。
- **Details**：
  - 字段值 `pnpm@10.19.0` 与本机 `pnpm --version` 输出一致
  - 位置放在 `name`/`version` 之后、`scripts` 之前
  - 不修改 workflow（`pnpm/action-setup@v4` 会自动读取该字段）
- **Acceptance Criteria**：
  - `node -e "console.log(require('./frontend/package.json').packageManager)"` 输出 `pnpm@10.19.0`
  - `frontend/pnpm-lock.yaml` 未变更（lockfile v9 与 pnpm 10 兼容）
  - `.github/workflows/build.yml` 无改动

---

## Phase 2：文档同步与提交

### TASK-002：更新 Project.md 记录 pnpm 版本声明方式

- **Status**：DONE
- **Description**：在 `.docs/Project.md` §2 依赖管理中补充 pnpm 版本声明约定。
- **Details**：
  - 在「依赖管理」行说明：前端 `package.json` 的 `packageManager` 字段声明 pnpm 版本（pnpm@10.19.0），CI 的 `pnpm/action-setup@v4` 自动读取
- **Acceptance Criteria**：
  - `.docs/Project.md` §2 出现 `packageManager` 字段说明
  - 表述与实际代码一致

### TASK-003：提交并推送触发云端 CI

- **Status**：DONE
- **Description**：提交 `frontend/package.json` 与 `.docs/Project.md` 的改动，推送到 `origin/main`。
- **Details**：
  - 提交信息：`fix(ci): declare pnpm version via packageManager field`
  - 推送后确认远端 Actions 自动触发
- **Acceptance Criteria**：
  - `git log -1` 显示修复提交
  - `git status` 干净
  - `git push` 成功，Actions 出现新的 run

# Tasks：Preview 目录中文锚点跳转修复

**关联 Plan**：`Plan.md`

**状态**：DONE

**完成日期**：2026-08-15

**回归测试结论**：全部验收命令通过。

**总计 Task**：3 个

## Phase 1：修正锚点目标解析

### TASK-001：解码预览链接 fragment 后查找标题

- **Status**：DONE
- **Description**：调整预览 iframe 的点击处理，将百分号编码 fragment 解码为 DOM id 后滚动。
- **Details**：
  - 仅处理 `#` 开头且非空的链接
  - 解码失败时使用原 fragment
  - 保持所有 iframe 导航被阻断
- **Acceptance Criteria**：
  - 运行 `cd frontend && node_modules/.bin/esbuild src/main.ts --bundle --loader:.css=empty >/dev/null` 返回退出码 0
- **Dependencies**：无
- **Priority**：P0

## Phase 2：回归验证与文档同步

### TASK-002：添加中文目录与标题组合回归测试

- **Status**：DONE
- **Description**：添加真实 Markdown 组合用例，校验中文目录 href 的 URL 编码形式和标题 Unicode id 同时存在。
- **Details**：
  - 输入同时包含目录链接和目标标题
  - 断言输出 href 经 URL 解码后等于标题 id
- **Acceptance Criteria**：
  - 运行 `go test ./internal/mdrender -run TestRenderUnicodeTOCLinkTarget -v` 显示 PASS
- **Dependencies**：TASK-001
- **Priority**：P0

### TASK-003：执行全量检查并同步项目记录

- **Status**：DONE
- **Description**：执行项目最小验证链，并记录本次 URL 编码失配约束。
- **Details**：
  - 执行前端构建、Go 全量测试和 vet
  - 更新项目数据流、已知坑和决策记录
- **Acceptance Criteria**：
  - 运行 `cd frontend && npm run build` 返回退出码 0
  - 运行 `go test ./...` 返回退出码 0
  - 运行 `go vet ./...` 返回退出码 0
- **Dependencies**：TASK-002
- **Priority**：P1

# Tasks：修复审查报告遗留问题

**关联计划**：Plan.md（v1.0，2026-09-25）
**总计 Task**：3 个
**状态**：DONE

---

## Phase 1：修正目录解析

### TASK-001：抽取并修正目录解析及 ATX 标题识别

- **Status**：DONE
- **Description**：将目录解析从 main.ts 提取为可由前端代码和 Node 自检共同导入的模块；修正围栏闭合判断和 ATX 标题结尾井号处理。
- **Details**：
  - 沿用现有 src/gutter.ts 的轻量模块与零依赖自检模式，不增加依赖；
  - 开围栏记录反引号或波浪号及其长度；仅同类且长度不短于开围栏、内容符合闭合行规则时结束围栏；
  - 修正标题文本提取，使 C#、F#、Part # 保留结尾井号，只移除前有空格的合法 ATX 闭合井号；
  - 在 tests/tocGutter.test.ts 调用生产解析模块，覆盖反引号围栏内出现波浪号、4 个反引号不被 3 个关闭、正确闭合后标题入目录及上述三种标题文本。
- **Acceptance Criteria**：node frontend/tests/tocGutter.test.ts 退出码为 0；测试导入生产解析模块而非复制解析正则；围栏与标题样例均有断言；frontend 主入口构建通过。
- **Dependencies**：无
- **Priority**：P0

## Phase 2：修正重复标题折叠状态

### TASK-002：按重复标题出现序号恢复折叠状态

- **Status**：DONE
- **Description**：按标题层级、文本与同键标题的出现序号分别保存、恢复节点折叠状态。
- **Details**：
  - 提取或复用最小纯函数，使出现序号状态映射可在零依赖自检中直接验证；
  - 自检包含两个层级和文本相同但 expanded 值不同的节点，并验证重建后的节点分别恢复原值；
  - 不维护跨编辑稳定 ID；结构变化后按当前相同标题的出现顺序对应。
- **Acceptance Criteria**：重复标题状态映射自检在 npm test 中执行并通过；移除出现序号后该自检会失败；无额外依赖。
- **Dependencies**：TASK-001
- **Priority**：P1

## Phase 3：文档维护与回归

### TASK-003：同步项目说明并执行回归验证

- **Status**：DONE
- **Description**：根据实际模块边界更新 Project.md 的目录结构、运行测试清单与目录解析说明，并追加本次折叠状态决策；执行前端和 Go 回归。
- **Details**：
  - 若新增 toc.ts，更新 §3 前端文件清单及 §2 npm test 列表；若复用既有模块，则按实际变更更新对应清单；
  - 更新 §4 目录解析描述，§8 追加折叠状态和围栏识别决策；
  - 运行 cd frontend && npm test 与 npm run build；运行 Go vet、常规测试及 race 测试；Go 命令通过临时 GOCACHE 执行，完成后删除临时缓存目录。
- **Acceptance Criteria**：前端测试、构建与 Go vet/test/race 均退出码为 0；Project.md 所列文件和测试与仓库实际状态一致；临时 GOCACHE 已清理。
- **Dependencies**：TASK-001, TASK-002
- **Priority**：P0

**完成日期**：2026-09-25
**回归测试结论**：通过。前端 npm test/build 与 Go vet/test/race 全部通过；Go 临时缓存已清理。
# Tasks：补齐 Project.md 契约保真度与维护表修复

**关联 Plan**：无（Quick 模式跳过 Plan）  
**总计 Task**：2 个  

---

## Phase 1：契约补齐与维护表修复

### TASK-001：补齐丢失的核心物理与测试契约

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：无
- **Description**：在 `.docs/Project.md` 的「约束与决策」及「结构」中补齐丢失的物理事件监听、跨 realm 类型判定、测试注入及 wailsjs 绑定维护契约。
- **Details**：
  - 补齐 CodeMirror 事件监听契约：编辑器行号槽事件必须监听 `cm.scrollDOM` 而非 `contentDOM`（`EditorView.domEventHandlers` 仅监听 contentDOM，行号槽为兄弟节点无法捕获）。
  - 补齐跨 realm DOM 判定契约：iframe 内事件 target 不能直接 `instanceof Element`，须使用 `closest`（跨 realm 判定失效）。
  - 补齐测试安全契约：偏好保存失败场景测试必须使用 `App.saveSettings` 函数字段注入，禁止目录占位覆盖 `settings.Path()`（避免在带配置目录下运行二进制时误删真实配置）。
  - 修正 wailsjs 本地副本维护契约：更新目录树注释并补充规则——新增 Go 导出方法时须同步手补提交的 `frontend/wailsjs/go/main/` 绑定文件，以满足本地 esbuild 语法检查。
- **Acceptance Criteria**：
  - `cm.scrollDOM`、`instanceof Element`、`App.saveSettings`、`wailsjs` 绑定规则在 `.docs/Project.md` 中以「规则——原因」格式完整记录。
  - 目录树中 wailsjs 说明与开发验证链路保持一致。

### TASK-002：补齐长期实现约束与已知限制并清理维护表死链接

- **Status**：DONE
- **Priority**：P0
- **Dependencies**：TASK-001
- **Description**：在 `.docs/Project.md` 中补齐行内公式、openPath 顺序、目录常量单一来源、已知限制及安全立场，并移除维护表中指向已省略外部集成的无效行。
- **Details**：
  - 补齐行内公式语法边界：`$` 行内公式首尾空格启发式与货币误判防护（首尾有空格或未闭合退化为普通文本），且行内公式不支持跨行（避免跨段污染）。
  - 补齐文件加载顺序契约：打开与拖放统一经 `openPath()`，未保存确认必须发生在 `LoadFile` 之前（避免取消后标题与状态产生副作用，并统一捕获读取错误）。
  - 补齐跨包目录名常量单一来源：目录名以 `settings.AppDir` 为单一来源，两包禁止互引，通过常量归一避免漂移。
  - 补齐系统已知限制：多实例未启用 SingleInstance（双击新文件会启动第二实例）；源行号锚点仅覆盖顶层块且跳转粒度为渲染块；原生 `<dialog>` 必须显式声明 `margin: auto` 以抵消全局通配外边距重置；便携化部署在写保护目录下配置不可写为已知限制；安全立场接受内联 on* 与远程图片保持默认 HTML 语义（sandbox 与链接拦截兜底）。
  - 清理维护表无效引用：从文末 `## 维护` 表格中删除「外部服务接入或下线 → 外部集成」行。
- **Acceptance Criteria**：
  - 行内公式边界、openPath 顺序、AppDir 常量单一来源与已知限制完整写入「约束与决策」。
  - 维护速查表格不再包含「外部集成」行。
  - 全文结构、格式与代码库实际状态 100% 对齐。

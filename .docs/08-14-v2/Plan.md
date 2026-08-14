# Plan：修复云端 CI 构建失败（pnpm version 未指定）

**状态**：DONE
**日期**：2026-08-14
**版本**：v1.1.1
**回归测试结论**：workflow 语法经 actionlint 校验通过；`pnpm/action-setup@v4` 读取 `packageManager` 字段路径已验证。最终以云端 Actions 运行结果为准（SCOPE 约定云端验收）。

---

## 1. 背景与目标

`.github/workflows/build.yml` 中 `pnpm/action-setup@v4` 未指定 pnpm 版本，且 `frontend/package.json` 缺少 `packageManager` 字段，导致 Actions 报错：

```
Error: No pnpm version is specified. Please specify it by one of the following ways:
- in the GitHub Action config with the key "version"
- in the package.json with the key "packageManager"
```

目标：让云端 CI 重新跑通，前端依赖安装成功。

## 2. 阶段划分

### Phase 1：声明 pnpm 版本

| 项目 | 内容 |
|------|------|
| **输入** | `frontend/package.json`（缺 `packageManager`）、`build.yml`（缺 `version`） |
| **输出** | `frontend/package.json` 增加 `packageManager` 字段 |
| **验收标准** | `package.json` 含 `"packageManager": "pnpm@10.19.0"`；workflow 无需改动（v4 自动读取该字段）；本机 pnpm 10.19.0 与 lockfile v9 兼容 |

### Phase 2：文档同步与提交

| 项目 | 内容 |
|------|------|
| **输入** | Phase 1 的 package.json |
| **输出** | 更新 `.docs/Project.md`（记录 pnpm 版本声明方式），提交并推送 |
| **验收标准** | `git log` 含修复提交；推送后云端 workflow 自动触发 |

## 3. 架构决策

| 决策项 | 选择 | 理由 | 替代方案（为何不选） |
|--------|------|------|----------------------|
| 声明位置 | `package.json` 的 `packageManager` 字段 | pnpm/action-setup@v4 官方推荐；版本与前端依赖同文件管理，一处维护；未来换包管理器也兼容（corepack 标准） | workflow 中 `with: version:` 硬编码（需在 YAML 和 package.json 两处维护，易失同步） |

## 4. 风险清单

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 本机 pnpm 10.19.0 与 CI 用同版本，但 lockfile v9 若与 pnpm 10 有兼容问题 | 🟢 低 | 本机 pnpm 10.19.0 生成/使用该 lockfile 正常，CI 同版本无差异 |
| `packageManager` 字段触发 corepack 下载新版本 | 🟢 低 | 版本与本机一致（10.19.0），无额外下载 |

## 5. Phase 依赖关系

```
Phase 1 ──→ Phase 2
```

严格串行。

---

> ### Task 拆解预览
>
> | Phase | 预估 Task 数 | 示例 Task |
> |-------|-------------|-----------|
> | Phase 1 | 1 | package.json 增加 packageManager 字段 |
> | Phase 2 | 2 | 更新 Project.md、提交并推送 |
>
> **总计预估**：3 个 Task。

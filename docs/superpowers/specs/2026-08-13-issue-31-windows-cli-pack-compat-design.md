# Issue #31 Windows CLI 与 npm pack 兼容性设计

## 目标

修复纯 Windows 环境下的 Claude CLI 多路径解析、npm pack JSON 污染、OpenCode harness 脆弱解析和 Bash mock 依赖，并增加能复现这些环境差异的回归覆盖。

## 方案

- `findClaudeOriginal()` 将 `where claude` 输出按行处理，按返回顺序过滤空行和 wrapper 目录候选，选择首个有效路径。
- `copy-resources.mjs` 将成功诊断输出写到 stderr，使 npm 的 stdout 保持机器可读；共享 `parseNpmPackJson` 从 stdout 提取最后一个完整 JSON manifest，并在解析失败时包含 stdout/stderr 诊断。
- 所有 OpenCode pack 测试复用共享 parser；sdd-plan harness 在 manifest 缺失时通过 parser 抛出包含上下文的错误。
- Windows mock shim 直接调用 Node 原生 mock 实现，POSIX Bash mock 保持不变。CI contract 使用仅包含 Node 和 cmd shim 的隔离 PATH，证明不需要 Bash。

## 错误处理

解析不到 manifest 时抛出明确错误，包含 stdout 和 stderr；manifest 为空或首项缺少 `filename` 时由调用点给出可诊断失败。资源同步失败仍写 stderr 并保持非零退出。

## 测试策略

先为多候选路径、混入 lifecycle 输出、stderr 分流、无 Bash shim 和 sdd-plan manifest 缺失编写失败测试；实现最小修复后运行聚焦测试、完整 `npm test`、baseline lint、`git diff --check`。Windows-specific contract 通过 Node 模拟 Windows 输入，不要求 macOS 主机伪装平台。

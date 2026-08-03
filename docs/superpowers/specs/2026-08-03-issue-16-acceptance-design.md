# Issue #16 验收闭环设计

> 版本：v1.0 · 最后更新：2026-08-03 · 负责人：Enterprise Team · 评审：Approved

## 目标

补齐 Issue #16 尚未被自动化证明的验收项，并消除 `npm pack` 并发执行时的资源同步竞态。完成后，测试必须证明发布后的 `/sdd-plan` command 能解析主 skill、依次进入 `brainstorming` 与 `writing-plans`，且委派 skill 缺失时继续执行 inline fallback。

## 范围

- 新增仅用于测试的可控 OpenCode harness。
- 新增真实发布资源驱动的命令链路和 fallback 行为测试。
- 将资源同步改为临时目录构建后替换，避免暴露半同步目录。
- 为新增公共导出补齐 JSDoc。
- 不调用真实模型，不要求网络、API 凭据或 Claude Code。
- 不改变 OpenCode npm 包的生产运行接口。

## 方案选择

采用可控 harness 解析发布 command 与 skill 文件，并输出确定性的执行事件。该方案验证实际发布资源和状态转换，同时保持 CI 离线、稳定且无模型费用。

不采用以下方案：

- 仅增加正则断言：不能证明问答、批准和 chain 行为。
- 在插件 hook 中实现完整运行时 resolver：会扩大插件职责，超出 Issue #16 的 command-wrapper 修复范围。

## Harness 设计

Harness 接收 command 路径、隔离 HOME 和可选的批准回答，执行以下流程：

1. 从 command 中解析主 skill 候选路径，并读取第一个存在的 `sdd-plan/SKILL.md`。
2. 将 `superpowers:<name>` 归一化为 `<name>`。
3. 按 command 声明的 OpenCode、Agents、Claude 路径顺序查找委派 skill。
4. 读取 `brainstorming` 后记录 `question`、`approval-requested` 和 `approved` 事件。
5. 批准后解析并进入 `writing-plans`，记录 `writing-plans-started`。
6. 委派文件不存在时记录 `inline-content-resolution`，并继续完成流程，不抛出缺少独立 skill 的错误。

Harness 位于测试目录，不包含在 `opencode/package.json#files` 中。它模拟 OpenCode 对 command prompt 的执行契约，不模拟模型语言生成。

## 隔离要求

- 测试创建临时 HOME、prefix、cache 和 PATH。
- PATH 只保留运行测试所需的 Node/npm shim，不包含 `claude`、用户级 skill 或用户配置。
- 输入必须来自本次生成的 npm tarball及安装结果，不得直接读取开发目录中的委派 skill。

## 原子资源同步

`syncResourceTree(src, dst)` 必须：

1. 在 `dst` 同级创建唯一临时目录。
2. 将完整源树复制到临时目录。
3. 仅在复制成功后替换目标目录。
4. 替换失败时保留原目标并清理临时目录。
5. 使用跨进程锁序列化同一 `opencode` 工作树的 `prepack` 同步，避免两个发布进程互相删除或替换资源。

并发测试同时启动两个资源同步或 `npm pack` 进程，断言二者成功、目标树完整且工作区不产生内容漂移。

## 测试策略

### RED

- 新增 harness E2E，初始因 harness 不存在而失败。
- 新增缺失 `brainstorming` 的 fallback 测试，初始因没有行为执行器而失败。
- 新增并发同步测试，使用延迟注入稳定复现旧实现的删除/复制竞态。

### GREEN

- 实现最小 harness，使命令链路测试通过。
- 实现临时目录替换和跨进程锁，使并发测试通过。
- 为公共导出补充 JSDoc。

### REFACTOR

- 提取路径解析、事件记录和锁生命周期 helper。
- 串行运行聚焦测试，再运行全量构建、两次并发 pack、`npm audit`。
- 对照 Issue #16 的 11 条验收标准重新生成 PASS/PARTIAL/FAIL 结论。

## 验收结果要求

- Issue #16 的 11 项标准全部为 PASS。
- 聚焦测试与全量测试均为 0 failure。
- 两个并发 `npm pack --dry-run` 均成功。
- `git diff --check` 通过，执行 pack 后工作区保持干净。
- npm 审计为 0 vulnerabilities。

## 验收证据（Issue #16 11/11 PASS）

| # | Issue #16 验收标准 | 证据（文件 / 测试） |
|---|-------------------|---------------------|
| 1 | npm 包清单包含 5 个委派 skills | `opencode/package.json#files` 含 `delegated-skills/`；`npm package exposes every delegated workflow skill from its canonical bundle`；并发 pack 测试断言清单含 5 个 `PRIMARY_DELEGATES` |
| 2 | 全新 HOME 安装后 `~/.config/opencode/skills/brainstorming/SKILL.md` 存在 | `postinstall installs delegated skills into a clean OpenCode HOME...`；harness 正常链路 `resolutions[1].source` 命中该路径 |
| 3 | 全新 HOME 安装后 `~/.config/opencode/skills/writing-plans/SKILL.md` 存在 | 同上；harness `resolutions[2]` 解析到该路径并读取成功 |
| 4 | `/sdd-plan` 能进入 brainstorming 问答和设计确认阶段 | harness 事件 `brainstorming-question` + `brainstorming-approval-requested`；语义负例测试拒绝缺失/反向契约 |
| 5 | brainstorming 完成后能继续执行 writing-plans | harness 事件 `brainstorming-approved` → `writing-plans-started`；`unapproved design does not enter writing-plans` 验证未批准时停止 |
| 6 | 委派 skill 缺失时走 `inline-content-resolution` 而非停止 | `missing brainstorming skill...` 与 `missing writing-plans skill...` 两个 fallback 测试 |
| 7 | `superpowers:xxx` 稳定解析到无 namespace 安装目录 | harness 记录 `normalized: brainstorming/writing-plans` 且从去 namespace 路径读取；`published sdd-plan command...` 断言 namespace 归一化说明 |
| 8 | 升级安装不覆盖用户修改过的同名 skill | `npm resource upgrades do not overwrite user modifications made after install`、`postinstall preserves an existing skill when its backup fails` |
| 9 | 卸载删除插件创建的委派 skill 并恢复用户同名 skill | `npm resource ownership restores user data and removes plugin-created resources`、`npm resource upgrades retain the original user backup for uninstall` |
| 10 | npm pack/install 集成测试覆盖纯 OpenCode、无 Claude Code 环境 | `sdd-plan-harness.test.js` 隔离 HOME/PATH（断言无 `claude` shim）后真实 pack + `npm install --global --foreground-scripts`；`install.test.js` 覆盖隔离 Windows HOME |
| 11 | 回归测试确保 command 模板含 namespace resolver 与 fallback chain | `published sdd-plan command resolves namespaced delegates and retains inline fallback`、`all published commands retain the generator skill-resolution contract`（6 个 command 全覆盖） |

## 错误处理

- command 缺少主 skill 契约时，harness 以明确错误退出。
- 用户未批准设计时，不得进入 writing-plans。
- fallback 仅用于内容缺失，不得改变当前 agent/subagent 的执行模式。
- 同步复制或替换失败时，不得留下临时目录或破坏最后一个完整目标。

## 规格自检

- 无占位符、TODO 或待定决策。
- Harness、生产代码和发布资源边界明确。
- 测试覆盖正常链路、fallback、隔离环境和并发同步。
- 范围不包含真实模型调用或插件运行时架构重写。

# ARD378508 — sdd-doc 脚本路径修复 设计方案

## Constitution Check
*GATE: Must pass before design phase. Re-check after design complete.*

**Triggered HARD_RULEs**:
- 提交规范 § commit 格式 (enterprise-baseline.md:47-50): 所有 commit 必须以 `[ARD378508] <type>: <subject>` 格式

**Triggered SOFT_RULEs**:
- 工具使用规范 § SDD 阶段命令 (enterprise-baseline.md:54-56): 本变更涉及 skill 文件修改，但遵循了 `/sdd-spec` → `/sdd-plan` 流程

**Compliance Plan**:
- 提交规范：task commit 使用 `[ARD378508] fix: <task-id> - <subject>` 格式
- 工具使用规范：已在 Ring 1 完成 `/sdd-spec`，当前 Ring 2 `/sdd-plan`，后续按流程进入 `/sdd-apply`

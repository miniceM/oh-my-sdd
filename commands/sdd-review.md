---
description: 当用户在 SDD 流程中已完成实现、需要验证+归档时使用。SDD Ring 5（验证归档）。
argument-hint: [change-name]
---

# /sdd-review —— SDD 第 5 环：验证与归档

参数 `$ARGUMENTS` 是变更名称。**前置检查**：`openspec/changes/$ARGUMENTS/tasks.md` 所有 checkbox 必须已勾选，否则提示用户先跑 `/sdd-apply` 完成剩余任务。

## 你的工作流

1. **运行验证**：
   - 有 openspec：`Bash("openspec validate --all")`
   - 无 openspec：用 `Read` 检查 `openspec/changes/$ARGUMENTS/` 下文件齐全（proposal/specs/design/tasks）

2. **检查 tasks.md**：用 `Read` + `Grep` 确认所有 `- [ ]` 都变 `- [x]`

3. **检查测试**：
   - `Bash("npm test")` 或项目对应测试命令
   - 全绿 + 覆盖率 ≥ 80%（用 `Bash("npm run test:coverage")` 或等价）
   - 未达标 → 阻塞归档，提示补测试

4. **写 review 总结**（`Write` 到 `openspec/changes/$ARGUMENTS/review.md`）：
   - 实际工作量 vs 预估（按 task 数 + 总耗时）
   - 偏离 spec/design 的地方（如有 RETRO.md，引用之）
   - 后续 follow-up（如发现的 tech debt）

5. **归档**：
   - 有 openspec：`Bash("openspec archive $ARGUMENTS")`
   - 无 openspec：`Bash("mv openspec/changes/$ARGUMENTS openspec/changes/archive/")`（如 archive 目录不存在先创建）

## 强制规则
- ✅ 必须运行 validate（或手动检查文件齐全）
- ✅ 必须有 review.md 文档
- ✅ 测试覆盖率 < 80% 必须阻塞归档
- ❌ 禁止在未归档状态下开始新 change 的 Ring 4（防多 change 互相干扰）
- ❌ 禁止删除归档目录（archive 是审计依据）

## 何时不应使用
- tasks 还有未完成项（先 `/sdd-apply`）
- 测试还在红（先修测试）

完成后告诉用户：变更已归档，可以开始下一个 SDD 循环。提示用 `/sdd-spec <new-change>` 启动新变更。

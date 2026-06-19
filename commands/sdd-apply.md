---
description: 当用户在 SDD 流程中已完成 tasks.md、要按任务列表执行实现时使用。SDD Ring 4（实现执行）。
argument-hint: [change-name]
---

# /sdd-apply —— SDD 第 4 环：实现执行

参数 `$ARGUMENTS` 是变更名称。**前置检查**：`openspec/changes/$ARGUMENTS/tasks.md` 必须已存在，否则提示用户先跑 `/sdd-task`。

## 你的工作流

1. **加载 `tasks.md`**（用 `Read`）：按顺序处理每个任务

2. **每个任务走 TDD 循环**（推荐用 `superpowers:test-driven-development` skill）：
   - 写失败测试（`Write` 测试文件）
   - 跑测试确认 fail（`Bash("npm test ...")` 或对应命令）
   - 写最小实现（`Write` 或 `Edit`）
   - 跑测试确认 pass
   - **commit**（`Bash("git add <files> && git commit -m 'T<N>: <subject>")`）

3. **任务完成后**：用 `Edit` 把 `tasks.md` 里对应行的 `- [ ]` 改成 `- [x]`

4. **遇到 spec/design 矛盾**：
   - 停止当前 apply
   - 在 `openspec/changes/$ARGUMENTS/RETRO.md` 记录矛盾点
   - 提示用户回到 `/sdd-spec` 或 `/sdd-plan` 修订上游
   - **不要**自己擅自改 spec/design

## 强制规则
- ✅ 必须按 tasks.md 顺序执行（除非有依赖标注可并行）
- ✅ 每个任务完成必须独立 commit
- ✅ commit message 含任务 ID（如 `T3: 实现 X 功能`）
- ✅ 测试失败时回到测试诊断，不绕过、不删测试
- ❌ 禁止跳过任务（除非 task 标记为 `optional`）
- ❌ 禁止一次 commit 多个任务（除非 task 显式合并）
- ❌ 禁止改用户 `~/.claude/CLAUDE.md` 里 oh-my-sdd 标记段

## 何时不应使用
- tasks.md 还没生成（先 `/sdd-task`）
- 只是 ad-hoc 修复（不走 SDD 直接改）

完成后告诉用户运行 `/sdd-review $ARGUMENTS`。

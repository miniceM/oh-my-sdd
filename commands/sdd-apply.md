---
description: SDD Ring 4 - 执行实现 (apply)
argument-hint: [change-name]
---

# /sdd-apply —— SDD 第 4 环：实现执行

参数 `$ARGUMENTS` 是变更名称（必须已存在 tasks.md）。

## 你的工作流

1. **加载 tasks.md**：按顺序处理每个任务
2. **TDD 循环**（每个任务）：
   - 写失败测试 → 跑（确认 fail）→ 写最小实现 → 跑（确认 pass）→ commit
3. **任务完成后**：勾选 tasks.md 里的 checkbox
4. **遇到 spec/design 矛盾**：停止，回到 Ring 1/2 修正上游

## 强制规则
- ✅ 必须按 tasks.md 顺序执行
- ✅ 每个任务完成必须 commit
- ✅ 测试失败时回到测试，不绕过
- ❌ 禁止跳过任务（除非 task 标记为 optional）
- ❌ 禁止改 baseline（`content/enterprise-baseline.md`）

完成后告诉用户运行 `/sdd-review`。

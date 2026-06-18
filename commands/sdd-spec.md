---
description: SDD Ring 1 - 创建规格 (spec)
argument-hint: [change-name]
---

# /sdd-spec —— SDD 第 1 环：规格定义

用户在请求创建 SDD 变更的规格。参数 `$ARGUMENTS` 是变更名称。

## 你的工作流

1. **创建变更目录**：`openspec new change $ARGUMENTS`（或 `mkdir -p openspec/changes/$ARGUMENTS`）
2. **写 proposal.md**：从用户需求里提炼
   - 业务背景（why）
   - 范围边界（in scope / out of scope）
   - 验收标准（acceptance criteria）
3. **写 specs/*.md**：每个 capability 一个文件
   - Requirements（场景/需求）
   - Design（可选，简单变更可跳过）
4. **不要写实现代码**——这一阶段禁止 `.ts`/`.py` 等代码改动

## 强制规则
- ✅ 必须先写 proposal 再讨论 specs
- ✅ 每个 spec 必须有 acceptance criteria
- ❌ 禁止跳到实现（那是 Ring 4 `/sdd-apply`）
- ❌ 禁止改 `openspec/specs/` 里既有 specs（那是 baseline）

完成后告诉用户运行 `/sdd-plan` 进入下一环。

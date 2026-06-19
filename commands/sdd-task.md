---
description: 当用户在 SDD 流程中已完成 design、需要拆分可执行任务时使用。SDD Ring 3（任务拆分）。
argument-hint: [change-name]
---

# /sdd-task —— SDD 第 3 环：任务拆分

参数 `$ARGUMENTS` 是变更名称。**前置检查**：`openspec/changes/$ARGUMENTS/design.md` 必须已存在，否则提示用户先跑 `/sdd-plan`。

## 你的工作流

1. **加载上游**（用 `Read`）：
   - `proposal.md` + `specs/*.md` + `design.md`

2. **生成 `tasks.md`**（用 `Write`）：
   - 按依赖顺序列出可独立执行的任务
   - 每个任务含：
     - **任务标题** + 简短描述
     - **文件路径**：要改/创建的文件
     - **验收测试**：对应测试文件 + 测试名
     - **依赖任务**：必须先完成的其他任务 ID
   - 推荐粒度：每个任务 ≤ 30 分钟工作量

3. **检查测试覆盖**：每个任务必须有对应测试。无测试的任务标记为 `chore` 并说明理由。

## 强制规则
- ✅ 必须基于 design，不能跳过 Ring 2
- ✅ 每个任务必须可独立测试
- ✅ 任务 ID 用 `T1, T2, ...` 格式便于引用
- ✅ 用 Markdown checkbox（`- [ ] T1: ...`）便于 Ring 4 勾选
- ❌ 禁止在任务里描述完整实现代码（简短 hint OK）
- ❌ 禁止删除 design 里的决策记录

## 何时不应使用
- design 还没冻结（先 `/sdd-plan`）
- 单一任务无需拆分（可以直接 `/sdd-apply`）

完成后告诉用户运行 `/sdd-apply $ARGUMENTS`。

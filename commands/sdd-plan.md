---
description: 当用户在 SDD 流程中已完成 spec、需要写技术设计/架构决策时使用。SDD Ring 2（技术计划）。
argument-hint: [change-name]
---

# /sdd-plan —— SDD 第 2 环：技术计划

参数 `$ARGUMENTS` 是变更名称。**前置检查**：`openspec/changes/$ARGUMENTS/proposal.md` 必须已存在，否则提示用户先跑 `/sdd-spec`。

## 你的工作流

1. **加载上游**（用 `Read`）：
   - `openspec/changes/$ARGUMENTS/proposal.md`
   - `openspec/changes/$ARGUMENTS/specs/*.md`

2. **写 `design.md`**（用 `Write`）：
   - **架构决策**：关键 tradeoff + 选定方案 + 理由
   - **数据模型 / 接口变更**：如涉及（纯重构可跳过）
   - **替代方案**：列出至少 1 个被否决的方案 + 否决理由
   - **伪代码 / 流程图**：允许（不算"实现代码"）

3. **识别风险**：技术风险 + 缓解措施（如"依赖 X 但 X 还未发布，fallback 用 Y"）

## 强制规则
- ✅ 必须基于 Ring 1 的 specs，不能凭空设计
- ✅ 必须列出至少 1 个被否决的备选方案（强制思考全面）
- ✅ design.md 末尾让用户确认再进 Ring 3
- ❌ 禁止写任务拆分（那是 Ring 3 `/sdd-task`）
- ❌ 禁止写真实现代码（伪代码 OK）

## 何时不应使用
- spec 还没冻结（先 `/sdd-spec`）
- 变更极简单无需设计（如改 typo）—— 可以从 spec 直接跳 task

完成后告诉用户运行 `/sdd-task $ARGUMENTS`。

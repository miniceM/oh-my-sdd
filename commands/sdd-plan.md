---
description: SDD Ring 2 - 生成计划 (plan)
argument-hint: [change-name]
---

# /sdd-plan —— SDD 第 2 环：技术计划

参数 `$ARGUMENTS` 是变更名称（必须已存在 proposal）。

## 你的工作流

1. **加载上游**：读 `openspec/changes/$ARGUMENTS/proposal.md` 和 `specs/*.md`
2. **写 design.md**：
   - 架构决策（关键 tradeoff）
   - 数据模型 / 接口变更
   - 替代方案与放弃理由
3. **识别风险**：列出技术风险与缓解

## 强制规则
- ✅ 必须基于 Ring 1 的 specs，不能凭空设计
- ✅ 必须列出至少 1 个被否决的备选方案
- ❌ 禁止写任务拆分（那是 Ring 3 `/sdd-task`）
- ❌ 禁止写实现代码

完成后告诉用户运行 `/sdd-task`。

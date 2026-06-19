---
description: 当用户请求"写需求/规格/spec"或开始一个新功能/变更的 SDD 流程时使用。SDD Ring 1（规格定义）。
argument-hint: [change-name]
---

# /sdd-spec —— SDD 第 1 环：规格定义

参数 `$ARGUMENTS` 是变更名称。**如为空，主动询问用户**（建议 `NNN-feature-slug` 格式）。

## 你的工作流

1. **创建变更目录**（优先 openspec，无则手动）：
   - 有 openspec：`Bash("openspec new change $ARGUMENTS")`
   - 无 openspec：`Bash("mkdir -p openspec/changes/$ARGUMENTS/specs")`

2. **写 `proposal.md`**（用 `Write` 工具）：
   - 业务背景：为什么做（why）
   - 范围边界：in scope / out of scope
   - 验收标准：可验证的清单

3. **写 `specs/*.md`**：每个 capability 一个文件，含
   - Requirements：场景 / 用户故事 / 输入输出
   - Design 提纲：可选，简单变更可跳过

4. **不要写实现代码**——这一阶段禁止 `.ts`/`.py` 等代码改动

## 强制规则
- ✅ 必须先写 proposal 再讨论 specs（防"用户原话当 spec"）
- ✅ 每个 spec 必须有可验证的 acceptance criteria
- ✅ proposal.md 写完后让用户确认再写 specs
- ❌ 禁止跳到实现（那是 Ring 4 `/sdd-apply`）
- ❌ 禁止改 `openspec/specs/` 里既有 specs（那是项目 baseline）

## 何时不应使用
- 简单 bug fix（直接修就行）
- 重命名、格式化等无行为变化（跳过整个 SDD）
- 临时实验性代码

完成后告诉用户运行 `/sdd-plan $ARGUMENTS` 进入下一环。

---
description: SDD Ring 3 - 拆分任务 (task)
argument-hint: [change-name]
---

# /sdd-task —— SDD 第 3 环：任务拆分

参数 `$ARGUMENTS` 是变更名称（必须已存在 design）。

## 你的工作流

1. **加载上游**：读 proposal + specs + design
2. **生成 tasks.md**：
   - 按依赖顺序列出可独立执行的任务
   - 每个任务含：文件路径、验收测试、依赖任务
   - 推荐粒度：每个任务 ≤ 30 分钟工作量
3. **检查测试覆盖**：每个任务必须有对应测试

## 强制规则
- ✅ 必须基于 design，不能跳过 Ring 2
- ✅ 每个任务必须可独立测试
- ❌ 禁止在任务里描述"如何实现"（那是 Ring 4）
- ❌ 禁止删除 design 里的决策记录

完成后告诉用户运行 `/sdd-apply`。

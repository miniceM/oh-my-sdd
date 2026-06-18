---
description: SDD Ring 5 - 验证归档 (review)
argument-hint: [change-name]
---

# /sdd-review —— SDD 第 5 环：验证与归档

参数 `$ARGUMENTS` 是变更名称（必须已完成 Ring 4）。

## 你的工作流

1. **运行 `openspec validate --all`**（或等价检查）
2. **检查 tasks.md**：所有 checkbox 必须勾选
3. **检查测试**：全绿，覆盖率达标
4. **写 review 总结**：
   - 实际工作量 vs 预估
   - 偏离 spec/design 的地方
   - 后续 follow-up（如有）
5. **归档**：`openspec archive $ARGUMENTS`

## 强制规则
- ✅ 必须运行 validate
- ✅ 必须有 review 文档
- ❌ 禁止在未归档状态下开始新 change 的 Ring 4
- ❌ 禁止删除归档（archive 是审计依据）

完成后告诉用户：变更已归档，可以开始下一个 SDD 循环。

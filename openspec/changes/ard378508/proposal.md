## Why

`sdd-doc/SKILL.md` 在步骤 3.5.2（第 226 行）和步骤 4（第 280 行）中硬编码相对路径 `python3 scripts/sdd_doc.py`，但实际脚本位于 `skills/sdd-doc/scripts/sdd_doc.py`（技能的 `scripts/` 子目录）。运行时路径解析失败，导致 `/sdd-doc` 命令的步骤 3.5（覆盖前检查）和步骤 4（渲染输出）无法执行。本变更修复此路径错误，确保 `/sdd-doc` 命令完整可用。

## What Changes

- **修改 `skills/sdd-doc/SKILL.md`**：将第 226 行和第 280 行的 `scripts/sdd_doc.py` 路径更正为 `skills/sdd-doc/scripts/sdd_doc.py`（相对于项目根目录的完整路径）

## Capabilities

### New Capabilities
- (无新 capability)

### Modified Capabilities
- (无现有 spec 需要修改，本变更是技能定义内部的路径修复，不涉及 spec 层行为变更)

## Impact

- 仅修改 `skills/sdd-doc/SKILL.md` 一个文件
- 无 API、数据库、依赖变更
- 修复后 `/sdd-doc` 命令的覆盖前安全检查（step 3.5）和渲染执行（step 4）可正常工作

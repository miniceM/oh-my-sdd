# ARD378508 — sdd-doc 脚本路径修复 任务清单

## Overview

Fix `skills/sdd-doc/SKILL.md` 中两处硬编码脚本路径引用，将 `scripts/sdd_doc.py` 更正为 `skills/sdd-doc/scripts/sdd_doc.py`，确保 `/sdd-doc` 命令的覆盖前检查（step 3.5.2）和渲染执行（step 4）可正常调用 Python 脚本。

## Scope

- 仅修改 1 个文件：`skills/sdd-doc/SKILL.md`
- 共 2 行文本替换（L226、L280）
- 无新文件创建，无依赖变更，无测试改动

## Design

单方案，无替代选项：

| 位置 | 改动前 | 改动后 |
|------|--------|--------|
| L226 | `python3 scripts/sdd_doc.py --check-overwrite <output_path>` | `python3 skills/sdd-doc/scripts/sdd_doc.py --check-overwrite <output_path>` |
| L280 | `python3 scripts/sdd_doc.py <slug> --data-json ...` | `python3 skills/sdd-doc/scripts/sdd_doc.py <slug> --data-json ...` |

---

### Task 1: Fix script path references in sdd-doc SKILL.md

**Description**: Update the two incorrect relative path references to `sdd_doc.py` in the skill definition file.

**Files**:
- Modify: `skills/sdd-doc/SKILL.md` (lines 226, 280)

**Changes**:
- [ ] Line 226: `python3 scripts/sdd_doc.py` → `python3 skills/sdd-doc/scripts/sdd_doc.py`
- [ ] Line 280: `python3 scripts/sdd_doc.py` → `python3 skills/sdd-doc/scripts/sdd_doc.py`

**Verification**:
- [ ] Run `python3 skills/sdd-doc/scripts/sdd_doc.py --help` → exits with code 0
- [ ] Run `python3 skills/sdd-doc/scripts/sdd_doc.py --check-overwrite /tmp/test.md` → returns valid JSON with `exists: false`
- [ ] Read L226-L227 and L280-L281 to confirm paths are correct

**Commit**: `[ARD378508] fix: T1 - update sdd_doc.py script path references in SKILL.md`

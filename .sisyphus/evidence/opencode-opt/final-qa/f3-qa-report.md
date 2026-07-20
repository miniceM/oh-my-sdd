# F3 — Real Manual QA Evidence

**Date**: 2026-07-17
**Runner**: Sisyphus-Junior
**Environment**: macOS darwin, Node v24.13.0

---

## Smoke Test: PASS

```
scripts/smoke-test-opencode.sh (OMSD_SMOKE=1)

Step 1: Install             ✓ PASS (exit 0)
Step 2: opencode.json       ✓ PASS (plugin array contains oh-my-sdd)
Step 3: Plugin files        ✓ PASS (plugin.js + hooks installed)
Step 4: Hook simulation     ✓ PASS (all 5 hooks: session-start, pre-tool-use, post-tool-use, user-prompt-submit, session-end)
Step 5: Disable             ✓ PASS (plugin removed, disabled=true)
Step 6: Enable              ✓ PASS (plugin restored, disabled cleared)
Step 7: Uninstall           ✓ PASS (5 items removed, summary printed)
```

## Flags Test: PASS

```
TEMP_HOME=$(mktemp -d)
bin/oms-install.js --tool opencode    → install ok: true   ✓
bin/oms-install.js --tool opencode --disable → disabled: true  ✓
bin/oms-install.js --tool opencode --enable  → enabled: true   ✓
```

## Uninstall Summary: PASS

```
bin/oms-uninstall.js --tool opencode output:
  ✓ 已删除: skills 目录
  ✓ opencode.json plugin 数组已移除 1 个 oh-my-sdd 入口
  ✓ 已删除: plugins/oh-my-sdd
  ✓ AGENTS.md 全部为哨兵块，已删除
  ✓ 已删除哨兵文件

📋 卸载摘要：
  删除了 5 项 OpenCode 适配
  · skills 目录
  · plugin 目录
  · 哨兵文件
  · opencode.json plugin 入口
  · AGENTS.md 哨兵块

plugins dir removed: true  ✓
```

---

## VERDICT

| Test       | Result |
|------------|--------|
| Smoke      | PASS   |
| Flags      | PASS   |
| Uninstall  | PASS   |
| **VERDICT**| **ALL PASS** |

**Note**: opencode.json schema uses `plugin` (singular string array), not `plugins` (object array). Verification code adjusted accordingly.

---
name: sdd-constitution
description: 本 skill 在用户说"改 baseline"/"更新 constitution"/"修原则"/"发布新版本"时使用。创建或更新项目 baseline，确保修订流程（SemVer bump + Sync Impact Report）被遵守。
argument-hint: [原则变更描述，可选]
---

# /sdd-constitution —— 项目 Governance 文档修订

更新项目 baseline 文件 `content/enterprise-baseline.md`。这是企业 SDD Agent 的治理文档，包含 YAML frontmatter + Sync Impact Report + 正文（HARD_RULE/SOFT_RULE 原则）。

**前置依赖**：无。
**操作对象**：`content/enterprise-baseline.md`（oh-my-sdd 的 baseline）。
**强制**：每次修订必须 SemVer bump + 更新 Sync Impact Report + 更新 frontmatter `last_amended`。

## User Input

```text
$ARGUMENTS
```

你 **MUST** 考虑用户输入（非空时）后再继续。

## Outline

1. **读取当前 baseline**：读取 `content/enterprise-baseline.md`，解析 frontmatter（包含 `oms_version` / `ratified` / `last_amended`）。
   - 确认 frontmatter 字段齐全。
   - 记录现行版本号，用于后续 bump 决策。

2. **收集变更内容**：
   - 如果用户输入提供具体变更（如"新增一条 HARD_RULE"），使用用户输入。
   - 否则从对话上下文推断（如"刚才决定的架构规则"）。
   - 对于 governance dates：`ratified` 保持不变，`last_amended` 改为今天。

3. **决定 Semantic Version bump**：
   - **MAJOR**：删除或重定义现有 HARD_RULE（向后不兼容）
   - **MINOR**：新增 HARD_RULE/SOFT_RULE，或对现有规则的实质扩展
   - **PATCH**：措辞、typo、非语义澄清
   - 如果 bump 类型不明确，先说明推理再定版。
   - `oms_version` 必须符合 SemVer 格式（MAJOR.MINOR.PATCH）。

4. **编写更新内容**：
   - 更新 YAML frontmatter 中的 `oms_version` 和 `last_amended`。
   - 在文件首的 Sync Impact Report HTML 注释块中记录变更：
     ```
     Version change: <旧版本> → <新版本>
     Bump rationale: <一句话说明为什么这个 bump 类型>
     Modified principles: <列出修改的原则, 如无则写 none>
     Added sections: <新增的章节>
     Templates requiring updates: <受影响的模板文件及状态>
     Follow-up TODOs: <延后项, 如无则写 none>
     ```
   - 修改正文中对应的 HARD_RULE/SOFT_RULE 段。
   - 保持 baseline 正文 ≤ 1000 token（`scripts/check-baseline-tokens.mjs` 校验）。若接近上限（>800 token），提示用户考虑精简或拆到 skills/ 按需加载。

5. **一致性传播检查**：
   - 若修订新增/修改了 HARD_RULE，确认 `hooks/lib/rules.js` 中是否需要新增/修改对应规则匹配。
   - 若涉及 PreToolUse 阻断规则（HARD_RULE #6），确认 `hooks/pre-tool-use.js` 的 deny reason 措辞同步。
   - 若修订影响 `.github/PULL_REQUEST_TEMPLATE.md` 的 `[OVERRIDE]` 槽位，提示用户同步更新。
   - 检查 `hooks/post-tool-use.js`（计数）和 `hooks/session-end.js`（DOP 上报）是否受规则变更影响。

6. **写回文件**：将更新后的内容写回 `content/enterprise-baseline.md`（覆盖）。

7. **运行 lint**：执行 `node scripts/check-baseline-tokens.mjs`，确保：
   - 正文 ≤ 1000 token
   - frontmatter 字段齐全
   - `oms_version` 是合法 SemVer
   - 若 lint 失败，修复后重新运行。

8. **输出摘要**：
   - 新版本号和 bump 类型
   - 变更摘要（2-3 句话）
   - 任何延后项
   - 建议 commit message：`docs(baseline): bump to v<新版本号> (<bump 类型> — <一句话原因>)`

## 验证清单

- ✅ 更新前：`oms_version` / `ratified` / `last_amended` 字段齐全
- ✅ frontmatter YAML 格式正确
- ✅ Sync Impact Report 更新（version change / bump rationale / modified principles / added sections / follow-up TODOs）
- ✅ 正文 ≤ 1000 token（`node scripts/check-baseline-tokens.mjs` 通过）
- ✅ `rules.js` / `pre-tool-use.js` 一致性检查（如适用）
- ✅ 无存留的未解释占位符
- ✅ 建议 commit message 格式正确

## 格式化要求

- 使用 Markdown 标题层级与 baseline 现有格式一致
- HARD_RULE / SOFT_RULE 使用有序列表
- 行宽 < 100 字符
- 单空行分隔段落，无尾部空格

如果用户只提供部分更新（如仅修订一条原则），仍需完整执行版本判断和 Sync Impact Report 更新。

如果需要的关键信息缺失（如 ratification date 不可知），插入 `TODO(<FIELD_NAME>): 说明` 并记入 Sync Impact Report 的延后项。

不要创建新文件；始终操作已有的 `content/enterprise-baseline.md`。

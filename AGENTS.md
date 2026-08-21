# oh-my-sdd — Agent Guide

## What This Is

Enterprise SDD (Spec-Driven Development) plugin & control plane supporting 4 AI tools (Claude Code, Lingma, OpenCode, KiloCode). Not a standalone app — it hooks into host session lifecycles, instructions, and tool safety gates.

## Quick Commands

```bash
# Test (Node.js built-in runner, no Jest)
npm test

# Lint baseline (validates enterprise-baseline.md ≤ 1000 tokens + schema)
npm run lint:baseline

# Dev workflow: clear cache + reinstall plugin
./scripts/dev-reinstall.sh

# Dev workflow: launch Claude Code with mock IAM
./scripts/dev-launch-claude.sh

# Diagnose if session-start hook is working
./scripts/diag-session.sh
```

## Architecture

```
.claude-plugin/     → Plugin manifest (plugin.json, marketplace.json)
skills/             → 17 SKILL.md files (SDD commands + enterprise skills)
hooks/              → Session lifecycle hooks (SessionStart, PreToolUse, etc.)
lib/                → Shared utilities (config, iam-cli, dop-client, rules)
content/            → Markdown injected into system prompt (baseline, welcome)
bin/                → CLI tools (oms, oms-install, oms-uninstall, oms-login, oms-update, oms-git-hooks, oms-wrapper-verify)
install/            → Host registry, 4 host adapters, and control plane (health, plan, ownership, repair, executor)
opencode/           → OpenCode npm plugin package (@cli-tools/oh-my-sdd-opencode)
scripts/            → Dev utilities (reinstall, launch, diag, lint)
__tests__/unit/     → Unit tests (platform, config, iam-cli, etc.)
__tests__/integration/ → Integration tests (hooks, SDD workflow)
```

## Hook System

Hooks fire at session lifecycle points. Key files:

- `session-start.js` — Auth check → inject enterprise baseline into system prompt → DOP telemetry
- `pre-tool-use.js` — Security gate: blocks writes BEFORE they happen (hardcoded secrets, destructive commands)
- `post-tool-use.js` — Telemetry: tracks files touched for DOP reporting
- `session-end.js` — DOP flush + session summary

**PreToolUse vs PostToolUse**: PreToolUse actually blocks writes. PostToolUse fires after write lands on disk — its `permissionDecision` is ignored by Claude Code. Rules enforcement moved to PreToolUse (spike 2026-06-29 confirmed this).

## Testing

Uses Node.js built-in test runner (`node:test` + `node:assert/strict`). No external framework.

```bash
# Run all tests
npm test

# Run single test file
node --test __tests__/unit/platform.test.js

# Run all unit tests
node --test __tests__/unit/
```

CI tests on Ubuntu/macOS/Windows × Node 18/20/22.

## Baseline (Enterprise Rules)

`content/enterprise-baseline.md` is the source of truth for enterprise rules. It has:

- YAML frontmatter: `oms_version`, `ratified`, `last_amended`
- Body with HARD_RULE (blocking) and SOFT_RULE (warnable) sections
- Token budget: body ≤ 1000 tokens (enforced by `npm run lint:baseline`)

During install, the body is injected into `~/.claude/CLAUDE.md` between markers:
```
<!-- BEGIN oh-my-sdd:enterprise-baseline -->
...body...
<!-- END oh-my-sdd:enterprise-baseline -->
```

**Changing baseline**: Edit `content/enterprise-baseline.md`, bump `oms_version` in frontmatter, add Sync Impact Report block. Run `npm run lint:baseline` to validate.

## Security Rules (lib/rules.js)

Hard rules (block writes):
- AWS AK pattern: `AKIA[A-Z0-9]{16}`
- OpenAI sk- pattern: `sk-[a-zA-Z0-9]{20,64}`
- `rm -rf /` or `rm -rf /*`
- `git push --force` to main
- `.env` file direct edits

Soft rules (warn but allow):
- README missing quickstart section
- Public API functions without docstrings

## External Dependencies

- `iam` CLI — Enterprise identity auth (required)
- `dop` CLI — Enterprise telemetry (required)
- `openspec` CLI — Spec management (required for /sdd-review)
- `gh` CLI — GitHub (optional, for issues/PRs)
- `claude` CLI — Claude Code (required)

## Dev Gotchas

1. **Plugin cache**: After changing hooks/skills, run `./scripts/dev-reinstall.sh` — `npm install` alone won't refresh Claude Code's cache.

2. **Hook injection**: SessionStart hook's `additionalContext` is silently dropped (Anthropic bug #16538). Workaround: `wrapper/claude.sh` (and `.ps1`) injects baseline via `--append-system-prompt-file` flag. The wrapper copies `content/enterprise-baseline.md` to `~/.config/claude-enterprise/baseline.md` (POSIX) or `~/AppData/Roaming/ClaudeEnterprise/baseline.md` (Windows) at install time.

3. **PreToolUse is the real gate**: PostToolUse can't block writes. All security enforcement must be in `pre-tool-use.js`.

4. **Baseline token budget**: Body must be ≤ 1000 tokens. Frontmatter and Sync Impact Report are stripped before counting. Use `npm run lint:baseline` to check.

5. **Session meta**: Stored at `~/.oh-my-sdd/sessions/<session-id>.json`. Session IDs from stdin are sanitized (only `[A-Za-z0-9_-]` kept) to prevent path traversal.

6. **Mock IAM for dev**: `./scripts/dev-launch-claude.sh` prepends `scripts/` to PATH, which contains mock `iam` and `dop` scripts. Set `OMS_MOCK_USER=bob` or `OMS_MOCK_LOGGED_OUT=1` to vary behavior.

## File Editing Rules

When editing hooks or skills:
- Hooks read stdin as JSON: `{ session_id, tool_name, tool_input, cwd }`
- Hooks output JSON to stdout: `{ permissionDecision?, additionalContext? }`
- Use `CLAUDE_PLUGIN_ROOT` env var to locate plugin root
- All hooks have 1-5s timeouts — never block on external calls

## Agent 规范

###  任务输入与事实记录

1. 任务输入包含本文件、相关目录规则和用户指定的 SSOT。
2. `git status --short` 是已有工作区改动的记录入口，用户改动保持不变。
3. 代码入口、调用者和被调用者以图谱查询及精确源码片段为依据。
4. 结论分为“源码事实、测试/实验事实、线上事实、推断”，四类证据不混用。
5. 多文件变更具有设计记录和实施计划；单文件确定性修改不要求独立计划。

### 变更约束

- 每个提交/变更集保持单一目的；重命名、逻辑修复、生成物清理分开说明。

### GitHub 操作约束

- 所有 GitHub 平台资源的创建、读取、更新、评论、评审和状态操作（包括 Issue、PR 等）必须使用本地 `gh` CLI 完成；禁止使用 GitHub 连接器或其他远程操作入口。仓库文件、提交、本地分支和分支推送仍使用本地 Git 命令，并遵守以下流程。
- 执行 GitHub 操作前，先确认 `gh auth status` 和当前仓库上下文；命令必须明确指向目标仓库，避免误操作。

### 5.4 Issue → 分支 → PR 交付流程（强制）

所有需要提交到远程仓库的代码、配置、测试和工程文档变更，必须严格遵循以下流程：

1. **Issue**：先有可追踪的 Issue 或任务编号；没有编号时使用本地 `gh issue create --repo OWNER/REPO` 创建，或使用 `gh issue list --repo OWNER/REPO`、`gh issue view <number> --repo OWNER/REPO` 获取 Issue，不得直接以临时分支替代需求记录。每个 Issue 必须包含清晰、可观察、可验证的“验收标准”章节，且至少包含一条 Markdown checklist（每条一项，格式为 `- [ ] ...`）；不得使用无法客观判断完成与否的表述。已有 Issue 不符合该格式时，必须先使用 `gh issue edit <number> --repo OWNER/REPO --body-file <issue-body-file>` 补齐，或停止流程。
2. **分支**：从最新 `main` 创建专用分支，命名为 `<type>/issue-<number>-<short-slug>`，例如 `fix/issue-943-terminal-cleanup`、`docs/issue-120-root-layout`。禁止在 `main`、`master` 或其他默认保护分支上提交变更。
3. **提交**：只暂存当前 Issue 范围内的文件；提交信息使用 Conventional Commits，并在提交正文或 footer 中关联 Issue。
4. **验证**：提交前运行与变更范围匹配的验证门禁，并检查 `git diff --check`、暂存区内容和敏感文件。
5. **推送分支**：只能推送 Issue 分支，例如 `git push -u origin <issue-branch>`；严禁执行 `git push origin main`、`git push origin master` 或向默认分支直接推送。
6. **PR 前验收核验**：创建 PR 前，必须使用本地 `gh issue view <number> --repo OWNER/REPO --json title,body,state,url` 获取 Issue 原文，并确认 `state` 为 `OPEN`、验收标准章节存在且至少包含一条 checklist。随后逐条核对每项标准是否全部达成，并为每条标准保留对应的测试、命令输出或人工检查证据；任一标准未达成、证据不足或 Issue 不符合前置条件时，必须停止，不得创建 PR。
7. **PR**：只能使用本地 `gh pr create --repo OWNER/REPO` 创建 PR，目标为 `main`。应先准备 PR 描述草稿（可使用 `--body-file`），其中必须包含变更范围、验证结果、已知阻断、Issue 关联（例如 `Closes #123`）以及“验收标准核验”章节；逐条复制 Issue 验收标准，标记完成状态（`- [x]`），并在同一条目下记录对应的测试命令及结果、命令输出摘要或人工检查记录；不得省略任何标准。代码通过审核和保护规则后，才能由合并流程进入 `main`。
8. **清理**：PR 合并并确认远程 `main` 包含目标提交后，才删除本地和远程 Issue 分支；未合并分支不得清理。确认和清理操作同样必须使用本地 `gh` CLI 及本地 Git 命令。

该流程不因“改动很小”“只改文档”“需要尽快发布”或“用户要求 push all”而豁免。紧急修复也必须使用 Issue 分支和 PR；本项目不允许直接 push `main`/`master`。如果缺少 Issue 编号、目标分支、远程权限或 PR 审核条件，停止发布并报告阻断，不得自行绕过。

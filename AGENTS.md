# oh-my-sdd — Agent Guide

## What This Is

Claude Code plugin providing enterprise SDD (Spec-Driven Development) workflow. Not a standalone app — it's a plugin that hooks into Claude Code's session lifecycle and tool use.

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
hooks/lib/          → Shared utilities (config, iam-cli, dop-client, rules)
content/            → Markdown injected into system prompt (baseline, welcome)
bin/                → CLI tools (oms-install, oms-login, oms-uninstall)
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

## Security Rules (hooks/lib/rules.js)

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

2. **Hook injection**: SessionStart hook's `additionalContext` is silently dropped (Anthropic bug #16538). Install.js works around this by injecting baseline into user-level `~/.claude/CLAUDE.md` instead.

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

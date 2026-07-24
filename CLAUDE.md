# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`@cli-tools/oh-my-sdd` is an **enterprise Claude Code / Lingma plugin** (v0.2+, multi-tool) that adds:

- 5 SDD slash commands: `/sdd-spec` → `/sdd-plan` → `/sdd-task` → `/sdd-apply` → `/sdd-review`
- An "enterprise baseline" injected into the host agent's system prompt (HARD_RULE / SOFT_RULE rules)
- A 7-layer **onion enforcement model** that BLOCKS writes before they hit disk (PreToolUse hooks, not PostToolUse)
- Wrappers around `iam` (auth) and `dop` (telemetry) enterprise CLIs
- git hooks (`commit-msg`, `pre-commit`, `pre-push`, `prepare-commit-msg`) under `hooks/git/`

It is **not** a standalone app — it ships via `npm install -g` and postinstall hook registers the plugin with the host tool.

For deep dive on testing, rule engine internals, and dev gotchas, read [`AGENTS.md`](./AGENTS.md). This file is the "what you need to know in 5 minutes" version.

## Common commands

```bash
# All tests (Node built-in runner, no Jest)
npm test

# Single test file
node --test __tests__/unit/rules.test.js          # or any path matching __tests__/**/*.test.js
node --test __tests__/integration/pre-tool-use.test.js

# Baseline token budget + schema check (CI gate)
npm run lint:baseline

# Dev: clear plugin cache + reinstall (required after editing hooks/skills/baseline)
./scripts/dev-reinstall.sh

# Dev: launch Claude Code with mock iam + dop
./scripts/dev-launch-claude.sh          # set OMS_MOCK_USER=bob or OMS_MOCK_LOGGED_OUT=1 to vary
OMS_MOCK_USER=alice ./scripts/dev-launch-claude.sh

# Diagnose whether SessionStart hook is firing
./scripts/diag-session.sh

# Install / uninstall specific tool (multi-tool support)
oms-install --tool claude
oms-install --tool lingma
oms-uninstall --tool claude
```

## High-level architecture

```
install.js               ← dispatcher: preflightFor(tool) + main({tool}) + detectDefaultTool
  ├── hooks/lib/install-claude.js    (Claude Code path: marketplace + plugin + wrapper)
  ├── hooks/lib/install-lingma.js    (Lingma path: skills + rules + settings.json merge)
  └── hooks/lib/install-shared.js    (sentinels, copyDirRecursive, copySkillsToDir)

hooks/                   ← 5 lifecycle hooks, registered in hooks/hooks.json
  ├── session-start.js          (iam check → inject baseline → DOP telemetry)
  ├── pre-tool-use.js           (the REAL security gate — blocks writes)
  ├── post-tool-use.js          (telemetry only — does NOT block writes)
  ├── user-prompt-submit.js     (DOP prompt tracking)
  ├── session-end.js            (DOP flush + summary)
  └── lib/                      (config, iam-cli, dop-client, rules, constitution, platform, …)

hooks/git/               ← git hooks installed via oms-git-hooks (commit-msg, pre-commit, pre-push, prepare-commit-msg)
  └── lib/                      (hook-utils, override-check, hook-installer)

skills/                  ← 17 SKILL.md files (5 SDD + 12 enterprise reference skills)
  ├── sdd-{spec,plan,task,apply,review}/SKILL.md       (the 5 SDD ring commands)
  ├── sdd-{constitution,doc}/SKILL.md                  (constitution amendment + openspec→MD doc)
  └── {api-design,business-modeling,db-conventions,doc-writer,fe-*,
       security-check,testing-strategy}/SKILL.md       (loaded on demand by SDD skills)

content/                 ← versioned governance content
  ├── enterprise-baseline.md    (injected into system prompt; SemVer-bumped; ≤ 1000 tokens)
  ├── welcome-message.md
  └── auth-required.md

wrappers/                ← claude.sh / claude.ps1 / claude.bat
                           inject baseline via --append-system-prompt-file at launch

bin/                     ← CLI: oms-install, oms-uninstall, oms-login, oms-update, oms-git-hooks, oms-welcome, oms-wrapper-verify
__tests__/               ← node:test unit + integration
  ├── unit/            (per-module)
  ├── integration/     (per-hook + SDD workflow + git hooks + install)
  ├── spike/           (one-off validations, see docs/spike-posttooluse-deny.md)
  └── helpers/spawn-hook.js
```

## The 7-layer onion (the most important model to understand)

Layers run outer→inner; each layer tightens enforcement. Source: README §"强制约束体系" + `hooks/lib/constitution.js` + `scripts/check-baseline-tokens.mjs`.

| # | Layer | Where | What it does |
|---|-------|-------|--------------|
| 7 | CI gate | `__tests__/integration/constitution-integrity.test.js` | frontmatter + token budget + marker idempotency |
| 6 | Amendment governance | `skills/sdd-constitution/SKILL.md` | SemVer bump of baseline + Sync Impact Report |
| 5 | Mandatory hooks | `hooks/pre-tool-use.js` | **`permissionDecision: "deny"` actually blocks writes** |
| 4 | Analyze CRITICAL | `skills/sdd-review/SKILL.md` | HARD_RULE violation → Critical; `[OVERRIDE] <rule>: <reason>` in PR body downgrades |
| 3 | Plan gate | `skills/sdd-plan/SKILL.md` step 1.5 | forces `## Constitution Check` in design.md |
| 2 | Injection | `wrappers/claude.{sh,ps1}` (Claude) / `~/.lingma/rules/oh-my-sdd.md` (Lingma) | inject baseline into system prompt |
| 1 | Data | `content/enterprise-baseline.md` | versioned source of truth (frontmatter + body + Sync Report) |

**Edit order matters**: data → (test layer 7) → inject on next install → next SDD ring picks it up.

## Critical gotchas (things that bite you on first read)

1. **PreToolUse, NOT PostToolUse, is the real gate.** PostToolUse fires AFTER the file is on disk — its `permissionDecision: "deny"` is silently ignored by Claude Code. The whole rule engine lives in `pre-tool-use.js`. Proven by spike 2026-06-29; see `docs/spike-posttooluse-deny.md`. Do not move rules to PostToolUse thinking it'll work.

2. **SessionStart `additionalContext` is silently dropped** (Anthropic bug #16538). Workaround: `wrappers/claude.sh` and `.ps1` copy `content/enterprise-baseline.md` to `~/.config/claude-enterprise/baseline.md` and pass it via `--append-system-prompt-file` at launch. On Lingma, baseline goes to `~/.lingma/rules/oh-my-sdd.md` (Always rule).

3. **Plugin cache is sticky.** `npm install` alone does NOT refresh Claude Code's plugin cache. Use `./scripts/dev-reinstall.sh` after editing hooks/skills/baseline.

4. **Baseline token budget: ≤ 1000 tokens** of body (frontmatter + Sync Impact Report stripped before counting). Enforced by `npm run lint:baseline`. Bumping baseline = updating `oms_version` in frontmatter + adding a Sync Impact Report block.

5. **Commit format is HARD_RULE**: `[<change-id>] <type>: <subject>`. `change-id` is `^[A-Z]{2,6}\d+$` (format-only validation; no openspec cross-check). Without change-id, `commit-msg` hook blocks. The git hook also accepts `[OVERRIDE] <rule>: <reason>` to downgrade.

6. **Hook stdin contract**: hooks read JSON `{ session_id, tool_name, tool_input, cwd }` from stdin, output JSON to stdout `{ permissionDecision?, additionalContext? }`. Use `CLAUDE_PLUGIN_ROOT` env var for plugin root. **All hooks have 1–5s timeouts — never block on external calls.**

7. **Lingma untested e2e**: the Lingma path is built from doc interpretation (`help.aliyun.com/zh/lingma/lingma-cn`). Hooks are byte-identical to Claude (event names match) but full e2e on real Lingma IDE is pending. v0.3 task.

8. **`openspec` is required, not optional.** Without it, `/sdd-review` archive step is **blocking** (no mv fallback — mv doesn't merge, breaks the "specs reflect system truth" invariant). Install: `npm install -g @fission-ai/openspec`.

9. **Multi-tool coexistence**: each tool gets its own skills dir + settings.json merge. `oms-uninstall --tool <name>` only removes one tool's artifacts. `--purge` additionally clears `~/.oh-my-sdd/` state.

10. **Session meta path safety**: stdin session IDs are sanitized (`[A-Za-z0-9_-]` only) before forming `~/.oh-my-sdd/sessions/<id>.json` — guards against path traversal.

## Where to look first for each change type

| You want to… | Start here |
|--------------|-----------|
| Add/edit a HARD or SOFT rule | `content/enterprise-baseline.md` → then `hooks/lib/rules.js` → run `npm run lint:baseline` + `node --test __tests__/integration/pre-tool-use.test.js` |
| Change what `/sdd-plan` does | `skills/sdd-plan/SKILL.md` (delegates to `superpowers:brainstorming` → `writing-plans`) |
| Change what `/sdd-apply` does | `skills/sdd-apply/SKILL.md` (delegates to `superpowers:subagent-driven-development` or `executing-plans` based on task count) |
| Add a new tool (KiloCode/Cursor/Windsurf) | `hooks/lib/install-<tool>.js` + `install.js` dispatcher + `wrappers/` if it has a CLI |
| Add a new enterprise reference skill (api-design, security-check, …) | `skills/<name>/SKILL.md` — same frontmatter + scripts/ subdir convention as superpowers; **use `scripts/` and relative paths, NOT `${CLAUDE_SKILL_DIR}`** |
| Touch git hooks | `hooks/git/<event>-check.js` + `hooks/git/lib/hook-installer.js` |
| Change wrapper (baseline injection) | `wrappers/claude.{sh,ps1,bat}` (all three must stay in sync) |
| Change install/uninstall | `install.js` (entry) + `uninstall.js` (mirror) + `hooks/lib/install-{claude,lingma,shared}.js` |
| Add a CLI subcommand | `bin/<name>.js` (each exports a function, runnable directly) |
| Investigate a hook failure | `scripts/diag-session.sh` first, then `__tests__/helpers/spawn-hook.js` for reproducible spawn |

## External deps (all on PATH for production)

- `node` ≥ 18, `npm` ≥ 9 (declared in `package.json` engines)
- `iam` CLI — enterprise identity (required for Claude path)
- `dop` CLI — enterprise telemetry (required; `dop change list` is read-only)
- `openspec` CLI — `npm i -g @fission-ai/openspec` (required for `/sdd-review` archive)
- `gh` CLI — optional, for issues + PRs
- `claude` or `lingma` — host tool
- `superpowers` plugin (optional but recommended; `/sdd-plan`, `/sdd-apply`, `/sdd-review` all delegate to it)

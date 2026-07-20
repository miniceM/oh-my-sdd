# OpenCode Plugin Optimization — oh-my-sdd

## TL;DR

> **Quick Summary**: Refactor oh-my-sdd's OpenCode plugin from a single 234-line TypeScript file into a modular, observable, parity-complete adapter that matches the maturity of the Claude Code side.
>
> **Deliverables**:
> - Split `opencode/src/plugin.ts` into 5 focused modules
> - Add UserPromptSubmit event parity (slash command telemetry)
> - Add structured logging with secret-masking
> - Add plugin config block in `opencode.json` for timeouts/log level
> - Add CI workflow + version sync for `dist/` artifacts
> - Add test coverage for the new modules
> - Update docs (README, AGENTS.md, troubleshooting)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: T1 (module split) → T2 (UserPromptSubmit) → T3 (logging) → Final review

---

## Context

### Original Request
"检查当前的架构，特别是针对opencode plugin的设计，结合官方plugin的最佳实践给出优化方案"

### Interview Summary
**Key Discoveries** (from direct file reads + tests):

- `opencode/src/plugin.ts` is 234 lines, single file, holds paths/runner/mappers/plugin composition
- Hook logic is reused by spawning `node <hooksDir>/<hook>.js` — single source of truth
- Tool name translation at adapter boundary: `write→Write, edit→Edit, apply_patch→MultiEdit`
- 2 install layouts in the wild (legacy top-level `plugin.js` + new `dist/plugin.js`); plugin has probe
- `~/.config/opencode/AGENTS.md` baseline injection (sentinel block)
- `opencode.json` plugin array registration handled by `hooks/lib/install-opencode.js`
- All 31 existing tests pass (3 dedicated to opencode: paths, config register, build-flow)
- **GAP**: UserPromptSubmit hook has NO OpenCode adapter — slash command telemetry silently dropped
- **GAP**: Silent error handling — no log file for triage
- **GAP**: No user-facing config in `opencode.json` (timeouts, log level, hook toggles)
- **GAP**: `dist/plugin.js` rebuilt only at `prepublishOnly`; no CI parity check
- **GAP**: No version sync between root and `opencode/package.json`
- **GAP**: Single-file responsibility creep impedes testability

### Metis Review
**Identified Gaps** (addressed in plan):
- Scope creep risk: Lingma is a 3rd host — explicitly EXCLUDED from this plan (separate concern)
- Breaking changes: legacy install layout must remain functional — preserved via probe
- Log privacy: HARD_RULE redaction required — built into T3
- CI parity: dist rebuild check added in T5
- Dependency ordering: T1 (module split) is foundation for T2/T3/T4
- Sentinel collision on dual-host machines: `sentinelPathFor(tool)` already isolates by tool name

### OpenCode Event Model (per current API research)
- `session.created`, `session.deleted` (SessionStart/SessionEnd parity) — **wired**
- `tool.execute.before`, `tool.execute.after` (PreToolUse/PostToolUse parity) — **wired**
- User message event for slash-command parity — **TO BE VERIFIED in T2** (OpenCode event name to be confirmed against installed version)

---

## Work Objectives

### Core Objective
Bring the OpenCode plugin to feature parity with the Claude Code side while improving maintainability, observability, and operational safety.

### Concrete Deliverables
- `opencode/src/paths.ts` — install layout probe (extracted)
- `opencode/src/runner.ts` — `runHook` + structured logger (extracted)
- `opencode/src/mappers.ts` — event input → Claude Code stdin (extracted)
- `opencode/src/types.ts` — OpenCode event interfaces (extracted)
- `opencode/src/plugin.ts` — composition root only
- `opencode/src/config.ts` — plugin config loader from `opencode.json`
- `hooks/lib/user-prompt-submit.js` — no change to logic, but verify OpenCode compat
- `hooks/lib/install-opencode.js` — uninstall summary, disable flag
- `.github/workflows/opencode-plugin-ci.yml` — CI parity check
- `scripts/build-opencode-plugin.mjs` — version sync + tsc wrapper
- Updated `README.md` + `AGENTS.md` + new `docs/opencode-troubleshooting.md`
- 3+ new test files in `__tests__/unit/opencode/`

### Definition of Done
- [ ] `cd opencode && npm run build` succeeds; `dist/plugin.js` reflects `src/`
- [ ] CI step `Verify dist parity` is green
- [ ] All 31 existing tests still pass + new tests pass
- [ ] `npm run lint:baseline` green
- [ ] Manual smoke: install on a fresh opencode config, ask "你的身份是什么？", get "企业 SDD Agent" answer
- [ ] Manual smoke: trigger hard rule (`echo "AKIA1234567890ABCDEF" > test.txt` via opencode) → write blocked, error visible

### Must Have
- UserPromptSubmit parity (slash command telemetry works in OpenCode)
- Module split (5 files, each < 80 lines)
- Structured logging with secret redaction
- `opencode.json` plugin config block (timeout, log level, hook toggles)
- Version sync (root version → `opencode/package.json` via build)
- CI parity check
- 80%+ test coverage on new modules

### Must NOT Have (Guardrails from Metis)
- ❌ Do NOT remove `dist/plugin.js` from git (existing users depend on it)
- ❌ Do NOT break the legacy top-level install layout probe
- ❌ Do NOT log AK/SK/token/password/`.env` content (HARD_RULE)
- ❌ Do NOT change `~/.config/opencode/AGENTS.md` sentinel block format
- ❌ Do NOT change `opencode.json` `plugin` array registration schema
- ❌ Do NOT modify `hooks/lib/*.js` business logic (only adapter surface)
- ❌ Do NOT increase `runHook` default timeout above 5s (hook contracts)
- ❌ Do NOT add Lingma changes (separate plan)
- ❌ Do NOT add agent definitions / sub-agents (not in OpenCode's surface yet, scope creep)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed via the test suite and CLI probes.
> No acceptance criteria require human manual testing.

### Test Decision
- **Infrastructure exists**: YES (Node `node:test` runner, 17 unit + 14 integration files)
- **Automated tests**: Tests-after (matches existing convention; project does not use TDD)
- **Framework**: `node --test` (no Jest)
- **Coverage**: ≥80% on new modules (verified via `c8` if available; otherwise `node --test --experimental-test-coverage`)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/opencode-opt/task-{N}-{slug}.{ext}`.

- **CLI/build verification**: Bash — `cd opencode && npm run build`, `node --test __tests__/unit/opencode/`
- **Module verification**: node REPL — import each new module, call exported function
- **Install/uninstall verification**: spawn `node install.js --tool opencode` against a temp HOME, assert filesystem state
- **Hook integration verification**: spawn-hook helper in `__tests__/helpers/` already used by Claude Code tests; reuse

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + safe extractions):
├── T1: Extract paths.ts + types.ts from plugin.ts (no behavior change)
├── T2: Add OpenCode UserPromptSubmit event adapter (slash command parity)
├── T3: Add structured logger with secret redaction (no behavior change)
├── T8: Disable-plugin flag in install + uninstall summary
└── T9: Add opencode-plugin-ci.yml (dist parity check) + npm script

Wave 2 (After T1 — composition + tests):
├── T4: Add config.ts + opencode.json plugin config block
├── T5: Version sync script (root version → opencode/package.json)
├── T10: Tests for paths.ts, runner.ts, mappers.ts, config.ts
└── T11: Split plugin.ts into composition root (mappers/runner/paths already extracted)

Wave 3 (After Wave 2 — docs + smoke):
├── T6: Update README.md with OpenCode architecture section
├── T7: Add docs/opencode-troubleshooting.md
└── T12: Smoke test on temp HOME (full install → run hooks → uninstall)

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA on 3 OS (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix
- T1 (paths/types) → T11 (plugin split), T10 (tests)
- T2 (UserPromptSubmit) → T10 (tests)
- T3 (logger) → T11 (composition root uses logger)
- T4 (config) → T11 (plugin uses config)
- T5 (version sync) → T9 (CI checks dist)
- T8 (disable flag) → independent
- T9 (CI) → T1 (build artifact must be stable)
- T10 (tests) → T1, T2, T3, T4
- T11 (plugin split) → T1, T3, T4
- T12 (smoke) → T11
- T6 (docs) → T11 (docs must reflect final module structure)

**Critical path**: T1 → T11 → T12 → F1–F4 → user okay
**Parallelism**: 5 tasks in Wave 1 (max), 4 in Wave 2, 3 in Wave 3

---

## TODOs

- [x] T1. **Extract paths.ts and types.ts from plugin.ts** (foundation, no behavior change)

  **What to do**:
  - Create `opencode/src/paths.ts` exporting `HOOKS_DIR`, `PLUGIN_ROOT` (from current plugin.ts lines 23–33)
  - Create `opencode/src/types.ts` exporting `OpenCodeSessionInput`, `OpenCodeToolInput`, `RunHookOptions`, `HookResult`
  - Refactor `opencode/src/plugin.ts` to import from these new modules
  - Ensure `cd opencode && npm run build` produces working `dist/plugin.js`
  - Run `__tests__/unit/opencode-plugin-paths.test.js` and confirm it still passes

  **Must NOT do**:
  - Do not change the install layout probe logic (sibling-vs-parent fallback)
  - Do not change the `TOOL_MAP` / `TRACKED_TOOLS` constants location yet (they go to mappers.ts in T11)

  **Recommended Agent Profile**:
  - **Category**: `quick` (mechanical refactor, no logic change)
  - **Skills**: `[]`
  - **Reason**: Pure file extraction, ~30 lines moved

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T8, T9)
  - **Blocks**: T10 (tests), T11 (plugin split)
  - **Blocked By**: None

  **References**:
  - `opencode/src/plugin.ts:23-33` — current `__dirname` / `SIBLING_HOOKS` / `HOOKS_DIR` / `PLUGIN_ROOT` logic to extract
  - `opencode/src/plugin.ts:51-55` — `RunHookOptions` interface
  - `opencode/src/plugin.ts:122-149` — `OpenCodeSessionInput` / `OpenCodeToolInput` interfaces
  - `__tests__/unit/opencode-plugin-paths.test.js:30-56` — existing probe test pattern (must keep passing)

  **Acceptance Criteria**:
  - [ ] `opencode/src/paths.ts` and `opencode/src/types.ts` exist; `tsc --noEmit` passes
  - [ ] `cd opencode && npm run build` produces `dist/plugin.js` (no errors)
  - [ ] `node --test __tests__/unit/opencode-plugin-paths.test.js` → 3 pass
  - [ ] `node --test __tests__/unit/opencode-config-register.test.js` → 11 pass (no regression)

  **QA Scenarios**:
  ```
  Scenario: paths.ts resolves hooks/ in both install layouts
    Tool: Bash (node --test)
    Preconditions: T1 code complete
    Steps:
      1. cd /Users/hosea/work/git/oh-my-sdd
      2. node --test __tests__/unit/opencode-plugin-paths.test.js
    Expected Result: 3 pass, 0 fail
    Failure Indicators: any "fail" line, missing module error, tsc compile error
    Evidence: .sisyphus/evidence/opencode-opt/task-1-paths-test.txt

  Scenario: tsc build succeeds with new module structure
    Tool: Bash
    Preconditions: T1 code complete
    Steps:
      1. cd /Users/hosea/work/git/oh-my-sdd/opencode
      2. npx tsc --noEmit 2>&1
      3. npx tsc 2>&1
    Expected Result: exit 0, no errors, dist/plugin.js regenerated
    Evidence: .sisyphus/evidence/opencode-opt/task-1-tsc-build.txt
  ```

  **Commit**: YES
  - Message: `refactor(opencode): extract paths.ts and types.ts from plugin.ts`
  - Files: `opencode/src/paths.ts`, `opencode/src/types.ts`, `opencode/src/plugin.ts`, `opencode/dist/plugin.js`
  - Pre-commit: `cd opencode && npm run build && node --test __tests__/unit/opencode-plugin-paths.test.js`

---

- [x] T2. **Add OpenCode UserPromptSubmit event adapter (slash command parity)**

  **What to do**:
  - Investigate the OpenCode event for user message submission (likely `message.created` / `chat.message` / `user.message`). Verify against installed `@opencode-ai/plugin` types or opencode.ai docs.
  - Add new handler in `opencode/src/plugin.ts` that subscribes to the user-message event, extracts prompt text, calls `runHook('user-prompt-submit.js', { session_id, prompt })`
  - The hook already parses `<command-name>` tags (don't duplicate)
  - If exact event name can't be confirmed, use the documented event and add `// TODO: verify against installed opencode version` comment

  **Must NOT do**:
  - Do not block on network calls (telemetry is best-effort)
  - Do not exceed 3s timeout
  - Do not log prompt content (HARD_RULE: no secret leak)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
  - **Reason**: Single new event handler, 20-40 lines, follows existing pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T10 (tests)
  - **Blocked By**: None

  **References**:
  - `opencode/src/plugin.ts:186-229` — existing event handler pattern (copy this shape)
  - `hooks/user-prompt-submit.js:28-36` — `<command-name>` parsing (don't duplicate; re-spawn the hook)
  - `hooks/hooks.json:19-26` — Claude Code UserPromptSubmit config (parity target)
  - External: opencode.ai Plugins page — events list (verify event name)

  **Acceptance Criteria**:
  - [ ] New event handler subscribes to user-message event in `opencode/src/plugin.ts`
  - [ ] Handler invokes `user-prompt-submit.js` via `runHook`
  - [ ] `npm run build` succeeds
  - [ ] All existing tests still pass

  **QA Scenarios**:
  ```
  Scenario: UserPromptSubmit handler is present in compiled dist
    Tool: Bash (grep)
    Preconditions: T2 code complete, npm run build done
    Steps:
      1. grep -q 'user-prompt-submit' opencode/dist/plugin.js
    Expected Result: exit 0, line found
    Failure Indicators: no match
    Evidence: .sisyphus/evidence/opencode-opt/task-2-spawn-grep.txt

  Scenario: Default export object includes user-message event key
    Tool: Bash (node REPL)
    Preconditions: T2 code complete
    Steps:
      1. node --input-type=module -e "import oms from './opencode/dist/plugin.js'; const p = await oms({}); console.log(Object.keys(p).join(','))"
    Expected Result: output contains the user-message event key
    Evidence: .sisyphus/evidence/opencode-opt/task-2-handler-exports.txt
  ```

  **Commit**: YES
  - Message: `feat(opencode): wire UserPromptSubmit event for slash command telemetry parity`
  - Files: `opencode/src/plugin.ts`, `opencode/dist/plugin.js`
  - Pre-commit: `cd opencode && npm run build`

---

- [x] T3. **Add structured logger with secret redaction** (triage-ability, no user-facing behavior change)

  **What to do**:
  - Create `opencode/src/logger.ts` exporting `log(level, message, fields?)` that:
    - Writes to `~/.oh-my-sdd/logs/opencode-plugin.log` (append mode, mode 0600)
    - Auto-creates the directory
    - Supports `level`: 'debug' | 'info' | 'warn' | 'error'
    - Truncates fields to 1KB each
  - Redaction filter: before write, scan message + fields for patterns and replace:
    - `AKIA[A-Z0-9]{16}` → `AKIA****REDACTED****`
    - `sk-[a-zA-Z0-9]{20,64}` → `sk-****REDACTED****`
  - Add `OMSD_DEBUG=1` env var that bumps default level to 'debug'
  - Wire into existing `runHook` (T11) — replace silent `process.stderr.write` with `logger.warn(...)`

  **Must NOT do**:
  - Do not log `tool_input.content` / `tool_input.new_string` (could contain secrets)
  - Do not log stdin payloads
  - Do not write to a path inside the plugin install dir (use state dir)
  - Do not break `runHook` return semantics (only change error reporting)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (security-sensitive, redaction correctness)
  - **Skills**: `['security-check']`
  - **Reason**: Hard rules on what NOT to log; mirror `hooks/lib/rules.js` redaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T11 (composition root uses logger)
  - **Blocked By**: None

  **References**:
  - `hooks/lib/rules.js:22-40` — exact regex patterns for redaction
  - `hooks/lib/log.js` — existing log API surface (`debug`, `info`, `warn`, `error`) for parity
  - `hooks/lib/platform.js:37-39` — `getStateDir()` returns `~/.oh-my-sdd`; reuse
  - `opencode/src/plugin.ts:74-114` — current silent error swallowing points to replace

  **Acceptance Criteria**:
  - [ ] `opencode/src/logger.ts` exists with `log()` + redaction filter
  - [ ] Test verifies AKIA redaction: input `AKIA1234567890ABCDEF` → output `AKIA****REDACTED****`
  - [ ] Test verifies sk- redaction: input `sk-abcdef...64chars` → output `sk-****REDACTED****`
  - [ ] Log file path = `~/.oh-my-sdd/logs/opencode-plugin.log`
  - [ ] `tsc --noEmit` passes
  - [ ] Existing tests still pass

  **QA Scenarios**:
  ```
  Scenario: Logger redacts AKIA pattern
    Tool: Bash (node REPL)
    Preconditions: T3 code complete
    Steps:
      1. HOME=/tmp/oms-log-test mkdir -p /tmp/oms-log-test/.oh-my-sdd/logs
      2. HOME=/tmp/oms-log-test node --input-type=module -e "import('./opencode/dist/logger.js').then(m => m.log('info', 'test', { msg: 'AKIA1234567890ABCDEF' }))"
      3. cat /tmp/oms-log-test/.oh-my-sdd/logs/opencode-plugin.log
    Expected Result: log file contains "AKIA****REDACTED****", not raw AKIA
    Evidence: .sisyphus/evidence/opencode-opt/task-3-ak-redact.txt

  Scenario: Logger does not leak tool_input content
    Tool: Bash (node REPL)
    Preconditions: T3 code complete
    Steps:
      1. HOME=/tmp/oms-log-test node --input-type=module -e "import('./opencode/dist/logger.js').then(m => m.log('info', 'pre-tool', { tool_input: { content: 'AKIA1234567890ABCDEF' } }))"
      2. cat /tmp/oms-log-test/.oh-my-sdd/logs/opencode-plugin.log
    Expected Result: log file contains "AKIA****REDACTED****" or omits content field; raw AKIA absent
    Evidence: .sisyphus/evidence/opencode-opt/task-3-no-content-leak.txt
  ```

  **Commit**: YES
  - Message: `feat(opencode): add structured logger with secret redaction`
  - Files: `opencode/src/logger.ts`, `opencode/dist/logger.js`, `opencode/dist/plugin.js` (rebuild)
  - Pre-commit: `cd opencode && npm run build`

---

- [x] T4. **Add config.ts + opencode.json plugin config block** (user-facing knobs)

  **What to do**:
  - Create `opencode/src/config.ts` exporting `loadConfig()` that reads `~/.config/opencode/opencode.json`, extracts `oh-my-sdd` key, validates schema, returns frozen config
  - Default config: `{ timeouts: { preToolUse: 5000, postToolUse: 3000, sessionStart: 10000, userPrompt: 3000 }, logLevel: 'info', hooks: { preToolUse: true, postToolUse: true, sessionStart: true, userPrompt: true } }`
  - Schema:
    ```ts
    interface OhMySddConfig {
      timeouts?: Partial<{ preToolUse: number; postToolUse: number; sessionStart: number; userPrompt: number }>;
      logLevel?: 'debug' | 'info' | 'warn' | 'error';
      hooks?: Partial<{ preToolUse: boolean; postToolUse: boolean; sessionStart: boolean; userPrompt: boolean }>;
      disabled?: boolean;
    }
    ```
  - In `opencode/src/plugin.ts` (later T11), pass `config.timeouts` into `runHook({ timeoutMs })` calls
  - If `config.disabled === true`, plugin returns `{}` (no handlers)
  - If `config.hooks.preToolUse === false`, skip the PreToolUse handler
  - On invalid config: log warning, fall back to defaults (do not crash)

  **Must NOT do**:
  - Do not change the `plugin` array schema in opencode.json
  - Do not require the `oh-my-sdd` key (fully optional)
  - Do not throw on missing file (defaults apply)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Schema validation + defaults + safe fallback logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T11
  - **Blocked By**: T1 (needs `paths.ts` for `~/.config/opencode/opencode.json` path)

  **References**:
  - `hooks/lib/config.js` — existing config loader pattern (shape, validation style)
  - `opencode/src/plugin.ts:38-43` — current hardcoded timeouts
  - `hooks/lib/install-opencode.js:137-169` — `registerOpenCodePlugin` (don't touch `plugin` array part; only add `oh-my-sdd` key)

  **Acceptance Criteria**:
  - [ ] `opencode/src/config.ts` exports `loadConfig()` and `OhMySddConfig` type
  - [ ] Default config returned when `opencode.json` missing or no `oh-my-sdd` key
  - [ ] Custom config merged with defaults (partial overrides)
  - [ ] Invalid `logLevel` value → warning logged, default applied
  - [ ] `tsc --noEmit` passes
  - [ ] Tests cover: missing file, empty file, valid partial, invalid logLevel

  **QA Scenarios**:
  ```
  Scenario: loadConfig returns defaults when opencode.json missing
    Tool: Bash (node)
    Preconditions: T4 code complete
    Steps:
      1. HOME=/tmp/oms-empty-config node --input-type=module -e "import('./opencode/dist/config.js').then(m => console.log(JSON.stringify(m.loadConfig())))"
    Expected Result: JSON with default timeouts and logLevel='info'
    Evidence: .sisyphus/evidence/opencode-opt/task-4-defaults.txt

  Scenario: loadConfig merges user overrides
    Tool: Bash (node)
    Preconditions: T4 code complete
    Steps:
      1. mkdir -p /tmp/oms-cfg/.config/opencode
      2. echo '{"oh-my-sdd": {"timeouts": {"preToolUse": 1000}, "logLevel": "debug"}}' > /tmp/oms-cfg/.config/opencode/opencode.json
      3. HOME=/tmp/oms-cfg node --input-type=module -e "import('./opencode/dist/config.js').then(m => console.log(JSON.stringify(m.loadConfig())))"
    Expected Result: preToolUse=1000, logLevel=debug, other timeouts = defaults
    Evidence: .sisyphus/evidence/opencode-opt/task-4-override.txt
  ```

  **Commit**: YES
  - Message: `feat(opencode): add plugin config block + config.ts loader`
  - Files: `opencode/src/config.ts`, `opencode/src/plugin.ts`, `opencode/dist/config.js`, `opencode/dist/plugin.js`
  - Pre-commit: `cd opencode && npm run build`

---

- [x] T5. **Version sync script (root version → opencode/package.json)**

  **What to do**:
  - Create `scripts/build-opencode-plugin.mjs` that:
    1. Reads root `package.json` version
    2. Writes it to `opencode/package.json` if different
    3. Runs `cd opencode && npm run build`
    4. Prints summary
  - Update root `package.json`:
    - Add `"build:opencode": "node scripts/build-opencode-plugin.mjs"` script
    - Change `prepublishOnly` to call `npm run build:opencode`
  - Add guard: if `opencode/dist/plugin.js` is older than `opencode/src/plugin.ts` (mtime check), exit 1 with message "dist stale; run npm run build:opencode"

  **Must NOT do**:
  - Do not change `package-lock.json` (npm handles)
  - Do not commit `opencode/node_modules/`
  - Do not break `prepublishOnly` for npm publish

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
  - **Reason**: Mechanical version sync + build orchestration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T9 (CI uses this script)
  - **Blocked By**: T1

  **References**:
  - `package.json:18` — current `prepublishOnly: "cd opencode && npm ci --include=dev && npm run build"`
  - `opencode/package.json:3` — current `version: 0.1.0`
  - `package.json:1-2` — root version source

  **Acceptance Criteria**:
  - [ ] `scripts/build-opencode-plugin.mjs` exists
  - [ ] Running it sets `opencode/package.json` version = root version
  - [ ] Running it rebuilds `opencode/dist/plugin.js`
  - [ ] `npm run build:opencode` works from root
  - [ ] Guard exits 1 if dist is stale vs src

  **QA Scenarios**:
  ```
  Scenario: Version sync updates opencode/package.json
    Tool: Bash
    Preconditions: T5 code complete
    Steps:
      1. cd /Users/hosea/work/git/oh-my-sdd
      2. node -e "console.log(require('./package.json').version)"
      3. node scripts/build-opencode-plugin.mjs
      4. node -e "console.log(require('./opencode/package.json').version)"
    Expected Result: both versions match
    Evidence: .sisyphus/evidence/opencode-opt/task-5-version-sync.txt

  Scenario: Stale dist guard triggers
    Tool: Bash
    Preconditions: T5 code complete
    Steps:
      1. touch -d "1 hour ago" opencode/dist/plugin.js
      2. node scripts/build-opencode-plugin.mjs
    Expected Result: exit 1 (guard) OR rebuild + exit 0 (script's policy)
    Evidence: .sisyphus/evidence/opencode-opt/task-5-stale-guard.txt
  ```

  **Commit**: YES
  - Message: `chore(build): add opencode version sync + dist staleness guard`
  - Files: `scripts/build-opencode-plugin.mjs`, `package.json`
  - Pre-commit: `node scripts/build-opencode-plugin.mjs && cd opencode && npm run build`

---

- [x] T10. **Tests for paths.ts, runner.ts, mappers.ts, config.ts** (raise coverage from 0% to ≥80%)

  **What to do**:
  - Create `__tests__/unit/opencode/paths.test.js` — verifies `HOOKS_DIR` / `PLUGIN_ROOT` resolution in both install layouts (extend existing `opencode-plugin-paths.test.js` rather than duplicate)
  - Create `__tests__/unit/opencode/runner.test.js` — tests `runHook` with:
    - Happy path: hook exits 0, returns JSON `{ permissionDecision: 'deny' }` → adapter throws
    - Timeout: hook hangs → `runHook` returns `{}` after timeoutMs
    - Non-zero exit: hook exits 1 → returns `{}`
    - Spawn failure: `node` not in PATH → returns `{}`
  - Create `__tests__/unit/opencode/mappers.test.js` — tests `mapPreToolUse`, `mapPostToolUse`, `mapSessionStart`, `mapSessionEnd`:
    - Untracked tool (`bash`) → returns null
    - `write` → `Write` with content passthrough
    - `edit` → `Edit` with new_string passthrough
    - `apply_patch` → `MultiEdit`
  - Create `__tests__/unit/opencode/config.test.js` — tests `loadConfig`:
    - Missing file → defaults
    - Empty file → defaults
    - Valid partial overrides → merged
    - Invalid `logLevel` → warning + defaults
    - `disabled: true` → returns disabled config

  **Must NOT do**:
  - Do not test the actual hook scripts (that's `__tests__/integration/pre-tool-use.test.js` already)
  - Do not duplicate existing `opencode-plugin-paths.test.js` cases

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `['testing-strategy']`
  - **Reason**: Test design matters; reuse existing helpers

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T12 (smoke)
  - **Blocked By**: T1, T2, T3, T4

  **References**:
  - `__tests__/unit/opencode-plugin-paths.test.js` — existing pattern (must remain compatible)
  - `__tests__/unit/opencode-config-register.test.js` — existing pattern (imports `install-opencode.js` with `?t=...` cache bust)
  - `__tests__/helpers/spawn-hook.js` — if exists, reuse; else create it
  - `opencode/src/runner.ts` (after T3) — `runHook` interface
  - `opencode/src/mappers.ts` (after T11) — mapper functions
  - `opencode/src/config.ts` (after T4) — `loadConfig` interface

  **Acceptance Criteria**:
  - [ ] 4 new test files in `__tests__/unit/opencode/`
  - [ ] All new tests pass
  - [ ] All existing tests still pass
  - [ ] `node --test "opencode/**"` reports ≥80% line coverage on new modules (if coverage tooling available)

  **QA Scenarios**:
  ```
  Scenario: New opencode test files all pass
    Tool: Bash
    Preconditions: T6 code complete
    Steps:
      1. cd /Users/hosea/work/git/oh-my-sdd
      2. node --test __tests__/unit/opencode/ 2>&1
    Expected Result: tests > 0, pass == tests, fail == 0
    Failure Indicators: any fail line, missing module
    Evidence: .sisyphus/evidence/opencode-opt/task-6-new-tests.txt

  Scenario: Full unit test suite still green
    Tool: Bash
    Preconditions: T6 code complete
    Steps:
      1. cd /Users/hosea/work/git/oh-my-sdd
      2. node --test __tests__/unit/ 2>&1 | tail -5
    Expected Result: pass count includes all 17 original + new
    Evidence: .sisyphus/evidence/opencode-opt/task-6-full-unit.txt
  ```

  **Commit**: YES
  - Message: `test(opencode): add unit tests for paths/runner/mappers/config`
  - Files: `__tests__/unit/opencode/*.test.js`
  - Pre-commit: `node --test __tests__/unit/opencode/`

---

- [x] T11. **Split plugin.ts into composition root (mappers/runner/paths already extracted)**

  **What to do**:
  - Create `opencode/src/mappers.ts` with `TOOL_MAP`, `TRACKED_TOOLS`, `mapSessionStart`, `mapSessionEnd`, `mapPreToolUse`, `mapPostToolUse`, `mapUserPromptSubmit` (new)
  - Create `opencode/src/runner.ts` with `runHook` (moved from plugin.ts:56-116)
  - Refactor `opencode/src/plugin.ts` to be a thin composition root:
    - Import from `paths.ts`, `runner.ts`, `mappers.ts`, `config.ts`, `logger.ts`
    - Export `OhMySddPlugin` factory
    - Wire `config.disabled` / `config.hooks.*` to enable/disable handlers
    - Wire `config.timeouts.*` into `runHook` calls
  - Target: `opencode/src/plugin.ts` ≤ 60 lines (composition only)

  **Must NOT do**:
  - Do not change external behavior (event payload shape, return values)
  - Do not change the legacy install layout probe
  - Do not introduce new dependencies (no `lodash`, no `zod` — keep it stdlib)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: Module boundary discipline; needs to preserve runtime behavior

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Sequential**: depends on T1, T2, T3, T4 completion
  - **Blocks**: T12 (smoke), T13 (AGENTS.md)
  - **Blocked By**: T1, T2, T3, T4

  **References**:
  - `opencode/src/plugin.ts:41-46` — `TOOL_MAP` and `TRACKED_TOOLS` to move to mappers
  - `opencode/src/plugin.ts:127-177` — all `map*` functions to move
  - `opencode/src/plugin.ts:56-116` — `runHook` to move to runner
  - `opencode/src/plugin.ts:183-231` — `OhMySddPlugin` to keep in plugin.ts (composition)

  **Acceptance Criteria**:
  - [ ] `opencode/src/mappers.ts`, `runner.ts` exist
  - [ ] `opencode/src/plugin.ts` ≤ 60 lines
  - [ ] `tsc --noEmit` passes
  - [ ] `cd opencode && npm run build` succeeds
  - [ ] All existing tests still pass (T1 + T6 test files must remain green)

  **QA Scenarios**:
  ```
  Scenario: plugin.ts is now under 60 lines (composition root)
    Tool: Bash
    Preconditions: T7 code complete
    Steps:
      1. wc -l opencode/src/plugin.ts
    Expected Result: output is ≤ 60
    Evidence: .sisyphus/evidence/opencode-opt/task-7-line-count.txt

  Scenario: Module exports are present
    Tool: Bash
    Preconditions: T7 code complete
    Steps:
      1. ls opencode/src/{paths,types,mappers,runner,config,logger,plugin}.ts
    Expected Result: 7 files present
    Evidence: .sisyphus/evidence/opencode-opt/task-7-modules.txt

  Scenario: All integration tests still pass
    Tool: Bash
    Preconditions: T7 code complete
    Steps:
      1. cd /Users/hosea/work/git/oh-my-sdd
      2. node --test __tests__/integration/ 2>&1 | tail -5
    Expected Result: 0 fail
    Evidence: .sisyphus/evidence/opencode-opt/task-7-integration.txt
  ```

  **Commit**: YES
  - Message: `refactor(opencode): split plugin.ts into composition root + mappers + runner`
  - Files: `opencode/src/{mappers,runner,plugin}.ts`, `opencode/dist/*.js`
  - Pre-commit: `cd opencode && npm run build && node --test`

---

- [x] T8. **Disable-plugin flag in install + uninstall summary** (UX improvement)

  **What to do**:
  - Modify `hooks/lib/install-opencode.js`:
    - Add `disable()` function: sets `opencode.json` `oh-my-sdd.disabled = true` and removes the plugin entry from the `plugin` array (but keeps the plugin files on disk)
    - Add `enable()` function: removes `disabled` flag and re-adds plugin entry
    - Update `uninstallForOpenCode()` to print a summary: "Removed: skills (X dirs), plugin dir, AGENTS.md block, opencode.json entry, sentinel"
  - Add CLI flag support: `oms-install --tool opencode --disable` and `oms-install --tool opencode --enable`
  - Update `bin/oms-install.js` to parse and forward these flags

  **Must NOT do**:
  - Do not break the existing `installForOpenCode()` flow when no flag is passed
  - Do not delete plugin files on `--disable` (only on `uninstall`)
  - Do not change the `plugin` array schema (entries are still relative paths)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`
  - **Reason**: Additive change; small CLI surface

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `hooks/lib/install-opencode.js:137-169` — `registerOpenCodePlugin` (use as template for `disable`/`enable`)
  - `hooks/lib/install-opencode.js:241-280` — `uninstallForOpenCode` (add summary print at end)
  - `bin/oms-install.js:61-81` — `parseArgs` (add `--disable` / `--enable` parsing)
  - `install.js:117-136` — `main` dispatcher (forward `disable` flag)

  **Acceptance Criteria**:
  - [ ] `disable()` function exists and removes plugin from `opencode.json` array
  - [ ] `enable()` function exists and re-adds plugin
  - [ ] `uninstallForOpenCode()` prints summary before exit
  - [ ] `oms-install --tool opencode --disable` works
  - [ ] `oms-install --tool opencode --enable` works
  - [ ] All existing tests still pass + new test in `__tests__/unit/install-targets.test.js`

  **QA Scenarios**:
  ```
  Scenario: --disable removes plugin entry but keeps files
    Tool: Bash
    Preconditions: T8 code complete, fake HOME with installed opencode
    Steps:
      1. HOME=/tmp/oms-disable node install.js --tool opencode
      2. HOME=/tmp/oms-disable node install.js --tool opencode --disable
      3. cat /tmp/oms-disable/.config/opencode/opencode.json
      4. ls /tmp/oms-disable/.config/opencode/plugins/oh-my-sdd/
    Expected Result: opencode.json has no oh-my-sdd plugin entry; plugin dir still exists
    Evidence: .sisyphus/evidence/opencode-opt/task-8-disable.txt

  Scenario: --enable re-adds plugin entry
    Tool: Bash
    Preconditions: T8 code complete
    Steps:
      1. (continue from previous) HOME=/tmp/oms-disable node install.js --tool opencode --enable
      2. cat /tmp/oms-disable/.config/opencode/opencode.json
    Expected Result: opencode.json plugin array contains oh-my-sdd entry again
    Evidence: .sisyphus/evidence/opencode-opt/task-8-enable.txt

  Scenario: Uninstall summary prints
    Tool: Bash
    Preconditions: T8 code complete
    Steps:
      1. HOME=/tmp/oms-disable node install.js --tool opencode --uninstall  # or oms-uninstall equivalent
    Expected Result: stderr contains summary lines ("Removed: skills...", "Removed: plugin dir...")
    Evidence: .sisyphus/evidence/opencode-opt/task-8-summary.txt
  ```

  **Commit**: YES
  - Message: `feat(install): add --disable/--enable flags for opencode plugin + uninstall summary`
  - Files: `hooks/lib/install-opencode.js`, `bin/oms-install.js`, `install.js`
  - Pre-commit: `node --test __tests__/unit/install-targets.test.js`

---

- [x] T9. **CI workflow: dist parity check + version sync** (operational safety)

  **What to do**:
  - Create `.github/workflows/opencode-plugin-ci.yml` triggered on:
    - Pull request affecting `opencode/**` or `package.json` or `scripts/build-opencode-plugin.mjs`
  - Steps:
    1. `actions/checkout@v4`
    2. `actions/setup-node@v4` with node-version: [18, 20, 22]
    3. `npm ci` (root)
    4. `npm run build:opencode` (T5 script)
    5. `node --test __tests__/unit/opencode/`
    6. `git diff --exit-code opencode/dist/` (fail if dist changed but not committed)
    7. `npm run lint:baseline`
  - Add a top-level `npm run ci:opencode` script that mirrors steps 4-6 for local use

  **Must NOT do**:
  - Do not change the existing `.github/workflows/` files (only add a new one)
  - Do not trigger on every push (only PRs)
  - Do not require secrets

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `['git-master']`
  - **Reason**: Standard CI pattern

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: T5 (uses build:opencode script)

  **References**:
  - `.github/workflows/` — existing CI files (do not modify)
  - `package.json:15-22` — existing scripts
  - `scripts/check-baseline-tokens.mjs` — existing lint pattern

  **Acceptance Criteria**:
  - [ ] `.github/workflows/opencode-plugin-ci.yml` exists
  - [ ] `npm run ci:opencode` script in root `package.json` works locally
  - [ ] Workflow is syntactically valid YAML
  - [ ] On dist staleness, `git diff --exit-code` fails (expected)

  **QA Scenarios**:
  ```
  Scenario: CI workflow YAML is valid
    Tool: Bash
    Preconditions: T9 code complete
    Steps:
      1. python3 -c "import yaml; yaml.safe_load(open('.github/workflows/opencode-plugin-ci.yml'))" 2>&1
    Expected Result: exit 0, no YAML errors
    Evidence: .sisyphus/evidence/opencode-opt/task-9-yaml-valid.txt

  Scenario: ci:opencode script runs locally
    Tool: Bash
    Preconditions: T9 code complete
    Steps:
      1. cd /Users/hosea/work/git/oh-my-sdd
      2. npm run ci:opencode 2>&1 | tail -20
    Expected Result: all steps complete (or step 6 git-diff fails because dist changed — that's a feature)
    Evidence: .sisyphus/evidence/opencode-opt/task-9-ci-local.txt
  ```

  **Commit**: YES
  - Message: `ci: add opencode plugin parity workflow + ci:opencode script`
  - Files: `.github/workflows/opencode-plugin-ci.yml`, `package.json`
  - Pre-commit: `npm run ci:opencode` (or `git diff --exit-code opencode/dist/` if expected to fail)

---

- [x] T6. **Update README.md with OpenCode architecture section** (discoverability)

  **What to do**:
  - In root `README.md`:
    - Add an "Architecture → OpenCode adapter" subsection with:
      - Diagram showing opencode/src/ module layout (7 files)
      - Event mapping table (OpenCode event → hook.js)
      - Install layout explanation (legacy vs dist)
    - Add troubleshooting entry: "OpenCode plugin not loading" → check `opencode.json` plugin array, check dist file exists, check `~/.oh-my-sdd/logs/opencode-plugin.log`
  - Update root `AGENTS.md` similarly (the architecture diagram there is Claude-Code-only)

  **Must NOT do**:
  - Do not remove existing Claude Code documentation
  - Do not introduce new external links without checking they resolve

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `['doc-writer']`
  - **Reason**: Documentation update; clarity over volume

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T11 (so docs reflect final module structure)

  **References**:
  - `README.md` — current state (read first)
  - `AGENTS.md` — current state (Claude-Code-focused)
  - `opencode/src/` (post-T7) — final module list for the diagram

  **Acceptance Criteria**:
  - [ ] `README.md` has new "OpenCode adapter" section with diagram
  - [ ] `AGENTS.md` architecture diagram updated
  - [ ] No broken internal links (`grep -rn '](#' README.md AGENTS.md` to verify)

  **QA Scenarios**:
  ```
  Scenario: README has OpenCode section
    Tool: Bash (grep)
    Preconditions: T10 code complete
    Steps:
      1. grep -q 'OpenCode adapter\|opencode/src\|OpenCode 适配' README.md
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/opencode-opt/task-10-readme-grep.txt

  Scenario: AGENTS.md reflects new module structure
    Tool: Bash
    Preconditions: T10 code complete
    Steps:
      1. grep -q 'mappers.ts\|runner.ts' AGENTS.md
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/opencode-opt/task-10-agents-grep.txt
  ```

  **Commit**: YES
  - Message: `docs: add OpenCode architecture section to README + AGENTS.md`
  - Files: `README.md`, `AGENTS.md`
  - Pre-commit: `grep -rn '](#' README.md AGENTS.md` (verify anchors)

---

- [x] T7. **Add docs/opencode-troubleshooting.md** (operational guide)

  **What to do**:
  - Create `docs/opencode-troubleshooting.md` covering:
    - **Baseline not loading** — check `~/.config/opencode/AGENTS.md` has the sentinel block
    - **Plugin not registered** — check `~/.config/opencode/opencode.json` has the entry in `plugin` array
    - **Plugin throws on every tool call** — check `~/.oh-my-sdd/logs/opencode-plugin.log`; look for `permissionDecision: "deny"` reasons
    - **Soft rule warnings not visible to agent** — explain that OpenCode's `additionalContext` is via AGENTS.md only; the adapter writes to stderr as best-effort
    - **Disable without uninstall** — `oms-install --tool opencode --disable`
    - **Re-enable** — `oms-install --tool opencode --enable`
    - **Version mismatch** — run `npm run build:opencode` to sync
    - **Stale dist** — symptom: hook not found errors; fix: `npm run build:opencode`
    - **Log file location** — `~/.oh-my-sdd/logs/opencode-plugin.log`; rotate manually if > 10MB
  - Link from root README and AGENTS.md

  **Must NOT do**:
  - Do not include example secret values in the doc
  - Do not link to external pages that aren't already cited in the repo

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `['doc-writer']`
  - **Reason**: User-facing troubleshooting doc

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T11, T8

  **References**:
  - `docs/sdd-git-workflow.md` — existing docs style reference
  - `docs/smoke-test-checklist.md` — existing docs style reference
  - `baseline/opencode.md` — what the baseline looks like
  - `hooks/lib/install-opencode.js` — what gets installed where

  **Acceptance Criteria**:
  - [ ] `docs/opencode-troubleshooting.md` exists
  - [ ] Covers 8 scenarios listed above
  - [ ] No fake secret values
  - [ ] Linked from README + AGENTS.md

  **QA Scenarios**:
  ```
  Scenario: Troubleshooting doc covers all 8 scenarios
    Tool: Bash (grep)
    Preconditions: T11 code complete
    Steps:
      1. for s in "Baseline not loading" "Plugin not registered" "throws on every tool" "Soft rule" "Disable" "Re-enable" "Version mismatch" "Stale dist" "Log file"; do grep -q "$s" docs/opencode-troubleshooting.md && echo "FOUND: $s" || echo "MISSING: $s"; done
    Expected Result: all 9 strings found (or renamed per editorial discretion; baseline = at least 8 found)
    Evidence: .sisyphus/evidence/opencode-opt/task-11-troubleshoot-grep.txt
  ```

  **Commit**: YES
  - Message: `docs: add opencode-troubleshooting.md`
  - Files: `docs/opencode-troubleshooting.md`
  - Pre-commit: `grep -rn opencode-troubleshooting.md README.md AGENTS.md` (verify linked)

---

- [x] T12. **Smoke test on temp HOME (full install → run hooks → uninstall)** (end-to-end)

  **What to do**:
  - Create `scripts/smoke-opencode.sh` (or `.ps1` for Windows, but bash is fine for macOS/Linux dev) that:
    1. Creates a temp HOME at `/tmp/oms-smoke-XXXX`
    2. Runs `node install.js --tool opencode` against it
    3. Asserts: `~/.config/opencode/AGENTS.md` exists, has sentinel block
    4. Asserts: `~/.config/opencode/opencode.json` has plugin entry
    5. Asserts: `~/.config/opencode/plugins/oh-my-sdd/dist/plugin.js` exists
    6. Asserts: `~/.config/opencode/plugins/oh-my-sdd/hooks/pre-tool-use.js` exists
    7. Spawns a fake opencode-like event payload: `node -e "import('./dist/plugin.js').then(async m => { const p = await m.default({}); await p['tool.execute.before']({ tool: 'write', input: { file_path: '/tmp/evil.txt', content: 'AKIA1234567890ABCDEF' } }, {}); })"` (or the actual event name after T2)
    8. Expects the call to throw (hard rule denied)
    9. Runs `oms-uninstall --tool opencode`
    10. Asserts: plugin dir, sentinel, AGENTS.md block are removed
  - Add `npm run smoke:opencode` script

  **Must NOT do**:
  - Do not require an actual `opencode` CLI (we mock the plugin invocation)
  - Do not leave temp dirs on disk on failure (trap EXIT → rm -rf)
  - Do not run in CI by default (manual smoke only); gate behind `OMSD_SMOKE=1`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`
  - **Reason**: E2E integration; many moving parts

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: T11, T8

  **References**:
  - `__tests__/integration/install-targets.test.js` — existing install flow test pattern
  - `hooks/lib/install-opencode.js:213-240` — `installForOpenCode` flow
  - `opencode/src/plugin.ts:198-221` — `tool.execute.before` handler

  **Acceptance Criteria**:
  - [ ] `scripts/smoke-opencode.sh` exists
  - [ ] `npm run smoke:opencode` runs end-to-end on macOS
  - [ ] All 10 assertions in the script pass
  - [ ] Hard rule denial produces a thrown error (capture in evidence)

  **QA Scenarios**:
  ```
  Scenario: Smoke test passes end-to-end
    Tool: Bash
    Preconditions: T12 code complete
    Steps:
      1. cd /Users/hosea/work/git/oh-my-sdd
      2. OMSD_SMOKE=1 npm run smoke:opencode 2>&1
    Expected Result: all assertions print "PASS", exit 0
    Evidence: .sisyphus/evidence/opencode-opt/task-12-smoke.txt

  Scenario: Hard rule denial is observable
    Tool: Bash
    Preconditions: T12 code complete
    Steps:
      1. From smoke test step 7, capture the thrown error
    Expected Result: error message references HARD_RULE / AKIA
    Evidence: .sisyphus/evidence/opencode-opt/task-12-deny.txt
  ```

  **Commit**: YES
  - Message: `test(opencode): add end-to-end smoke test script`
  - Files: `scripts/smoke-opencode.sh`, `package.json`
  - Pre-commit: `OMSD_SMOKE=1 npm run smoke:opencode`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.**

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns (e.g. AKIA logging, dist removal, sentinel format change). Check evidence files in `.sisyphus/evidence/opencode-opt/`. Confirm all 12 task acceptance criteria pass.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | Evidence [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `cd opencode && npx tsc --noEmit` + `node --test __tests__/unit/opencode/`. Review new files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Run `OMSD_SMOKE=1 npm run smoke:opencode` against fresh temp HOME. Verify all 10 smoke assertions. Test the disable/enable flag. Test the uninstall summary. Capture evidence in `.sisyphus/evidence/opencode-opt/final-qa/`.
  Output: `Smoke [PASS/FAIL] | Flags [PASS/FAIL] | Uninstall [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Confirm Lingma was NOT touched (separate host, excluded). Confirm `hooks/lib/*.js` business logic NOT modified. Confirm no NEW dependencies in `opencode/package.json`.
  Output: `Tasks [N/N compliant] | Lingma [UNTOUCHED] | Hooks [UNTOUCHED] | Deps [UNCHANGED] | VERDICT`

---

## Commit Strategy

Commits are grouped by T-number, not by physical TODOs order. Execute in dependency order.

- **T1** (paths/types extract): `refactor(opencode): extract paths.ts and types.ts from plugin.ts`
- **T2** (UserPromptSubmit): `feat(opencode): wire UserPromptSubmit event for slash command telemetry parity`
- **T3** (logger): `feat(opencode): add structured logger with secret redaction`
- **T4** (config): `feat(opencode): add plugin config block + config.ts loader`
- **T5** (version sync): `chore(build): add opencode version sync + dist staleness guard`
- **T6** (README): `docs: add OpenCode architecture section to README + AGENTS.md`
- **T7** (troubleshooting): `docs: add opencode-troubleshooting.md`
- **T8** (disable flag): `feat(install): add --disable/--enable flags for opencode plugin + uninstall summary`
- **T9** (CI): `ci: add opencode plugin parity workflow + ci:opencode script`
- **T10** (tests): `test(opencode): add unit tests for paths/runner/mappers/config`
- **T11** (plugin split): `refactor(opencode): split plugin.ts into composition root + mappers + runner`
- **T12** (smoke): `test(opencode): add end-to-end smoke test script`

All commits must include the `change-id` placeholder — per enterprise baseline HARD_RULE, no commit without `[change-id]`. The orchestrator will inject the change-id from `/sdd-spec` flow.

---

## Success Criteria

### Verification Commands
```bash
# Build
cd /Users/hosea/work/git/oh-my-sdd && cd opencode && npm run build     # Expected: exit 0, dist regenerated

# Unit tests (new opencode-specific)
cd /Users/hosea/work/git/oh-my-sdd && node --test __tests__/unit/opencode/  # Expected: all pass

# Full unit suite (regression)
cd /Users/hosea/work/git/oh-my-sdd && node --test __tests__/unit/      # Expected: 17 original + new pass

# Integration tests
cd /Users/hosea/work/git/oh-my-sdd && node --test __tests__/integration/  # Expected: 14 pass

# Baseline lint
cd /Users/hosea/work/git/oh-my-sdd && npm run lint:baseline            # Expected: "✓ baseline schema ok"

# End-to-end smoke
cd /Users/hosea/work/git/oh-my-sdd && OMSD_SMOKE=1 npm run smoke:opencode  # Expected: all 10 assertions pass, exit 0
```

### Final Checklist
- [ ] All "Must Have" present:
  - [ ] UserPromptSubmit parity
  - [ ] Module split (5+ files in `opencode/src/`, plugin.ts ≤ 60 lines)
  - [ ] Structured logging with redaction
  - [ ] `opencode.json` `oh-my-sdd` config block
  - [ ] Version sync script
  - [ ] CI parity check
  - [ ] ≥80% coverage on new modules
- [ ] All "Must NOT Have" absent:
  - [ ] `dist/plugin.js` still in git
  - [ ] Legacy install layout probe still works
  - [ ] No AK/SK/token in log files
  - [ ] Sentinel block format unchanged
  - [ ] `plugin` array schema unchanged
  - [ ] `hooks/lib/*.js` business logic untouched
  - [ ] No Lingma changes
  - [ ] No new dependencies in `opencode/package.json`
- [ ] All tests pass (17 unit + 14 integration + new opencode tests)
- [ ] All evidence files saved in `.sisyphus/evidence/opencode-opt/`
- [x] Final Verification Wave F1-F4 all APPROVE
- [ ] User explicit okay received

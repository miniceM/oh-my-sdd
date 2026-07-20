# Learnings — plugin.ts split

## Patterns

- **Composition root pattern (≤60 lines)**: Import mappers/runner/config/logger; factory function wires them; export named + default. Event handler keys (`'session.created'`, `'tool.execute.before'`) are OpenCode's actual plugin API event names — don't abstract them.
- **Hook toggle coupling**: `session.deleted` uses `config.hooks.sessionStart` gate (no separate `sessionEnd` toggle in config). Comment "lifecycle paired" prevents future "bug fix" that would break it.
- **Test coupling to internal structure**: `opencode-plugin-paths.test.js` asserted `dist/plugin.js` imports `HOOKS_DIR`/`PLUGIN_ROOT`. After move to runner.ts, test needs to check `dist/runner.js` instead. The test's *intent* (verify shipped code uses probe-fallback) is preserved; only the consumer module changed.

## Conventions

- `.js` import extensions mandatory (ESM)
- All 5 event handlers preserved: `session.created`, `session.deleted`, `tool.execute.before`, `tool.execute.after`, `command.execute.before`
- `mapCommandExecuteBefore` renamed to `mapUserPromptSubmit` (matches task spec naming; same logic)
- Config-aware timeouts now flow from `loadConfig()` instead of hardcoded values (preserves defaults: 10000/5000/3000)
- `permissionDecision === 'deny'` throw preserved (HARD_RULE enforcement path)
- `additionalContext` → stderr write preserved
- `command.execute.before` uses `.catch(() => {})` (best-effort telemetry, never blocks)

## Decisions

- **Used `any` for `hookSpecificOutput`**: Matches existing pattern; typing it strictly would require a separate interface for hook protocol shape (out of scope).
- **Inlined `CmdIn` type alias** instead of named `CommandInput` interface: saves lines for the composition-root budget.

## Test Patterns — opencode/ unit tests

### Import paths
- Tests import from `opencode/dist/*.js` (compiled output), NOT `opencode/src/*.ts`
- Relative path from `__tests__/unit/opencode/` → `../../../opencode/dist/`
- Cache-busting for module-level constants: `?t=${Date.now()}-${Math.random()}` suffix on dynamic `import()`

### runner.test.js — HOOKS_DIR coupling
- `runHook` joins hookName with module-level `HOOKS_DIR` (not injectable)
- Workaround: import `HOOKS_DIR` from `dist/paths.js`, create temp hook scripts there via `mkdirSync(HOOKS_DIR, { recursive: true })` + `writeFileSync`, cleanup in `after()`
- `path.join` does NOT resolve absolute paths (unlike `path.resolve`) — hookName is always relative to HOOKS_DIR
- Default timeout test takes ~5s (real wait) — acceptable for CI

### config.test.js — HOME override pattern
- `OPENCODE_CONFIG_JSON` computed at module load: `join(homedir(), '.config', 'opencode', 'opencode.json')`
- Override `process.env.HOME` before dynamic import to redirect config path
- Each test needs fresh import via cache-busting URL suffix
- Same pattern as existing `opencode-config-register.test.js`

### node --test directory invocation
- `node --test __tests__/unit/opencode/` fails on Node 24 (MODULE_NOT_FOUND)
- Use glob: `node --test '__tests__/unit/opencode/*.test.js'`

## Docs Writing

- Public-facing troubleshooting guide should only mention config paths, CLI commands, and observable behavior. Avoid internal hook/lib implementation details.
- Validate markdown for forbidden em/en dashes and emoji before considering done.

## F2 — Code Quality Review (2026-07-17)

### Static Analysis Results
- **`as any`**: 1 instance in `plugin.ts:28` — `result.hookSpecificOutput as any` — justified bridge between hook output schema and OpenCode API; acceptable
- **`@ts-ignore/@ts-expect-error`**: 0 — clean
- **Empty catches**: 5 instances, all with intentional design comments (fail-safe pattern: logging must not crash, stdin write failure non-critical, hook spawn failure → silent degradation)
- **`console.log`**: 0 — clean (structured logger used throughout)
- **Commented-out code**: 0 — clean
- **Unused imports**: 0 — clean across all 7 files
- **Comment density in plugin.ts**: 0 `^//` lines — minimal, clean composition root

### Build & Test
- `tsc --noEmit`: PASS (zero errors)
- Tests: 14/14 pass (opencode-config-register: 11, opencode-plugin-paths: 3)
- `__tests__/unit/opencode/` directory: does not exist — N/A

### File Review Summary
| File | Lines | Verdict |
|------|-------|---------|
| mappers.ts | 103 | Clean — pure functions, clear naming, TOOL_MAP well-structured |
| runner.ts | 76 | Clean — spawn+timeout+cleanup pattern, good fail-safe comments |
| config.ts | 135 | Clean — deepMerge, validateConfig, bounds checking all solid |
| plugin.ts | 47 | Clean — ≤60 lines, minimal composition root |
| logger.ts | 83 | Clean — secret redaction (AKIA/sk-), JSON-lines, mode 0600 |
| paths.ts | 17 | Clean — dual layout probe, PLUGIN_ROOT derived |
| types.ts | 22 | Clean — minimal interfaces, no circular deps |

## PreToolUse Edit Context Fix (2026-07-20)

### Implementation
- Added `getSurroundingContext(filePath, newString, windowLines = 10)` in `hooks/pre-tool-use.js`.
- `extractContentAndPath` is now async and returns `{ content, softContext, filePath }`.
  - `content` remains the incoming fragment (for HARD pattern rules).
  - `softContext` is the existing file content when readable, or the fragment fallback.
  - `Write` continues to pass its full content as both `content` and `softContext`.
- `matchRules(content, filePath, softContext)` now evaluates `rule.check()` against `softContext` while `rule.pattern` rules still run against `content`.
- Updated integration tests to cover Edit/MultiEdit context-aware behavior for README quickstart and public-API docstring rules.

### Verification
- `node --test __tests__/integration/pre-tool-use.test.js __tests__/spike/pre-tool-use-deny.test.js` → 33/33 pass.
- `npm test` full suite has 9 unrelated pre-existing failures (post-tool-use, session-end, platform, etc.) not caused by this change.

### Caveats
- `windowLines` is intentionally unused in the current implementation; the function reads the full existing file for simplicity. For very large files this could be optimized later.
- JSDoc comments in `hooks/lib/rules.js` still mention the old best-effort limitation; they should be updated to reflect context-aware behavior.

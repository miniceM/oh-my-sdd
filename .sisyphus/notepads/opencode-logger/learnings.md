# Learnings — opencode/src/logger.ts

## Patterns
- OpenCode plugin uses `node:` prefix for all stdlib imports (consistent with plugin.ts)
- tsconfig: ES2022, esnext module, bundler resolution, strict, types: ["node"]
- Redaction patterns must use `/g` flag for `.replace()` to catch all occurrences (rules.js patterns don't have `g` — they use `.test()` not `.replace()`)
- `!Array.isArray(value)` guard needed in redactFields to avoid treating arrays as objects

## Conventions
- Log path: `~/.oh-my-sdd/logs/opencode-plugin.log` (matches `hooks/lib/platform.js` getStateDir)
- File mode: 0600 for log files, 0700 for log directory
- OMSD_DEBUG=1 env var for debug verbosity
- Empty catch block intentional — logging must never crash plugin

## Cross-file Dependencies
- Redaction patterns coupled to `hooks/lib/rules.js` lines 22-40 (HARDCODED_AWS_AK, HARDCODED_SK)
- Documented in module docstring and inline comments

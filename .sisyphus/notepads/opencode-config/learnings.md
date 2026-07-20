# Learnings — opencode/src/config.ts

## Patterns used
- ESM imports require `.js` extension (`from './logger.js'`)
- Module-level JSDoc matches existing codebase style (logger.ts, plugin.ts)
- `deepMerge` uses `Record<string, unknown>` (not generic `T`) to avoid TS "can only be indexed for reading" error
- `cloneDefaults()` via JSON round-trip avoids shared mutable state
- Validation logs warnings via existing `log()` from logger.ts before falling back

## Conventions observed
- opencode/src/ is independent from hooks/lib/ (no cross-imports)
- stdlib only (fs, path, os) — no external deps
- Config path: `~/.config/opencode/opencode.json` under `"oh-my-sdd"` key
- Timeout bounds: 100ms–30000ms
- Invalid values reset to defaults (not throw)

## TS gotcha
- Generic `T extends Record<string, unknown>` cannot be indexed for writing in strict mode
- Solution: use concrete `Record<string, unknown>` return type, cast at call site

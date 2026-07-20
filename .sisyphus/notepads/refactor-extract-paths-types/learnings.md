# Learnings — extract paths.ts and types.ts from plugin.ts

## Files changed
- **Created**: `opencode/src/paths.ts` — path probe logic (HOOKS_DIR, PLUGIN_ROOT)
- **Created**: `opencode/src/types.ts` — interfaces (RunHookOptions, OpenCodeSessionInput, OpenCodeToolInput, HookResult)
- **Modified**: `opencode/src/plugin.ts` — imports from paths.js + types.js, removed extracted code
- **Modified**: `__tests__/unit/opencode-plugin-paths.test.js` — test 3 now checks dist/paths.js for probe patterns + verifies plugin.js imports from paths.js

## Key observations
- Install copies entire `opencode/dist/` to `~/.config/opencode/plugins/oh-my-sdd/` via `copyDirRecursive`, so paths.js is always available alongside plugin.js at installed location
- Type-only imports (`import type { ... }`) are erased by tsc — dist/types.js is empty export
- Runtime import `import { HOOKS_DIR, PLUGIN_ROOT } from './paths.js'` emits in dist/plugin.js
- tsconfig uses `moduleResolution: "bundler"` — handles `.js` extensions in imports from `.ts` files
- The same two-install-layout probe in paths.js works identically at installed location (paths.js is sibling of plugin.js, both in `oh-my-sdd/` directory, hooks/ is sibling too)

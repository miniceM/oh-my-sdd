
## F3 QA Learnings (2026-07-17)

- **install.js is pure dispatcher**: calls `main()` with no args when invoked directly. CLI arg parsing lives in `bin/oms-install.js`. Always use `bin/oms-install.js --tool opencode` for flag tests.
- **opencode.json schema**: uses `plugin` (singular, string array of paths like `"./plugins/oh-my-sdd/plugin.js"`), NOT `plugins` (object array with `.name`). Verification must use `j.plugin.some(p => p.includes('oh-my-sdd'))`.
- **Smoke test script** (`scripts/smoke-test-opencode.sh`) already covers install/verify/hooks/disable/enable/uninstall in one pass — comprehensive.
- **Uninstall summary** prints 5 items with Chinese labels — well formatted.

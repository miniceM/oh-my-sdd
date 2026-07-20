
## F3 QA Issues (2026-07-17)

- **install.js ignores --tool flag**: `node install.js --tool opencode` still runs Claude Code path. `install.js` line 148-152 calls `main()` without passing parsed args. Only `bin/oms-install.js` correctly parses and forwards flags. Not a bug per se (install.js is internal dispatcher), but confusing if users invoke it directly.

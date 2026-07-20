# Issues — plugin.ts split

## Pre-existing (out of scope)

- **`prepublishOnly` test failure** (`__tests__/unit/package-files.test.js:73`): Expects `'cd opencode && npm ci --include=dev && npm run build'`, actual `'npm run build:opencode'`. Caused by a `package.json` modification already in the working tree (adds `build:opencode` script, `ci:opencode`, changes `prepublishOnly`). Not introduced by this refactor — clean `main` passes 288/288; with all working-tree changes (incl. mine) it's 287/288. Fix belongs to the `build:opencode` task, not this split.

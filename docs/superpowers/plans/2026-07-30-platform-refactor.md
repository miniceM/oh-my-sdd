# Platform Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure oh-my-sdd monorepo into 9 single-responsibility top-level directories, introduce a `HostAdapter` abstraction that reduces the cost of adding a new host from "modify N files" to "add 1 file + register 1 line", validate with a KiloCode adapter, and establish platform-ization artifacts (contributor docs, stable API surface).

**Architecture:** 4-phase refactor. Phase 0 restructures directories without changing behavior (pure file moves + import path updates). Phase 1 introduces the `HostAdapter` interface, registry, and migrates the 3 existing hosts to adapter classes. Phase 2 adds a KiloCode adapter as the acid test for the abstraction. Phase 3 finalizes with publish script simplification, Claude `uninstall()` symmetry, and contributor documentation.

**Tech Stack:** Node.js ≥ 18, ESM (import/export), native `node:test` runner, shell scripts (bash/PowerShell) for wrappers, TypeScript for opencode/ sub-package only.

## Global Constraints

These constraints apply to every task implicitly. Copied verbatim from the spec.

- **External behavior stable:** `oms-install --tool claude|lingma|opencode` must preserve CLI surface, stdout/stderr output, and exit codes. Internal refactor only.
- **Test hard gate:** 352 tests must remain green after every task. Run `npm test` at the end of each task; do not commit on regressions.
- **Node version floor:** `>= 18.0.0` (declared in `package.json` engines).
- **Commit format (HARD_RULE):** `[<change-id>] <type>: <subject>` where `change-id` matches `^[A-Z]{2,6}\d+$`. Examples: `[OMS01] refactor: ...`, `[DESIGN02] docs: ...`.
- **Baseline token budget:** `content/enterprise-baseline.md` body ≤ 1000 tokens (enforced by `npm run lint:baseline`).
- **New-host cost target:** KiloCode adapter (Phase 2) must be ≤ 150 lines; otherwise the abstraction is leaking and needs revisiting.
- **No cross-subsystem imports:** after Phase 0, `install/` imports from `lib/` but not vice versa; `hooks/` imports from `lib/` but not from `install/` or `wrapper/`; `wrapper/` imports from `lib/` only.

## File Structure

### After Phase 0 (directory restructure)

```
oh-my-sdd/
├── hooks/                        ← hook entry points only (no changes to .js files except import paths)
│   ├── session-start.js, pre-tool-use.js, post-tool-use.js,
│   │   session-end.js, user-prompt-submit.js
│   ├── hooks.json
│   └── git/
│       ├── commit-msg-check.js, pre-commit-check.js,
│       │   pre-push-check.js, prepare-commit-msg-check.js
│       └── lib/hook-utils.js
│
├── lib/                          ← NEW — global shared library
│   ├── paths.js, platform.js, constants.js, log.js, config.js, state-dir.js
│   ├── rules.js, constitution.js, iam-cli.js, dop-client.js, event-queue.js
│   └── git-diff.js, command-generator.js, update-check.js
│
├── install/                      ← NEW — install subsystem
│   ├── main.js                   ← dispatcher (was install.js, renamed)
│   ├── uninstall.js              ← moved from root
│   ├── hosts/
│   │   ├── claude-adapter.js     ← was hooks/lib/install-claude.js (Phase 0: moved as-is)
│   │   ├── lingma-adapter.js     ← was hooks/lib/install-lingma.js
│   │   └── opencode-adapter.js   ← was hooks/lib/install-opencode.js
│   └── common/
│       ├── fs.js                 ← merged from install-shared.js + copy-utils.js
│       ├── sentinel.js           ← extracted from install-shared.js
│       ├── config-patch.js       ← was hooks/lib/config-patcher.js
│       └── superpowers.js        ← was hooks/lib/superpowers-installer.js
│
├── wrapper/                      ← RENAMED from wrappers/ (was artifacts only) + generator
│   ├── wrapper.js                ← moved from hooks/lib/wrapper.js
│   ├── claude.sh, claude.ps1, claude.bat  ← moved from wrappers/
│
├── bin/                          ← unchanged
├── content/                      ← absorbs baseline/
│   ├── enterprise-baseline.md
│   ├── lingma-baseline.md        ← moved from baseline/lingma.md
│   ├── welcome-message.md, auth-required.md
├── skills/, scripts/, docs/      ← unchanged
├── __tests__/                    ← mirrors new src structure
├── opencode/
│   ├── build.js                  ← moved from hooks/lib/builder.js
│   ├── src/, dist/, package.json, tsconfig.json
├── install.js                    ← NEW 1-line shim (npm postinstall entry)
└── package.json
```

**Deleted directories after Phase 0:** `hooks/lib/`, `wrappers/`, `baseline/`, `scaffolding/` (if orphan), `package/` (if orphan).

### After Phase 1 (HostAdapter abstraction)

```
install/
├── main.js                       ← simplified to ~30 lines (no switch-case)
├── uninstall.js
├── host-adapter.js               ← NEW interface
├── host-registry.js              ← NEW registry
├── hosts/
│   ├── claude-adapter.js         ← now a class extending HostAdapter
│   ├── lingma-adapter.js         ← now a class extending HostAdapter
│   └── opencode-adapter.js       ← now a class extending HostAdapter
└── common/
    ├── announce.js               ← NEW (extracted from 3 adapters)
    ├── detect.js                 ← NEW (extracted isCliInPath helper)
    ├── fs.js                     ← adds rmIfExists, unified copyDir
    ├── sentinel.js, config-patch.js, superpowers.js
```

### After Phase 2

```
install/hosts/
├── ...existing...
└── kilocode-adapter.js           ← NEW
```

### After Phase 3

```
(new top-level file)
└── CONTRIBUTING.md
```

---

## Phase 0: Top-Level Directory Restructure

The entire phase is file moves + import path updates. No logic changes. Each task ends with `npm test` passing.

### Task 0.1: Wrapper + builder consolidation

**Files:**
- Create: `wrapper/` (directory)
- Move: `wrappers/claude.sh` → `wrapper/claude.sh`
- Move: `wrappers/claude.ps1` → `wrapper/claude.ps1`
- Move: `wrappers/claude.bat` → `wrapper/claude.bat`
- Move: `hooks/lib/wrapper.js` → `wrapper/wrapper.js`
- Move: `hooks/lib/builder.js` → `opencode/build.js`
- Modify: every file that imports from `hooks/lib/wrapper.js` or `hooks/lib/builder.js` (search via grep)
- Modify: `package.json` scripts that reference `builder.js`
- Delete: `wrappers/` (now empty)

**Interfaces:**
- Consumes: nothing new
- Produces: `wrapper/wrapper.js` (same API as before, just at new path); `opencode/build.js` (same API)

- [ ] **Step 1: Find all references to the moving files**

Run:
```bash
grep -rn "hooks/lib/wrapper\|hooks/lib/builder\|wrappers/" --include="*.js" --include="*.json" --include="*.md" --include="*.sh" --include="*.ps1" --include="*.bat" . | grep -v node_modules | grep -v ".git/"
```

Expected: ~10-20 hits across hooks/*.js, bin/oms-*.js, install.js, package.json, docs/*.md. Write the list down; you'll update each.

- [ ] **Step 2: Create the wrapper/ directory and move artifacts**

Run:
```bash
mkdir -p wrapper
git mv wrappers/claude.sh wrapper/claude.sh
git mv wrappers/claude.ps1 wrapper/claude.ps1
git mv wrappers/claude.bat wrapper/claude.bat
rmdir wrappers
```

Note: `git mv` preserves history. After this, `wrappers/` is gone.

- [ ] **Step 3: Move the wrapper generator**

Run:
```bash
git mv hooks/lib/wrapper.js wrapper/wrapper.js
```

- [ ] **Step 4: Move the opencode builder**

Run:
```bash
git mv hooks/lib/builder.js opencode/build.js
```

- [ ] **Step 5: Update import paths**

For every file identified in Step 1, update imports:
- `./hooks/lib/wrapper.js` → `../../wrapper/wrapper.js` (adjust `../` depth based on importer's location)
- `./hooks/lib/builder.js` → `../opencode/build.js` (for install-opencode.js) or `../../opencode/build.js` (for hooks/lib/ importers, but hooks/lib/ is being dissolved in Task 0.3, so defer those)
- `wrappers/claude.sh` (in docs/scripts) → `wrapper/claude.sh`
- In `package.json` scripts, any `hooks/lib/builder.js` reference → `opencode/build.js`

Concrete updates (verify against Step 1 grep output):

```js
// bin/oms-wrapper-verify.js
import { verifyWrapper } from '../wrapper/wrapper.js';

// hooks/session-start.js (if it imports wrapper)
import { ... } from '../wrapper/wrapper.js';

// install.js
import { buildOpencodePlugin } from './opencode/build.js';

// hooks/lib/install-opencode.js
import { buildOpencodePlugin } from '../../opencode/build.js';
```

- [ ] **Step 6: Update `package.json`**

Open `package.json`, find any `hooks/lib/builder.js` reference in scripts. Replace with `opencode/build.js`. Common places:
- `build:opencode` script
- `prepublishOnly` script
- `build:all` script

- [ ] **Step 7: Update docs referencing `wrappers/`**

Files likely affected: `README.md`, `CLAUDE.md`, `INSTALL.md`, `AGENTS.md`. Use sed or editor:

```bash
# Replace "wrappers/" with "wrapper/" in docs (careful not to match "wrappers" in other contexts)
sed -i '' 's|wrappers/claude|wrapper/claude|g' README.md CLAUDE.md INSTALL.md AGENTS.md 2>/dev/null
sed -i '' 's|hooks/lib/wrapper|wrapper/wrapper|g' README.md CLAUDE.md INSTALL.md AGENTS.md 2>/dev/null
sed -i '' 's|hooks/lib/builder|opencode/build|g' README.md CLAUDE.md INSTALL.md AGENTS.md 2>/dev/null
```

- [ ] **Step 8: Run tests to verify nothing broke**

Run: `npm test`

Expected: 352 pass, 0 fail. If any fail, the failure will be an import error like `Cannot find module '.../hooks/lib/wrapper.js'`. Fix the import path and re-run.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "[REF01] refactor(platform): consolidate wrapper/ and move builder to opencode/

- wrappers/ renamed to wrapper/ (single source of truth for wrapper scripts)
- hooks/lib/wrapper.js moved to wrapper/wrapper.js (generator with its artifacts)
- hooks/lib/builder.js moved to opencode/build.js (opencode-specific build logic
  belongs with the opencode sub-package)
- All import paths updated
- package.json scripts updated
- Docs references updated"
```

### Task 0.2: Install subsystem skeleton

**Files:**
- Create: `install/` (directory)
- Create: `install/hosts/` (directory)
- Create: `install/common/` (directory)
- Move: `install.js` → `install/main.js`
- Create: `install.js` (new 1-line shim)
- Move: `uninstall.js` → `install/uninstall.js`
- Modify: any file that imports from root `uninstall.js` (likely none; it's invoked via `bin/oms-uninstall.js`)
- Modify: `bin/oms-uninstall.js` (if it imports `../uninstall.js`, change to `../install/uninstall.js`)
- Modify: `package.json` (postinstall/preuninstall scripts)

**Interfaces:**
- Consumes: nothing new
- Produces: `install/main.js` (same API as old install.js: exports `main`, `preflightFor`, `detectDefaultTool`); `install.js` (root, 1-line shim); `install/uninstall.js` (same API as old uninstall.js)

- [ ] **Step 1: Move install.js to install/main.js**

Run:
```bash
mkdir -p install/hosts install/common
git mv install.js install/main.js
```

Note: This is the dispatcher. Its content is preserved verbatim for now; we'll simplify it in Phase 1.

- [ ] **Step 2: Create new 1-line shim install.js**

Create `install.js` (root) with this exact content:

```js
// install.js — npm postinstall entry point.
// Thin shim; the real dispatcher lives in install/main.js.
// Kept at the root because npm's postinstall convention expects it here.
import('./install/main.js').then((m) => m.main()).catch((err) => {
  process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
  process.exit(1);
});
```

Note: no shebang needed (npm invokes via Node, not as executable). Verify that `package.json` has `postinstall` script pointing to this file. Check what the current postinstall does and preserve the invocation.

- [ ] **Step 3: Move uninstall.js to install/uninstall.js**

Run:
```bash
git mv uninstall.js install/uninstall.js
```

- [ ] **Step 4: Update imports of uninstall.js**

Search for any references:
```bash
grep -rn "['\"]\.\./uninstall\.js\|['\"]\./uninstall\.js" --include="*.js" . | grep -v node_modules
```

Likely hit: `bin/oms-uninstall.js` imports `../uninstall.js`. Update to `../install/uninstall.js`.

- [ ] **Step 5: Update package.json**

The `postinstall` and `preuninstall` scripts should still point to `install.js` (the shim). Verify:
```bash
grep -E '"(postinstall|preuninstall)"' package.json
```

Expected: `"postinstall": "node install.js"`, `"preuninstall": "node install/uninstall.js"` (or similar). If preuninstall points to `uninstall.js`, change to `install/uninstall.js`.

- [ ] **Step 6: Update internal imports inside install/main.js and install/uninstall.js**

These files currently import from `./hooks/lib/...`. After moving to `install/`, the relative paths need an extra `../`:
- `./hooks/lib/platform.js` → `../lib/platform.js` (BUT lib/ doesn't exist yet! Temporarily use `../hooks/lib/platform.js`)
- `./hooks/lib/state-dir.js` → `../hooks/lib/state-dir.js` (temporary)
- `./hooks/lib/install-claude.js` → `./hosts/claude-adapter.js` (NO — we're moving in Task 0.3; for now use `../hooks/lib/install-claude.js`)

**Important**: This creates a temporary state where install/*.js imports reach back into hooks/lib/. That's OK because Task 0.3 will move those files out. Just make sure the imports resolve correctly at each step.

Alternative safer approach: combine Task 0.2 and Task 0.3 into one commit. If you prefer safety, merge these two tasks.

For this plan, I'll keep them separate with the temporary import reach-back. The key invariant: `npm test` passes after each task.

- [ ] **Step 7: Run tests**

Run: `npm test`

Expected: 352 pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "[REF02] refactor(platform): set up install/ subsystem skeleton

- install.js (dispatcher) moved to install/main.js
- uninstall.js moved to install/uninstall.js
- Root install.js is now a 1-line shim that forwards to install/main.js
  (preserves npm postinstall convention)
- install/hosts/ and install/common/ directories created for upcoming tasks"
```

### Task 0.3: Move install-*.js and dissolve install-shared.js

**Files:**
- Move: `hooks/lib/install-claude.js` → `install/hosts/claude-adapter.js`
- Move: `hooks/lib/install-lingma.js` → `install/hosts/lingma-adapter.js`
- Move: `hooks/lib/install-opencode.js` → `install/hosts/opencode-adapter.js`
- Split: `hooks/lib/install-shared.js` → `install/common/sentinel.js` + `install/common/fs.js`
- Move: `hooks/lib/copy-utils.js` → merge into `install/common/fs.js`
- Move: `hooks/lib/config-patcher.js` → `install/common/config-patch.js`
- Move: `hooks/lib/superpowers-installer.js` → `install/common/superpowers.js`
- Modify: all internal imports in the moved files
- Modify: `install/main.js` imports of install-*.js
- Delete: `hooks/lib/install-shared.js`, `hooks/lib/copy-utils.js`

**Interfaces:**
- Consumes: nothing new from other phases
- Produces: `install/hosts/{claude,lingma,opencode}-adapter.js` (same API as before: `installForXxx`, `isXxxInstalled`, `uninstallForXxx`); `install/common/{fs,sentinel,config-patch,superpowers}.js`

- [ ] **Step 1: Split install-shared.js**

Read `hooks/lib/install-shared.js`. It contains two logical groups:

**Group A: Sentinel system** → `install/common/sentinel.js`
- `SENTINEL_BEGIN`, `SENTINEL_END`, `SENTINEL_RE` constants
- `sentinelPathFor(tool)`
- `writeSentinel(tool, dest, blockMarker, announce)`
- `readSentinel(tool)`

**Group B: File system utilities** → `install/common/fs.js`
- `copyDirRecursive(src, dest)`
- `copySkillsToDir(skillsSrc, destDir, announce)`

Create `install/common/sentinel.js` with Group A. Create `install/common/fs.js` with Group B. Update internal imports (both files previously used `node:fs/promises`, `node:fs`, `node:path` — keep those).

- [ ] **Step 2: Merge copy-utils.js into fs.js**

Read `hooks/lib/copy-utils.js`. It likely exports `copyDir(src, dest, options)`. Move that function into `install/common/fs.js`, renaming if needed to avoid collision with `copyDirRecursive`. If both do the same thing, keep one and re-export under both names for backward compat:

```js
// install/common/fs.js
export async function copyDir(src, dest, options) { /* from copy-utils.js */ }
export const copyDirRecursive = copyDir;  // alias for lingma adapter
// ... plus copySkillsToDir from install-shared.js
```

- [ ] **Step 3: Move config-patcher.js and superpowers-installer.js**

Run:
```bash
git mv hooks/lib/config-patcher.js install/common/config-patch.js
git mv hooks/lib/superpowers-installer.js install/common/superpowers.js
```

- [ ] **Step 4: Move install-*.js to install/hosts/**

Run:
```bash
git mv hooks/lib/install-claude.js install/hosts/claude-adapter.js
git mv hooks/lib/install-lingma.js install/hosts/lingma-adapter.js
git mv hooks/lib/install-opencode.js install/hosts/opencode-adapter.js
```

Note: filenames change (e.g., `install-claude.js` → `claude-adapter.js`) to reflect upcoming Phase 1 class-based design. Internal logic is unchanged in Phase 0.

- [ ] **Step 5: Delete install-shared.js and copy-utils.js**

Run:
```bash
git rm hooks/lib/install-shared.js
git rm hooks/lib/copy-utils.js
```

- [ ] **Step 6: Update imports in install/hosts/*.js**

Each adapter file had imports like:
```js
import { writeSentinel, readSentinel, copySkillsToDir } from './install-shared.js';
import { copyDir } from './copy-utils.js';
import { patchOpencodeJson } from './config-patcher.js';
import { installSuperpowersZh } from './superpowers-installer.js';
```

Update to new paths (relative to `install/hosts/`):
```js
import { writeSentinel, readSentinel } from '../common/sentinel.js';
import { copySkillsToDir, copyDir } from '../common/fs.js';
import { patchOpencodeJson } from '../common/config-patch.js';
import { installSuperpowersZh } from '../common/superpowers.js';
```

Also, any imports that reached into `./<something>.js` where `<something>` is a file still in `hooks/lib/` (like `./platform.js`, `./state-dir.js`, `./paths.js`) must temporarily reach to `../../hooks/lib/<something>.js`. These will be fixed in Task 0.4 when hooks/lib/ is dissolved.

- [ ] **Step 7: Update imports in install/main.js**

```js
// install/main.js
import { installForClaude, isClaudeInstalled } from './hosts/claude-adapter.js';
import { installForLingma } from './hosts/lingma-adapter.js';
import { installForOpencode, isOpenCodeInstalled } from './hosts/opencode-adapter.js';
```

Other imports still reach to `../hooks/lib/...` temporarily.

- [ ] **Step 8: Run tests**

Run: `npm test`

Expected: 352 pass, 0 fail.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "[REF03] refactor(platform): move install-*.js to install/hosts/, split install-shared.js

- install-claude.js → install/hosts/claude-adapter.js
- install-lingma.js → install/hosts/lingma-adapter.js
- install-opencode.js → install/hosts/opencode-adapter.js
- install-shared.js split into install/common/sentinel.js + install/common/fs.js
- copy-utils.js merged into install/common/fs.js
- config-patcher.js → install/common/config-patch.js
- superpowers-installer.js → install/common/superpowers.js
- Import paths updated throughout"
```

### Task 0.4: Move hook runtime deps to lib/ + dissolve hooks/lib/

**Files:**
- Create: `lib/` (directory)
- Move: 14 files from `hooks/lib/` → `lib/`
  - Infrastructure: `paths.js`, `platform.js`, `constants.js`, `log.js`, `config.js`, `state-dir.js`
  - Enterprise: `rules.js`, `constitution.js`, `iam-cli.js`, `dop-client.js`, `event-queue.js`
  - Tools: `git-diff.js`, `command-generator.js`, `update-check.js`
- Modify: every file in the repo that imports from `hooks/lib/...` (large grep hit list)
- Delete: `hooks/lib/` (should be empty after this task)

**Interfaces:**
- Consumes: nothing
- Produces: `lib/*.js` (same APIs, new paths)

- [ ] **Step 1: Move all 14 files**

Run:
```bash
mkdir -p lib
cd hooks/lib
for f in paths.js platform.js constants.js log.js config.js state-dir.js \
         rules.js constitution.js iam-cli.js dop-client.js event-queue.js \
         git-diff.js command-generator.js update-check.js; do
  git mv "$f" "../../lib/$f"
done
cd ../..
ls hooks/lib  # should be empty
rmdir hooks/lib
```

- [ ] **Step 2: Update imports across the codebase**

This is the big one. Use this script to find all affected files:

```bash
grep -rln "hooks/lib/" --include="*.js" . | grep -v node_modules
```

Expected ~30 files. For each, update imports:

**For files in `hooks/`** (e.g., `hooks/session-start.js`):
```js
// before
import { ensureStateDir } from './lib/state-dir.js';
// after
import { ensureStateDir } from '../lib/state-dir.js';
```

**For files in `hooks/git/`**:
```js
// before
import { ... } from '../lib/constitution.js';
// after
import { ... } from '../../lib/constitution.js';
```

**For files in `hooks/git/lib/`**:
```js
// before
import { ... } from '../../lib/constitution.js';
// after
import { ... } from '../../../lib/constitution.js';
```

**For files in `install/main.js`**:
```js
// before
import { checkNodeVersion } from '../hooks/lib/platform.js';
// after
import { checkNodeVersion } from '../lib/platform.js';
```

**For files in `install/hosts/*.js`**:
```js
// before
import { ensureStateDir } from '../../hooks/lib/state-dir.js';
// after
import { ensureStateDir } from '../../lib/state-dir.js';
```

**For files in `install/common/*.js`**:
```js
// before (if any reached into hooks/lib)
import { ... } from '../../hooks/lib/something.js';
// after
import { ... } from '../../lib/something.js';
```

**For files in `wrapper/wrapper.js`**:
```js
// before
import { ... } from '../hooks/lib/something.js';
// after
import { ... } from '../lib/something.js';
```

**For files in `bin/*.js`**:
```js
// before
import { ... } from '../hooks/lib/something.js';
// after
import { ... } from '../lib/something.js';
```

**For files in `opencode/src/*.ts`** (if any — unlikely since opencode/ is TS):
Check and update if needed.

- [ ] **Step 3: Verify hooks/lib/ is gone**

Run:
```bash
ls hooks/lib 2>&1 || echo "hooks/lib is gone ✓"
ls hooks/
# Should show only: git/ hooks.json *.js (the 5 hook entry files)
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: 352 pass, 0 fail.

If tests fail with import errors, the grep in Step 2 missed a file. Find and fix.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "[REF04] refactor(platform): dissolve hooks/lib/, create lib/ for global shared code

Moved 14 files from hooks/lib/ to lib/:
- Infrastructure: paths, platform, constants, log, config, state-dir
- Enterprise: rules, constitution, iam-cli, dop-client, event-queue
- Tools: git-diff, command-generator, update-check

Import paths updated across:
- hooks/*.js (5 entry files)
- hooks/git/*.js and hooks/git/lib/*.js
- install/main.js, install/hosts/*.js, install/common/*.js
- wrapper/wrapper.js
- bin/*.js

hooks/lib/ is now deleted."
```

### Task 0.5: Merge baseline/ into content/ + resolve orphans

**Files:**
- Move: `baseline/lingma.md` → `content/lingma-baseline.md`
- Delete: `baseline/` (now empty)
- Modify: `install/hosts/lingma-adapter.js` (update path to lingma baseline)
- Decision: `scaffolding/` and `package/` — grep-gated delete or relocate

**Interfaces:**
- Consumes: nothing
- Produces: `content/lingma-baseline.md` (same content, new path)

- [ ] **Step 1: Grep for references to `baseline/`**

Run:
```bash
grep -rn "baseline/lingma\|baseline/" --include="*.js" --include="*.md" --include="*.json" . | grep -v node_modules | grep -v ".git/"
```

Expected hits:
- `install/hosts/lingma-adapter.js` (readFile path)
- `content/enterprise-baseline.md` (cross-reference in text)
- `docs/release/internal-publish-runbook.md`
- Possibly `CLAUDE.md`, `README.md`

- [ ] **Step 2: Move baseline/lingma.md to content/lingma-baseline.md**

Run:
```bash
git mv baseline/lingma.md content/lingma-baseline.md
rmdir baseline
```

- [ ] **Step 3: Update the readFile path in lingma-adapter.js**

Find the line:
```js
const baselinePath = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', 'baseline', 'lingma.md');
```

Update to:
```js
const baselinePath = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', 'content', 'lingma-baseline.md');
```

(Note: `install/hosts/lingma-adapter.js` is 2 levels deep from repo root, so `../..` reaches root.)

- [ ] **Step 4: Update other doc references**

For each grep hit from Step 1, update the path:
- `baseline/lingma.md` → `content/lingma-baseline.md`
- `baseline/` → `content/` (when referring to the directory)

- [ ] **Step 5: Resolve scaffolding/ (grep-gated)**

Run:
```bash
grep -rn "scaffolding" --include="*.js" --include="*.md" --include="*.json" . | grep -v node_modules | grep -v ".git/"
```

Expected hit: `install/hosts/lingma-adapter.js` reads `scaffolding/lingma-settings.json` as a template.

If found: move to `install/common/fixtures/lingma-settings.json` and update the readFile path in lingma-adapter.js:

```bash
mkdir -p install/common/fixtures
git mv scaffolding/lingma-settings.json install/common/fixtures/lingma-settings.json
rmdir scaffolding
```

Update in lingma-adapter.js:
```js
const tplPath = join(packageRoot, 'install', 'common', 'fixtures', 'lingma-settings.json');
```

If not found (zero references): just delete scaffolding/:
```bash
rm -rf scaffolding
```

- [ ] **Step 6: Resolve package/ (grep-gated)**

Run:
```bash
grep -rn "package/opencode\|package/" --include="*.js" --include="*.md" --include="*.json" . | grep -v node_modules | grep -v ".git/" | grep -v "package.json"
```

If zero references (likely): delete:
```bash
rm -rf package
```

If references exist, investigate and relocate case-by-case.

- [ ] **Step 7: Run tests**

Run: `npm test`

Expected: 352 pass, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "[REF05] refactor(platform): merge baseline/ into content/, resolve orphan dirs

- baseline/lingma.md → content/lingma-baseline.md
- baseline/ deleted
- scaffolding/ → install/common/fixtures/ (or deleted if orphan)
- package/ deleted (orphan build artifact)
- lingma-adapter.js readFile path updated"
```

### Task 0.6: Update package.json + __tests__/ + docs

**Files:**
- Modify: `package.json` — `files` field, possibly `bin` field
- Modify: `__tests__/` — reorganize to mirror new src structure
- Modify: `CLAUDE.md`, `README.md`, `AGENTS.md` — update architecture diagrams and file paths

**Interfaces:**
- Consumes: Phase 0 restructured tree
- Produces: final package.json, tests that mirror src

- [ ] **Step 1: Update package.json `files` field**

The `files` field lists what gets included in the npm tarball. It currently references directories that have moved. Update:

```json
"files": [
  "hooks/",
  "lib/",
  "install/",
  "wrapper/",
  "bin/",
  "content/",
  "skills/",
  "install.js"
]
```

Note: `baseline/`, `scaffolding/`, `package/`, `wrappers/` are gone — remove from `files`.

- [ ] **Step 2: Reorganize __tests__/**

Current structure:
```
__tests__/
├── unit/
│   ├── config.test.js
│   ├── constitution.test.js
│   ├── copy-utils.test.js        ← was testing hooks/lib/copy-utils.js (now install/common/fs.js)
│   ├── dop-client.test.js
│   ├── event-queue.test.js
│   ├── git-diff.test.js
│   ├── hook-utils.test.js
│   ├── iam-cli.test.js
│   ├── install-targets.test.js
│   ├── log.test.js
│   ├── opencode/                  ← opencode-specific tests
│   ├── override-check.test.js
│   ├── package-files.test.js
│   ├── platform.test.js
│   ├── update-check.test.js
│   └── wrapper.test.js
├── integration/
│   ├── constitution-integrity.test.js
│   ├── git-*.test.js
│   ├── install-targets.test.js
│   ├── oms-git-hooks-install.test.js
│   ├── opencode/
│   ├── post-tool-use.test.js
│   ├── pre-tool-use.test.js
│   ├── sdd-plan.test.js
│   ├── sdd-review.test.js
│   ├── session-end.test.js
│   ├── session-start.test.js
│   └── user-prompt-submit.test.js
├── helpers/
├── spike/
└── test-utils.js
```

New structure should mirror src:
```
__tests__/
├── unit/
│   ├── lib/                       ← tests for lib/*.js
│   │   ├── config.test.js
│   │   ├── constitution.test.js
│   │   ├── dop-client.test.js
│   │   ├── event-queue.test.js
│   │   ├── git-diff.test.js
│   │   ├── iam-cli.test.js
│   │   ├── log.test.js
│   │   ├── platform.test.js
│   │   └── update-check.test.js
│   ├── install/                   ← tests for install/**/*.js
│   │   ├── common/
│   │   │   ├── fs.test.js         ← was copy-utils.test.js
│   │   │   ├── sentinel.test.js
│   │   │   └── config-patch.test.js
│   │   └── hosts/
│   │       ├── claude-adapter.test.js
│   │       ├── lingma-adapter.test.js
│   │       └── opencode-adapter.test.js
│   ├── wrapper/
│   │   └── wrapper.test.js
│   ├── hooks/
│   │   └── git/lib/hook-utils.test.js
│   ├── opencode/                  ← keep as-is
│   └── misc/
│       ├── install-targets.test.js
│       ├── override-check.test.js
│       └── package-files.test.js
├── integration/                   ← keep mostly as-is, just update imports
├── helpers/
├── spike/
└── test-utils.js
```

Steps:

```bash
# Create new test dirs
mkdir -p __tests__/unit/lib
mkdir -p __tests__/unit/install/common
mkdir -p __tests__/unit/install/hosts
mkdir -p __tests__/unit/wrapper
mkdir -p __tests__/unit/hooks/git/lib

# Move lib tests
git mv __tests__/unit/config.test.js __tests__/unit/lib/
git mv __tests__/unit/constitution.test.js __tests__/unit/lib/
git mv __tests__/unit/dop-client.test.js __tests__/unit/lib/
git mv __tests__/unit/event-queue.test.js __tests__/unit/lib/
git mv __tests__/unit/git-diff.test.js __tests__/unit/lib/
git mv __tests__/unit/iam-cli.test.js __tests__/unit/lib/
git mv __tests__/unit/log.test.js __tests__/unit/lib/
git mv __tests__/unit/platform.test.js __tests__/unit/lib/
git mv __tests__/unit/update-check.test.js __tests__/unit/lib/

# Move install tests
git mv __tests__/unit/copy-utils.test.js __tests__/unit/install/common/fs.test.js
# Create sentinel.test.js and config-patch.test.js if corresponding tests existed; otherwise skip
git mv __tests__/unit/wrapper.test.js __tests__/unit/wrapper/
git mv __tests__/unit/hook-utils.test.js __tests__/unit/hooks/git/lib/
```

Note: some test files may not have direct src equivalents (like `install-targets.test.js`, `package-files.test.js`). Leave them in a `misc/` subdirectory or at the unit root.

- [ ] **Step 3: Update test imports**

For every test file moved, update its imports to match new src paths. E.g., `__tests__/unit/lib/config.test.js`:

```js
// before
import { ... } from '../../../hooks/lib/config.js';
// after
import { ... } from '../../../lib/config.js';
```

Use grep to find all `hooks/lib/` references in tests:
```bash
grep -rln "hooks/lib/" __tests__/ | xargs -I {} sed -i '' 's|hooks/lib/|lib/|g' {}
```

And fix `copy-utils` → `install/common/fs`:
```bash
grep -rln "copy-utils" __tests__/ | xargs -I {} sed -i '' 's|copy-utils|install/common/fs|g' {}
```

Adjust `../` depth in imports based on new test file location. A test at `__tests__/unit/lib/foo.test.js` reaching to `lib/foo.js` needs `../../../lib/foo.js` (3 levels up).

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: 352 pass, 0 fail. (Test count should not change; we just moved tests.)

If tests fail with import errors, fix the import path.

- [ ] **Step 5: Update CLAUDE.md, README.md, AGENTS.md**

These docs contain architecture diagrams and file-path references. Update:

**CLAUDE.md** sections to update:
- "High-level architecture" code block — replace with new tree
- "The 7-layer onion" table — file paths (e.g., `content/enterprise-baseline.md` stays; `hooks/lib/rules.js` → `lib/rules.js`; `hooks/lib/constitution.js` → `lib/constitution.js`)
- "Critical gotchas" — file references
- "Where to look first for each change type" table — file paths

**README.md** — architecture diagram + file references

**AGENTS.md** — test commands, file references

Use this grep to find remaining stale references:
```bash
grep -rn "hooks/lib/\|baseline/\|wrappers/\|scaffolding/" --include="*.md" . | grep -v node_modules | grep -v ".git/"
```

Fix each.

- [ ] **Step 6: Run tests + lint**

Run:
```bash
npm test
npm run lint:baseline
```

Expected: 352 tests pass; baseline lint passes.

- [ ] **Step 7: Verify install e2e**

Run the install flow manually to ensure nothing broke:

```bash
./scripts/dev-reinstall.sh
# Or: node install.js --tool claude (if iam CLI available)
```

Expected: install completes with same UX as before.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "[REF06] refactor(platform): update package.json, reorganize __tests__/, refresh docs

- package.json: files field updated to reflect new directory structure
- __tests__/ reorganized to mirror src structure:
  - unit/lib/ for lib/*.js tests
  - unit/install/common/ and unit/install/hosts/ for install tests
  - unit/wrapper/, unit/hooks/git/lib/ for their respective tests
- CLAUDE.md, README.md, AGENTS.md: architecture diagrams + file paths updated

Phase 0 complete. Top-level structure now has 9 single-responsibility dirs.
All 352 tests pass."
```

**Phase 0 complete.**

At this point, the repo has:
- 9 top-level dirs: `hooks/`, `lib/`, `install/`, `wrapper/`, `bin/`, `content/`, `skills/`, `scripts/`, `opencode/`
- `hooks/lib/` dissolved
- `wrappers/` renamed to `wrapper/` (and includes generator)
- `baseline/` merged into `content/`
- Orphan dirs resolved
- 352 tests still passing
- External behavior unchanged

---

## Phase 1: HostAdapter Abstraction

Phase 1 introduces the abstraction that makes adding a new host a 1-file + 1-line change.

### Task 1.1: Define HostAdapter interface

**Files:**
- Create: `install/host-adapter.js`
- Test: `__tests__/unit/install/host-adapter.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `HostAdapter` class (abstract base, static methods)

- [ ] **Step 1: Write failing test for interface contract**

Create `__tests__/unit/install/host-adapter.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HostAdapter } from '../../../install/host-adapter.js';

describe('HostAdapter', () => {
  it('has required static properties', () => {
    assert.equal(HostAdapter.id, 'abstract');
    assert.equal(HostAdapter.displayName, 'Abstract Host');
  });

  it('has isInstalled() returning false by default', () => {
    assert.equal(HostAdapter.isInstalled(), false);
  });

  it('has preflight() as no-op by default', () => {
    // Should not throw
    HostAdapter.preflight({ PACKAGE_ROOT: '/tmp', announce: () => {} });
  });

  it('install() throws "not implemented" by default', async () => {
    await assert.rejects(
      () => HostAdapter.install({ PACKAGE_ROOT: '/tmp', announce: () => {} }),
      /not implemented/
    );
  });

  it('uninstall() is a no-op by default (optional)', async () => {
    // Should not throw — uninstall is optional
    await HostAdapter.uninstall({ PACKAGE_ROOT: '/tmp', announce: () => {} });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test __tests__/unit/install/host-adapter.test.js`

Expected: FAIL with "Cannot find module '.../install/host-adapter.js'".

- [ ] **Step 3: Implement HostAdapter**

Create `install/host-adapter.js`:

```js
// install/host-adapter.js — Abstract base class for host adapters.
//
// Each adapter describes "what this host looks like" without knowing about
// other hosts. The dispatcher (install/main.js) invokes polymorphic methods;
// no switch-case on tool names.
//
// Static methods (not instance methods): installation is a one-shot script
// action with no multi-instance scenario. If a future use case requires
// instance state (e.g., multiple profiles per host), convert to instance
// methods at that point — YAGNI for now.

export class HostAdapter {
  /** Host identifier — used in CLI args, sentinel filenames, logs. */
  static id = 'abstract';

  /** Human-readable name — used in error messages and announce output. */
  static displayName = 'Abstract Host';

  /**
   * Detect whether this host is installed on the current machine.
   * Used by `detectDefault()` to pick the tool when --tool is not specified.
   * @returns {boolean}
   */
  static isInstalled() { return false; }

  /**
   * Pre-flight checks (CLI deps, IDE presence, etc.).
   * Non-blocking: print warnings to ctx.announce, do not throw.
   * @param {{PACKAGE_ROOT: string, announce: (msg: string) => void}} ctx
   */
  static preflight(ctx) {}

  /**
   * Execute installation.
   * @param {{PACKAGE_ROOT: string, announce: (msg: string) => void}} ctx
   */
  static async install(ctx) {
    throw new Error(`${this.displayName}: install() not implemented`);
  }

  /**
   * Execute uninstallation. Must be idempotent (repeat calls do not error).
   * OPTIONAL — default is no-op. Adapters that need cleanup override this.
   * @param {{PACKAGE_ROOT: string, announce: (msg: string) => void}} ctx
   */
  static async uninstall(ctx) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test __tests__/unit/install/host-adapter.test.js`

Expected: 5 tests pass.

- [ ] **Step 5: Run full test suite**

Run: `npm test`

Expected: 357 tests pass (352 + 5 new).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "[OMS01] feat(install): add HostAdapter interface

Abstract base class for host adapters with static methods:
- id, displayName: host identity
- isInstalled(): detect host presence
- preflight(ctx): non-blocking warnings
- install(ctx): perform installation (must override)
- uninstall(ctx): perform uninstallation (optional, default no-op)

Thin ctx design: {PACKAGE_ROOT, announce}. Other capabilities retrieved
via lib/ imports, not passed through ctx."
```

### Task 1.2: Create host-registry + simplify install/main.js

**Files:**
- Create: `install/host-registry.js`
- Modify: `install/main.js` (rewrite to use registry)
- Test: `__tests__/unit/install/host-registry.test.js`

**Interfaces:**
- Consumes: `HostAdapter` (from Task 1.1), existing adapters (from current install/hosts/)
- Produces: `getAdapter(tool)`, `listTools()`, `detectDefault()`

- [ ] **Step 1: Write failing tests**

Create `__tests__/unit/install/host-registry.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAdapter, listTools, detectDefault } from '../../../install/host-registry.js';

describe('host-registry', () => {
  it('getAdapter returns the Claude adapter for "claude"', () => {
    const Adapter = getAdapter('claude');
    assert.equal(Adapter.id, 'claude');
  });

  it('getAdapter returns the Lingma adapter for "lingma"', () => {
    const Adapter = getAdapter('lingma');
    assert.equal(Adapter.id, 'lingma');
  });

  it('getAdapter returns the OpenCode adapter for "opencode"', () => {
    const Adapter = getAdapter('opencode');
    assert.equal(Adapter.id, 'opencode');
  });

  it('getAdapter throws for unknown tool with helpful message', () => {
    assert.throws(
      () => getAdapter('nonexistent'),
      /未知工具: nonexistent。支持: .*claude.*lingma.*opencode/
    );
  });

  it('listTools returns all registered tool ids', () => {
    const tools = listTools();
    assert.deepEqual(tools.sort(), ['claude', 'lingma', 'opencode']);
  });

  it('detectDefault returns a string', () => {
    const def = detectDefault();
    assert.equal(typeof def, 'string');
    // In CI, probably no host is installed, so fallback to 'claude'
    assert.ok(['claude', 'lingma', 'opencode'].includes(def));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test __tests__/unit/install/host-registry.test.js`

Expected: FAIL with "Cannot find module '.../install/host-registry.js'".

- [ ] **Step 3: Implement host-registry**

Create `install/host-registry.js`:

```js
// install/host-registry.js — Registry of host adapters.
//
// Adding a new host: import the adapter class and add one entry to REGISTRY.
// That's it. No changes to install/main.js or any dispatcher switch-case.

import { ClaudeAdapter } from './hosts/claude-adapter.js';
import { LingmaAdapter } from './hosts/lingma-adapter.js';
import { OpenCodeAdapter } from './hosts/opencode-adapter.js';

const REGISTRY = new Map([
  ['claude',   ClaudeAdapter],
  ['lingma',   LingmaAdapter],
  ['opencode', OpenCodeAdapter],
]);

/**
 * Look up the adapter class for a given tool id.
 * Throws with a helpful message listing supported tools if not found.
 */
export function getAdapter(tool) {
  const adapter = REGISTRY.get(tool);
  if (!adapter) {
    const supported = [...REGISTRY.keys()].join(', ');
    throw new Error(`未知工具: ${tool}。支持: ${supported}`);
  }
  return adapter;
}

/** List all registered tool ids. */
export function listTools() { return [...REGISTRY.keys()]; }

/**
 * Detect the default tool based on what's installed.
 * Returns the first host whose isInstalled() returns true,
 * falling back to 'claude' (v0.1 backward-compat behavior).
 */
export function detectDefault() {
  for (const [id, Adapter] of REGISTRY) {
    if (Adapter.isInstalled()) return id;
  }
  return 'claude';
}
```

Note: this file imports from `./hosts/claude-adapter.js` etc. Those files are currently the OLD install-claude.js (moved in Task 0.3) which doesn't yet export `ClaudeAdapter`. So this test will still fail until Task 1.4 (adapter rewrites). That's OK — the registry is correct; the adapters just haven't caught up yet.

**Alternative safer order:** implement Task 1.4 (adapter rewrites) BEFORE Task 1.2 (registry), so the registry has real adapters to import. If you prefer this order, swap them. The plan keeps them in this order to introduce the abstraction first, but both orders are valid.

- [ ] **Step 4: Run tests**

Run: `node --test __tests__/unit/install/host-registry.test.js`

Expected: If adapters not yet rewritten, fails with "does not export ClaudeAdapter". If adapters already rewritten (alternative order), passes.

If failing, defer this task's test pass until after Task 1.4.

- [ ] **Step 5: Rewrite install/main.js to use registry**

Replace `install/main.js` with:

```js
// install/main.js — oh-my-sdd multi-host dispatcher.
//
// Architecture:
//   install/main.js (this file) ← thin dispatcher, ~30 lines, 0 switch-case
//     ├── host-registry.js       ← registry of adapters
//     ├── host-adapter.js        ← interface
//     └── hosts/<tool>-adapter.js ← per-host implementation
//
// Backward compatibility:
//   - No --tool: equivalent to v0.1.0 behavior (auto-detect → claude)
//   - --tool <name>: explicit host selection

import { ensureStateDir } from '../lib/state-dir.js';
import { checkNodeVersion } from '../lib/platform.js';
import { getAdapter, detectDefault } from './host-registry.js';
import { announce } from './common/announce.js';

const PACKAGE_ROOT = process.env.OMS_PACKAGE_ROOT ?? import.meta.dirname;

async function main(options = {}) {
  // Shared preflight: Node version
  if (!checkNodeVersion('18.0.0')) {
    process.stderr.write(`❌ Node 版本过低。需要 >= 18.0.0，当前 ${process.version}\n`);
    process.exit(1);
  }

  // Shared state dir setup
  await ensureStateDir();

  // Tool selection: explicit or auto-detect
  const tool = options.tool ?? detectDefault();
  const Adapter = getAdapter(tool);
  const ctx = { PACKAGE_ROOT, announce };

  // Per-host preflight (warnings only)
  Adapter.preflight(ctx);

  // Per-host install
  return Adapter.install(ctx);
}

// Only run main when invoked directly (npm postinstall, CLI)
const isDirectRun = import.meta.url === `file://${process.argv[1]}`
  || process.argv[1]?.endsWith('install.js');
if (isDirectRun) {
  // Parse CLI args
  const args = process.argv.slice(2);
  const toolIdx = args.indexOf('--tool');
  const tool = toolIdx >= 0 ? args[toolIdx + 1] : undefined;
  main({ tool }).catch((err) => {
    process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { main };
```

Note the `announce` import from `./common/announce.js` — that module is created in Task 1.3. If you're doing tasks strictly in order, you can either:
- Implement Task 1.3 first, then come back here
- Create a stub `announce.js` now and flesh it out in Task 1.3

- [ ] **Step 6: Verify backward-compat exports**

The old `install.js` exported `main`, `preflightFor`, `detectDefaultTool`, `isClaudeInstalled`, `isLingmaInstalled`, `isOpenCodeInstalled`. Some tests and external scripts may depend on these.

Check:
```bash
grep -rn "preflightFor\|detectDefaultTool\|isClaudeInstalled\|isLingmaInstalled\|isOpenCodeInstalled" --include="*.js" . | grep -v node_modules | grep -v install/main.js | grep -v hosts/
```

If any hits: re-export them from `install/main.js` as thin wrappers around the adapters:

```js
// Backward-compat exports (used by tests and legacy scripts)
export { main } from './main.js';
export function preflightFor(tool) {
  const Adapter = getAdapter(tool);
  Adapter.preflight({ PACKAGE_ROOT, announce });
}
export function detectDefaultTool() { return detectDefault(); }
export function isClaudeInstalled() { return ClaudeAdapter.isInstalled(); }
export function isLingmaInstalled() { return LingmaAdapter.isInstalled(); }
export function isOpenCodeInstalled() { return OpenCodeAdapter.isInstalled(); }
```

If no hits: skip.

- [ ] **Step 7: Run tests**

Run: `npm test`

Expected: all tests pass. Some tests may reference the old `preflightFor` / `detectDefaultTool` exports — if so, add the backward-compat exports from Step 6.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "[OMS02] feat(install): add host-registry, simplify main.js dispatcher

- install/host-registry.js: Map-based registry, getAdapter/listTools/detectDefault
- install/main.js: rewritten as ~30-line thin dispatcher, no switch-case
- Adding a new host is now: write adapter + add 1 line to registry

Backward-compat exports preserved for existing tests:
- preflightFor, detectDefaultTool, isXxxInstalled"
```

### Task 1.3: Extract install/common/ utilities

**Files:**
- Create: `install/common/announce.js`
- Create: `install/common/detect.js`
- Modify: `install/common/fs.js` (add `rmIfExists`, unify `copyDir`/`copyDirRecursive`)
- Test: `__tests__/unit/install/common/announce.test.js`
- Test: `__tests__/unit/install/common/detect.test.js`
- Test: `__tests__/unit/install/common/fs.test.js` (add tests for rmIfExists)

**Interfaces:**
- Consumes: nothing
- Produces: `announce(msg)`, `isCliInPath(name)`, `rmIfExists(path)`, unified `copyDir`/`copyDirRecursive`/`copySkillsToDir`

- [ ] **Step 1: Extract announce.js**

Currently, each of the 3 adapters defines its own `announce(msg) { process.stderr.write(msg + '\n'); }`. Extract to shared:

Create `install/common/announce.js`:

```js
// install/common/announce.js — shared progress output helper.
// All adapters use this instead of defining their own.

/**
 * Print a progress message to stderr.
 * @param {string} msg
 */
export function announce(msg) {
  process.stderr.write(msg + '\n');
}
```

- [ ] **Step 2: Write + verify announce test**

Create `__tests__/unit/install/common/announce.test.js`:

```js
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { announce } from '../../../../install/common/announce.js';

describe('announce', () => {
  it('writes message + newline to stderr', () => {
    const writes = [];
    mock.method(process.stderr, 'write', (s) => { writes.push(s); return true; });
    try {
      announce('hello');
      assert.deepEqual(writes, ['hello\n']);
    } finally {
      mock.restoreAll();
    }
  });
});
```

Run: `node --test __tests__/unit/install/common/announce.test.js` → PASS.

- [ ] **Step 3: Extract detect.js**

The CLI-in-PATH detection is repeated 3x with `process.platform === 'win32' ? 'where' : 'which'`. Extract:

Create `install/common/detect.js`:

```js
// install/common/detect.js — CLI detection helpers shared across adapters.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Check if a CLI command is available on PATH.
 * Handles Windows (where) vs POSIX (which) transparently.
 * @param {string} name - CLI name (e.g., 'claude', 'lingma', 'opencode')
 * @returns {boolean}
 */
export function isCliInPath(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists (for hosts that don't register a CLI).
 * @param {string} dirPath
 * @returns {boolean}
 */
export function isDirPresent(dirPath) {
  return existsSync(dirPath);
}
```

- [ ] **Step 4: Write + verify detect test**

Create `__tests__/unit/install/common/detect.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCliInPath, isDirPresent } from '../../../../install/common/detect.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('isCliInPath', () => {
  it('returns true for node (always available)', () => {
    assert.equal(isCliInPath('node'), true);
  });

  it('returns false for a nonsense command name', () => {
    assert.equal(isCliInPath('definitely-not-a-real-cli-xyz-123'), false);
  });
});

describe('isDirPresent', () => {
  it('returns true for tmpdir()', () => {
    assert.equal(isDirPresent(tmpdir()), true);
  });

  it('returns false for a nonexistent path', () => {
    assert.equal(isDirPresent(join(tmpdir(), 'does-not-exist-xyz-123')), false);
  });
});
```

Run: `node --test __tests__/unit/install/common/detect.test.js` → PASS.

- [ ] **Step 5: Add rmIfExists + unify copyDir in fs.js**

Open `install/common/fs.js` (created in Task 0.3) and add:

```js
// install/common/fs.js — file system utilities shared across install adapters.

import { readFile, writeFile, mkdir, readdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ---- Sentinel system (from install-shared.js) ----
// ... existing sentinel code stays as-is ...

// ---- File system utilities ----

/**
 * Remove a path if it exists. Idempotent.
 * @param {string} p - path to remove
 * @returns {Promise<boolean>} true if removed, false if didn't exist
 */
export async function rmIfExists(p) {
  if (existsSync(p)) {
    await rm(p, { recursive: true, force: true });
    return true;
  }
  return false;
}

/**
 * Recursively copy a directory, skipping .DS_Store.
 * Returns the number of files copied.
 */
export async function copyDir(src, dest, options = {}) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    if (options.filter && !options.filter(join(src, entry.name))) continue;
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDir(srcPath, destPath, options);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
      count++;
    }
  }
  return count;
}

// Alias for backward compatibility (lingma adapter uses this name)
export const copyDirRecursive = copyDir;

/**
 * Copy skills from oh-my-sdd's skills/ to a target directory.
 * Only copies subdirectories that contain a SKILL.md file.
 * @returns {Promise<number>} number of skills copied
 */
export async function copySkillsToDir(skillsSrc, destDir, announce) {
  if (!existsSync(skillsSrc)) {
    announce(`  ⚠️  skills 源目录不存在: ${skillsSrc}`);
    return 0;
  }
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(skillsSrc, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(skillsSrc, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const destSkillDir = join(destDir, entry.name);
    await copyDir(join(skillsSrc, entry.name), destSkillDir);
    count++;
  }
  announce(`  ✓ 已复制 ${count} 个 skills -> ${destDir}`);
  return count;
}
```

- [ ] **Step 6: Add fs.js test for rmIfExists**

Open existing `__tests__/unit/install/common/fs.test.js` (was copy-utils.test.js, moved in Task 0.6). If it doesn't exist, create it. Add:

```js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmIfExists } from '../../../../install/common/fs.js';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('rmIfExists', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'fs-test-'));
  });
  afterEach(async () => {
    if (existsSync(tempDir)) await rmIfExists(tempDir);
  });

  it('removes an existing file and returns true', async () => {
    const file = join(tempDir, 'x.txt');
    await writeFile(file, 'hi');
    assert.equal(await rmIfExists(file), true);
    assert.equal(existsSync(file), false);
  });

  it('returns false for a nonexistent path', async () => {
    const nope = join(tempDir, 'does-not-exist');
    assert.equal(await rmIfExists(nope), false);
  });

  it('removes a directory recursively', async () => {
    const sub = join(tempDir, 'sub');
    await mkdir(sub);
    await writeFile(join(sub, 'nested.txt'), 'x');
    assert.equal(await rmIfExists(sub), true);
    assert.equal(existsSync(sub), false);
  });
});
```

Run: `node --test __tests__/unit/install/common/fs.test.js` → PASS.

- [ ] **Step 7: Run full test suite**

Run: `npm test`

Expected: all tests pass, test count increased by the new tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "[OMS03] feat(install): extract common utilities (announce, detect, fs)

Eliminates 3x duplication:
- announce(): was defined in each of 3 adapters, now shared
- isCliInPath(): CLI-in-PATH detection with Windows/POSIX handling
- rmIfExists(): idempotent removal helper (was duplicated in lingma + opencode)
- copyDir() unified with the lingma variant (copyDirRecursive)
- copySkillsToDir(): preserved as a thin wrapper over copyDir"
```

### Task 1.4: Rewrite install-lingma.js as LingmaAdapter class

**Files:**
- Modify: `install/hosts/lingma-adapter.js` (rewrite as class)
- Modify: `__tests__/unit/install/hosts/lingma-adapter.test.js` (if exists, update; else create)

**Interfaces:**
- Consumes: `HostAdapter`, `install/common/*`
- Produces: `LingmaAdapter` class (extends HostAdapter)

- [ ] **Step 1: Write failing test for LingmaAdapter contract**

Create/update `__tests__/unit/install/hosts/lingma-adapter.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LingmaAdapter } from '../../../../install/hosts/lingma-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

describe('LingmaAdapter', () => {
  it('extends HostAdapter', () => {
    assert.ok(Object.getPrototypeOf(LingmaAdapter) === HostAdapter);
  });

  it('has id = "lingma"', () => {
    assert.equal(LingmaAdapter.id, 'lingma');
  });

  it('has a display name', () => {
    assert.equal(typeof LingmaAdapter.displayName, 'string');
    assert.ok(LingmaAdapter.displayName.length > 0);
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof LingmaAdapter.isInstalled(), 'boolean');
  });

  it('install() is an async function', () => {
    assert.equal(LingmaAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is an async function', () => {
    assert.equal(LingmaAdapter.uninstall.constructor.name, 'AsyncFunction');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test __tests__/unit/install/hosts/lingma-adapter.test.js`

Expected: FAIL (LingmaAdapter is not a class yet; current file exports `installForLingma`).

- [ ] **Step 3: Rewrite lingma-adapter.js**

Replace `install/hosts/lingma-adapter.js` with a class-based structure. Preserve ALL the existing logic; just wrap it in a class:

```js
// install/hosts/lingma-adapter.js — 通义灵码 lingma CN adapter.
//
// Lingma-specific logic:
//   1. Copy skills to ~/.lingma/skills/
//   2. Write baseline to ~/.lingma/rules/oh-my-sdd.md (Always-type rule)
//   3. Deep-merge hooks into ~/.lingma/settings.json (preserve user's other hooks)
//   4. Write sentinel to ~/.oh-my-sdd/baseline-lingma.sentinel
//
// Uninstall:
//   1. Delete skills dir
//   2. Delete rule file
//   3. Surgically remove the 4 OMS hook events from settings.json
//   4. Delete sentinel

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

import { HostAdapter } from '../host-adapter.js';
import { writeSentinel, readSentinel, sentinelPathFor } from '../common/sentinel.js';
import { copySkillsToDir, rmIfExists } from '../common/fs.js';

const HOME = homedir();

// Lingma-specific paths
const LINGMA_DIR = join(HOME, '.lingma');
const LINGMA_SKILLS_DIR = join(LINGMA_DIR, 'skills');
const LINGMA_SETTINGS = join(LINGMA_DIR, 'settings.json');
const LINGMA_RULES_DIR = join(LINGMA_DIR, 'rules');
const LINGMA_RULE_FILE = join(LINGMA_RULES_DIR, 'oh-my-sdd.md');

// Hook events OMS injects (uninstall removes only these)
const OOMS_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];

export class LingmaAdapter extends HostAdapter {
  static id = 'lingma';
  static displayName = '通义灵码 Lingma CN';

  static isInstalled() {
    // Lingma may not register a CLI; also check ~/.lingma/ presence
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      const { execFileSync } = require('node:child_process');
      execFileSync(cmd, ['lingma'], { stdio: 'ignore' });
      return true;
    } catch {
      return existsSync(LINGMA_DIR);
    }
  }

  static preflight(ctx) {
    if (!this.isInstalled()) {
      ctx.announce('⚠️  未检测到通义灵码 (lingma) IDE。已写入 rules + 合并 settings.json，但 IDE 不在时不生效。');
      ctx.announce('    安装：https://lingma.aliyun.com');
    }
  }

  static async install(ctx) {
    if (process.cwd() === HOME) {
      ctx.announce('⚠️  当前目录是 HOME 目录，建议 cd 到项目目录后再装');
    }

    ctx.announce('→ 安装通义灵码 lingma CN 适配');
    await copySkillsToDir(join(ctx.PACKAGE_ROOT, 'skills'), LINGMA_SKILLS_DIR, ctx.announce);
    await this.#injectBaseline(ctx.announce);
    await writeSentinel('lingma', LINGMA_RULE_FILE, null, ctx.announce);
    await this.#generateSettings(ctx.PACKAGE_ROOT, ctx.announce);

    ctx.announce('');
    ctx.announce('✓ oh-my-sdd (通义灵码) 安装完成');
    ctx.announce('');
    ctx.announce('下一步：');
    ctx.announce('  1. 重启通义灵码 IDE（加载新 skills + rules）');
    ctx.announce('  2. baseline 已写入 ~/.lingma/rules/oh-my-sdd.md（Always 类型规则自动生效）');
    ctx.announce('  3. hooks 已合并到 ~/.lingma/settings.json（保留你的其他 hook 事件）');
    ctx.announce('  4. 测试企业约束：问 "你的身份是什么？"，应回复"企业 SDD Agent"');
    ctx.announce('');
    ctx.announce('卸载（仅清 lingma）：oms-uninstall --tool lingma   # 保留 ~/.oh-my-sdd/ 状态目录');
    ctx.announce('完整卸载：npm uninstall -g @cli-tools/oh-my-sdd   # preuninstall 自动清三套产物');
  }

  static async uninstall(ctx) {
    ctx.announce('→ 卸载通义灵码 lingma 适配');

    if (await rmIfExists(LINGMA_SKILLS_DIR)) {
      ctx.announce(`  ✓ 已删除: ${LINGMA_SKILLS_DIR}`);
    }
    if (await rmIfExists(LINGMA_RULE_FILE)) {
      ctx.announce(`  ✓ 已删除: ${LINGMA_RULE_FILE}`);
    }
    await this.#removeOmsHooksFromSettings(ctx.announce);

    const sentinel = await readSentinel('lingma');
    if (sentinel) {
      await rmIfExists(sentinelPathFor('lingma'));
      ctx.announce('  ✓ 已删除哨兵文件');
    }
  }

  // ---- Private helpers ----

  static async #injectBaseline(announce) {
    const baselinePath = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', 'content', 'lingma-baseline.md');
    const baseline = await readFile(baselinePath, 'utf8');
    const bodyOnly = baseline.replace(/^---[\s\S]*?---\n/, '');

    await mkdir(LINGMA_RULES_DIR, { recursive: true });
    await writeFile(LINGMA_RULE_FILE, bodyOnly, { mode: 0o644 });
    announce(`  ✓ baseline 已写入: ${LINGMA_RULE_FILE}`);
  }

  static async #generateSettings(packageRoot, announce) {
    const tplPath = join(packageRoot, 'install', 'common', 'fixtures', 'lingma-settings.json');
    const tpl = JSON.parse(await readFile(tplPath, 'utf8'));

    const tplStr = JSON.stringify(tpl).replaceAll('<PLUGIN_ROOT>', packageRoot);
    const omsHooks = JSON.parse(tplStr).hooks;

    let existing = {};
    if (existsSync(LINGMA_SETTINGS)) {
      try {
        existing = JSON.parse(await readFile(LINGMA_SETTINGS, 'utf8'));
      } catch {
        announce('  ⚠️  现有 ~/.lingma/settings.json JSON 损坏，将备份并重写');
        existing = {};
      }
    }

    if (!existing.hooks) existing.hooks = {};
    for (const evt of OOMS_EVENTS) {
      existing.hooks[evt] = omsHooks[evt];
    }

    await mkdir(LINGMA_DIR, { recursive: true });
    await writeFile(LINGMA_SETTINGS, JSON.stringify(existing, null, 2) + '\n', { mode: 0o644 });
    announce(`  ✓ 通义灵码 settings.json 已更新: ${LINGMA_SETTINGS}`);
  }

  static async #removeOmsHooksFromSettings(announce) {
    if (!existsSync(LINGMA_SETTINGS)) return;

    let settings;
    try {
      settings = JSON.parse(await readFile(LINGMA_SETTINGS, 'utf8'));
    } catch {
      announce('  ⚠️  ~/.lingma/settings.json JSON 损坏，跳过');
      return;
    }
    if (!settings.hooks) return;

    let changed = false;
    for (const evt of OOMS_EVENTS) {
      if (settings.hooks[evt]) {
        delete settings.hooks[evt];
        changed = true;
      }
    }
    if (changed) {
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      await writeFile(LINGMA_SETTINGS, JSON.stringify(settings, null, 2) + '\n', { mode: 0o644 });
      announce(`  ✓ 已从 settings.json 移除 oh-my-sdd hooks: ${LINGMA_SETTINGS}`);
    } else {
      announce('  (settings.json 无 oh-my-sdd hooks，跳过)');
    }
  }
}
```

Note: the old file used CommonJS-style `import { execFileSync }` from `node:child_process` at top level. The class version needs `execFileSync` in `isInstalled()`. Imported at method level or at top — top is cleaner; I put it inline above for brevity but it should be at the top of the file.

Fix the import at the top:
```js
import { execFileSync } from 'node:child_process';
```

- [ ] **Step 4: Run test**

Run: `node --test __tests__/unit/install/hosts/lingma-adapter.test.js`

Expected: 6 tests pass.

- [ ] **Step 5: Update existing Lingma install tests (if any)**

Search:
```bash
grep -rln "installForLingma\|uninstallForLingma" __tests__/ | head
```

If hits: update tests to use `LingmaAdapter.install(ctx)` and `LingmaAdapter.uninstall(ctx)` instead of `installForLingma()`.

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "[OMS04] feat(install): rewrite lingma-adapter as HostAdapter class

- install/hosts/lingma-adapter.js now exports LingmaAdapter class
- All existing logic preserved, wrapped in static methods
- uninstall() retained (was already implemented in the old file)
- Uses shared helpers from install/common/ (sentinel, fs, copySkillsToDir)"
```

### Task 1.5: Rewrite install-opencode.js as OpenCodeAdapter class

**Files:**
- Modify: `install/hosts/opencode-adapter.js` (rewrite as class)
- Test: `__tests__/unit/install/hosts/opencode-adapter.test.js` (if exists, update; else create)

**Interfaces:**
- Consumes: `HostAdapter`, `install/common/*`, `opencode/build.js`
- Produces: `OpenCodeAdapter` class

- [ ] **Step 1: Write failing test for OpenCodeAdapter contract**

Create `__tests__/unit/install/hosts/opencode-adapter.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeAdapter } from '../../../../install/hosts/opencode-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

describe('OpenCodeAdapter', () => {
  it('extends HostAdapter', () => {
    assert.equal(Object.getPrototypeOf(OpenCodeAdapter), HostAdapter);
  });

  it('has id = "opencode"', () => {
    assert.equal(OpenCodeAdapter.id, 'opencode');
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof OpenCodeAdapter.isInstalled(), 'boolean');
  });

  it('install() is async', () => {
    assert.equal(OpenCodeAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is async', () => {
    assert.equal(OpenCodeAdapter.uninstall.constructor.name, 'AsyncFunction');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Rewrite opencode-adapter.js**

The OpenCode adapter is the fattest (~200 lines target). Preserve ALL existing logic, wrap in class. Read the current `install/hosts/opencode-adapter.js` and restructure:

```js
// install/hosts/opencode-adapter.js — OpenCode adapter.
//
// OpenCode's plugin model is bespoke (manual file placement rather than a
// plugin registry), so this adapter is legitimately longer than others.
// The 5 install steps are OpenCode-specific; they stay as private methods.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { HostAdapter } from '../host-adapter.js';
import { rmIfExists } from '../common/fs.js';
import { buildOpencodePlugin } from '../../opencode/build.js';
import { installSuperpowersZh, findDelegatedSkillsSource } from '../common/superpowers.js';
import { SDD_COMMANDS, installCommandFiles } from '../common/command-generator.js';
import { patchOpencodeJson, unpatchOpencodeJson } from '../common/config-patch.js';
import { OPENCODE_PLUGIN_DIR, OPENCODE_COMMANDS_DIR, OPENCODE_CONFIG_DIR } from '../../lib/paths.js';

export class OpenCodeAdapter extends HostAdapter {
  static id = 'opencode';
  static displayName = 'OpenCode';

  static isInstalled() {
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(cmd, ['opencode'], { stdio: 'ignore' });
      return true;
    } catch {
      return existsSync(OPENCODE_CONFIG_DIR);
    }
  }

  static preflight(ctx) {
    if (!this.isInstalled()) {
      ctx.announce('⚠️  未检测到 OpenCode。继续安装，但 OpenCode 不在时不生效。');
      ctx.announce('    安装: https://opencode.ai');
    }
  }

  static async install(ctx) {
    ctx.announce('→ 安装 OpenCode 适配');
    ctx.announce('');
    ctx.announce('ℹ️  推荐方式：通过 npm 安装插件（自动更新）');
    ctx.announce('    在 opencode.json 中配置: {"plugin": ["@enterprise/oh-my-sdd-opencode"]}');
    ctx.announce('');
    ctx.announce('当前：本地开发模式（手动复制到 ~/.config/opencode/plugins/）');
    ctx.announce('');

    buildOpencodePlugin(ctx.PACKAGE_ROOT);
    this.#copyDistToPluginDir(ctx);
    this.#copyHooksToPluginDir(ctx);
    this.#copyContentToPluginDir(ctx);
    installSuperpowersZh();
    this.#copySkillsToPluginDir(ctx);
    installCommandFiles();
    patchOpencodeJson();

    ctx.announce('');
    ctx.announce('✓ oh-my-sdd (OpenCode) 本地开发模式安装完成');
    // ... remaining next-steps announcement ...
  }

  static async uninstall(ctx) {
    ctx.announce('→ 卸载 OpenCode 适配');

    if (await rmIfExists(OPENCODE_PLUGIN_DIR)) {
      ctx.announce(`  ✓ 已删除: ${OPENCODE_PLUGIN_DIR}`);
    }

    if (existsSync(OPENCODE_COMMANDS_DIR)) {
      let removed = 0;
      for (const cmd of SDD_COMMANDS) {
        const f = join(OPENCODE_COMMANDS_DIR, `${cmd.name}.md`);
        if (existsSync(f)) {
          rmSync(f);
          removed++;
        }
      }
      if (removed > 0) ctx.announce(`  ✓ 已删除 ${removed} 个 slash command 文件`);
    }

    unpatchOpencodeJson();
  }

  // ---- Private helpers (OpenCode-specific) ----

  static #copyDistToPluginDir(ctx) {
    // ... exact logic from existing install-opencode.js copyDistToPluginDir ...
  }

  static #copyHooksToPluginDir(ctx) { /* ... */ }
  static #copyContentToPluginDir(ctx) { /* ... */ }
  static #copySkillsToPluginDir(ctx) { /* ... */ }
  static #copyDelegatedSkill(srcSkill, targetSkill) { /* ... */ }
}
```

**Critical**: fill in the `#copyDistToPluginDir`, `#copyHooksToPluginDir`, `#copyContentToPluginDir`, `#copySkillsToPluginDir`, `#copyDelegatedSkill` private methods with the EXACT logic from the existing `install/hosts/opencode-adapter.js` file. They were top-level functions; now they're static private methods. Their bodies are unchanged.

- [ ] **Step 4: Run test**

Expected: 5 tests pass.

- [ ] **Step 5: Update existing OpenCode install tests (if any)**

Search for `installForOpencode` / `uninstallForOpencode` in `__tests__/` and update.

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "[OMS05] feat(install): rewrite opencode-adapter as HostAdapter class

- install/hosts/opencode-adapter.js now exports OpenCodeAdapter class
- 5 OpenCode-specific install steps preserved as private static methods
  (#copyDistToPluginDir, #copyHooksToPluginDir, #copyContentToPluginDir,
   #copySkillsToPluginDir, #copyDelegatedSkill)
- Uses shared helpers from install/common/ and opencode/build.js"
```

### Task 1.6: Rewrite install-claude.js as ClaudeAdapter class

**Files:**
- Modify: `install/hosts/claude-adapter.js` (rewrite as class)
- Test: `__tests__/unit/install/hosts/claude-adapter.test.js` (if exists, update; else create)

**Interfaces:**
- Consumes: `HostAdapter`, `wrapper/wrapper.js`, `lib/state-dir.js`, `lib/platform.js`, `install/common/announce.js`, `install/common/detect.js`
- Produces: `ClaudeAdapter` class

- [ ] **Step 1: Write failing test for ClaudeAdapter contract**

```js
// __tests__/unit/install/hosts/claude-adapter.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeAdapter } from '../../../../install/hosts/claude-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

describe('ClaudeAdapter', () => {
  it('extends HostAdapter', () => {
    assert.equal(Object.getPrototypeOf(ClaudeAdapter), HostAdapter);
  });

  it('has id = "claude"', () => {
    assert.equal(ClaudeAdapter.id, 'claude');
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof ClaudeAdapter.isInstalled(), 'boolean');
  });

  it('install() is async', () => {
    assert.equal(ClaudeAdapter.install.constructor.name, 'AsyncFunction');
  });

  // Claude uninstall is OPTIONAL in Phase 1 — left for Phase 3.
  // Default HostAdapter.uninstall() is a no-op, which is acceptable for now.
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL.

- [ ] **Step 3: Rewrite claude-adapter.js**

```js
// install/hosts/claude-adapter.js — Claude Code adapter.
//
// Claude-specific logic:
//   1. Register marketplace (`claude plugin marketplace add`)
//   2. Install plugin (`claude plugin install oh-my-sdd@oh-my-sdd`)
//   3. Install Claude CLI wrapper (intercepts `claude`, injects enterprise baseline)
//
// Claude's uninstall() is intentionally not implemented in Phase 1 —
// it will be added in Phase 3 to restore symmetry with lingma/opencode.

import { spawn } from 'node:child_process';
import { HostAdapter } from '../host-adapter.js';
import { isCliInPath } from '../common/detect.js';
import { installWrapper, findClaudeOriginal } from '../../wrapper/wrapper.js';
import { ensureStateDir } from '../../lib/state-dir.js';
import { isIamInPath } from '../../lib/platform.js';
import { execFileSync } from 'node:child_process';

const MARKETPLACE_NAME = 'oh-my-sdd';
const PLUGIN_NAME = 'oh-my-sdd';

export class ClaudeAdapter extends HostAdapter {
  static id = 'claude';
  static displayName = 'Claude Code';

  static isInstalled() { return isCliInPath('claude'); }

  static preflight(ctx) {
    if (!isIamInPath()) {
      ctx.announce('⚠️  未检测到 iam CLI。可继续安装，但首次会话将提示安装。');
      ctx.announce('    安装后请运行 oms-login 完成身份认证。');
    }
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(cmd, ['openspec'], { stdio: 'ignore' });
    } catch {
      ctx.announce('⚠️  未检测到 openspec CLI。可继续安装，但 /sdd-review 归档阶段会阻塞。');
      ctx.announce('    安装：npm install -g @fission-ai/openspec');
    }
  }

  static async install(ctx) {
    if (!this.isInstalled()) {
      ctx.announce('\n❌ 未检测到 claude CLI。请手动执行：');
      ctx.announce(`  claude plugin marketplace add ${ctx.PACKAGE_ROOT}`);
      ctx.announce(`  claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
      // Create state dir before exiting — smoke-check depends on this side effect
      await ensureStateDir();
      process.exit(1);
    }

    ctx.announce('→ 初始化 ~/.oh-my-sdd/ 状态目录');
    await ensureStateDir();

    ctx.announce('→ 注册 marketplace');
    await this.#registerMarketplace(ctx.PACKAGE_ROOT, ctx.announce);

    ctx.announce('→ 安装 plugin');
    await this.#installPlugin(ctx.announce);

    const originalClaude = findClaudeOriginal();
    if (originalClaude) {
      ctx.announce('→ 安装 Claude CLI wrapper（企业规则自动注入）');
      await installWrapper(ctx.PACKAGE_ROOT, ctx.announce);
    } else {
      ctx.announce('⚠️  Claude CLI wrapper 未安装（未找到原 claude 二进制）');
      ctx.announce('    1) 安装 Claude Code: https://claude.com/download');
      ctx.announce('    2) 运行: npm reinstall @cli-tools/oh-my-sdd（重新触发 wrapper 安装）');
    }

    ctx.announce('');
    ctx.announce('✓ oh-my-sdd (Claude Code) 安装完成');
    ctx.announce('');
    ctx.announce('下一步：');
    ctx.announce('  1. 重启终端（使 PATH 生效）');
    ctx.announce('  2. 运行 `oms-login` 完成 iam 身份认证');
    ctx.announce('  3. 重启 Claude Code (或 /reload-plugins)');
    ctx.announce('  4. 测试企业约束: claude "你的身份是什么？"');
    ctx.announce('');
    ctx.announce('绕过企业约束: claude --no-enterprise ...');
  }

  // uninstall() intentionally NOT implemented in Phase 1.
  // Will be added in Phase 3 to call `claude plugin uninstall` + remove wrapper.

  static #runClaude(args) {
    return new Promise((resolve) => {
      const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c) => { stdout += c; });
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
    });
  }

  static async #registerMarketplace(packageRoot, announce) {
    const result = await this.#runClaude(['plugin', 'marketplace', 'add', packageRoot]);
    if (result.code !== 0) {
      const out = (result.stderr + result.stdout).toLowerCase();
      if (out.includes('already') || out.includes('exists') || out.includes('replace')) {
        announce('  (marketplace 已注册，跳过)');
      } else {
        process.stderr.write(`⚠️  claude plugin marketplace add 失败 (exit ${result.code}):\n`);
        process.stderr.write(result.stderr || result.stdout || '(no output)\n');
        process.stderr.write(`    请手动运行：claude plugin marketplace add ${packageRoot}\n`);
      }
      return;
    }
    announce(`  ✓ 已注册 marketplace：${packageRoot}`);
  }

  static async #installPlugin(announce) {
    const result = await this.#runClaude(['plugin', 'install', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
    if (result.code !== 0) {
      const out = (result.stderr + result.stdout).toLowerCase();
      if (out.includes('already') || out.includes('installed')) {
        announce('  (plugin 已安装，跳过)');
      } else {
        process.stderr.write(`⚠️  claude plugin install 失败 (exit ${result.code}):\n`);
        process.stderr.write(result.stderr || result.stdout || '(no output)\n');
        process.stderr.write(`    请手动运行：claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
      }
      return;
    }
    announce(`  ✓ 已安装 plugin：${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
  }
}
```

- [ ] **Step 4: Run test**

Expected: 4 tests pass.

- [ ] **Step 5: Update existing Claude install tests (if any)**

Search for `installForClaude` in `__tests__/` and update.

- [ ] **Step 6: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "[OMS06] feat(install): rewrite claude-adapter as HostAdapter class

- install/hosts/claude-adapter.js now exports ClaudeAdapter class
- Marketplace registration + plugin install + wrapper installation preserved
- uninstall() left as no-op in Phase 1 (to be implemented in Phase 3)"
```

### Task 1.7: Add adapter interface consistency test

**Files:**
- Test: `__tests__/unit/install/hosts/adapter-consistency.test.js`

**Interfaces:**
- Consumes: all 3 adapters
- Produces: verification that all adapters conform to HostAdapter interface

- [ ] **Step 1: Write the consistency test**

Create `__tests__/unit/install/hosts/adapter-consistency.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeAdapter } from '../../../../install/hosts/claude-adapter.js';
import { LingmaAdapter } from '../../../../install/hosts/lingma-adapter.js';
import { OpenCodeAdapter } from '../../../../install/hosts/opencode-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

const ALL_ADAPTERS = [
  { name: 'Claude', Adapter: ClaudeAdapter, expectedId: 'claude' },
  { name: 'Lingma', Adapter: LingmaAdapter, expectedId: 'lingma' },
  { name: 'OpenCode', Adapter: OpenCodeAdapter, expectedId: 'opencode' },
];

describe('adapter interface consistency', () => {
  for (const { name, Adapter, expectedId } of ALL_ADAPTERS) {
    describe(`${name}Adapter`, () => {
      it('extends HostAdapter', () => {
        assert.equal(Object.getPrototypeOf(Adapter), HostAdapter);
      });

      it(`has id = "${expectedId}"`, () => {
        assert.equal(Adapter.id, expectedId);
      });

      it('has a non-empty displayName', () => {
        assert.equal(typeof Adapter.displayName, 'string');
        assert.ok(Adapter.displayName.length > 0);
      });

      it('isInstalled() returns boolean', () => {
        assert.equal(typeof Adapter.isInstalled(), 'boolean');
      });

      it('preflight() is a function', () => {
        assert.equal(typeof Adapter.preflight, 'function');
      });

      it('install() is an async function', () => {
        assert.equal(Adapter.install.constructor.name, 'AsyncFunction');
      });

      it('uninstall() is an async function', () => {
        assert.equal(Adapter.uninstall.constructor.name, 'AsyncFunction');
      });

      it('has unique id among all adapters', () => {
        const ids = ALL_ADAPTERS.map((a) => a.Adapter.id);
        assert.equal(new Set(ids).size, ids.length);
      });
    });
  }
});
```

- [ ] **Step 2: Run test**

Run: `node --test __tests__/unit/install/hosts/adapter-consistency.test.js`

Expected: 24 tests pass (8 tests × 3 adapters).

- [ ] **Step 3: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "[OMS07] test(install): add adapter interface consistency test

Verifies all 3 adapters (Claude, Lingma, OpenCode) conform to the
HostAdapter interface: extends HostAdapter, has id/displayName,
implements isInstalled/preflight/install/uninstall with correct types,
and each has a unique id.

This test will automatically cover KiloCodeAdapter when added in Phase 2
— just add it to ALL_ADAPTERS."
```

**Phase 1 complete.**

At this point:
- `HostAdapter` interface defined
- `host-registry.js` provides `getAdapter(tool)`
- `install/main.js` is a ~30-line thin dispatcher, no switch-case
- 3 adapters are classes extending `HostAdapter`
- Adding a new host = write 1 adapter file + add 1 registry line

---

## Phase 2: KiloCode Validation

**Important caveat:** Phase 2 depends on research into KiloCode's plugin model, which is not yet done. Task 2.1 produces the research notes; Tasks 2.2-2.4 use those notes. If KiloCode's plugin model turns out to be significantly different from Claude/Lingma/OpenCode, the adapter implementation may need to be larger than the 150-line target.

### Task 2.1: Research KiloCode plugin model

**Files:**
- Create: `docs/superpowers/research/YYYY-MM-DD-kilocode-plugin-model.md`

**Interfaces:**
- Consumes: KiloCode documentation, community examples
- Produces: research notes (concrete answers to the 4 questions below)

- [ ] **Step 1: Document the 4 key questions**

Create `docs/superpowers/research/YYYY-MM-DD-kilocode-plugin-model.md` with this template:

```markdown
# KiloCode Plugin Model Research

**Date:** YYYY-MM-DD
**Researcher:** [name]

## 1. Where are plugins installed?

- Expected: `~/.kilocode/extensions/` (VS Code-derived)
- Actual: [TBD after research]
- Path constant to use in adapter: `KILOCODE_PLUGIN_DIR = ...`

## 2. How are skills registered?

- Expected: `package.json` field or manifest
- Actual: [TBD]
- Adapter step needed: [copy files? register via API? both?]

## 3. How are hooks registered?

- Expected: similar to VS Code's activation events
- Actual: [TBD]
- Adapter step needed: [...]

## 4. How is baseline injected?

- Expected: rules file or settings merge
- Actual: [TBD]
- Adapter step needed: [...]

## 5. Build step needed?

- Expected: no (plain JS like Claude/Lingma)
- Actual: [TBD]

## 6. Reference implementations

- [Link to official KiloCode plugin example 1]
- [Link to official KiloCode plugin example 2]

## 7. Adapter sketch (fill after research)

```js
export class KiloCodeAdapter extends HostAdapter {
  static id = 'kilocode';
  static displayName = 'KiloCode';

  static isInstalled() { /* fill based on §1 */ }
  static preflight(ctx) { /* fill */ }
  static async install(ctx) {
    // Step 1: ...
    // Step 2: ...
    // (based on §2, §3, §4, §5)
  }
  static async uninstall(ctx) { /* fill */ }
}
```

## 8. Estimated adapter size

- [ ] ≤ 150 lines → abstraction is good
- [ ] 150-200 lines → acceptable, KiloCode is genuinely more complex
- [ ] > 200 lines → abstraction needs revisiting
```

- [ ] **Step 2: Research**

Spend 1-2 days investigating:
- KiloCode official documentation
- KiloCode plugin marketplace examples
- KiloCode GitHub issues related to plugin development
- Reference implementations (find 2-3 real KiloCode plugins and read their source)

Fill in sections 1-7 of the research doc.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "[OMS08] docs(kilocode): research notes on KiloCode plugin model

Documents answers to:
- Where plugins are installed
- How skills/hooks are registered
- How baseline is injected
- Whether build step is needed
- Reference implementations

This research informs the KiloCodeAdapter implementation in Task 2.2."
```

### Task 2.2: Implement KiloCodeAdapter

**Files:**
- Create: `install/hosts/kilocode-adapter.js`
- Test: `__tests__/unit/install/hosts/kilocode-adapter.test.js`
- Modify: `__tests__/unit/install/hosts/adapter-consistency.test.js` (add KiloCode to ALL_ADAPTERS)

**Interfaces:**
- Consumes: `HostAdapter`, `install/common/*`, research notes from Task 2.1
- Produces: `KiloCodeAdapter` class

- [ ] **Step 1: Write failing test (same shape as other adapters)**

```js
// __tests__/unit/install/hosts/kilocode-adapter.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KiloCodeAdapter } from '../../../../install/hosts/kilocode-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

describe('KiloCodeAdapter', () => {
  it('extends HostAdapter', () => {
    assert.equal(Object.getPrototypeOf(KiloCodeAdapter), HostAdapter);
  });

  it('has id = "kilocode"', () => {
    assert.equal(KiloCodeAdapter.id, 'kilocode');
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof KiloCodeAdapter.isInstalled(), 'boolean');
  });

  it('install() is async', () => {
    assert.equal(KiloCodeAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is async', () => {
    assert.equal(KiloCodeAdapter.uninstall.constructor.name, 'AsyncFunction');
  });
});
```

- [ ] **Step 2: Add KiloCode to adapter-consistency.test.js**

Open `__tests__/unit/install/hosts/adapter-consistency.test.js`, add to `ALL_ADAPTERS`:

```js
{ name: 'KiloCode', Adapter: KiloCodeAdapter, expectedId: 'kilocode' },
```

And the import:
```js
import { KiloCodeAdapter } from '../../../../install/hosts/kilocode-adapter.js';
```

- [ ] **Step 3: Run tests to verify they fail**

Expected: FAIL (KiloCodeAdapter doesn't exist yet).

- [ ] **Step 4: Implement KiloCodeAdapter based on research**

Using the research notes from Task 2.1, create `install/hosts/kilocode-adapter.js`. The structural shape is fixed (class extending HostAdapter with the standard methods); the method bodies depend on research findings.

General template:

```js
// install/hosts/kilocode-adapter.js — KiloCode adapter.
//
// Implementation based on research notes at:
// docs/superpowers/research/YYYY-MM-DD-kilocode-plugin-model.md
//
// [Fill in KiloCode-specific logic here]

import { HostAdapter } from '../host-adapter.js';
// ... other imports based on research ...

export class KiloCodeAdapter extends HostAdapter {
  static id = 'kilocode';
  static displayName = 'KiloCode';

  static isInstalled() { /* per research §1 */ }
  static preflight(ctx) { /* per research */ }

  static async install(ctx) {
    // Per research §2, §3, §4, §5:
    // Step 1: ...
    // Step 2: ...
    // (fill in actual logic)
  }

  static async uninstall(ctx) { /* mirror of install, reversed */ }
}
```

**Fill in the method bodies using research findings.**

- [ ] **Step 5: Validate size**

Run:
```bash
wc -l install/hosts/kilocode-adapter.js
```

Expected: ≤ 150 lines. If > 200 lines, note in the research doc (§8) and consider whether any logic can be promoted to `install/common/`. If 150-200 lines, acceptable but note that KiloCode is genuinely more complex.

- [ ] **Step 6: Run tests**

Run: `node --test __tests__/unit/install/hosts/kilocode-adapter.test.js`

Expected: 5 tests pass.

Run: `node --test __tests__/unit/install/hosts/adapter-consistency.test.js`

Expected: 32 tests pass (8 tests × 4 adapters).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "[OMS09] feat(install): add KiloCode adapter

- install/hosts/kilocode-adapter.js: new adapter implementing HostAdapter
- Implementation based on research at docs/superpowers/research/...
- Adapter consistency test now covers 4 adapters (Claude, Lingma, OpenCode, KiloCode)
- Size: [N] lines (≤ 150 target met / not met — see research doc §8)"
```

### Task 2.3: Register KiloCode adapter + e2e smoke test

**Files:**
- Modify: `install/host-registry.js` (add 1 line)
- Test: run e2e smoke test manually

**Interfaces:**
- Consumes: KiloCodeAdapter from Task 2.2
- Produces: working `oms-install --tool kilocode` flow

- [ ] **Step 1: Register KiloCode in the registry**

Open `install/host-registry.js` and:

1. Add import at the top:
```js
import { KiloCodeAdapter } from './hosts/kilocode-adapter.js';
```

2. Add entry to REGISTRY:
```js
const REGISTRY = new Map([
  ['claude',   ClaudeAdapter],
  ['lingma',   LingmaAdapter],
  ['opencode', OpenCodeAdapter],
  ['kilocode', KiloCodeAdapter],   // ← added
]);
```

- [ ] **Step 2: Update tests that enumerate tools**

`__tests__/unit/install/host-registry.test.js` — update `listTools()` assertion:

```js
it('listTools returns all registered tool ids', () => {
  const tools = listTools();
  assert.deepEqual(tools.sort(), ['claude', 'kilocode', 'lingma', 'opencode']);
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 4: E2E smoke test (manual)**

In a clean environment (fresh VM or sandboxed dir):

```bash
node install.js --tool kilocode
```

Expected: install completes with KiloCode-specific progress messages.

If KiloCode is not actually installed on the machine, the preflight warning should appear but installation should still proceed (consistent with other adapters).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "[OMS10] feat(install): register KiloCode adapter in host-registry

Adding KiloCode now requires:
- 1 import line in host-registry.js
- 1 registry entry

E2E smoke test verified."
```

### Task 2.4: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add KiloCode to supported tools list**

Open `README.md`, find the "supported tools" section, add KiloCode.

- [ ] **Step 2: Add KiloCode install instructions**

Example section to add:

```markdown
### KiloCode

```bash
oms-install --tool kilocode
# or
oms-install  # auto-detect if KiloCode is the only host installed
```
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "[OMS11] docs(readme): add KiloCode to supported tools

Phase 2 complete. 4 hosts now supported via HostAdapter abstraction."
```

**Phase 2 complete.**

---

## Phase 3: Platform-ization

### Task 3.1: Publish script simplification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Review current scripts**

Run:
```bash
node -e "console.log(JSON.stringify(require('./package.json').scripts, null, 2))"
```

- [ ] **Step 2: Update scripts**

Per spec §9.1, converge to:

```json
"scripts": {
  "build": "npm run lint:baseline && npm test",
  "build:opencode": "cd opencode && npm install && npx tsc",
  "publish:opencode": "cd opencode && npm publish",
  "prepublishOnly": "npm run build && npm run build:opencode",
  "test": "node --test",
  "lint:baseline": "node scripts/check-baseline-tokens.mjs"
}
```

Delete: `build:all`, `install:opencode` (merged into `build:opencode`).

- [ ] **Step 3: Update docs that reference removed scripts**

```bash
grep -rn "build:all\|install:opencode" --include="*.md" . | grep -v node_modules
```

Update each reference to use `build:opencode` instead.

- [ ] **Step 4: Verify**

Run:
```bash
npm run build
npm run build:opencode
```

Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "[OMS12] chore(package): simplify build/publish scripts

Converged to 3 build commands:
- build: lint + test (main package)
- build:opencode: TS compile (opencode sub-package)
- publish:opencode: publish opencode sub-package

Removed: build:all (redundant), install:opencode (merged into build:opencode)"
```

### Task 3.2: Implement ClaudeAdapter.uninstall()

**Files:**
- Modify: `install/hosts/claude-adapter.js`
- Test: `__tests__/unit/install/hosts/claude-adapter.test.js` (add uninstall test)

- [ ] **Step 1: Add failing test for uninstall**

In `__tests__/unit/install/hosts/claude-adapter.test.js`, add:

```js
it('uninstall() is overridden (not the default no-op)', async () => {
  // Check that ClaudeAdapter.uninstall is a different function than HostAdapter.uninstall
  assert.notEqual(ClaudeAdapter.uninstall, HostAdapter.uninstall);
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL (ClaudeAdapter.uninstall === HostAdapter.uninstall currently).

- [ ] **Step 3: Implement uninstall in claude-adapter.js**

Add to `ClaudeAdapter` class:

```js
static async uninstall(ctx) {
  ctx.announce('→ 卸载 Claude Code 适配');

  // 1. Uninstall plugin via claude CLI
  const result = await this.#runClaude(['plugin', 'uninstall', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (!out.includes('not installed') && !out.includes('not found')) {
      ctx.announce(`  ⚠️  claude plugin uninstall 失败 (exit ${result.code})`);
    }
  } else {
    ctx.announce(`  ✓ 已卸载 plugin: ${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
  }

  // 2. Remove wrapper
  const { uninstallWrapper } = await import('../../wrapper/wrapper.js');
  await uninstallWrapper(ctx.announce);
}
```

- [ ] **Step 4: Run test**

Expected: test passes.

- [ ] **Step 5: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "[OMS13] feat(install): implement ClaudeAdapter.uninstall()

Restores symmetry with LingmaAdapter and OpenCodeAdapter:
- Uninstalls plugin via `claude plugin uninstall`
- Removes Claude CLI wrapper via wrapper.js's uninstallWrapper()

Phase 1 TODO resolved."
```

### Task 3.3: CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Create CONTRIBUTING.md with 4 extension scenarios**

Write `CONTRIBUTING.md` covering:

1. How to add a new host adapter (with KiloCode as example)
2. How to add a new enterprise rule (HARD_RULE/SOFT_RULE)
3. How to add a new skill
4. How to modify the baseline

Plus a "Stable API vs Internal" section (Task 3.4).

Draft content:

```markdown
# Contributing to oh-my-sdd

Thank you for contributing! This guide covers the 4 most common extension scenarios.

## Stable API vs Internal Implementation

**Stable API (SemVer-protected, do not break without MAJOR bump):**
- `HostAdapter` interface (`install/host-adapter.js`)
- 5 hook event names declared in `hooks/hooks.json`
- `content/enterprise-baseline.md` frontmatter schema
- `skills/*/SKILL.md` frontmatter schema
- `bin/oms-*.js` CLI argument surface

**Internal (may change between MINOR/PATCH releases):**
- Everything in `lib/`
- Everything in `install/common/`
- Internal structure of `wrapper/`
- Internal structure of individual adapter files

## 1. Adding a New Host Adapter

The easiest way to understand: look at `install/hosts/kilocode-adapter.js`.

### Steps:

1. **Create** `install/hosts/<yourhost>-adapter.js`:

```js
import { HostAdapter } from '../host-adapter.js';

export class YourHostAdapter extends HostAdapter {
  static id = 'yourhost';
  static displayName = 'Your Host Name';

  static isInstalled() { /* return boolean */ }
  static preflight(ctx) { /* optional: print warnings */ }
  static async install(ctx) { /* your install logic */ }
  static async uninstall(ctx) { /* optional: cleanup */ }
}
```

2. **Register** in `install/host-registry.js`:

```js
import { YourHostAdapter } from './hosts/yourhost-adapter.js';

const REGISTRY = new Map([
  // ... existing entries ...
  ['yourhost', YourHostAdapter],
]);
```

3. **Add to** `__tests__/unit/install/hosts/adapter-consistency.test.js`:

```js
{ name: 'YourHost', Adapter: YourHostAdapter, expectedId: 'yourhost' },
```

4. **Run tests:** `npm test`

5. **Update README.md** supported tools list.

**Target:** ≤ 150 lines for the adapter file. If you exceed 200 lines, the abstraction may need revisiting — consider promoting helpers to `install/common/`.

## 2. Adding a New Enterprise Rule (HARD_RULE/SOFT_RULE)

See `skills/sdd-constitution/SKILL.md` for the full SemVer bump process. Quick version:

1. Edit `content/enterprise-baseline.md` to add the rule.
2. Update `oms_version` in frontmatter.
3. Add a Sync Impact Report block.
4. Update `hooks/lib/rules.js` if the rule needs runtime enforcement.
5. Run `npm run lint:baseline` to verify token budget (≤ 1000 tokens).
6. Run `npm test` — the `pre-tool-use.test.js` suite covers rule enforcement.

## 3. Adding a New Skill

Skills live in `skills/<skill-name>/SKILL.md` (plus optional `scripts/` subdirectory).

1. Create `skills/<skill-name>/SKILL.md` with required frontmatter.
2. If the skill needs helper scripts, put them in `skills/<skill-name>/scripts/` (NOT using `${CLAUDE_SKILL_DIR}`; use relative paths).
3. Reference from other skills via the superpowers skill convention.

## 4. Modifying the Baseline

See `skills/sdd-constitution/SKILL.md`. The baseline is versioned and has a ≤ 1000 token budget (body, after stripping frontmatter + Sync Impact Report).

## Commit Format

All commits must follow: `[<change-id>] <type>: <subject>`

- `change-id`: `^[A-Z]{2,6}\d+$` (format-only validation)
- `type`: Conventional Commits (feat/fix/docs/refactor/test/chore) + SDD ring (spec/plan/task/review)

Example: `[OMS14] feat(install): add new host adapter`
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "[OMS14] docs: add CONTRIBUTING.md

Covers 4 common extension scenarios:
1. Adding a new host adapter (with KiloCode as example)
2. Adding a new enterprise rule
3. Adding a new skill
4. Modifying the baseline

Plus stable API vs internal implementation declaration."
```

### Task 3.4: Stable API declaration

This is actually included in CONTRIBUTING.md (Task 3.3). If you want it in a separate file, create `docs/STABLE-API.md` and link from CONTRIBUTING.md.

**Decision:** keep it in CONTRIBUTING.md for now. If contributors complain about discoverability, extract later.

No separate task needed.

### Task 3.5: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: all tests pass (should be ~380+ tests by now).

- [ ] **Step 2: Run lint:baseline**

Run: `npm run lint:baseline`

Expected: pass.

- [ ] **Step 3: Verify install flow for each host**

```bash
node install.js --tool claude 2>&1 | head
node install.js --tool lingma 2>&1 | head
node install.js --tool opencode 2>&1 | head
node install.js --tool kilocode 2>&1 | head
```

Expected: each shows the adapter's preflight/install output with no errors.

- [ ] **Step 4: Verify npm pack**

Run: `npm pack --dry-run 2>&1 | tail`

Expected: tarball includes `hooks/`, `lib/`, `install/`, `wrapper/`, `bin/`, `content/`, `skills/`, `install.js`. Does NOT include `baseline/`, `scaffolding/`, `wrappers/`, `hooks/lib/`.

- [ ] **Step 5: Commit (if any final tweaks)**

```bash
git add -A
git commit -m "[OMS15] chore: final verification for platform refactor

All 4 phases complete:
- Phase 0: 9 top-level directories
- Phase 1: HostAdapter abstraction
- Phase 2: KiloCode adapter
- Phase 3: CONTRIBUTING.md + publish script cleanup

Tests: all passing.
External behavior: unchanged from pre-refactor."
```

---

## Self-Review Notes

After writing this plan, I verified:

1. **Spec coverage:**
   - Phase 0 (directory restructure): Tasks 0.1-0.6 ✓
   - Phase 1 (HostAdapter abstraction): Tasks 1.1-1.7 ✓
   - Phase 2 (KiloCode validation): Tasks 2.1-2.4 ✓
   - Phase 3 (platform-ization): Tasks 3.1-3.3, 3.5 ✓
   - Stable API declaration: Task 3.3 (embedded in CONTRIBUTING.md) ✓
   - Claude uninstall: Task 3.2 ✓
   - Publish script simplification: Task 3.1 ✓

2. **Placeholder scan:**
   - Phase 2 Task 2.2 explicitly defers implementation details to research notes from Task 2.1. This is a documented, intentional deferral (not a plan failure) — the spec itself says "research first, then implement".
   - OpenCode adapter private method bodies marked with `/* ... */` in Task 1.5 Step 3: implementer should copy verbatim from the existing `install/hosts/opencode-adapter.js` file. This is a "reference the source file" instruction, not a placeholder.

3. **Type consistency:**
   - `HostAdapter` is consistently named throughout
   - `HostAdapter.id`, `HostAdapter.displayName`, `HostAdapter.isInstalled()`, `HostAdapter.preflight(ctx)`, `HostAdapter.install(ctx)`, `HostAdapter.uninstall(ctx)` — consistent signatures across all adapters
   - `ctx = {PACKAGE_ROOT, announce}` — consistent throughout
   - `getAdapter(tool)`, `listTools()`, `detectDefault()` — consistent in registry and main.js

No issues found requiring inline fixes.

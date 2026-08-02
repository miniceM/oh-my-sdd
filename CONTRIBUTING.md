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

3. **Tests auto-discovered** — the adapter-consistency test (`__tests__/unit/install/hosts/adapter-consistency.test.js`) dynamically iterates `listTools()` + `getAdapter()`, so your new adapter is automatically tested (7 assertions per adapter).

4. **Run tests:** `npm test`

5. **Update README.md** supported tools list.

**Target:** <= 150 lines for the adapter file. If you exceed 200 lines, the abstraction may need revisiting — consider promoting helpers to `install/common/`.

## 2. Adding a New Enterprise Rule (HARD_RULE/SOFT_RULE)

See `skills/sdd-constitution/SKILL.md` for the full SemVer bump process. Quick version:

1. Edit `content/enterprise-baseline.md` to add the rule.
2. Update `oms_version` in frontmatter.
3. Add a Sync Impact Report block.
4. Update `lib/rules.js` if the rule needs runtime enforcement.
5. Run `npm run lint:baseline` to verify token budget (<= 1000 tokens).
6. Run `npm test` — the `pre-tool-use.test.js` suite covers rule enforcement.

## 3. Adding a New Skill

Skills live in `skills/<skill-name>/SKILL.md` (plus optional `scripts/` subdirectory).

1. Create `skills/<skill-name>/SKILL.md` with required frontmatter.
2. If the skill needs helper scripts, put them in `skills/<skill-name>/scripts/` (NOT using `${CLAUDE_SKILL_DIR}`; use relative paths).
3. Reference from other skills via the superpowers skill convention.

## 4. Modifying the Baseline

See `skills/sdd-constitution/SKILL.md`. The baseline is versioned and has a <= 1000 token budget (body, after stripping frontmatter + Sync Impact Report).

## Commit Format

All commits must follow: `[<change-id>] <type>: <subject>`

- `change-id`: `^[A-Z]{2,6}\d+$` (format-only validation)
- `type`: Conventional Commits (feat/fix/docs/refactor/test/chore) + SDD ring (spec/plan/task/review)

Example: `[OMS14] feat(install): add new host adapter`

# Issue 57: Windows resource sync under persistent directory locks

## Problem

On enterprise Windows workstations, `npm run test` can fail while
`opencode/scripts/copy-resources.mjs` atomically replaces an existing resource
directory. Windows returns `EPERM`, `EBUSY`, or `EACCES` when Defender, Search
Indexer, an editor, or another process temporarily holds a directory handle.
The current retry window is bounded at roughly two seconds. The local test
suite and GitHub Actions Windows runner do not reproduce the failure because
they do not provide the same long-lived monitoring processes or repository
location characteristics.

## Constitution Check

- Preserve the current atomic staging/backup replacement model.
- Do not disable or bypass enterprise security software.
- Keep failures explicit and diagnosable; never silently publish a partial
  resource tree.
- Add deterministic tests before changing production behavior.

## Design

### 1. Skip unnecessary replacements

Before creating staging content, compare the filtered source tree with the
existing destination. If they are equivalent, return without renaming the
destination. This avoids taking a directory rename lock during repeated
`npm test`, `npm pack`, and lifecycle runs when the generated mirror is already
current.

The comparison includes copied file paths and bytes and ignores the existing
resource exclusion list. If the destination is missing or cannot be compared,
the synchronizer falls back to the existing staging path rather than treating
an incomplete comparison as success.

### 2. Use a bounded retry deadline for real replacements

Keep staging and atomic replacement for changed trees. Centralize transient
rename handling behind a retry helper with an explicit total deadline and
short increasing delays. Retry only `EPERM`, `EBUSY`, and `EACCES`; propagate
other errors immediately. The options object remains injectable so tests can
use short deadlines without slowing the suite.

When the deadline expires, retain the last complete destination and include
the operation (`destination-to-backup`, `staging-to-destination`, or restore),
paths, error code, attempt count, and elapsed time in the thrown error/log.

### 3. CI and test contracts

Add regression coverage for:

- an equivalent destination that must not call `renameSync`;
- changed destinations that recover from transient Windows errors;
- a persistent lock that reaches the injected deadline and preserves the old
  destination with diagnostic context;
- repeated synchronization of an already materialized tree.

Keep the existing Linux/macOS/Windows matrix and add a CI contract assertion
that the OpenCode resource synchronization path is exercised twice against an
existing destination. CI cannot reproduce every enterprise EDR behavior, so
the persistent-lock case remains deterministic through injected filesystem
operations.

## Alternatives considered

1. Increase the existing fixed retry count. This is small but still performs
   unnecessary replacements and has no principled deadline or diagnostics.
2. Copy and delete in place on Windows. This avoids the directory rename but
   can leave a partially synchronized tree and violates the atomic replacement
   guarantee.
3. Compare first, then retain atomic replacement with deadline-based retries.
   This is the selected design because it removes the common no-op failure path
   while preserving safety for real changes.

## Success criteria

- An unchanged source/destination pair performs no directory rename.
- A transient Windows-style lock is retried and eventually succeeds.
- A persistent lock fails after the configured deadline without destroying the
  previous complete destination, and the error identifies the failed step.
- `npm test`, `npm run lint:baseline`, and the targeted OpenCode tests pass on
  the supported platforms.
- The PR links Issue 57 and documents why the public CI runner did not expose
  the enterprise workstation failure.

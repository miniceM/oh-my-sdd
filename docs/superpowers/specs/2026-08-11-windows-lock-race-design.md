# Windows lock-race handling design

## Context

CI job `test (windows-latest, 20)` fails when a destination lock is removed between the failed lock-directory creation and the metadata inspection. Windows can report `EPERM` from `statSync` during this release window. `reclaimStaleLock` currently rethrows that error, so `withSyncLock` stops instead of retrying.

## Decision

Treat `EPERM` from the initial lock metadata observation as an indeterminate, still-contended lock. `reclaimStaleLock` returns `false`; `withSyncLock` then follows its existing bounded polling path and attempts acquisition again. It neither deletes nor renames the lock in this state.

## Safety and verification

The behavior preserves the existing live-owner and stale-owner checks. A deterministic unit test removes the test lock while an injected metadata read throws `EPERM`, then verifies the sync operation eventually runs and removes its own lock. The relevant test file and the full suite must pass.

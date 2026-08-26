# OpenCode runtime probe design

## Goal

Make OpenCode doctor unit tests deterministic without weakening the production
activation-evidence checks, and retain a real installation/lifecycle test as
the integration boundary.

## Decision

The adapter will obtain activation evidence through an explicit runtime probe.
The default probe preserves the production behaviour: read the activation
record, locate the globally installed npm plugin, and compare its resource
digest. Unit tests will provide a deterministic probe result instead of
spawning a child process and shadowing `npm` through `PATH`.

## Boundaries

- The runtime probe owns activation-record validation and reports either valid
  evidence or an evidence-unavailable reason.
- `OpenCodeAdapter.inspectRuntime()` owns translating that evidence into
  `loaded`, `enforced`, and postinstall health states.
- Unit tests exercise the translation with injected probe results.
- The existing real OpenCode E2E path continues to exercise the default probe,
  npm installation, resource bootstrap, and host activation together.

## Error handling

The default probe remains fail-closed: an unreadable activation record, a
failed npm lookup, a missing installed package, or a digest mismatch produces
unknown runtime evidence with its diagnostic reason. The probe must not claim
runtime loading or write prevention from plugin registration alone.

## Acceptance checks

- A valid injected activation proves `loaded`; the write-before hook proves
  `enforced`.
- Missing write-before evidence leaves only `enforced` unknown.
- Digest, timestamp, schema, and degraded-resource cases remain covered.
- Unit tests do not require a fake npm executable, shell launcher, or PATH
  override.
- A real-install test still covers the default probe path.

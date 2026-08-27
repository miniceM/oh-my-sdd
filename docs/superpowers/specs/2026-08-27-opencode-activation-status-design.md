# OpenCode activation status design

## Goal

Make `oms status --tool opencode` report the actual OpenCode HARD_RULE
enforcement state reliably. A normal package rebuild or reinstall must not
downgrade valid loaded/enforced evidence merely because package contents have
changed after activation was recorded.

## Current behaviour and source facts

- `opencode/scripts/postinstall.mjs` calls `bootstrapOpenCodeResources()` with
  no hook list, so its activation record has `registered_hooks: []`.
- The runtime plugin passes its actual hooks, including `tool.execute.before`,
  to the same bootstrap function. A later postinstall can overwrite that
  runtime evidence with the empty list.
- `inspectOpenCodeActivation` currently recomputes a digest of the globally
  installed package root. Build products and dependencies can legitimately
  change after activation, causing an otherwise valid record to be rejected.
- `OpenCodeAdapter.inspectRuntime` always supplies the missing-hook reason
  whenever activation is active, even when `tool.execute.before` is present.

## Selected design

1. Define the known OpenCode plugin hook list in the resource-bootstrap
   module, with `tool.execute.before` included. `bootstrapOpenCodeResources`
   uses that list when no caller supplies a runtime list. Runtime activation
   still supplies `Object.keys(hooks)`, preserving runtime truth when it is
   available.
2. Keep `resource_digest` in the activation schema for compatibility and
   diagnostics, but stop treating a changed package-root digest as failure of
   activation evidence. Schema, timestamp, resource state, and non-empty hook
   list remain validation requirements.
3. Make the enforced reason conditional: it is absent when the write-before
   hook is verified, and explains the missing hook only when it is absent.

## Data flow

`npm postinstall` and OpenCode runtime activation both call the shared
bootstrap function. The bootstrap writes a schema-v1 activation record with a
non-empty hook list. `oms status` validates that record and uses the hook list
to report `loaded` and `enforced`; a package-content change no longer alters
those runtime evidence fields.

## Error handling and compatibility

Malformed records, expired/future timestamps, missing required fields, missing
or invalid hook arrays, and failed resources remain invalid activation
evidence. Resource drift remains a separate degraded/postinstall finding and
does not by itself downgrade loaded evidence. No activation-record schema
migration is required.

## Tests

- Add a bootstrap test proving postinstall-default activation contains the
  write-before hook.
- Update activation-probe tests so digest drift retains verified loaded and
  enforced evidence.
- Add direct `inspectOpenCodeActivation` coverage for a digest mismatch and an
  empty hook list, using an injected npm-root command.
- Assert verified enforcement carries no contradictory reason text.

## Scope

This changes only OpenCode activation evidence and its status presentation. It
does not alter HARD_RULE execution, plugin registration, resource ownership,
or the activation-record schema version.

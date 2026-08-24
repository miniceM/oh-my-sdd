# Issue #70: Complete the text installation closure

## Goal

Make `oms-install --tool opencode --yes` text output explain every deferred
resource and every postflight layer, so a successful-but-pending installation
is actionable and semantically consistent with JSON output.

## Acceptance-driven design

1. Human-readable result output includes deferred terminal events with host,
   resource path/id, phase, owner, status, reason, and next action.
2. Postinstall is rendered as its own evidence layer. A pending npm lifecycle
   reports the missing paths/checks and how to start/retry the lifecycle.
3. Runtime `loaded` and `enforced` remain `unknown` when there is no host
   evidence, with explicit reasons/evidence rather than an implied success.
4. Text counts and statuses use the same event/layer data as JSON; deferred is
   not counted as failure.
5. The next action includes the copyable `oms doctor --tool opencode` command
   and explains when to start/retry OpenCode/npm lifecycle work.
6. A real temporary-`HOME` OpenCode CLI integration test covers the text
   result, pending/deferred state, paths/reason, next action, and exit code.

## Implementation slices

- `install/control-plane/render.js`: render deferred events and postinstall
  evidence; include deferred counts and event next actions.
- `install/main.js`: expose postinstall in the shared `summary.layers` and
  merge postflight next actions so text and JSON consume the same model.
- `install/hosts/opencode-adapter.js`: provide evidence fields for pending and
  unknown runtime layers and keep the actionable doctor command copyable.
- Unit/integration tests: update the old deferred-hidden expectation and add a
  real temp-home `oms-install` text integration assertion.

## Verification

Run the focused renderer, installer, adapter, doctor, and OpenCode integration
tests first; then run `npm test`, `npm run lint:baseline`, `git diff --check`,
and inspect the staged diff before pushing the Issue branch.

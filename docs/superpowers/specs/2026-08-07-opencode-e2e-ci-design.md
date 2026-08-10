# OpenCode Plugin CI E2E Design

## Goal

Before publishing the OpenCode npm package to the enterprise registry, GitHub Actions must detect failures in the real user installation path:

1. A user installs the plugin package globally with npm.
2. OpenCode CLI starts and loads the exact plugin files from that tarball.
3. Every published `sdd-*` command is discoverable.
4. Every published project skill is available.
5. Hooks allow safe operations and block forbidden operations with a useful message.

The test runs against the real OpenCode CLI downloaded from the public npm registry. Enterprise-only `iam` and `dop` commands are replaced by repository mocks.

## Scope And Non-Goals

In scope:

- The packaged `opencode` npm artifact, installed globally into an isolated prefix.
- OpenCode CLI startup, explicit local-plugin loading, and non-interactive machine-readable behavior.
- Command and skill discovery from the installed user configuration.
- Positive and negative hook behavior through the OpenCode plugin runtime.
- Linux, macOS, and Windows GitHub-hosted runners.

Out of scope:

- Model quality or generated agent responses. A local scripted OpenAI-compatible server is used only to drive deterministic tool calls; no provider credential or live model is used.
- Enterprise registry publication itself.
- Real IAM authentication or DOP telemetry delivery.
- Testing every OpenCode version; CI uses a configurable pinned/default version.

## Test Isolation

Each E2E process receives a fresh temporary directory for:

- `HOME` and `USERPROFILE`.
- npm global prefix and cache.
- OpenCode configuration, cache, data, and state directories, selected with `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, and the temporary home.
- A temporary project workspace.
- Hook and plugin logs.

The repository mock directory is prepended to `PATH`. `OMS_MOCK_USER=ci` is accepted by the mock as a shorthand for both IAM identities. Windows resolves `iam.cmd` and `dop.cmd`, which delegate to the bundled Bash mocks on GitHub-hosted runners. No real IAM, DOP, npm enterprise registry, or model provider is contacted.

The test must never write to the developer's real home directory or use the enterprise npm registry for the package under test.

## Installation Flow

1. Run `npm ci --prefix opencode` so the package's release lifecycle has its declared build dependencies.
2. Run `npm pack --json --pack-destination <packDir>` in `opencode/`; lifecycle scripts are deliberately enabled.
3. Inspect the resulting tarball manifest and install it globally with `npm install --global --foreground-scripts <tarball>` using the temporary prefix.
4. Assert the postinstall summary has no failures and that commands, OMS skills, delegated skills, and the ownership manifest exist below the temporary home.
5. Resolve the installed package root with `npm root --global`, then create a temporary OpenCode local-plugin loader which re-exports `OhMySddPlugin` from that installed `dist/index.js`. This is the only plugin loaded by the test; it avoids OpenCode downloading the package by name through Bun.
6. Write an isolated OpenCode config that points to the local loader and a local scripted provider, then install the pinned real OpenCode CLI from the public registry in the same prefix.
7. Start the real CLI in the temporary project, execute commands and scripted tool calls, and capture stdout, stderr, exit code, server transcript, and plugin logs.

The test must use the package tarball, not the source directory, so missing `files`, build output, lifecycle scripts, or executable metadata fail before publication.

## Discovery Contracts

### Commands

The expected command set is derived from the tarball's `.opencode/commands/sdd-*.md` contract, not an unrelated test-only list. Every expected file must be installed below the temporary OpenCode command root and be invoked through `opencode run --format json --command <name>`. The test must not depend on an undocumented command-list event.

The governance invariant is explicit: `sdd-constitution` must not be exposed.

### Skills

The expected skill set is derived from `opencode/oms-skills/*/SKILL.md` and the package's allowlist. Every expected skill directory must exist below the isolated OpenCode user skill root and contain a readable `SKILL.md`. Forbidden or non-published skills must not be copied.

### Hooks

The E2E suite uses a local scripted OpenAI-compatible provider to make the real CLI request one declared tool at a time. The provider transcript is asserted so the test proves that OpenCode invoked the actual installed plugin runtime, not a directly imported handler. It exercises:

- Safe command/tool input is allowed.
- Hard-rule AWS/OpenAI key patterns are denied.
- Direct `.env` edits are denied.
- Destructive `rm -rf /` forms are denied.
- Force push to protected branches is denied.
- Hook failure is fail-closed and emits a diagnostic message.

Assertions should use structured OpenCode/plugin results where available, and retain stderr/log checks only for diagnostic text that is not exposed structurally.

## CI Matrix

Add a dedicated `opencode-e2e` workflow job matrix for `ubuntu-latest`, `macos-latest`, and `windows-latest`, using Node 22 and one explicit `OPENCODE_VERSION`. The existing normal suite continues to cover Node 18/20/22. The job installs OpenCode from public npm and runs:

```text
npm run test:e2e:opencode
```

The test is opt-in in local development via `OMS_OPENCODE_E2E=1`, but enabled unconditionally by the CI job. `OPENCODE_PACKAGE=opencode-ai` and `OPENCODE_VERSION` are both explicit CI inputs. On failure, upload captured OpenCode/plugin/hook logs, the scripted-provider transcript, tarball manifest, and serialized test summary as artifacts.

## Failure Handling

- A missing OpenCode executable, malformed startup response, missing command, missing skill, or unexpected allow/deny result fails the job.
- A failed enterprise mock, missing Windows `.cmd` shim, or unexpected mock identity is a test failure, not a reason to silently skip.
- Cleanup runs in a `finally` path on all platforms.
- Windows process termination and path handling use Node APIs; shell-specific commands are avoided.
- The failure message includes the OS, Node version, OpenCode version, package tarball, and relevant log paths.

## Verification

The implementation will add focused helper/unit coverage for discovery and process parsing, then run:

```text
npm test
npm run lint:baseline
npm run test:e2e:opencode
```

The E2E command is expected to be skipped outside an explicit E2E/CI environment so the normal test suite remains deterministic and does not download OpenCode.

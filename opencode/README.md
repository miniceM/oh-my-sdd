# oh-my-sdd for OpenCode

OpenCode adapter for the oh-my-sdd enterprise SDD workflow.

## Install from this repository

```bash
cd opencode
npm install -g --foreground-scripts .
```

The package installs OMS skills and commands into OpenCode's global discovery
directories. It also bundles the pinned Superpowers workflow skills required by
`/sdd-plan`, `/sdd-apply`, and `/sdd-review`.

## Configure OpenCode

Register the npm plugin in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@cli-tools/oh-my-sdd-opencode"]
}
```

If `plugin` already contains other entries, keep them and append the package name.
Running `oms-install --tool opencode` from the main `@cli-tools/oh-my-sdd` package
updates this configuration automatically.

## Installed resources

The postinstall script copies only package-owned resources and records their
digests in `~/.oh-my-sdd/opencode-npm-resources.json`:

- OMS and delegated skills: `~/.config/opencode/skills/<skill>/SKILL.md`
- OpenCode commands: `~/.config/opencode/commands/sdd-*.md`
- Enterprise baseline: `~/.config/opencode/AGENTS.md` (one oh-my-sdd-managed block)
- Cross-tool skill mirror: `~/.agents/skills/<skill>/SKILL.md`
- Cross-tool command mirror: `~/.agents/command/sdd-*.md`

Existing resources are backed up before replacement. A later uninstall restores
those backups, while resources modified after installation are preserved.
The baseline block is maintained separately so user-authored `AGENTS.md` content
outside the sentinel remains untouched. Reinstalling updates the same block
without duplication.

## Use the commands

Restart OpenCode after installation, then invoke an SDD command with its arguments:

```text
/sdd-spec add-payment-retry
/sdd-plan add-payment-retry
/sdd-apply add-payment-retry
/sdd-review add-payment-retry
```

The package also provides `/sdd-task` and `/sdd-doc`.

## Diagnose installation

Run the postinstall script again when checking discovery paths:

```bash
npm install -g --foreground-scripts .
```

Its output reports OMS skills, delegated skills, and commands separately. A clean
installation currently contains 17 OMS skills, 8 delegated workflow skills, and
6 commands in each configured target. Repeated installation should report them as
`unchanged`; any `preserved` or `failed` count is accompanied by a warning that
identifies the affected resource.

## Uninstall

```bash
oms-opencode-uninstall
```

Use this command instead of plain `npm uninstall -g`. Modern npm does not run
uninstall lifecycle scripts; the wrapper removes the global npm package and, only
after that succeeds, removes or restores resources recorded in the ownership
manifest and removes the oh-my-sdd baseline block. A failed npm uninstall
therefore leaves the installed resources intact.

If npm removal succeeds but resource cleanup reports an error, reinstall the same
package version and rerun the supported uninstaller; the ownership manifest keeps
the remaining cleanup work resumable:

```bash
npm install -g @cli-tools/oh-my-sdd-opencode@0.2.1
oms-opencode-uninstall
```

# oh-my-sdd for OpenCode

`@cli-tools/oh-my-sdd-opencode` is the native npm plugin package for the
oh-my-sdd enterprise SDD workflow in OpenCode. Its OMS Markdown resource source
of truth remains `packages/product/skills` and `packages/product/content`; the
product workspace also supplies the plugin runtime resources in
`packages/product/hooks` and `packages/product/lib`.

## Install and configure

Install the published plugin globally:

```bash
npm install -g @cli-tools/oh-my-sdd-opencode
```

For a checkout, first refresh the package mirrors from the product workspace,
then install this workspace explicitly:

```bash
npm run sync:opencode
npm install -g --foreground-scripts ./packages/opencode-plugin
```

Register the npm plugin in OpenCode's configuration (preserve any existing
plugins):

```json
{
  "plugin": ["@cli-tools/oh-my-sdd-opencode"]
}
```

The configuration file is normally `~/.config/opencode/opencode.json`. Running
`oms-install --tool opencode` from `@cli-tools/oh-my-sdd` can manage that entry
for you.

## Resources and discovery

`npm run sync:opencode` is the repository sync boundary. It copies the product's
OMS Markdown sources and runtime resources into the package:

- `packages/product/skills` → `packages/opencode-plugin/skills`,
  `oms-skills`, `.opencode/skills`, and `.agents/skills`
- `packages/product/content` → `packages/opencode-plugin/content`
- `packages/product/hooks` → `packages/opencode-plugin/hooks`
- `packages/product/lib` → `packages/opencode-plugin/lib`
- `packages/opencode-plugin/.opencode/commands` →
  `packages/opencode-plugin/.agents/command`

The `.agents/command` files are generated mirrors. Edit only the
`.opencode/commands` command sources, then run `npm run sync:opencode`; do not
edit the generated mirror directly.

OpenCode does not discover command or skill files inside an installed npm package
by itself. The package `postinstall` therefore installs its packaged OMS skills
and commands into OpenCode's global discovery paths:

- `~/.config/opencode/skills/<skill>/SKILL.md`
- `~/.config/opencode/commands/sdd-*.md`
- the oh-my-sdd-managed block in `~/.config/opencode/AGENTS.md`
- cross-tool mirrors at `~/.agents/skills/<skill>/SKILL.md` and
  `~/.agents/command/sdd-*.md`

Project-local discovery paths remain `<project>/.opencode/skills` and
`<project>/.opencode/commands`. The command wrappers prefer a repository's
product source when present, then the package mirrors, then the global OpenCode
installation and `.agents`/`.claude` paths. This lets a checkout exercise the
current source while an installed package works outside the repository.

## Ownership and upgrades

Postinstall records only package-owned resources and their digests in
`~/.oh-my-sdd/opencode-npm-resources.json`. It backs up pre-existing conflicting
resources before replacement. On upgrade, a resource changed since OMS installed
it is preserved rather than overwritten; unmodified OMS-owned resources are
updated. The managed `AGENTS.md` block is maintained independently, leaving all
user-authored content outside its sentinels intact.

Upgrade with npm as usual:

```bash
npm install -g @cli-tools/oh-my-sdd-opencode@latest
```

Restart OpenCode after installation or upgrade. Commands are then available as
`/sdd-spec`, `/sdd-plan`, `/sdd-task`, `/sdd-apply`, `/sdd-review`, and
`/sdd-doc`.

## Diagnostics

Use the product control-plane CLI to check the installation and repair only
OMS-owned drift:

```bash
oms status --tool opencode
oms doctor --tool opencode
oms repair --tool opencode --apply
```

For a checkout, `npm run sync:opencode` verifies that current product resources
can be mirrored into the plugin before packaging.

## Uninstall

Use the supported wrapper rather than plain `npm uninstall -g`:

```bash
oms-opencode-uninstall
```

It unregisters this plugin entry, removes the managed `AGENTS.md` block, and
uses the ownership manifest to remove OMS-created resources or restore backups.
Resources modified after installation are preserved. If cleanup is interrupted,
reinstall the same package version and run the wrapper again; the manifest keeps
the remaining cleanup identifiable.

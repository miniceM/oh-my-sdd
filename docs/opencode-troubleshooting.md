# OpenCode Plugin Troubleshooting

Operational guide for debugging the oh-my-sdd OpenCode plugin.

## Debug Logging

Enable debug logging before starting OpenCode:

```bash
export OMSD_DEBUG=1
opencode
```

Logs are written to `~/.oh-my-sdd/logs/opencode-plugin.log`.

You can also control the log level through the `logLevel` field in `~/.config/opencode/opencode.json`. Supported levels include `debug`, `info`, `warn`, and `error`.

## Plugin Not Firing

1. Check whether the plugin is disabled in `~/.config/opencode/opencode.json` under the `oh-my-sdd` key.
2. Look for the `disabled` flag. If it is set to `true`, the plugin will not run.
3. Re-enable the plugin with the install command:

```bash
oms-install --enable
```

To disable it later, run:

```bash
oms-install --disable
```

## Hook Timeouts

Hook timeouts are configurable per hook. The defaults are:

| Hook | Default Timeout |
| --- | --- |
| preToolUse | 5000 ms |
| postToolUse | 3000 ms |
| sessionStart | 10000 ms |
| userPrompt | 3000 ms |

Valid range is 100 ms to 30000 ms. Set values in `~/.config/opencode/opencode.json` under the `oh-my-sdd` key.

If a hook times out, OpenCode may skip it without failing the whole operation. Increase the timeout for the relevant hook if you see repeated timeout warnings in the log.

## Config File Issues

### Missing Config File

If `~/.config/opencode/opencode.json` is missing, the plugin falls back to built-in defaults. Create the file and add an `oh-my-sdd` object to customize behavior.

### Corrupt JSON

If the config file contains invalid JSON, the plugin backs it up and loads defaults. Check `~/.oh-my-sdd/logs/opencode-plugin.log` for the backup path, then fix the original file.

### Invalid logLevel

An unknown `logLevel` value triggers a warning and falls back to the default level. Use one of the supported values listed in the Debug Logging section.

## Common Scenarios

### "dist/plugin.js not found"

The OpenCode plugin has not been built. Run:

```bash
npm run build:opencode
```

Then restart OpenCode.

### "Hook not running on tool X"

Only Write, Edit, and MultiEdit operations are tracked by the plugin. Hooks will not fire for other tool calls.

### Version Mismatch

If the plugin behavior does not match the installed package version, rebuild to sync the OpenCode plugin assets:

```bash
npm run build:opencode
```

## Diagnostic Commands

### Check Plugin Status

```bash
oms-install --status
```

This prints whether the plugin is enabled, its path, and the installed version.

### Run Smoke Tests

```bash
./scripts/smoke-test-opencode.sh
```

This runs a quick end-to-end check against the OpenCode plugin and reports any failures.

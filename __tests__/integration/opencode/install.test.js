import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const worktreeRoot = process.cwd();

test('install + uninstall: oms-install/uninstall --tool opencode round-trip', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-install-'));
  const env = { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome };

  // Step 1: install (use CLI wrapper which parses --tool)
  execFileSync('node', ['bin/oms-install.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env,
    stdio: 'pipe',
  });
  const pluginDir = path.join(tmpHome, '.config', 'opencode', 'plugins', 'oh-my-sdd');
  assert.ok(fs.existsSync(pluginDir), `plugin dir should exist: ${pluginDir}`);
  assert.ok(fs.existsSync(path.join(pluginDir, 'index.js')), 'index.js should exist');
  assert.ok(fs.existsSync(path.join(pluginDir, 'plugin.js')), 'plugin.js should exist');
  const cfgPath = path.join(tmpHome, '.config', 'opencode', 'opencode.json');
  const cfgAfterInstall = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.ok(cfgAfterInstall.plugin.includes('oh-my-sdd'), 'opencode.json should include oh-my-sdd');

  // Step 2: uninstall
  execFileSync('node', ['bin/oms-uninstall.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env,
    stdio: 'pipe',
  });
  assert.ok(!fs.existsSync(pluginDir), 'plugin dir should be removed');
  const cfgAfterUninstall = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const plugins = cfgAfterUninstall.plugin ?? [];
  assert.ok(!plugins.includes('oh-my-sdd'), 'opencode.json should not include oh-my-sdd');
});

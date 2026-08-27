import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlugin, OhMySddPlugin } from '../../../packages/opencode-plugin/dist/index.js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('plugin: createPlugin keeps operational hooks without baseline system transform', () => {
  const hooks = createPlugin();
  assert.equal(hooks['experimental.chat.system.transform'], undefined);
  assert.equal(typeof hooks['tool.execute.before'], 'function');
  assert.equal(typeof hooks['tool.execute.after'], 'function');
  assert.equal(typeof hooks['command.execute.before'], 'function');
  assert.equal(typeof hooks.event, 'function');
  // permission.ask not registered by default (YAGNI)
  assert.equal(hooks['permission.ask'], undefined);
});

test('plugin: OhMySddPlugin is a function (plugin factory)', () => {
  assert.equal(typeof OhMySddPlugin, 'function');
});

test('plugin: resource activation completes before hooks are returned', async () => {
  const home = mkdtempSync(join(tmpdir(), 'oms-plugin-load-'));
  const oldHome = process.env.HOME;
  const oldUserProfile = process.env.USERPROFILE;
  const oldXdgConfigHome = process.env.XDG_CONFIG_HOME;
  try {
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.XDG_CONFIG_HOME = join(home, '.config');
    const hooks = await OhMySddPlugin({});
    assert.equal(typeof hooks.event, 'function');
    assert.equal(existsSync(join(home, '.oh-my-sdd', 'opencode-activation.json')), true);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUserProfile;
    if (oldXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = oldXdgConfigHome;
    rmSync(home, { recursive: true, force: true });
  }
});

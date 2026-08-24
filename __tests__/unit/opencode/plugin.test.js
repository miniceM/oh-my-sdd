import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlugin, OhMySddPlugin } from '../../../opencode/dist/index.js';
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
  try {
    process.env.HOME = home;
    const hooks = await OhMySddPlugin({});
    assert.equal(typeof hooks.event, 'function');
    assert.equal(existsSync(join(home, '.oh-my-sdd', 'opencode-activation.json')), true);
  } finally {
    process.env.HOME = oldHome;
    rmSync(home, { recursive: true, force: true });
  }
});

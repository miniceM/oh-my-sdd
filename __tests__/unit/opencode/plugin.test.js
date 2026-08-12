import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlugin, OhMySddPlugin } from '../../../opencode/dist/index.js';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlugin, OhMySddPlugin } from '../../../opencode/dist/index.js';

test('plugin: createPlugin returns Hooks object with 5 handlers', () => {
  const hooks = createPlugin();
  assert.equal(typeof hooks['experimental.chat.system.transform'], 'function');
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

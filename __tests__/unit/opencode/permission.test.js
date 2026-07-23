import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPermissionAskEnabled, handlePermissionAsk } from '../../../opencode/dist/permission.js';

test('permission: isPermissionAskEnabled returns false (YAGNI stub)', () => {
  assert.equal(isPermissionAskEnabled(), false);
});

test('permission: handlePermissionAsk is a no-op', () => {
  const output = { status: 'ask' };
  handlePermissionAsk({ permission: 'write' }, output);
  assert.equal(output.status, 'ask');
});

test('permission: handlePermissionAsk tolerates empty input', () => {
  handlePermissionAsk({}, { status: 'ask' });
});

test('permission: handlePermissionAsk returns a promise (async)', async () => {
  const ret = handlePermissionAsk({ permission: 'x' }, { status: 'ask' });
  assert.ok(ret instanceof Promise);
  await ret; // should not throw
});

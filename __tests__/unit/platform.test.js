import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  getNodeVersion, checkNodeVersion, getHomeDir,
  getPluginInstallDir, getStateDir, isIamInPath
} from '../../hooks/lib/platform.js';

test('getNodeVersion returns current Node version string', () => {
  const v = getNodeVersion();
  assert.match(v, /^v\d+\.\d+\.\d+/);
});

test('checkNodeVersion returns true for lower minimum', () => {
  assert.equal(checkNodeVersion('16.0.0'), true);
});

test('checkNodeVersion returns false for higher minimum', () => {
  assert.equal(checkNodeVersion('999.0.0'), false);
});

test('getHomeDir returns non-empty string', () => {
  assert.ok(getHomeDir().length > 0);
});

test('getPluginInstallDir ends with .claude/plugins/oh-my-sdd', () => {
  const p = getPluginInstallDir();
  assert.ok(p.endsWith(path.join('.claude', 'plugins', 'oh-my-sdd')));
});

test('getStateDir ends with .oh-my-sdd', () => {
  const p = getStateDir();
  assert.ok(p.endsWith('.oh-my-sdd'));
});

test('isIamInPath returns boolean', async () => {
  const result = await isIamInPath();
  assert.equal(typeof result, 'boolean');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  getNodeVersion, checkNodeVersion, getHomeDir,
  getPluginInstallDir, getStateDir, isIamInPath, sessionMetaPath
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

test('sessionMetaPath keeps safe chars [A-Za-z0-9_-] and lands in sessions dir', () => {
  const p = sessionMetaPath('abc-123_XYZ');
  assert.ok(p.endsWith(path.join('sessions', 'abc-123_XYZ.json')));
  assert.ok(p.startsWith(getStateDir()));
});

test('sessionMetaPath strips path separators to prevent traversal', () => {
  // ../../etc/passwd → etcpasswd (slashes and dots stripped); never /etc/passwd
  const p = sessionMetaPath('../../etc/passwd');
  assert.ok(p);
  assert.ok(!p.includes('/etc/'));
  assert.ok(p.endsWith(path.join('sessions', 'etcpasswd.json')));
});

test('sessionMetaPath returns null for null', () => {
  assert.equal(sessionMetaPath(null), null);
});

test('sessionMetaPath returns null for empty string', () => {
  assert.equal(sessionMetaPath(''), null);
});

test('sessionMetaPath returns null for undefined', () => {
  assert.equal(sessionMetaPath(undefined), null);
});

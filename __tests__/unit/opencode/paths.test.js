import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {
  getPluginRoot,
  getHooksDir,
  getBaselinePath,
  getStateDir,
  getLogFile,
  sanitizeSessionId,
} from '../../../opencode/dist/paths.js';

test('paths: getPluginRoot reads OMS_PLUGIN_ROOT env', () => {
  process.env.OMS_PLUGIN_ROOT = '/custom/root';
  assert.equal(getPluginRoot(), '/custom/root');
  delete process.env.OMS_PLUGIN_ROOT;
});

test('paths: getPluginRoot falls back to dist/../.. when env unset', () => {
  delete process.env.OMS_PLUGIN_ROOT;
  const root = getPluginRoot();
  assert.ok(root.endsWith('opencode'), `Expected endsWith 'opencode', got ${root}`);
});

test('paths: getHooksDir is <pluginRoot>/../../hooks', () => {
  process.env.OMS_PLUGIN_ROOT = '/x/opencode';
  assert.equal(getHooksDir(), path.normalize('/x/opencode/../../hooks'));
});

test('paths: getBaselinePath is <pluginRoot>/../../content/enterprise-baseline.md', () => {
  process.env.OMS_PLUGIN_ROOT = '/x/opencode';
  assert.equal(getBaselinePath(), path.normalize('/x/opencode/../../content/enterprise-baseline.md'));
});

test('paths: getStateDir uses ~/.oh-my-sdd (shared with claude/lingma)', () => {
  const state = getStateDir();
  assert.equal(state, path.join(os.homedir(), '.oh-my-sdd'));
});

test('paths: sanitizeSessionId replaces non-allowed chars with _', () => {
  assert.equal(sanitizeSessionId('../../../etc/passwd'), '_________etc_passwd');
  assert.equal(sanitizeSessionId('abc-123_XYZ'), 'abc-123_XYZ');
  assert.equal(sanitizeSessionId('a b/c\nd'), 'a_b_c_d');
});

test('paths: sanitizeSessionId returns fallback for undefined', () => {
  const a = sanitizeSessionId(undefined);
  const b = sanitizeSessionId(undefined);
  // Both should be strings
  assert.equal(typeof a, 'string');
  assert.equal(typeof b, 'string');
  assert.match(a, /^oms-opencode-\d+$/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
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
  try {
    assert.equal(getPluginRoot(), '/custom/root');
  } finally {
    delete process.env.OMS_PLUGIN_ROOT;
  }
});

test('paths: getPluginRoot falls back to opencode/ dir when env unset', () => {
  delete process.env.OMS_PLUGIN_ROOT;
  const root = getPluginRoot();
  assert.ok(root.endsWith('opencode'), `Expected endsWith 'opencode', got ${root}`);
});

test('paths: getHooksDir is <pluginRoot>/../hooks', () => {
  process.env.OMS_PLUGIN_ROOT = '/x/opencode';
  try {
    assert.equal(getHooksDir(), path.normalize('/x/hooks'));
  } finally {
    delete process.env.OMS_PLUGIN_ROOT;
  }
});

test('paths: getHooksDir fallback resolves to actual hooks/ dir', () => {
  delete process.env.OMS_PLUGIN_ROOT;
  const hooksDir = getHooksDir();
  assert.ok(fs.existsSync(hooksDir), `hooks/ should exist, got ${hooksDir}`);
});

test('paths: getBaselinePath is <pluginRoot>/../content/enterprise-baseline.md', () => {
  process.env.OMS_PLUGIN_ROOT = '/x/opencode';
  try {
    assert.equal(getBaselinePath(), path.normalize('/x/content/enterprise-baseline.md'));
  } finally {
    delete process.env.OMS_PLUGIN_ROOT;
  }
});

test('paths: getBaselinePath fallback resolves to actual baseline file', () => {
  delete process.env.OMS_PLUGIN_ROOT;
  const bp = getBaselinePath();
  assert.ok(fs.existsSync(bp), `baseline should exist, got ${bp}`);
});

test('paths: getStateDir uses ~/.oh-my-sdd (shared with claude/lingma)', () => {
  const state = getStateDir();
  assert.equal(state, path.join(os.homedir(), '.oh-my-sdd'));
});

test('paths: getLogFile returns ~/.oh-my-sdd/logs/opencode.log', () => {
  const logFile = getLogFile();
  assert.equal(logFile, path.join(os.homedir(), '.oh-my-sdd', 'logs', 'opencode.log'));
});

test('paths: sanitizeSessionId replaces non-allowed chars with _', () => {
  assert.equal(sanitizeSessionId('../../../etc/passwd'), '_________etc_passwd');
  assert.equal(sanitizeSessionId('abc-123_XYZ'), 'abc-123_XYZ');
  assert.equal(sanitizeSessionId('a b/c\nd'), 'a_b_c_d');
});

test('paths: sanitizeSessionId returns fallback for undefined', () => {
  const a = sanitizeSessionId(undefined);
  assert.match(a, /^oms-opencode-\d+$/);
});

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

test('paths: getPluginRoot falls back to opencode/ plugin dir when env unset', () => {
  delete process.env.OMS_PLUGIN_ROOT;
  const root = getPluginRoot();
  // 安装后布局：~/.config/opencode/plugins/oh-my-sdd/
  // 源码布局：opencode/dist/paths.js → plugin root = opencode/ (the dir containing dist/)
  assert.ok(
    root.endsWith('opencode') || root.endsWith('oh-my-sdd'),
    `Expected endsWith 'opencode' or 'oh-my-sdd', got ${root}`
  );
});

test('paths: getHooksDir is <pluginRoot>/hooks (installed layout)', () => {
  process.env.OMS_PLUGIN_ROOT = '/x/oh-my-sdd';
  try {
    const result = getHooksDir();
    // On Windows, path.resolve adds drive letter (D:\x\oh-my-sdd\hooks)
    // On Unix, it stays absolute (/x/oh-my-sdd/hooks)
    // Just verify it ends with the expected path components
    assert.ok(result.endsWith('x' + path.sep + 'oh-my-sdd' + path.sep + 'hooks') ||
               result.endsWith('x/oh-my-sdd/hooks'),
      `Expected to end with x/oh-my-sdd/hooks, got ${result}`);
  } finally {
    delete process.env.OMS_PLUGIN_ROOT;
  }
});

test('paths: getHooksDir fallback resolves to actual hooks/ dir', () => {
  delete process.env.OMS_PLUGIN_ROOT;
  const hooksDir = getHooksDir();
  // 源码布局下 hooks/ 在 repo 根目录；安装后在 plugin 目录内
  // 这里只验证路径格式（不以 .. 形式存在即可）
  assert.ok(hooksDir.endsWith('hooks'), `Expected endsWith 'hooks', got ${hooksDir}`);
});

test('paths: getBaselinePath is <pluginRoot>/content/enterprise-baseline.md (installed layout)', () => {
  process.env.OMS_PLUGIN_ROOT = '/x/oh-my-sdd';
  try {
    const result = getBaselinePath();
    // On Windows, path.resolve adds drive letter
    // Just verify it ends with the expected path components
    assert.ok(result.endsWith('oh-my-sdd' + path.sep + 'content' + path.sep + 'enterprise-baseline.md') ||
               result.endsWith('oh-my-sdd/content/enterprise-baseline.md'),
      `Expected to end with oh-my-sdd/content/enterprise-baseline.md, got ${result}`);
  } finally {
    delete process.env.OMS_PLUGIN_ROOT;
  }
});

test('paths: getBaselinePath fallback resolves to actual baseline file', () => {
  delete process.env.OMS_PLUGIN_ROOT;
  const bp = getBaselinePath();
  // 源码布局下在 content/；安装后在 plugin/content/
  assert.ok(bp.endsWith('enterprise-baseline.md'), `Expected baseline filename, got ${bp}`);
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

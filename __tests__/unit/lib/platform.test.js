import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  getNodeVersion, checkNodeVersion, getHomeDir, isWindows,
  getPluginInstallDir, getStateDir, isIamInPath, sessionMetaPath
} from '../../../packages/product/lib/platform.js';

test('isWindows distinguishes win32 from POSIX platforms', () => {
  assert.equal(isWindows('win32'), true);
  assert.equal(isWindows('darwin'), false);
  assert.equal(isWindows('linux'), false);
});

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

test('getHomeDir follows XDG_HOME_DIR > HOME > USERPROFILE > homedir fallback order', () => {
  const homedir = () => '/fallback-home';

  assert.equal(getHomeDir({
    env: { XDG_HOME_DIR: '/xdg-home', HOME: '/posix-home', USERPROFILE: 'C:\\Users\\tester' },
    homedir,
  }), '/xdg-home');
  assert.equal(getHomeDir({
    env: { HOME: '/posix-home', USERPROFILE: 'C:\\Users\\tester' },
    homedir,
  }), '/posix-home');
  assert.equal(getHomeDir({
    env: { USERPROFILE: 'C:\\Users\\tester' },
    homedir,
  }), 'C:\\Users\\tester');
  assert.equal(getHomeDir({ env: {}, homedir }), '/fallback-home');
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

test('isIamInPath uses which on POSIX', () => {
  const calls = [];
  const result = isIamInPath({
    platform: 'linux',
    execFile: (command, args, options) => calls.push({ command, args, options }),
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [{ command: 'which', args: ['iam'], options: { stdio: 'ignore' } }]);
});

test('isIamInPath returns false when which fails on POSIX', () => {
  assert.equal(isIamInPath({
    platform: 'darwin',
    execFile: () => { throw new Error('not found'); },
  }), false);
});

test('isIamInPath tries Windows PATHEXT variants until one succeeds', () => {
  const names = [];
  const result = isIamInPath({
    platform: 'win32',
    execFile: (command, [name], options) => {
      assert.equal(command, 'where');
      assert.deepEqual(options, { stdio: 'ignore' });
      names.push(name);
      if (name !== 'iam.cmd') throw new Error('not found');
    },
  });

  assert.equal(result, true);
  assert.deepEqual(names, ['iam', 'iam.exe', 'iam.cmd']);
});

test('isIamInPath returns false after all Windows variants fail', () => {
  const names = [];
  const result = isIamInPath({
    platform: 'win32',
    execFile: (_command, [name]) => {
      names.push(name);
      throw new Error('not found');
    },
  });

  assert.equal(result, false);
  assert.deepEqual(names, ['iam', 'iam.exe', 'iam.cmd', 'iam.bat']);
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

test('sessionMetaPath strips Windows drive and path separators', () => {
  const p = sessionMetaPath('C:\\temp\\..\\session');
  assert.ok(p);
  assert.ok(p.endsWith(path.join('sessions', 'Ctempsession.json')));
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

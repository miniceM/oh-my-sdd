import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isDirectExecution as isInstallDirect } from '../../../install/main.js';
import { isDirectExecution as isUninstallDirect } from '../../../install/uninstall.js';

const projectRoot = process.cwd();

test('importing the package entry point has no install side effects and preserves exports', () => {
  const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'oms-import-entry-'));
  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', [
        "const api = await import('./install.js');",
        "process.stdout.write(JSON.stringify(Object.keys(api).sort()));",
      ].join(' ')],
      {
        cwd: projectRoot,
        env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [
      'detectDefaultTool',
      'isClaudeInstalled',
      'isLingmaInstalled',
      'isOpenCodeInstalled',
      'main',
      'preflightFor',
    ]);
    assert.equal(existsSync(path.join(fakeHome, '.oh-my-sdd')), false);
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('executing the package entry point still invokes installation', () => {
  const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'oms-direct-entry-'));
  try {
    const result = spawnSync(process.execPath, ['install.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        PATH: '',
      },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /跳过 Claude 专属安装步骤/);
    assert.equal(existsSync(path.join(fakeHome, '.oh-my-sdd', 'config.json')), true);
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('calling the public installer resolves when Claude CLI is unavailable', () => {
  const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'oms-call-entry-'));
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', [
      "const { main } = await import('./install.js');",
      "await main({ tool: 'claude' });",
      "process.stdout.write('resolved');",
    ].join(' ')], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        PATH: '',
      },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /跳过 Claude 专属安装步骤/);
    assert.match(result.stdout, /resolved$/);
    assert.equal(existsSync(path.join(fakeHome, '.oh-my-sdd', 'config.json')), true);
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('install and uninstall direct-entry checks compare decoded Windows paths', () => {
  const dependencies = {
    platform: 'win32',
    pathApi: path.win32,
    fileURLToPathFn: () => 'C:\\Program Files\\oh-my-sdd\\install\\main.js',
  };
  const moduleUrl = 'file:///C:/Program%20Files/oh-my-sdd/install/main.js';
  const argvEntry = 'c:\\Program Files\\oh-my-sdd\\install\\main.js';

  assert.equal(isInstallDirect(moduleUrl, argvEntry, dependencies), true);
  assert.equal(isUninstallDirect(moduleUrl, argvEntry, dependencies), true);
  assert.equal(isInstallDirect(moduleUrl, 'C:\\other\\main.js', dependencies), false);
  assert.equal(isUninstallDirect(moduleUrl, 'C:\\other\\main.js', dependencies), false);
});

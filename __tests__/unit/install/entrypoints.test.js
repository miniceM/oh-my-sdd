import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createInstaller,
  isDirectExecution as isInstallDirect,
} from '../../../packages/product/install/main.js';
import { isDirectExecution as isUninstallDirect } from '../../../packages/product/install/uninstall.js';

const projectRoot = process.cwd();

function hostAdapter(id, { detected = false, install } = {}) {
  return class {
    static id = id;
    static displayName = id;
    static isInstalled() { return detected; }
    static describe() { return { id, detected }; }
    static preflight() {}
    static install = install;
  };
}

test('dry run returns a plan without invoking adapter install', async () => {
  const installCalls = [];
  const FakeAdapter = hostAdapter('fake', {
    install: (ctx) => installCalls.push(ctx),
  });
  const install = createInstaller({
    checkNodeVersionFn: () => true,
    ensureStateDirFn: async () => assert.fail('dry run must not create state'),
    getAdapterFn: () => FakeAdapter,
    listToolsFn: () => ['fake'],
  });

  const plan = await install({ tool: 'fake', dryRun: true });

  assert.equal(plan.schema_version, 1);
  assert.equal(installCalls.length, 0);
});

test('provided installation plan is applied without rebuilding it', async () => {
  const installCalls = [];
  const confirmedPlan = { schema_version: 1, hosts: [{ id: 'fake' }] };
  const FakeAdapter = hostAdapter('fake', {
    install: (ctx) => installCalls.push(ctx),
  });
  const install = createInstaller({
    checkNodeVersionFn: () => true,
    ensureStateDirFn: async () => {},
    getAdapterFn: () => FakeAdapter,
    buildInstallationPlanFn: () => assert.fail('provided plan must not be rebuilt'),
  });

  await install({ tool: 'fake', plan: confirmedPlan });

  assert.strictEqual(installCalls[0].plan, confirmedPlan);
});

test('multiple detected hosts require an explicit selection without installing', async () => {
  const installCalls = [];
  const adapters = new Map([
    ['first', hostAdapter('first', {
      detected: true,
      install: () => installCalls.push('first'),
    })],
    ['second', hostAdapter('second', {
      detected: true,
      install: () => installCalls.push('second'),
    })],
  ]);
  const install = createInstaller({
    checkNodeVersionFn: () => true,
    ensureStateDirFn: async () => assert.fail('ambiguous selection must not create state'),
    getAdapterFn: (tool) => adapters.get(tool),
    listToolsFn: () => [...adapters.keys()],
  });

  const result = await install();

  assert.equal(result.selection_required, true);
  assert.deepEqual(result.selection_options, ['first', 'second']);
  assert.equal(installCalls.length, 0);
});

test('importing the package entry point has no install side effects and preserves exports', () => {
  const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'oms-import-entry-'));
  try {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', [
        "const api = await import('./packages/product/install.js');",
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
    const result = spawnSync(process.execPath, ['packages/product/install.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        XDG_HOME_DIR: fakeHome,
        XDG_CONFIG_HOME: path.join(fakeHome, '.config'),
        OPENCODE_CONFIG_DIR: path.join(fakeHome, '.config', 'opencode'),
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
      "const { main } = await import('./packages/product/install.js');",
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

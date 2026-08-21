import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  buildClaudeInvocation,
  ClaudeAdapter,
  isClaudeCliAvailable,
} from '../../../../install/hosts/claude-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

describe('ClaudeAdapter', () => {
  it('extends HostAdapter', () => {
    assert.ok(Object.getPrototypeOf(ClaudeAdapter) === HostAdapter);
  });

  it('has id = "claude"', () => {
    assert.equal(ClaudeAdapter.id, 'claude');
  });

  it('has a display name', () => {
    assert.equal(typeof ClaudeAdapter.displayName, 'string');
    assert.ok(ClaudeAdapter.displayName.length > 0);
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof ClaudeAdapter.isInstalled(), 'boolean');
  });

  it('describes PreToolUse as supported but unverified until the runtime loads it', () => {
    const host = ClaudeAdapter.describe({ PACKAGE_ROOT: '/package/root' });

    assert.equal(host.capabilities.write_prevention.supported, true);
    assert.notEqual(host.capabilities.write_prevention.level, 'enforced');
    assert.match(host.capabilities.write_prevention.reason, /loaded|verified/i);
    assert.equal(host.resources.some((resource) => resource.type === 'plugin'), true);
  });

  it('uses version objects for every dependency fact', () => {
    const host = ClaudeAdapter.describe({ PACKAGE_ROOT: '/package/root' });
    assert.equal(host.dependencies.every((dependency) => (
      dependency.version && typeof dependency.version === 'object' && !Array.isArray(dependency.version)
    )), true);
  });

  it('reports a missing host runtime when the Claude CLI is absent', () => {
    const script = `
      const { ClaudeAdapter } = await import(${JSON.stringify(new URL('../../../../install/hosts/claude-adapter.js', import.meta.url).href)});
      process.stdout.write(JSON.stringify(ClaudeAdapter.describe()));
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      env: { ...process.env, PATH: '' },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const host = JSON.parse(result.stdout);
    assert.equal(host.detected, false);
    assert.equal(host.capabilities.host_runtime.level, 'missing');
  });

  it('detects a Claude CLI only when claude --version succeeds on POSIX', () => {
    const invocations = [];
    assert.equal(isClaudeCliAvailable({
      execFileSyncFn(command, args, options) {
        invocations.push({ command, args, options });
      },
      platform: 'linux',
    }), true);
    assert.deepEqual(invocations, [{
      command: 'claude',
      args: ['--version'],
      options: { stdio: 'ignore', timeout: 5000, windowsHide: true },
    }]);
  });

  it('treats a failing claude --version invocation as unavailable on Windows', () => {
    const invocations = [];
    assert.equal(isClaudeCliAvailable({
      execFileSyncFn(command, args, options) {
        invocations.push({ command, args, options });
        throw new Error('ENOENT');
      },
      platform: 'win32',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
    }), false);
    assert.deepEqual(invocations, [{
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'claude', '--version'],
      options: { stdio: 'ignore', timeout: 5000, windowsHide: true },
    }]);
  });

  it('detects a native Claude CLI through ComSpec on Windows', () => {
    const invocations = [];
    assert.equal(isClaudeCliAvailable({
      execFileSyncFn(command, args, options) {
        invocations.push({ command, args, options });
      },
      platform: 'win32',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
    }), true);
    assert.deepEqual(invocations, [{
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'claude', '--version'],
      options: { stdio: 'ignore', timeout: 5000, windowsHide: true },
    }]);
  });

  it('treats a timed out claude --version invocation as unavailable', () => {
    const timeout = new Error('Command timed out');
    timeout.code = 'ETIMEDOUT';

    assert.equal(isClaudeCliAvailable({
      execFileSyncFn() {
        throw timeout;
      },
      platform: 'linux',
    }), false);
  });

  it('install() is an async function', () => {
    assert.equal(ClaudeAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is overridden (not the default no-op)', () => {
    assert.notEqual(ClaudeAdapter.uninstall, HostAdapter.uninstall);
  });

  it('uses direct parameterized execution on POSIX', () => {
    assert.deepEqual(buildClaudeInvocation(
      ['plugin', 'install', 'oh-my-sdd'],
      { platform: 'linux' },
    ), {
      command: 'claude',
      args: ['plugin', 'install', 'oh-my-sdd'],
    });
  });

  it('runs claude through ComSpec on Windows so native and cmd CLIs resolve', () => {
    assert.deepEqual(
      buildClaudeInvocation(
        ['plugin', 'marketplace', 'add', 'C:\\Program Files\\oh-my-sdd'],
        { platform: 'win32', comspec: 'C:\\Windows\\System32\\cmd.exe' },
      ),
      {
        command: 'C:\\Windows\\System32\\cmd.exe',
        args: [
          '/d',
          '/s',
          '/c',
          'claude',
          'plugin',
          'marketplace',
          'add',
          'C:\\Program Files\\oh-my-sdd',
        ],
      },
    );
  });

  it('returns successfully and skips Claude work when the CLI is unavailable', async () => {
    const announcements = [];
    const invoked = [];

    const result = await ClaudeAdapter.install({
      PACKAGE_ROOT: '/package/root',
      announce(message) { announcements.push(message); },
    }, {
      isClaudeCliAvailable: () => false,
      ensureStateDirFn: async () => { invoked.push('state'); },
      registerMarketplace: async () => { invoked.push('marketplace'); },
      installPlugin: async () => { invoked.push('plugin'); },
      findClaudeOriginalFn: () => { invoked.push('find-original'); },
      installWrapperFn: async () => { invoked.push('wrapper'); },
    });

    assert.equal(result, false);
    assert.deepEqual(invoked, []);
    assert.match(announcements.join('\n'), /跳过 Claude 专属安装步骤/);
  });

  it('runs marketplace, plugin, and wrapper setup when the CLI is available', async () => {
    const announcements = [];
    const invoked = [];
    const originalClaude = '/usr/local/bin/claude';

    await ClaudeAdapter.install({
      PACKAGE_ROOT: '/package/root',
      announce(message) { announcements.push(message); },
    }, {
      isClaudeCliAvailable: () => true,
      ensureStateDirFn: async () => { invoked.push('state'); },
      registerMarketplace: async (packageRoot) => { invoked.push(['marketplace', packageRoot]); },
      installPlugin: async () => { invoked.push('plugin'); },
      findClaudeOriginalFn: () => originalClaude,
      installWrapperFn: async (packageRoot) => { invoked.push(['wrapper', packageRoot]); },
    });

    assert.deepEqual(invoked, [
      'state',
      ['marketplace', '/package/root'],
      'plugin',
      ['wrapper', '/package/root'],
    ]);
    assert.match(announcements.join('\n'), /oh-my-sdd \(Claude Code\) 安装完成/);
  });
});

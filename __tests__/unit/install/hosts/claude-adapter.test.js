import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
      options: { stdio: 'ignore' },
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
      args: ['/d', '/s', '/c', 'claude.cmd', '--version'],
      options: { stdio: 'ignore' },
    }]);
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

  it('runs claude.cmd through ComSpec on Windows', () => {
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
          'claude.cmd',
          'plugin',
          'marketplace',
          'add',
          'C:\\Program Files\\oh-my-sdd',
        ],
      },
    );
  });
});

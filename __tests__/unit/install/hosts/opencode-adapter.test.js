import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeAdapter } from '../../../../install/hosts/opencode-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';
import { SDD_COMMANDS } from '../../../../lib/command-generator.js';

describe('OpenCodeAdapter', () => {
  it('extends HostAdapter', () => {
    assert.ok(Object.getPrototypeOf(OpenCodeAdapter) === HostAdapter);
  });

  it('has id = "opencode"', () => {
    assert.equal(OpenCodeAdapter.id, 'opencode');
  });

  it('has a display name', () => {
    assert.equal(typeof OpenCodeAdapter.displayName, 'string');
    assert.ok(OpenCodeAdapter.displayName.length > 0);
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof OpenCodeAdapter.isInstalled(), 'boolean');
  });

  it('separates npm plugin registration from host-runtime loading', () => {
    const host = OpenCodeAdapter.describe({ PACKAGE_ROOT: '/package/root' });
    const registration = host.resources.find((resource) => resource.type === 'npm-plugin');

    assert.equal(registration.action, 'install-plugin-native');
    assert.equal(registration.enforcement, 'registered');
    assert.equal(host.risks.some((risk) => /load/i.test(risk.message)), true);
    assert.equal(host.capabilities.write_prevention.supported, false);
    assert.match(host.capabilities.write_prevention.evidence, /runtime/i);
  });

  it('uses version objects for every dependency fact', () => {
    const host = OpenCodeAdapter.describe({ PACKAGE_ROOT: '/package/root' });
    assert.equal(host.dependencies.every((dependency) => (
      dependency.version && typeof dependency.version === 'object' && !Array.isArray(dependency.version)
    )), true);
  });

  it('install() is an async function', () => {
    assert.equal(OpenCodeAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is an async function', () => {
    assert.equal(OpenCodeAdapter.uninstall.constructor.name, 'AsyncFunction');
  });

  it('installs the npm plugin through the native OpenCode CLI', async () => {
    const calls = [];
    const messages = [];
    const installation = await OpenCodeAdapter.install({
      announce: (message) => messages.push(message),
      execFileSync: (command, args, options) => {
        calls.push({ command, args, options });
        return 'installed';
      },
    });

    assert.deepEqual(calls, [{
      command: 'opencode',
      args: ['plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force'],
      options: { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    }]);
    assert.equal(installation.status, 'succeeded');
    assert.ok(messages.includes('✓ oh-my-sdd (OpenCode) npm 插件安装完成'));
    assert.deepEqual(installation.summary.next_actions, [
      '重启 OpenCode 后完成插件加载；随后可运行 oms doctor --tool opencode 查看注册状态。',
    ]);
    assert.equal(installation.events.filter((event) => event.status === 'deferred').length, 4);
  });

  it('reports a native plugin install failure with output and a retry command', async () => {
    const installation = await OpenCodeAdapter.install({
      announce: () => {},
      execFileSync: () => {
        const error = new Error('Command failed');
        error.stderr = 'registry unavailable';
        throw error;
      },
    });

    assert.equal(installation.status, 'failed');
    const failure = installation.events.find((event) => event.status === 'failed');
    assert.match(failure.reason, /registry unavailable/);
    assert.equal(failure.next_action, 'Retry: opencode plugin @cli-tools/oh-my-sdd-opencode --global --force');
  });

  it('numbers the five SDD workflow commands with integer rings', () => {
    assert.deepEqual(
      SDD_COMMANDS.slice(0, 5).map((command) => command.description.match(/第 (\d+) 环/)?.[1]),
      ['1', '2', '3', '4', '5']
    );
  });
});

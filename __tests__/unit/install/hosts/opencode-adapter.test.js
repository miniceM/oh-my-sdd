import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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

    assert.equal(registration.action, 'register-plugin');
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

  it('installs the npm plugin entry without copying a local development build', () => {
    const home = mkdtempSync(join(tmpdir(), 'oms-opencode-install-'));
    const adapterUrl = new URL('../../../../install/hosts/opencode-adapter.js', import.meta.url).href;
    const script = `
      const { OpenCodeAdapter } = await import(${JSON.stringify(adapterUrl)});
      const messages = [];
      const installation = await OpenCodeAdapter.install({ announce: (message) => messages.push(message) });
      process.stdout.write(JSON.stringify({ installation, messages }));
    `;

    try {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          XDG_HOME_DIR: home,
          XDG_CONFIG_HOME: join(home, '.config'),
          OPENCODE_CONFIG_DIR: join(home, '.config', 'opencode'),
        },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);

      const config = JSON.parse(readFileSync(join(home, '.config', 'opencode', 'opencode.json'), 'utf8'));
      assert.deepEqual(config.plugin, ['@cli-tools/oh-my-sdd-opencode']);

      const { installation, messages } = JSON.parse(result.stdout);
      assert.ok(messages.includes('✓ oh-my-sdd (OpenCode) npm 插件安装完成'));
      assert.ok(!messages.some((message) => message.includes('HARD_RULE')));
      assert.ok(!messages.some((message) => message.includes('本地开发模式')));
      assert.deepEqual(installation.summary.next_actions, [
        '重启 OpenCode 后完成插件加载；随后可运行 oms doctor --tool opencode 查看注册状态。',
      ]);
      const deferredEvents = installation.events.filter((event) => event.status === 'deferred');
      assert.equal(deferredEvents.length, 4);
      assert.ok(deferredEvents.every((event) => !messages.some((message) => message.includes(event.message))));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('numbers the five SDD workflow commands with integer rings', () => {
    assert.deepEqual(
      SDD_COMMANDS.slice(0, 5).map((command) => command.description.match(/第 (\d+) 环/)?.[1]),
      ['1', '2', '3', '4', '5']
    );
  });
});

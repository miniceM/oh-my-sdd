import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNpmRootInvocation, inspectOpenCodeActivation, OpenCodeAdapter } from '../../../../packages/product/install/hosts/opencode-adapter.js';
import { HostAdapter } from '../../../../packages/product/install/host-adapter.js';
import { doctor } from '../../../../packages/product/install/control-plane/health.js';
import { SDD_COMMANDS } from '../../../../packages/product/lib/command-generator.js';
import { createOpenCodeTestSandbox, prepareDoctorInstalledPackage } from '../../../helpers/opencode-test-env.js';

const PLUGIN_ROOT = fileURLToPath(new URL('../../../../packages/opencode-plugin/', import.meta.url));
const FIXED_NOW = Date.parse('2026-08-25T12:00:00.000Z');
const FIXTURE_RESOURCE_DIGEST = 'fixture-resource-digest';

async function inspectDoctorWithActivation(record, now = FIXED_NOW) {
  const expectedState = record?.failed_resources?.length > 0 ? 'failed'
    : record?.drifted_resources?.length > 0 ? 'degraded' : 'verified';
  const valid = record && typeof record === 'object' && record.schema_version === 1
    && record.resource_digest === activation().resource_digest
    && Date.parse(record.activated_at) <= now && now - Date.parse(record.activated_at) <= 24 * 60 * 60 * 1000
    && Array.isArray(record.registered_hooks) && record.registered_hooks.length > 0 && record.registered_hooks.every(Boolean)
    && Array.isArray(record.drifted_resources) && Array.isArray(record.failed_resources)
    && record.state === expectedState && record.state !== 'failed';
  const ctx = { runtimeProbe: { inspectActivation: () => valid
    ? { state: 'valid', path: '/fixture/activation.json', value: record }
    : { state: 'invalid', path: '/fixture/activation.json', reason: 'Activation evidence is unavailable' } } };
  return { runtime: await OpenCodeAdapter.inspectRuntime(ctx), report: await doctor({ adapters: [OpenCodeAdapter], ctx }) };
}

function activation(overrides = {}) {
  return {
    schema_version: 1,
    plugin_version: '1.0.0',
    resource_digest: FIXTURE_RESOURCE_DIGEST,
    activated_at: new Date(FIXED_NOW - 60_000).toISOString(),
    registered_hooks: ['tool.execute.before'],
    state: 'verified',
    drifted_resources: [],
    failed_resources: [],
    ...overrides,
  };
}

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

  it('requires the OpenCode CLI for native plugin installation', () => {
    const host = OpenCodeAdapter.describe({ PACKAGE_ROOT: '/package/root' });
    const cli = host.dependencies.find((dependency) => dependency.name === 'opencode');

    assert.equal(cli.required, true);
    assert.equal(cli.classification, 'required');
  });

  it('uses an injected activation probe for deterministic runtime evidence', async () => {
    const runtime = await OpenCodeAdapter.inspectRuntime({
      runtimeProbe: {
        inspectActivation: () => ({
          state: 'valid',
          path: '/fixture/opencode-activation.json',
          value: activation(),
        }),
      },
    });

    assert.equal(runtime.loaded.state, 'verified');
    assert.equal(runtime.enforced.state, 'verified');
  });

  it('accepts digest drift but rejects activation evidence without registered hooks', () => {
    const sandbox = createOpenCodeTestSandbox(process.cwd());
    try {
      const fixture = prepareDoctorInstalledPackage({ sandbox, packageRoot: PLUGIN_ROOT });
      mkdirSync(join(sandbox.home, '.oh-my-sdd'), { recursive: true });
      writeFileSync(join(sandbox.home, '.oh-my-sdd', 'opencode-activation.json'), JSON.stringify(
        activation({ resource_digest: 'stale-resource-digest' }),
      ));
      const adapterUrl = new URL('../../../../packages/product/install/hosts/opencode-adapter.js', import.meta.url).href;
      const inspect = () => spawnSync(process.execPath, ['--input-type=module', '--eval',
        `const { inspectOpenCodeActivation } = await import(${JSON.stringify(adapterUrl)}); process.stdout.write(JSON.stringify(inspectOpenCodeActivation({ now: () => ${FIXED_NOW}, execFileSync: () => process.env.OMS_TEST_NPM_ROOT })));`,
      ], { env: fixture.env, encoding: 'utf8' });
      const result = inspect();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).state, 'valid');
      writeFileSync(join(sandbox.home, '.oh-my-sdd', 'opencode-activation.json'), JSON.stringify(
        activation({ registered_hooks: [] }),
      ));
      const emptyHooks = inspect();
      assert.equal(emptyHooks.status, 0, emptyHooks.stderr);
      assert.equal(JSON.parse(emptyHooks.stdout).state, 'invalid');
    } finally {
      sandbox.cleanup();
      sandbox.cleanupArtifacts();
    }
  });

  it('doctor verifies loaded and enforced only from a valid activation with the write-before hook', async () => {
    const { runtime, report } = await inspectDoctorWithActivation(activation());

    assert.equal(runtime.loaded.state, 'verified');
    assert.equal(runtime.enforced.state, 'verified');
    assert.equal(runtime.enforced.reason, null);
    assert.equal(report.hosts[0].protection.level, 'enforced');
    assert.equal(report.findings.some((finding) => finding.code.startsWith('runtime-')), false);
  });

  it('treats expired activation records as unknown runtime evidence', async () => {
    for (const record of [
      activation({ activated_at: new Date(FIXED_NOW - (48 * 60 * 60 * 1000)).toISOString() }),
      activation({ activated_at: new Date(FIXED_NOW + (60 * 60 * 1000)).toISOString() }),
    ]) {
      const { runtime, report } = await inspectDoctorWithActivation(record);
      assert.equal(runtime.loaded.state, 'unknown');
      assert.equal(runtime.enforced.state, 'unknown');
      assert.match(runtime.loaded.reason, /rerun|restart|activation/i);
      assert.deepEqual(
        report.findings
          .filter((finding) => finding.code.startsWith('runtime-'))
          .map((finding) => finding.code)
          .sort(),
        ['runtime-enforced-unknown', 'runtime-loaded-unknown'],
      );
    }
  });

  it('runs npm root through ComSpec on Windows', () => {
    assert.deepEqual(buildNpmRootInvocation({
      platform: 'win32',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
    }), {
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'npm', 'root', '--global'],
    });
  });

  it('doctor fixture keeps a stable package snapshot when the source changes', () => {
    const sandbox = createOpenCodeTestSandbox(process.cwd());
    const source = join(sandbox.root, 'source-plugin');
    try {
      mkdirSync(source, { recursive: true });
      writeFileSync(join(source, 'version.txt'), 'before');
      const fixture = prepareDoctorInstalledPackage({ sandbox, packageRoot: source });
      writeFileSync(join(source, 'version.txt'), 'after');
      assert.equal(existsSync(fixture.installedPlugin), true);
      assert.equal(readFileSync(join(fixture.installedPlugin, 'version.txt'), 'utf8'), 'before');
    } finally {
      sandbox.cleanup();
      sandbox.cleanupArtifacts();
    }
  });

  it('treats missing or invalid activation records as unknown runtime evidence', async () => {
    for (const record of [undefined, '{ invalid JSON', activation({ schema_version: 2 })]) {
      const { runtime, report } = await inspectDoctorWithActivation(record);
      assert.equal(runtime.loaded.state, 'unknown');
      assert.equal(runtime.enforced.state, 'unknown');
      assert.deepEqual(
        report.findings
          .filter((finding) => finding.code.startsWith('runtime-'))
          .map((finding) => finding.code)
          .sort(),
        ['runtime-enforced-unknown', 'runtime-loaded-unknown'],
      );
    }
  });

  it('treats semantically inconsistent activation records as unknown runtime evidence', async () => {
    const inconsistent = [
      activation({ state: 'verified', drifted_resources: ['oms-skill:security-check'] }),
      activation({ state: 'degraded' }),
      activation({ state: 'failed' }),
      activation({ state: 'verified', failed_resources: ['runtime:hooks'] }),
      activation({ registered_hooks: [''] }),
    ];

    for (const record of inconsistent) {
      const { runtime } = await inspectDoctorWithActivation(record);
      assert.equal(runtime.loaded.state, 'unknown');
      assert.equal(runtime.enforced.state, 'unknown');
    }
  });

  it('does not infer write enforcement when activation has no write-before hook', async () => {
    const { runtime } = await inspectDoctorWithActivation(activation({ registered_hooks: ['tool.execute.after'] }));

    assert.equal(runtime.loaded.state, 'verified');
    assert.equal(runtime.enforced.state, 'unknown');
    assert.equal(runtime.enforced.reason, 'OpenCode activation does not include tool.execute.before.');
  });

  it('reports resource drift from a degraded activation without downgrading loaded evidence', async () => {
    const { runtime, report } = await inspectDoctorWithActivation(activation({
      state: 'degraded',
      drifted_resources: ['oms-skill:security-check'],
    }));

    assert.equal(runtime.loaded.state, 'verified');
    assert.equal(runtime.postinstall.state, 'drifted');
    assert.equal(report.findings.some((finding) => finding.code === 'resource-drifted'), true);
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

    const invocation = process.platform === 'win32'
      ? { command: process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe', args: ['/d', '/s', '/c', 'opencode', 'plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force'] }
      : { command: 'opencode', args: ['plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force'] };
    assert.deepEqual(calls, [{
      ...invocation,
      options: { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    }]);
    assert.equal(installation.status, 'succeeded');
    assert.ok(messages.includes('✓ oh-my-sdd (OpenCode) npm 插件安装完成'));
    assert.deepEqual(installation.summary.next_actions, [
      '重启 OpenCode 后完成插件加载；随后可运行 oms doctor --tool opencode 查看注册状态。',
    ]);
    assert.equal(installation.events.filter((event) => event.status === 'deferred').length, 4);
  });

  it('runs the native OpenCode plugin command through ComSpec on Windows', async () => {
    const calls = [];
    const installation = await OpenCodeAdapter.install({
      announce: () => {},
      platform: 'win32',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
      execFileSync: (command, args, options) => {
        calls.push({ command, args, options });
      },
    });

    assert.equal(installation.status, 'succeeded');
    assert.deepEqual(calls, [{
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'opencode', 'plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force'],
      options: { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    }]);
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

  it('includes both stderr and stdout when the native plugin install fails', async () => {
    const installation = await OpenCodeAdapter.install({
      announce: () => {},
      execFileSync: () => {
        const error = new Error('Command failed');
        error.stderr = 'registry unavailable';
        error.stdout = 'retrying package resolution';
        throw error;
      },
    });

    const failure = installation.events.find((event) => event.status === 'failed');
    assert.match(failure.reason, /registry unavailable/);
    assert.match(failure.reason, /retrying package resolution/);
  });

  it('numbers the five SDD workflow commands with integer rings', () => {
    assert.deepEqual(
      SDD_COMMANDS.slice(0, 5).map((command) => command.description.match(/第 (\d+) 环/)?.[1]),
      ['1', '2', '3', '4', '5']
    );
  });
});

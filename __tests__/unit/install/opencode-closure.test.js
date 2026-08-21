import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { OpenCodeAdapter } from '../../../install/hosts/opencode-adapter.js';
import { doctor } from '../../../install/control-plane/health.js';
import { applyRepair } from '../../../install/control-plane/repair.js';
import { buildRepairPlan } from '../../../install/control-plane/repair.js';
import { renderText } from '../../../install/control-plane/render.js';
import { runOmsInstall } from '../../../bin/oms-install.js';
import { resourceDigest } from '../../../opencode/scripts/resource-ownership.mjs';

test('OpenCode plan exposes detection, versions, scope, and lifecycle ownership', () => {
  const plan = OpenCodeAdapter.describe({});
  const dependencyNames = plan.dependencies.map((dependency) => dependency.name);
  const resourceKinds = Object.fromEntries(plan.resources.map((resource) => [resource.type, resource]));

  assert.equal(typeof plan.detected, 'boolean');
  assert.ok(dependencyNames.includes('node'));
  assert.ok(dependencyNames.includes('opencode'));
  assert.ok(plan.dependencies.every((dependency) => ['required', 'optional'].includes(dependency.classification)));
  assert.ok(plan.dependencies.every((dependency) => ['available', 'missing', 'unknown'].includes(dependency.state)));
  assert.equal(resourceKinds.config.phase, 'install');
  assert.equal(resourceKinds['npm-plugin'].phase, 'install');
  assert.equal(resourceKinds['plugin-resources'].phase, 'postinstall');
  assert.equal(resourceKinds.commands.phase, 'postinstall');
  assert.equal(resourceKinds.agents.phase, 'postinstall');
  assert.equal(resourceKinds.runtime.phase, 'runtime');
  assert.equal(plan.scope.kind, 'global');
  assert.match(plan.scope.path, /opencode/);
});

test('OpenCode reports a missing host runtime when CLI and config are absent', () => {
  const home = mkdtempSync(join(tmpdir(), 'oms-opencode-detection-'));
  const adapterUrl = new URL('../../../install/hosts/opencode-adapter.js', import.meta.url).href;
  const script = `
    const { OpenCodeAdapter } = await import(${JSON.stringify(adapterUrl)});
    process.stdout.write(JSON.stringify(OpenCodeAdapter.describe()));
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
        PATH: '',
      },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const host = JSON.parse(result.stdout);
    assert.equal(host.detected, false);
    assert.equal(host.capabilities.host_runtime.level, 'missing');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('OpenCode installation returns structured events and postflight evidence', () => {
  const home = mkdtempSync(join(tmpdir(), 'oms-opencode-closure-'));
  const mainUrl = new URL('../../../install/main.js', import.meta.url).href;
  const script = `
    const { main } = await import(${JSON.stringify(mainUrl)});
    const result = await main({ tool: 'opencode' });
    process.stdout.write(JSON.stringify(result));
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
        PATH: '',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const installation = JSON.parse(result.stdout);
    assert.equal(installation.type, 'installation-result');
    assert.ok(installation.events.some((event) => event.status === 'running'));
    assert.ok(installation.events.some((event) => event.status === 'succeeded'));
    assert.ok(installation.events.some((event) => event.status === 'warning' && event.resource.phase === 'postinstall'));
    assert.equal(installation.postflight.written.state, 'verified');
    assert.equal(installation.postflight.registered.state, 'verified');
    assert.equal(installation.postflight.loaded.state, 'unknown');
    assert.equal(installation.postflight.enforced.state, 'unknown');
    assert.deepEqual(JSON.parse(readFileSync(join(home, '.config/opencode/opencode.json'), 'utf8')).plugin, [
      '@cli-tools/oh-my-sdd-opencode',
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('OpenCode doctor includes actionable missing-resource evidence', () => {
  const home = mkdtempSync(join(tmpdir(), 'oms-opencode-doctor-'));
  const adapterUrl = new URL('../../../install/hosts/opencode-adapter.js', import.meta.url).href;
  const healthUrl = new URL('../../../install/control-plane/health.js', import.meta.url).href;
  const script = `
    const { OpenCodeAdapter } = await import(${JSON.stringify(adapterUrl)});
    const { doctor } = await import(${JSON.stringify(healthUrl)});
    process.stdout.write(JSON.stringify(await doctor({ adapters: [OpenCodeAdapter], ctx: {} })));
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
        PATH: '',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    const finding = report.findings.find((item) => item.host === 'opencode' && item.code === 'resource-missing');
    assert.ok(finding);
    assert.equal(finding.path.endsWith('opencode.json'), true);
    assert.equal(finding.action, 'patch-config');
    assert.equal(finding.level, 'warning');
    assert.match(finding.next_action, /repair/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('OpenCode doctor reports postinstall drift and repair preserves user changes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'oms-opencode-drift-'));
  const configDir = join(home, '.config', 'opencode');
  const target = join(configDir, 'commands', 'sdd-spec.md');
  const manifestPath = join(home, '.oh-my-sdd', 'opencode-npm-resources.json');
  const previousEnv = Object.fromEntries([
    'HOME', 'USERPROFILE', 'XDG_HOME_DIR', 'XDG_CONFIG_HOME', 'OPENCODE_CONFIG_DIR', 'PATH',
  ].map((key) => [key, process.env[key]]));

  try {
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.XDG_HOME_DIR = home;
    process.env.XDG_CONFIG_HOME = join(home, '.config');
    process.env.OPENCODE_CONFIG_DIR = configDir;
    process.env.PATH = '';

    mkdirSync(join(configDir, 'skills'), { recursive: true });
    mkdirSync(join(configDir, 'commands'), { recursive: true });
    mkdirSync(join(home, '.oh-my-sdd'), { recursive: true });
    writeFileSync(join(configDir, 'AGENTS.md'), '# managed\n');
    writeFileSync(join(configDir, 'opencode.json'), JSON.stringify({ plugin: ['@cli-tools/oh-my-sdd-opencode'] }));
    writeFileSync(target, 'installed command\n');
    writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      resources: [{
        target,
        created: true,
        backup: null,
        installed_digest: resourceDigest(target),
      }],
    }));
    writeFileSync(target, 'user-modified command\n');

    const report = await doctor({ adapters: [OpenCodeAdapter], ctx: {} });
    const finding = report.findings.find((item) => item.code === 'resource-drifted');
    assert.ok(finding);
    assert.equal(finding.path, target);
    assert.notEqual(finding.current_digest, finding.expected_digest);
    assert.match(finding.next_action, /preserve|manual|Review/i);

    const repairPlan = buildRepairPlan(report);
    const repairResult = await applyRepair(repairPlan, {
      applyStep: (step) => OpenCodeAdapter.applyResource(step),
    });
    assert.equal(repairResult.status, 'failed');
    const driftRepair = repairResult.steps.find((step) => step.code === 'resource-drifted');
    assert.equal(driftRepair.status, 'warning');
    assert.match(driftRepair.next_action, /手动|manual/i);
    assert.equal(readFileSync(target, 'utf8'), 'user-modified command\n');
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  }
});

test('unsupported repair steps are not reported as succeeded', async () => {
  const result = await applyRepair({
    steps: [{ host: 'opencode', path: '/tmp/commands', action: 'sync-postinstall', owned: true }],
  }, { applyStep: async () => ({ status: 'unsupported', message: 'npm lifecycle required' }) });

  assert.equal(result.steps[0].status, 'unsupported');
  assert.notEqual(result.status, 'succeeded');
  assert.equal(result.summary.unsupported, 1);
});

test('repair plan keeps non-repairable OpenCode findings explicit', async () => {
  const plan = buildRepairPlan({ findings: [{
    host: 'opencode',
    code: 'postinstall-pending',
    owned: false,
    repairable: false,
    message: 'npm lifecycle is pending',
    next_action: 'Start OpenCode',
  }] });

  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].unsupported, true);
  const result = await applyRepair(plan, { applyStep: async () => {
    throw new Error('unsupported steps must not execute');
  } });
  assert.equal(result.status, 'failed');
  assert.equal(result.steps[0].status, 'unsupported');
});

test('OpenCode adapter follows an explicit effective configuration directory', () => {
  const home = mkdtempSync(join(tmpdir(), 'oms-opencode-custom-dir-'));
  const configDir = join(home, 'custom-opencode');
  const mainUrl = new URL('../../../install/main.js', import.meta.url).href;
  const script = `
    const { main } = await import(${JSON.stringify(mainUrl)});
    process.stdout.write(JSON.stringify(await main({ tool: 'opencode' })));
  `;

  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      env: { ...process.env, HOME: home, USERPROFILE: home, OPENCODE_CONFIG_DIR: configDir, PATH: '' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const installation = JSON.parse(result.stdout);
    assert.equal(installation.postflight.written.path, join(configDir, 'opencode.json'));
    assert.deepEqual(JSON.parse(readFileSync(join(configDir, 'opencode.json'), 'utf8')).plugin, [
      '@cli-tools/oh-my-sdd-opencode',
    ]);
    assert.equal(existsSync(join(home, '.config/opencode/opencode.json')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('plan text shows detection, dependency status, scope, and write phases', () => {
  const text = renderText({
    schema_version: 1,
    hosts: [{
      id: 'opencode',
      display_name: 'OpenCode',
      detected: false,
      scope: { kind: 'global', path: '/tmp/.config/opencode' },
      dependencies: [{ name: 'opencode', classification: 'optional', state: 'missing', available: false, source: 'PATH' }],
      resources: [{ type: 'config', path: '/tmp/opencode.json', action: 'patch', phase: 'install' }],
      capabilities: {},
      risks: [],
      recommendation: { action: 'install', reason: 'Install OpenCode first' },
    }],
  });

  assert.match(text, /Detected: no/);
  assert.match(text, /Dependencies:/);
  assert.match(text, /optional.*missing/);
  assert.match(text, /Scope: global/);
  assert.match(text, /phase: install/);
});

test('multiple-host selection explains that no files were written', async () => {
  const stderr = { value: '', write(value) { this.value += value; } };
  const exitCode = await runOmsInstall([], {
    mainFn: async ({ dryRun }) => dryRun ? {
      schema_version: 1,
      selection_required: true,
      selection_options: ['claude', 'opencode'],
      hosts: [],
    } : null,
    stderr,
  });

  assert.equal(exitCode, 2);
  assert.match(stderr.value, /未执行写入/);
  assert.match(stderr.value, /oms-install --tool/);
});

test('corrupt OpenCode configuration fails without replacing the user file', () => {
  const home = mkdtempSync(join(tmpdir(), 'oms-opencode-corrupt-'));
  const adapterUrl = new URL('../../../install/hosts/opencode-adapter.js', import.meta.url).href;
  const configPath = join(home, '.config/opencode/opencode.json');
  const script = `
    const { OpenCodeAdapter } = await import(${JSON.stringify(adapterUrl)});
    process.stdout.write(JSON.stringify(await OpenCodeAdapter.install({ announce() {} })));
  `;

  try {
    const dir = join(home, '.config/opencode');
    mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, '{ invalid json');
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
    assert.equal(JSON.parse(result.stdout).status, 'failed');
    assert.equal(readFileSync(configPath, 'utf8'), '{ invalid json');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { KiloCodeAdapter } from '../../../../packages/product/install/hosts/kilocode-adapter.js';
import { HostAdapter } from '../../../../packages/product/install/host-adapter.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..', '..', '..', '..', 'packages', 'product');
const ADAPTER_URL = pathToFileURL(
  join(PACKAGE_ROOT, 'install', 'hosts', 'kilocode-adapter.js')
).href;
const SENTINEL_BEGIN = '<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->';

async function runAdapter(method, fakeHome, packageRoot = PACKAGE_ROOT) {
  const script = `
    import { KiloCodeAdapter } from ${JSON.stringify(ADAPTER_URL)};
    await KiloCodeAdapter.${method}({
      PACKAGE_ROOT: ${JSON.stringify(packageRoot)},
      announce() {},
    });
  `;
  await execFileAsync(process.execPath, ['--input-type=module', '--eval', script], {
    env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
  });
}

describe('KiloCodeAdapter', () => {
  it('extends HostAdapter', () => {
    assert.ok(Object.getPrototypeOf(KiloCodeAdapter) === HostAdapter);
  });

  it('has id = "kilocode"', () => {
    assert.equal(KiloCodeAdapter.id, 'kilocode');
  });

  it('has a display name', () => {
    assert.equal(typeof KiloCodeAdapter.displayName, 'string');
    assert.ok(KiloCodeAdapter.displayName.length > 0);
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof KiloCodeAdapter.isInstalled(), 'boolean');
  });

  it('is always advisory and never claims write prevention', () => {
    const host = KiloCodeAdapter.describe({ PACKAGE_ROOT });

    assert.deepEqual(host.capabilities.write_prevention, {
      supported: false,
      level: 'advisory',
      evidence: 'Kilo Code has no hook system, so HARD_RULE protection is advisory-only through AGENTS.md.',
    });
    assert.equal(host.risks.some((risk) => /no Hook|HARD_RULE|advisory/i.test(risk.message)), true);
  });

  it('uses version objects for every dependency fact', () => {
    const host = KiloCodeAdapter.describe({ PACKAGE_ROOT });
    assert.equal(host.dependencies.every((dependency) => (
      dependency.version && typeof dependency.version === 'object' && !Array.isArray(dependency.version)
    )), true);
  });

  it('reports a missing host runtime when CLI and config are absent', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-kilocode-detection-'));
    const script = `
      const { KiloCodeAdapter } = await import(${JSON.stringify(ADAPTER_URL)});
      process.stdout.write(JSON.stringify(KiloCodeAdapter.describe()));
    `;
    try {
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
        env: {
          ...process.env,
          HOME: fakeHome,
          USERPROFILE: fakeHome,
          XDG_HOME_DIR: fakeHome,
          PATH: '',
        },
        encoding: 'utf8',
      });

      assert.equal(result.status, 0, result.stderr);
      const host = JSON.parse(result.stdout);
      assert.equal(host.detected, false);
      assert.equal(host.capabilities.host_runtime.level, 'missing');
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('install() is an async function', () => {
    assert.equal(KiloCodeAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is an async function', () => {
    assert.equal(KiloCodeAdapter.uninstall.constructor.name, 'AsyncFunction');
  });

  it('has capabilities defined', () => {
    assert.ok(KiloCodeAdapter.capabilities);
    assert.equal(KiloCodeAdapter.capabilities.hooks, false);
    assert.equal(KiloCodeAdapter.capabilities.baselineEnforcement, 'advisory');
  });

  it('preserves user AGENTS.md content and keeps one OMS block across reinstall', async () => {
    // Arrange
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-kilocode-install-'));
    const agentsPath = join(fakeHome, '.config', 'kilo', 'AGENTS.md');
    const userContent = '# Personal instructions\nKeep this line.\n';
    mkdirSync(dirname(agentsPath), { recursive: true });
    writeFileSync(agentsPath, userContent);

    try {
      // Act
      await runAdapter('install', fakeHome);
      await runAdapter('install', fakeHome);

      // Assert
      const installed = readFileSync(agentsPath, 'utf8');
      assert.ok(installed.includes(userContent.trim()), '用户 AGENTS.md 内容应保留');
      assert.equal(installed.split(SENTINEL_BEGIN).length - 1, 1, 'OMS 块应保持幂等');
      assert.ok(installed.includes('# 企业 SDD Agent 基线'));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('uninstall removes only OMS content and OMS-owned skill directories', async () => {
    // Arrange
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-kilocode-uninstall-'));
    const agentsPath = join(fakeHome, '.config', 'kilo', 'AGENTS.md');
    const customSkill = join(fakeHome, '.kilo', 'skills', 'my-private-skill');
    const userContent = '# Personal instructions\nKeep this line.\n';
    mkdirSync(dirname(agentsPath), { recursive: true });
    mkdirSync(customSkill, { recursive: true });
    writeFileSync(agentsPath, userContent);
    writeFileSync(join(customSkill, 'SKILL.md'), '# My private skill\n');
    await runAdapter('install', fakeHome);
    assert.ok(existsSync(join(fakeHome, '.kilo', 'skills', 'sdd-spec')));

    try {
      // Act
      await runAdapter('uninstall', fakeHome);

      // Assert
      const uninstalled = readFileSync(agentsPath, 'utf8');
      assert.equal(uninstalled, userContent);
      assert.ok(!uninstalled.includes(SENTINEL_BEGIN));
      assert.ok(existsSync(customSkill), '用户自建 skill 不应被删除');
      assert.ok(!existsSync(join(fakeHome, '.kilo', 'skills', 'sdd-spec')));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('uninstall preserves same-name user skills when no ownership sentinel exists', async () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-kilocode-no-sentinel-'));
    const skillFile = join(fakeHome, '.kilo', 'skills', 'sdd-spec', 'SKILL.md');
    const userSkill = '# Independently authored sdd-spec\n';
    try {
      mkdirSync(dirname(skillFile), { recursive: true });
      writeFileSync(skillFile, userSkill);

      await runAdapter('uninstall', fakeHome);

      assert.equal(readFileSync(skillFile, 'utf8'), userSkill);
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('restores a pre-existing same-name user skill on uninstall', async () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-kilocode-conflict-'));
    const skillFile = join(fakeHome, '.kilo', 'skills', 'sdd-spec', 'SKILL.md');
    const userSkill = '# User-owned sdd-spec\nDo not delete me.\n';
    try {
      mkdirSync(dirname(skillFile), { recursive: true });
      writeFileSync(skillFile, userSkill);

      await runAdapter('install', fakeHome);
      assert.notEqual(readFileSync(skillFile, 'utf8'), userSkill);

      const sentinel = JSON.parse(readFileSync(
        join(fakeHome, '.oh-my-sdd', 'baseline-kilocode.sentinel'),
        'utf8',
      ));
      assert.deepEqual(
        sentinel.skill_ownership.find((skill) => skill.name === 'sdd-spec'),
        { name: 'sdd-spec', had_existing: true },
      );

      await runAdapter('uninstall', fakeHome);
      assert.equal(readFileSync(skillFile, 'utf8'), userSkill);
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('loads resources from a PACKAGE_ROOT containing spaces', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'oms kilo package '));
    const fakeHome = join(sandbox, 'home');
    const packageRoot = join(sandbox, 'package root');
    try {
      mkdirSync(join(packageRoot, 'skills', 'sample'), { recursive: true });
      mkdirSync(join(packageRoot, 'content'), { recursive: true });
      writeFileSync(join(packageRoot, 'skills', 'sample', 'SKILL.md'), '# sample\n');
      writeFileSync(
        join(packageRoot, 'content', 'enterprise-baseline.md'),
        '---\nversion: 1\n---\n# Baseline from spaced root\n',
      );

      await runAdapter('install', fakeHome, packageRoot);

      assert.ok(readFileSync(
        join(fakeHome, '.config', 'kilo', 'AGENTS.md'),
        'utf8',
      ).includes('# Baseline from spaced root'));
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('does not restore an OMS skill recorded by a legacy sentinel after upgrade', async () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-kilocode-legacy-upgrade-'));
    const skillDir = join(fakeHome, '.kilo', 'skills', 'sdd-spec');
    const sentinelPath = join(fakeHome, '.oh-my-sdd', 'baseline-kilocode.sentinel');
    try {
      mkdirSync(skillDir, { recursive: true });
      mkdirSync(dirname(sentinelPath), { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), '# old OMS skill\n');
      writeFileSync(sentinelPath, JSON.stringify({
        tool: 'kilocode',
        dest: join(fakeHome, '.config', 'kilo', 'AGENTS.md'),
        skill_names: ['sdd-spec'],
      }));

      await runAdapter('install', fakeHome);
      await runAdapter('uninstall', fakeHome);

      assert.ok(!existsSync(skillDir));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

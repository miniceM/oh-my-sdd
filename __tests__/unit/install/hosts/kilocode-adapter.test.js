import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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
import { KiloCodeAdapter } from '../../../../install/hosts/kilocode-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..', '..', '..', '..');
const ADAPTER_URL = pathToFileURL(
  join(PACKAGE_ROOT, 'install', 'hosts', 'kilocode-adapter.js')
).href;
const SENTINEL_BEGIN = '<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->';

async function runAdapter(method, fakeHome) {
  const script = `
    import { KiloCodeAdapter } from ${JSON.stringify(ADAPTER_URL)};
    await KiloCodeAdapter.${method}({
      PACKAGE_ROOT: ${JSON.stringify(PACKAGE_ROOT)},
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
});

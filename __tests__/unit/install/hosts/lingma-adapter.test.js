import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
import { fileURLToPath } from 'node:url';
import {
  LingmaAdapter,
  replacePluginRoot,
} from '../../../../install/hosts/lingma-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(TEST_DIR, '..', '..', '..', '..');
const ADAPTER_URL = new URL('../../../../install/hosts/lingma-adapter.js', import.meta.url).href;

function runAdapter(homeDir, method) {
  const script = `
    import { LingmaAdapter } from ${JSON.stringify(ADAPTER_URL)};
    await LingmaAdapter.${method}({
      PACKAGE_ROOT: ${JSON.stringify(PACKAGE_ROOT)},
      announce: () => {},
    });
  `;
  execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
    stdio: 'pipe',
  });
}

describe('LingmaAdapter', () => {
  it('extends HostAdapter', () => {
    assert.ok(Object.getPrototypeOf(LingmaAdapter) === HostAdapter);
  });

  it('has id = "lingma"', () => {
    assert.equal(LingmaAdapter.id, 'lingma');
  });

  it('has a display name', () => {
    assert.equal(typeof LingmaAdapter.displayName, 'string');
    assert.ok(LingmaAdapter.displayName.length > 0);
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof LingmaAdapter.isInstalled(), 'boolean');
  });

  it('keeps documented integration separate from unknown runtime evidence', () => {
    const host = LingmaAdapter.describe({ PACKAGE_ROOT });

    assert.deepEqual(host.capabilities.documentation_adaptation, {
      supported: true,
      level: 'written',
      evidence: 'Lingma rules, skills, and settings hook resources are documented installation targets.',
    });
    assert.deepEqual(host.capabilities.runtime_e2e, {
      supported: false,
      level: 'unknown',
      evidence: 'No Lingma runtime or end-to-end hook-loading probe is available during planning.',
    });
  });

  it('uses version objects for every dependency fact', () => {
    const host = LingmaAdapter.describe({ PACKAGE_ROOT });
    assert.equal(host.dependencies.every((dependency) => (
      dependency.version && typeof dependency.version === 'object' && !Array.isArray(dependency.version)
    )), true);
  });

  it('reports a missing host runtime when CLI and config are absent', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-lingma-detection-'));
    const script = `
      const { LingmaAdapter } = await import(${JSON.stringify(ADAPTER_URL)});
      process.stdout.write(JSON.stringify(LingmaAdapter.describe()));
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
    assert.equal(LingmaAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is an async function', () => {
    assert.equal(LingmaAdapter.uninstall.constructor.name, 'AsyncFunction');
  });

  it('preserves same-event user handlers and is idempotent on reinstall', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-lingma-home-'));
    const settingsPath = join(fakeHome, '.lingma', 'settings.json');
    try {
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'user-pre-hook' }] }],
          Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'user-stop-hook' }] }],
        },
        userSetting: true,
      }));

      runAdapter(fakeHome, 'install');
      runAdapter(fakeHome, 'install');

      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const preCommands = settings.hooks.PreToolUse.flatMap(entry => entry.hooks.map(hook => hook.command));
      const stopCommands = settings.hooks.Stop.flatMap(entry => entry.hooks.map(hook => hook.command));

      assert.equal(preCommands.filter(command => command === 'user-pre-hook').length, 1);
      assert.equal(preCommands.filter(command => command.includes('/hooks/pre-tool-use.js')).length, 1);
      assert.equal(stopCommands.filter(command => command === 'user-stop-hook').length, 1);
      assert.equal(stopCommands.filter(command => command.includes('/hooks/session-end.js')).length, 1);
      assert.equal(settings.userSetting, true);
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('uninstall removes only owned skills and OMS hook handlers', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-lingma-home-'));
    const lingmaDir = join(fakeHome, '.lingma');
    const settingsPath = join(lingmaDir, 'settings.json');
    const customSkill = join(lingmaDir, 'skills', 'my-private-skill', 'SKILL.md');
    try {
      mkdirSync(dirname(settingsPath), { recursive: true });
      mkdirSync(dirname(customSkill), { recursive: true });
      writeFileSync(customSkill, '# user-owned skill\n');
      writeFileSync(settingsPath, JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'user-pre-hook' }] }],
          Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'user-stop-hook' }] }],
        },
      }));

      runAdapter(fakeHome, 'install');
      assert.ok(existsSync(join(lingmaDir, 'skills', 'sdd-spec', 'SKILL.md')));
      const ownership = JSON.parse(readFileSync(
        join(fakeHome, '.oh-my-sdd', 'baseline-lingma.sentinel'),
        'utf8',
      ));
      assert.ok(ownership.skill_names.includes('sdd-spec'));
      assert.ok(ownership.hook_commands.some(command => command.includes('/hooks/pre-tool-use.js')));

      runAdapter(fakeHome, 'uninstall');

      assert.ok(existsSync(customSkill), 'user-owned skill must survive uninstall');
      assert.ok(!existsSync(join(lingmaDir, 'skills', 'sdd-spec')), 'OMS-owned skill must be removed');

      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const preCommands = settings.hooks.PreToolUse.flatMap(entry => entry.hooks.map(hook => hook.command));
      const stopCommands = settings.hooks.Stop.flatMap(entry => entry.hooks.map(hook => hook.command));
      assert.deepEqual(preCommands, ['user-pre-hook']);
      assert.deepEqual(stopCommands, ['user-stop-hook']);
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('uninstall preserves same-name user skills when no ownership sentinel exists', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-lingma-no-sentinel-'));
    const skillFile = join(fakeHome, '.lingma', 'skills', 'sdd-spec', 'SKILL.md');
    const userSkill = '# Independently authored sdd-spec\n';
    try {
      mkdirSync(dirname(skillFile), { recursive: true });
      writeFileSync(skillFile, userSkill);

      runAdapter(fakeHome, 'uninstall');

      assert.equal(readFileSync(skillFile, 'utf8'), userSkill);
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('uninstall cleans legacy OMS hooks when sentinel lacks ownership metadata', () => {
    // Arrange: simulate an installation created before hook_commands existed.
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-lingma-legacy-home-'));
    const lingmaDir = join(fakeHome, '.lingma');
    const settingsPath = join(lingmaDir, 'settings.json');
    const sentinelPath = join(fakeHome, '.oh-my-sdd', 'baseline-lingma.sentinel');
    try {
      mkdirSync(dirname(settingsPath), { recursive: true });
      mkdirSync(dirname(sentinelPath), { recursive: true });
      const template = replacePluginRoot(JSON.parse(readFileSync(
        join(PACKAGE_ROOT, 'install', 'common', 'fixtures', 'lingma-settings.json'),
        'utf8',
      )), PACKAGE_ROOT);
      writeFileSync(settingsPath, JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'user-pre-hook' }] },
            ...template.hooks.PreToolUse,
          ],
        },
      }));
      writeFileSync(sentinelPath, JSON.stringify({
        tool: 'lingma',
        dest: join(lingmaDir, 'rules', 'oh-my-sdd.md'),
        block_marker: null,
      }));

      // Act
      runAdapter(fakeHome, 'uninstall');

      // Assert
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const commands = settings.hooks.PreToolUse.flatMap(entry => entry.hooks.map(hook => hook.command));
      assert.deepEqual(commands, ['user-pre-hook']);
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('restores a pre-existing same-name user skill on uninstall', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-lingma-conflict-'));
    const skillFile = join(fakeHome, '.lingma', 'skills', 'sdd-spec', 'SKILL.md');
    const userSkill = '# User-owned sdd-spec\nDo not delete me.\n';
    try {
      mkdirSync(dirname(skillFile), { recursive: true });
      writeFileSync(skillFile, userSkill);

      runAdapter(fakeHome, 'install');
      assert.notEqual(readFileSync(skillFile, 'utf8'), userSkill);
      const sentinel = JSON.parse(readFileSync(
        join(fakeHome, '.oh-my-sdd', 'baseline-lingma.sentinel'),
        'utf8',
      ));
      assert.deepEqual(
        sentinel.skill_ownership.find((skill) => skill.name === 'sdd-spec'),
        { name: 'sdd-spec', had_existing: true },
      );

      runAdapter(fakeHome, 'uninstall');
      assert.equal(readFileSync(skillFile, 'utf8'), userSkill);
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('backs up malformed settings before replacing it', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-lingma-broken-settings-'));
    const settingsPath = join(fakeHome, '.lingma', 'settings.json');
    const malformed = '{ "hooks": broken json';
    try {
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, malformed);

      runAdapter(fakeHome, 'install');

      assert.equal(readFileSync(`${settingsPath}.oh-my-sdd-backup`, 'utf8'), malformed);
      assert.doesNotThrow(() => JSON.parse(readFileSync(settingsPath, 'utf8')));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('does not overwrite malformed settings when backup creation fails', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-lingma-backup-failure-'));
    const settingsPath = join(fakeHome, '.lingma', 'settings.json');
    const backupPath = `${settingsPath}.oh-my-sdd-backup`;
    const malformed = '{ "hooks": broken json';
    try {
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, malformed);
      mkdirSync(backupPath);

      assert.throws(() => runAdapter(fakeHome, 'install'));
      assert.equal(readFileSync(settingsPath, 'utf8'), malformed);
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it('inserts Windows plugin paths at the object level without corrupting JSON', () => {
    const pluginRoot = 'C:\\Program Files\\oh-my-sdd';
    const template = {
      hooks: {
        PreToolUse: [{ hooks: [{ command: 'node "<PLUGIN_ROOT>/hooks/pre-tool-use.js"' }] }],
      },
    };

    const result = replacePluginRoot(template, pluginRoot);
    const roundTripped = JSON.parse(JSON.stringify(result));

    assert.equal(
      roundTripped.hooks.PreToolUse[0].hooks[0].command,
      'node "C:\\Program Files\\oh-my-sdd/hooks/pre-tool-use.js"',
    );
  });

  it('does not restore an OMS skill recorded by a legacy sentinel after upgrade', () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'oms-lingma-legacy-upgrade-'));
    const skillDir = join(fakeHome, '.lingma', 'skills', 'sdd-spec');
    const sentinelPath = join(fakeHome, '.oh-my-sdd', 'baseline-lingma.sentinel');
    try {
      mkdirSync(skillDir, { recursive: true });
      mkdirSync(dirname(sentinelPath), { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), '# old OMS skill\n');
      writeFileSync(sentinelPath, JSON.stringify({
        tool: 'lingma',
        dest: join(fakeHome, '.lingma', 'rules', 'oh-my-sdd.md'),
        skill_names: ['sdd-spec'],
      }));

      runAdapter(fakeHome, 'install');
      runAdapter(fakeHome, 'uninstall');

      assert.ok(!existsSync(skillDir));
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});

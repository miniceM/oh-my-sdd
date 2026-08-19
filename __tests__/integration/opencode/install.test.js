import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  resourceDigest,
  writeOwnershipManifest,
} from '../../../opencode/scripts/resource-ownership.mjs';
import {
  firstNpmPackEntry,
  parseNpmPackJson,
} from '../../helpers/opencode-e2e-harness.js';
import { resolveNpmCli } from '../../helpers/resolve-npm-cli.js';

const worktreeRoot = process.cwd();

function runNpm(args, options) {
  return execFileSync(process.execPath, [resolveNpmCli(), ...args], options);
}

function runNpmWithOutput(args, options) {
  const result = spawnSync(
    process.execPath,
    [resolveNpmCli(), ...args],
    { ...options, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  assert.equal(result.status, 0, `npm command failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

test('install + uninstall: oms-install/uninstall --tool opencode round-trip', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-install-'));
  const env = { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome };

  // Step 1: install (use CLI wrapper which parses --tool)
  execFileSync('node', ['bin/oms-install.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env,
    stdio: 'pipe',
  });
  const pluginDir = path.join(tmpHome, '.config', 'opencode', 'plugins', 'oh-my-sdd');
  assert.ok(!fs.existsSync(pluginDir), 'production install should not copy a local development plugin');
  const cfgPath = path.join(tmpHome, '.config', 'opencode', 'opencode.json');
  const cfgAfterInstall = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  assert.ok(
    cfgAfterInstall.plugin.includes('@cli-tools/oh-my-sdd-opencode'),
    `opencode.json 应包含 npm 插件，实际: ${JSON.stringify(cfgAfterInstall.plugin)}`
  );

  // Simulate resources created by the npm package's postinstall lifecycle.
  const npmCommand = path.join(tmpHome, '.config', 'opencode', 'commands', 'sdd-doc.md');
  fs.mkdirSync(path.dirname(npmCommand), { recursive: true });
  fs.writeFileSync(npmCommand, 'plugin-owned command');
  const delegatedSkill = path.join(
    tmpHome,
    '.config',
    'opencode',
    'skills',
    'brainstorming',
  );
  fs.mkdirSync(delegatedSkill, { recursive: true });
  fs.writeFileSync(path.join(delegatedSkill, 'SKILL.md'), 'plugin-owned delegated skill');
  const manifestPath = path.join(tmpHome, '.oh-my-sdd', 'opencode-npm-resources.json');
  writeOwnershipManifest(manifestPath, [
    {
      target: npmCommand,
      backup: null,
      created: true,
      installed_digest: resourceDigest(npmCommand),
    },
    {
      target: delegatedSkill,
      backup: null,
      created: true,
      installed_digest: resourceDigest(delegatedSkill),
    },
  ]);
  fs.writeFileSync(npmCommand, 'user-modified command');

  // 模拟旧 SDK fallback 写入：卸载只能移除 OMS 区块，不能删除用户内容。
  const agentsPath = path.join(tmpHome, '.config', 'opencode', 'AGENTS.md');
  fs.writeFileSync(agentsPath, [
    '# User instructions',
    '<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->',
    'OMS baseline',
    '<!-- OH-MY-SDD:END -->',
    '',
  ].join('\n'));

  // Step 2: uninstall
  execFileSync('node', ['bin/oms-uninstall.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env,
    stdio: 'pipe',
  });
  assert.ok(!fs.existsSync(pluginDir), 'plugin dir should be removed');
  const cfgAfterUninstall = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const plugins = cfgAfterUninstall.plugin ?? [];
  assert.ok(!plugins.includes('@cli-tools/oh-my-sdd-opencode'), 'uninstall 应清掉 npm 插件 entry');
  assert.ok(!plugins.includes('./plugins/oh-my-sdd/index.js'), 'uninstall 应清掉 ./plugins/oh-my-sdd/index.js');
  assert.ok(!plugins.includes('oh-my-sdd'), 'uninstall 应清掉裸字符串 oh-my-sdd');
  assert.ok(!plugins.includes('./plugins/oh-my-sdd/plugin.js'), 'uninstall 应清掉旧 ./plugins/oh-my-sdd/plugin.js');
  assert.equal(fs.readFileSync(agentsPath, 'utf8'), '# User instructions\n');
  assert.equal(fs.existsSync(npmCommand), false, 'modified command should move out of the managed path');
  const preservedCommands = fs.readdirSync(path.dirname(npmCommand))
    .filter((name) => name.startsWith('sdd-doc.md.oh-my-sdd-modified-'));
  assert.equal(preservedCommands.length, 1, 'modified command should be preserved under a sibling name');
  assert.equal(
    fs.readFileSync(path.join(path.dirname(npmCommand), preservedCommands[0]), 'utf8'),
    'user-modified command',
  );
  assert.equal(fs.existsSync(delegatedSkill), false, 'npm-owned delegated skill should be removed');
  assert.equal(fs.existsSync(manifestPath), false, 'npm ownership manifest should be removed');
});

test('packed OpenCode package installs from a clean tarball and its wrapper fully uninstalls', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-opencode-pack-'));
  const home = path.join(root, 'home');
  const prefix = path.join(root, 'prefix');
  const cache = path.join(root, 'cache');
  const packDir = path.join(root, 'pack');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(packDir, { recursive: true });

  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    npm_config_prefix: prefix,
    npm_config_cache: cache,
  };
  delete env.OPENCODE_CONFIG_DIR;
  delete env.XDG_CONFIG_HOME;

  try {
    const packResult = runNpmWithOutput([
      'pack',
      '--json',
      '--pack-destination',
      packDir,
    ], {
      cwd: path.join(worktreeRoot, 'opencode'),
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const packed = parseNpmPackJson(packResult.stdout, packResult.stderr);
    const packEntry = firstNpmPackEntry(packed, packResult);
    const tarball = path.join(packDir, packEntry.filename);
    const tarballFiles = new Set(packEntry.files.map((file) => file.path));
    for (const requiredRuntimeFile of ['lib/rules.js', 'lib/iam-cli.js', 'lib/dop-client.js']) {
      assert.ok(
        tarballFiles.has(requiredRuntimeFile),
        `packed OpenCode plugin must include hook runtime dependency: ${requiredRuntimeFile}`,
      );
    }

    runNpm([
      'install',
      '--global',
      '--legacy-peer-deps',
      '--foreground-scripts',
      '--dangerously-allow-all-scripts',
      tarball,
    ], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.ok(fs.existsSync(path.join(home, '.config', 'opencode', 'skills', 'sdd-plan', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(home, '.config', 'opencode', 'skills', 'brainstorming', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(home, '.config', 'opencode', 'skills', 'test-driven-development', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(home, '.config', 'opencode', 'commands', 'sdd-plan.md')));

    const opencodeJson = path.join(home, '.config', 'opencode', 'opencode.json');
    fs.writeFileSync(opencodeJson, JSON.stringify({
      plugin: ['other-plugin', '@cli-tools/oh-my-sdd-opencode'],
      theme: 'user-theme',
    }));

    const packageRoot = process.platform === 'win32'
      ? path.join(prefix, 'node_modules', '@cli-tools', 'oh-my-sdd-opencode')
      : path.join(prefix, 'lib', 'node_modules', '@cli-tools', 'oh-my-sdd-opencode');
    const uninstallEntry = path.join(packageRoot, 'bin', 'oms-opencode-uninstall.mjs');
    assert.ok(fs.existsSync(uninstallEntry), 'packed package should expose its supported uninstaller');

    const uninstallOutput = execFileSync(process.execPath, [uninstallEntry], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(
      fs.existsSync(packageRoot),
      false,
      `uninstall wrapper should remove the npm package; output: ${uninstallOutput}`,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(opencodeJson, 'utf8')), {
      plugin: ['other-plugin'],
      theme: 'user-theme',
    });
    assert.equal(
      fs.existsSync(path.join(home, '.config', 'opencode', 'skills', 'brainstorming')),
      false,
      'uninstall wrapper should remove owned delegated resources first',
    );
    assert.equal(
      fs.existsSync(path.join(home, '.oh-my-sdd', 'opencode-npm-resources.json')),
      false,
      'uninstall wrapper should remove the ownership manifest',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

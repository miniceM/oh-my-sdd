import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  resourceDigest,
  writeOwnershipManifest,
} from '../../../opencode/scripts/resource-ownership.mjs';
import {
  firstNpmPackEntry,
  parseNpmPackJson,
  writePluginLoader,
} from '../../helpers/opencode-e2e-harness.js';
import { resolveNpmCli } from '../../helpers/resolve-npm-cli.js';

const worktreeRoot = process.cwd();

function createFakeOpenCode(tmpHome) {
  const binDir = path.join(tmpHome, 'fake-bin');
  const invocationLog = path.join(tmpHome, 'opencode-invocations.jsonl');
  const scriptPath = path.join(binDir, 'opencode.mjs');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(scriptPath, `
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('fake-opencode 1.0.0\\n');
  process.exit(0);
}
const expected = ['plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force'];
if (JSON.stringify(args) !== JSON.stringify(expected)) {
  process.stderr.write('unexpected fake opencode command: ' + JSON.stringify(args));
  process.exit(64);
}
fs.appendFileSync(process.env.OPENCODE_FAKE_INVOCATION_LOG, JSON.stringify(args) + '\\n');
const configDir = process.env.OPENCODE_CONFIG_DIR;
fs.mkdirSync(configDir, { recursive: true });
const configPath = path.join(configDir, 'opencode.json');
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
const plugins = Array.isArray(config.plugin) ? config.plugin : [];
if (!plugins.includes('@cli-tools/oh-my-sdd-opencode')) plugins.push('@cli-tools/oh-my-sdd-opencode');
fs.writeFileSync(configPath, JSON.stringify({ ...config, plugin: plugins }));
`);

  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(binDir, 'opencode.cmd'), `@echo off\n"${process.execPath}" "%~dp0opencode.mjs" %*\n`);
  } else {
    const executable = path.join(binDir, 'opencode');
    fs.writeFileSync(executable, `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`);
    fs.chmodSync(executable, 0o755);
  }

  return {
    launcherPath: process.platform === 'win32'
      ? path.join(binDir, 'opencode.cmd')
      : path.join(binDir, 'opencode'),
    invocationLog,
    path: `${binDir}${path.delimiter}${process.env.PATH || ''}`,
  };
}

test('fake OpenCode launcher delegates to its .mjs entrypoint instead of parsing ESM itself', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-fake-opencode-'));
  try {
    const fakeOpenCode = createFakeOpenCode(tmpHome);
    const launcher = fs.readFileSync(fakeOpenCode.launcherPath, 'utf8');
    assert.match(launcher, /opencode\.mjs/);
    assert.doesNotMatch(launcher, /^import\s/m);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

function readFakeOpenCodeInvocations(invocationLog) {
  return fs.readFileSync(invocationLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

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
  const fakeOpenCode = createFakeOpenCode(tmpHome);
  const env = {
    ...process.env,
    HOME: tmpHome,
    USERPROFILE: tmpHome,
    XDG_HOME_DIR: tmpHome,
    XDG_CONFIG_HOME: path.join(tmpHome, '.config'),
    OPENCODE_CONFIG_DIR: path.join(tmpHome, '.config', 'opencode'),
    OPENCODE_FAKE_INVOCATION_LOG: fakeOpenCode.invocationLog,
    PATH: fakeOpenCode.path,
  };

  // Step 1: install (use CLI wrapper which parses --tool)
  execFileSync('node', ['bin/oms-install.js', '--tool', 'opencode', '-y'], {
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
  assert.deepEqual(readFakeOpenCodeInvocations(fakeOpenCode.invocationLog), [
    ['plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force'],
  ]);

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

test('text install result closes the OpenCode pending loop in an isolated HOME', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-install-text-'));
  const fakeOpenCode = createFakeOpenCode(tmpHome);
  const env = {
    ...process.env,
    HOME: tmpHome,
    USERPROFILE: tmpHome,
    XDG_HOME_DIR: tmpHome,
    XDG_CONFIG_HOME: path.join(tmpHome, '.config'),
    OPENCODE_CONFIG_DIR: path.join(tmpHome, '.config', 'opencode'),
    OPENCODE_FAKE_INVOCATION_LOG: fakeOpenCode.invocationLog,
    PATH: fakeOpenCode.path,
  };

  try {
    const result = spawnSync('node', ['bin/oms-install.js', '--tool', 'opencode', '--yes'], {
      cwd: worktreeRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, result.stderr);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /Installation result \(status: succeeded\)/);
    assert.match(output, /action: install-plugin-native/);
    assert.match(output, /Installed @cli-tools\/oh-my-sdd-opencode through the OpenCode CLI/);
    assert.match(output, /\[deferred\]/);
    assert.match(output, /postinstall/);
    assert.match(output, /pending/);
    assert.match(output, /OpenCode managed skills directory|OpenCode managed commands directory/);
    assert.match(output, /npm lifecycle has not completed/);
    assert.match(output, /Checked npm lifecycle outputs/);
    assert.match(output, /oms doctor --tool opencode/);
    assert.match(output, /loaded: unknown/);
    assert.match(output, /OpenCode activation record is missing/);
    assert.match(output, /enforced: unknown/);
    assert.match(output, /OpenCode activation record is missing/);
    assert.ok(fs.existsSync(path.join(tmpHome, '.config', 'opencode', 'opencode.json')));
    assert.deepEqual(readFakeOpenCodeInvocations(fakeOpenCode.invocationLog), [
      ['plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force'],
    ]);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('native install activates the packed plugin lifecycle and doctor verifies enforcement', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-opencode-native-lifecycle-'));
  const home = path.join(root, 'home');
  const prefix = path.join(root, 'prefix');
  const packDir = path.join(root, 'pack');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(packDir, { recursive: true });
  const fakeOpenCode = createFakeOpenCode(root);
  const configDir = path.join(home, '.config', 'opencode');
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_HOME_DIR: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    OPENCODE_CONFIG_DIR: configDir,
    OPENCODE_FAKE_INVOCATION_LOG: fakeOpenCode.invocationLog,
    npm_config_prefix: prefix,
    npm_config_cache: path.join(root, 'cache'),
    PATH: fakeOpenCode.path,
  };

  try {
    const packResult = runNpmWithOutput(['pack', '--json', '--pack-destination', packDir], {
      cwd: path.join(worktreeRoot, 'opencode'), env,
    });
    const packEntry = firstNpmPackEntry(parseNpmPackJson(packResult.stdout, packResult.stderr), packResult);
    const tarballFiles = new Set(packEntry.files.map((file) => file.path));
    for (const requiredFile of [
      'dist/index.js', 'hooks/pre-tool-use.js', 'lib/rules.js', 'content/enterprise-baseline.md',
      'oms-skills/sdd-review/SKILL.md', '.opencode/commands/sdd-review.md', 'scripts/resource-bootstrap.mjs',
    ]) {
      assert.ok(tarballFiles.has(requiredFile), `packed plugin must include ${requiredFile}`);
    }

    execFileSync('node', ['bin/oms-install.js', '--tool', 'opencode', '--yes'], {
      cwd: worktreeRoot, env, stdio: 'pipe',
    });
    assert.deepEqual(readFakeOpenCodeInvocations(fakeOpenCode.invocationLog), [
      ['plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force'],
    ]);
    assert.ok(JSON.parse(fs.readFileSync(path.join(configDir, 'opencode.json'), 'utf8')).plugin
      .includes('@cli-tools/oh-my-sdd-opencode'));

    // An old command must be replaced by the package lifecycle on the next host load.
    const commandPath = path.join(configDir, 'commands', 'sdd-review.md');
    fs.mkdirSync(path.dirname(commandPath), { recursive: true });
    fs.writeFileSync(commandPath, '# legacy two-stage review\n');
    runNpm(['install', '--global', '--legacy-peer-deps', '--foreground-scripts', '--dangerously-allow-all-scripts',
      path.join(packDir, packEntry.filename)], { env, stdio: 'pipe' });

    const npmRoot = runNpm(['root', '--global'], { env, encoding: 'utf8' }).toString().trim();
    const packageRoot = path.join(npmRoot, '@cli-tools', 'oh-my-sdd-opencode');
    const loader = writePluginLoader({ configDir, packageRoot });
    // A new Node process models the OpenCode restart, including its isolated HOME.
    const restart = execFileSync(process.execPath, [
      '--input-type=module', '--eval',
      "const { OhMySddPlugin } = await import(process.argv[1]); const hooks = await OhMySddPlugin({}); let dangerDenied = false; let dangerReason = ''; try { await hooks['tool.execute.before']({ tool: 'write', sessionID: 'e2e' }, { args: { file_path: '/tmp/credentials.js', content: 'AKIAABCDEFGHIJKLMNOP' } }); } catch (error) { dangerDenied = true; dangerReason = String(error.message); } process.stdout.write(JSON.stringify({ hookKeys: Object.keys(hooks), dangerDenied, dangerReason }));",
      `${pathToFileURL(loader).href}?restart=${Date.now()}`,
    ], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const restarted = JSON.parse(restart);
    assert.ok(restarted.hookKeys.includes('tool.execute.before'));
    assert.equal(restarted.dangerDenied, true, 'loaded plugin must reject dangerous writes through PreToolUse');
    assert.match(restarted.dangerReason, /HARD_RULE|hardcoded-aws-access-key/);

    const reviewCommand = fs.readFileSync(commandPath, 'utf8');
    assert.match(reviewCommand, /原子 PR/);
    assert.doesNotMatch(reviewCommand, /legacy two-stage review/);
    assert.match(fs.readFileSync(path.join(configDir, 'skills', 'sdd-review', 'SKILL.md'), 'utf8'), /原子 PR/);

    const activation = JSON.parse(fs.readFileSync(path.join(home, '.oh-my-sdd', 'opencode-activation.json'), 'utf8'));
    assert.equal(activation.state, 'verified');
    assert.ok(activation.registered_hooks.includes('tool.execute.before'));

    const doctor = JSON.parse(execFileSync('node', ['bin/oms.js', 'doctor', '--tool', 'opencode', '--json'], {
      cwd: worktreeRoot, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }));
    const host = doctor.hosts.find((entry) => entry.id === 'opencode');
    assert.equal(host.evidence.loaded.state, 'verified');
    assert.equal(host.evidence.enforced.state, 'verified');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

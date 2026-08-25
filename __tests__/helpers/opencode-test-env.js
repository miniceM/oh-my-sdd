import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join } from 'node:path';

const WINDOWS_ENV = ['ComSpec', 'COMSPEC', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR'];

function inheritedWindowsEnv() {
  return Object.fromEntries(WINDOWS_ENV
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]));
}

function makeLauncher({ binDir, name, entry }) {
  if (process.platform === 'win32') {
    const launcherPath = join(binDir, `${name}.cmd`);
    writeFileSync(launcherPath, `@echo off\r\n"${process.execPath}" "%~dp0${entry}" %*\r\n`);
    return launcherPath;
  }
  const launcherPath = join(binDir, name);
  writeFileSync(launcherPath, `#!/bin/sh\nexec "${process.execPath}" "${join(binDir, entry)}" "$@"\n`);
  chmodSync(launcherPath, 0o755);
  return launcherPath;
}

export function createOpenCodeTestSandbox(repoRoot, { root = mkdtempSync(join(tmpdir(), 'oms-opencode-test-')) } = {}) {
  const home = join(root, 'home');
  const xdgConfigHome = join(root, 'xdg-config');
  const configDir = join(xdgConfigHome, 'opencode');
  const prefix = join(root, 'prefix');
  const cache = join(root, 'npm-cache');
  const temp = join(root, 'tmp');
  const sandbox = {
    root,
    home,
    configDir,
    prefix,
    cache,
    temp,
    packDir: join(root, 'pack'),
    toolchainDir: join(root, 'toolchain'),
    projectDir: join(root, 'project'),
    artifactsDir: join(repoRoot, '.e2e-artifacts', basename(root)),
    env: {
      ...inheritedWindowsEnv(),
      HOME: home,
      USERPROFILE: home,
      XDG_HOME_DIR: home,
      XDG_CONFIG_HOME: xdgConfigHome,
      OPENCODE_CONFIG_DIR: configDir,
      OPENCODE_CONFIG: join(configDir, 'opencode.json'),
      npm_config_prefix: prefix,
      npm_config_cache: cache,
      TEMP: temp,
      TMP: temp,
      TMPDIR: temp,
      OPENCODE_DISABLE_AUTOUPDATE: '1',
      OPENCODE_DISABLE_MODELS_FETCH: '1',
      OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
      PATH: [join(repoRoot, 'scripts'), process.env.PATH].filter(Boolean).join(delimiter),
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    cleanupArtifacts: () => rmSync(join(repoRoot, '.e2e-artifacts', basename(root)), { recursive: true, force: true }),
  };
  for (const directory of [
    home, xdgConfigHome, configDir, prefix, cache, temp, sandbox.packDir,
    sandbox.toolchainDir, sandbox.projectDir, sandbox.artifactsDir,
  ]) mkdirSync(directory, { recursive: true });
  return sandbox;
}

export function createFakeOpenCodeCli(sandbox) {
  const binDir = join(sandbox.root, 'fake-opencode-bin');
  const entry = 'opencode.mjs';
  const invocationLog = join(sandbox.root, 'opencode-invocations.jsonl');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, entry), `
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
const configPath = process.env.OPENCODE_CONFIG || path.join(process.env.OPENCODE_CONFIG_DIR, 'opencode.json');
fs.mkdirSync(path.dirname(configPath), { recursive: true });
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
const plugin = Array.isArray(config.plugin) ? config.plugin : [];
if (!plugin.includes('@cli-tools/oh-my-sdd-opencode')) plugin.push('@cli-tools/oh-my-sdd-opencode');
fs.writeFileSync(configPath, JSON.stringify({ ...config, plugin }));
`);
  const launcherPath = makeLauncher({ binDir, name: 'opencode', entry });
  const env = {
    ...sandbox.env,
    OPENCODE_FAKE_INVOCATION_LOG: invocationLog,
    PATH: [binDir, sandbox.env.PATH].join(delimiter),
  };
  return {
    binDir, launcherPath, invocationLog, env,
    readInvocations: () => existsSync(invocationLog)
      ? readFileSync(invocationLog, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
      : [],
  };
}

export function prepareDoctorInstalledPackage({ sandbox, packageRoot }) {
  const npmRoot = join(sandbox.root, 'npm-root');
  const npmBin = join(sandbox.root, 'npm-bin');
  const packageSnapshot = join(sandbox.root, 'package-snapshot');
  const installedPlugin = join(npmRoot, '@cli-tools', 'oh-my-sdd-opencode');
  mkdirSync(join(npmRoot, '@cli-tools'), { recursive: true });
  mkdirSync(npmBin, { recursive: true });
  cpSync(packageRoot, packageSnapshot, { recursive: true });
  symlinkSync(packageSnapshot, installedPlugin, process.platform === 'win32' ? 'junction' : 'dir');
  writeFileSync(join(npmBin, 'npm.mjs'), `process.stdout.write(process.env.OMS_TEST_NPM_ROOT + '\\n');\n`);
  makeLauncher({ binDir: npmBin, name: 'npm', entry: 'npm.mjs' });
  return {
    npmRoot, packageSnapshot,
    installedPlugin,
    env: {
      ...sandbox.env,
      OMS_TEST_NPM_ROOT: npmRoot,
      PATH: [npmBin, sandbox.env.PATH].join(delimiter),
    },
  };
}

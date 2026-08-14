import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// 动态导入 wrapper 模块
const wrapper = await import('../../../wrapper/wrapper.js');

// ---------- 目录配置 ----------

test('getWrapperBinDir returns user-level bin directory', () => {
  const binDir = wrapper.getWrapperBinDir();
  assert.ok(binDir.includes('bin'), 'bin directory must contain "bin"');
  assert.ok(!binDir.includes('/usr/') && !binDir.includes('/Applications/'), 'must be user-level, not system');
});

test('getWrapperBinDir selects the platform-specific user bin directory', () => {
  const homeDir = path.join('test-home', 'user');
  assert.equal(
    wrapper.getWrapperBinDir({ platform: 'win32', homeDir }),
    path.join(homeDir, 'bin'),
  );
  for (const platform of ['darwin', 'linux']) {
    assert.equal(
      wrapper.getWrapperBinDir({ platform, homeDir }),
      path.join(homeDir, '.local', 'bin'),
    );
  }
});

test('getEnterpriseConfigDir returns user-level config directory', () => {
  const configDir = wrapper.getEnterpriseConfigDir();
  assert.ok(configDir.includes('claude-enterprise') || configDir.includes('ClaudeEnterprise'), 'config dir must contain enterprise marker');
});

test('getEnterpriseConfigDir selects Windows and POSIX config conventions', () => {
  const homeDir = path.join('test-home', 'user');
  assert.equal(
    wrapper.getEnterpriseConfigDir({ platform: 'win32', homeDir }),
    path.join(homeDir, 'AppData', 'Roaming', 'ClaudeEnterprise'),
  );
  for (const platform of ['darwin', 'linux']) {
    assert.equal(
      wrapper.getEnterpriseConfigDir({ platform, homeDir }),
      path.join(homeDir, '.config', 'claude-enterprise'),
    );
  }
});

test('getDefaultShellConfig selects zsh for macOS and bash for Linux', () => {
  assert.equal(wrapper.getDefaultShellConfig('darwin'), '.zshrc');
  assert.equal(wrapper.getDefaultShellConfig('linux'), '.bashrc');
});

test('getRulesPath returns baseline.md in config directory', () => {
  const rulesPath = wrapper.getRulesPath();
  assert.ok(rulesPath.endsWith('baseline.md'), 'rules path must end with baseline.md');
  assert.ok(rulesPath.includes(wrapper.getEnterpriseConfigDir()), 'rules must be in config dir');
});

// ---------- Claude 查找 ----------

test('findClaudeOriginal returns string or null', () => {
  const result = wrapper.findClaudeOriginal();
  assert.ok(result === null || typeof result === 'string', 'must return string or null');
  // 可以返回备份 symlink（即使在 wrapper 目录）或其他位置的 Claude
});

test('findClaudeOriginal selects the first non-wrapper Windows PATH candidate', () => {
  const homeDir = path.join('test-home', 'user');
  const wrapperDir = path.join(homeDir, 'bin');
  const wrapperClaude = path.join(wrapperDir, 'claude.exe');
  const firstClaude = path.join('Program Files', 'Claude', 'claude.exe');
  const secondClaude = path.join('AppData', 'Local', 'Claude', 'claude.exe');

  assert.equal(
    wrapper.findClaudeOriginal({
      platform: 'win32',
      homeDir,
      existsSyncFn: () => false,
      execFileSyncFn: () => `${wrapperClaude}\r\n\r\n${firstClaude}\r\n${secondClaude}\r\n`,
    }),
    firstClaude,
  );
});

test('findClaudeOriginal returns null when Windows where output has no valid candidates', () => {
  const homeDir = path.join('test-home', 'user');
  const wrapperDir = path.join(homeDir, 'bin');
  const wrapperClaude = path.join(wrapperDir, 'claude.exe');

  assert.equal(
    wrapper.findClaudeOriginal({
      platform: 'win32',
      homeDir,
      existsSyncFn: () => false,
      execFileSyncFn: () => `\r\n${wrapperClaude}\r\n`,
    }),
    null,
  );
});

// ---------- 安装状态检查 ----------

test('isWrapperInstalled returns boolean', () => {
  const result = wrapper.isWrapperInstalled();
  assert.strictEqual(typeof result, 'boolean', 'must return boolean');
});

// ---------- 验证函数 ----------

test('verifyWrapper returns boolean', async () => {
  // verifyWrapper 接受一个 announce 函数参数
  const result = wrapper.verifyWrapper(() => {});
  assert.strictEqual(typeof result, 'boolean', 'must return boolean');
});

// ---------- wrapper scripts 存在性 ----------

test('wrapper directory contains required scripts', () => {
  const wrapperDir = path.join(PROJECT_ROOT, 'wrapper');
  assert.ok(existsSync(wrapperDir), 'wrapper directory must exist');

  // POSIX wrapper
  assert.ok(existsSync(path.join(wrapperDir, 'claude.sh')), 'claude.sh must exist');

  // Windows wrappers
  assert.ok(existsSync(path.join(wrapperDir, 'claude.ps1')), 'claude.ps1 must exist');
  assert.ok(existsSync(path.join(wrapperDir, 'claude.bat')), 'claude.bat must exist');
});

// ---------- content/ baseline 存在性（content/ 是唯一源，session-start + wrapper 共享）----------

test('content directory contains enterprise-baseline.md (single source of truth)', () => {
  const contentDir = path.join(PROJECT_ROOT, 'content');
  assert.ok(existsSync(contentDir), 'content directory must exist');

  const baseline = path.join(contentDir, 'enterprise-baseline.md');
  assert.ok(existsSync(baseline), 'enterprise-baseline.md must exist in content/');
});

// ---------- wrapper script 内容验证 ----------

test('claude.sh references baseline.md', () => {
  const shPath = path.join(PROJECT_ROOT, 'wrapper', 'claude.sh');
  const content = readFileSync(shPath, 'utf8');
  assert.ok(content.includes('baseline.md'), 'must reference baseline.md');
  assert.ok(content.includes('CLAUDE_ENTERPRISE_RULES'), 'must support env override');
  assert.ok(content.includes('--no-enterprise'), 'must support bypass option');
});

test('claude.ps1 references baseline.md', () => {
  const ps1Path = path.join(PROJECT_ROOT, 'wrapper', 'claude.ps1');
  const content = readFileSync(ps1Path, 'utf8');
  assert.ok(content.includes('baseline.md'), 'must reference baseline.md');
  assert.ok(content.includes('CLAUDE_ENTERPRISE_RULES'), 'must support env override');
  assert.ok(content.includes('--no-enterprise'), 'must support bypass option');
});

// ---------- PATH 配置函数存在性 ----------

test('installWrapper function exists and is async', () => {
  assert.strictEqual(typeof wrapper.installWrapper, 'function', 'installWrapper must be function');
  // async 函数的 constructor.name 是 'AsyncFunction'
  assert.strictEqual(wrapper.installWrapper.constructor.name, 'AsyncFunction', 'installWrapper must be async');
});

test('uninstallWrapper function exists and is async', () => {
  assert.strictEqual(typeof wrapper.uninstallWrapper, 'function', 'uninstallWrapper must be function');
  assert.strictEqual(wrapper.uninstallWrapper.constructor.name, 'AsyncFunction', 'uninstallWrapper must be async');
});

test('wrapper install, verification, reinstall, and uninstall preserve the original CLI', async (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX lifecycle is covered on macOS and Linux CI runners');
    return;
  }

  const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'oms-wrapper-lifecycle-'));
  const originalHome = process.env.HOME;
  const originalPath = process.env.PATH;
  t.after(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(fakeHome, { recursive: true, force: true });
  });

  const originalClaude = path.join(fakeHome, '.claude', 'bin', 'claude');
  const wrapperBin = path.join(fakeHome, '.local', 'bin');
  mkdirSync(path.dirname(originalClaude), { recursive: true });
  writeFileSync(originalClaude, '#!/bin/sh\nexit 0\n');
  chmodSync(originalClaude, 0o755);
  process.env.HOME = fakeHome;
  process.env.PATH = `${wrapperBin}${path.delimiter}${originalPath ?? ''}`;

  const messages = [];
  assert.equal(await wrapper.installWrapper(PROJECT_ROOT, message => messages.push(message)), true);
  assert.equal(wrapper.verifyWrapper(message => messages.push(message)), true);
  assert.equal(await wrapper.installWrapper(PROJECT_ROOT, message => messages.push(message)), true);

  const backup = path.join(wrapperBin, 'claude-original');
  assert.equal(existsSync(backup), true);
  assert.equal(existsSync(path.join(wrapperBin, 'claude')), true);
  assert.equal(existsSync(path.join(fakeHome, '.config', 'claude-enterprise', 'baseline.md')), true);
  assert.ok(messages.some(message => message.includes('备份已存在')));

  assert.equal(await wrapper.uninstallWrapper(message => messages.push(message)), true);
  assert.equal(existsSync(backup), false);
  assert.equal(existsSync(path.join(wrapperBin, 'claude')), false);
  assert.equal(wrapper.verifyWrapper(() => {}), false);
});

test('Windows wrapper lifecycle installs scripts and preserves the original executable', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows lifecycle runs on the Windows CI runner');
    return;
  }

  const fakeHome = mkdtempSync(path.join(os.tmpdir(), 'oms-wrapper-windows-'));
  const originalEnv = {
    XDG_HOME_DIR: process.env.XDG_HOME_DIR,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    PATH: process.env.PATH,
  };
  t.after(() => {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(fakeHome, { recursive: true, force: true });
  });

  const originalClaude = path.join(fakeHome, '.claude', 'bin', 'claude.exe');
  const wrapperBin = path.join(fakeHome, 'bin');
  mkdirSync(path.dirname(originalClaude), { recursive: true });
  writeFileSync(originalClaude, 'fake executable');
  process.env.XDG_HOME_DIR = fakeHome;
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  process.env.PATH = `${wrapperBin}${path.delimiter}${originalEnv.PATH ?? ''}`;

  const messages = [];
  assert.equal(await wrapper.installWrapper(PROJECT_ROOT, message => messages.push(message)), true);
  assert.equal(wrapper.verifyWrapper(message => messages.push(message)), true);
  assert.equal(await wrapper.installWrapper(PROJECT_ROOT, message => messages.push(message)), true);

  const backup = path.join(wrapperBin, 'claude-original.exe');
  assert.equal(existsSync(backup), true);
  assert.equal(readFileSync(backup, 'utf8'), 'fake executable');
  assert.equal(existsSync(path.join(wrapperBin, 'claude.ps1')), true);
  assert.equal(existsSync(path.join(wrapperBin, 'claude.bat')), true);
  assert.equal(
    existsSync(path.join(fakeHome, 'AppData', 'Roaming', 'ClaudeEnterprise', 'baseline.md')),
    true,
  );
  assert.ok(messages.some(message => message.includes('备份已存在')));

  assert.equal(await wrapper.uninstallWrapper(message => messages.push(message)), true);
  assert.equal(existsSync(backup), false);
  assert.equal(existsSync(path.join(wrapperBin, 'claude.ps1')), false);
  assert.equal(existsSync(path.join(wrapperBin, 'claude.bat')), false);
  assert.equal(wrapper.verifyWrapper(() => {}), false);
});

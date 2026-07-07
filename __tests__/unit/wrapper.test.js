import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// 动态导入 wrapper 模块
const wrapper = await import('../../hooks/lib/wrapper.js');

// ---------- 目录配置 ----------

test('getWrapperBinDir returns user-level bin directory', () => {
  const binDir = wrapper.getWrapperBinDir();
  assert.ok(binDir.includes('bin'), 'bin directory must contain "bin"');
  assert.ok(!binDir.includes('/usr/') && !binDir.includes('/Applications/'), 'must be user-level, not system');
});

test('getEnterpriseConfigDir returns user-level config directory', () => {
  const configDir = wrapper.getEnterpriseConfigDir();
  assert.ok(configDir.includes('claude-enterprise') || configDir.includes('ClaudeEnterprise'), 'config dir must contain enterprise marker');
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

test('wrappers directory contains required scripts', () => {
  const wrappersDir = path.join(PROJECT_ROOT, 'wrappers');
  assert.ok(existsSync(wrappersDir), 'wrappers directory must exist');

  // POSIX wrapper
  assert.ok(existsSync(path.join(wrappersDir, 'claude.sh')), 'claude.sh must exist');

  // Windows wrappers
  assert.ok(existsSync(path.join(wrappersDir, 'claude.ps1')), 'claude.ps1 must exist');
  assert.ok(existsSync(path.join(wrappersDir, 'claude.bat')), 'claude.bat must exist');
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
  const shPath = path.join(PROJECT_ROOT, 'wrappers', 'claude.sh');
  const content = execFileSync('cat', [shPath], { encoding: 'utf8' });
  assert.ok(content.includes('baseline.md'), 'must reference baseline.md');
  assert.ok(content.includes('CLAUDE_ENTERPRISE_RULES'), 'must support env override');
  assert.ok(content.includes('--no-enterprise'), 'must support bypass option');
});

test('claude.ps1 references baseline.md', () => {
  const ps1Path = path.join(PROJECT_ROOT, 'wrappers', 'claude.ps1');
  const content = execFileSync('cat', [ps1Path], { encoding: 'utf8' });
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
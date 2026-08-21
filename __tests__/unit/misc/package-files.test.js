import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..');

test('package.json files whitelist includes content/ and install-time opencode scripts', () => {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files), 'package.json must have a "files" array');
  assert.ok(pkg.files.includes('content/'), 'files must include "content/"');
  // install.js 经 install/hosts/opencode-adapter.js 加载 uninstall.mjs，
  // 后者 import agents-md.mjs / resource-ownership.mjs——缺任何一个都会让
  // postinstall 在模块解析阶段崩溃（ERR_MODULE_NOT_FOUND）
  for (const script of ['agents-md.mjs', 'uninstall.mjs', 'resource-ownership.mjs']) {
    assert.ok(pkg.files.includes(`opencode/scripts/${script}`),
      `files must include "opencode/scripts/${script}"`);
  }
});

test('npm pack --dry-run output includes content/ and install-time opencode scripts', () => {
  // npm pack writes the file listing to stderr, not stdout
  const result = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32', // Windows needs shell for PATH resolution
  });
  assert.equal(result.error, undefined,
    `npm pack failed to start: ${result.error && result.error.message}`);
  assert.equal(result.status, 0,
    `npm pack exited ${result.status}; stderr: ${(result.stderr || '').slice(0, 500)}`);
  const output = ((result.stdout || '') + (result.stderr || '')).replaceAll('\\', '/');
  assert.match(output, /content\/lingma-baseline\.md/);
  for (const script of ['agents-md', 'uninstall', 'resource-ownership']) {
    assert.match(output, new RegExp(`opencode/scripts/${script}\\.mjs`),
      `packed tarball must include opencode/scripts/${script}.mjs`);
  }
});

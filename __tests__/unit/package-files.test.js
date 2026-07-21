import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

test('package.json files whitelist includes baseline/', () => {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files), 'package.json must have a "files" array');
  assert.ok(pkg.files.includes('baseline/'), 'files must include "baseline/"');
});

test('npm pack --dry-run output includes baseline/ contents', () => {
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
  assert.match(output, /baseline\/lingma\.md/);
});

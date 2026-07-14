import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

test('package.json files whitelist includes baseline/ and opencode/', () => {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files), 'package.json must have a "files" array');
  assert.ok(pkg.files.includes('baseline/'), 'files must include "baseline/"');
  assert.ok(pkg.files.includes('opencode/'), 'files must include "opencode/"');
});

test('npm pack --dry-run output includes baseline and opencode paths', () => {
  // npm pack writes the file listing to stderr, not stdout
  const result = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  });
  const output = (result.stdout || '') + (result.stderr || '');
  assert.match(output, /baseline\/opencode\.md/);
  assert.match(output, /baseline\/lingma\.md/);
  assert.match(output, /opencode\/dist\/plugin\.js/);
  assert.match(output, /opencode\/src\/plugin\.ts/);
});

test('.gitignore has !/opencode/dist/ exception', () => {
  const gitignore = readFileSync(path.join(PACKAGE_ROOT, '.gitignore'), 'utf8');
  assert.match(
    gitignore,
    /![\/]?opencode\/dist\//,
    '.gitignore must have a !/opencode/dist/ exception to re-include dist/ as versioned'
  );
});

test('git check-ignore confirms opencode/dist/plugin.js is NOT ignored', () => {
  let ignored = true;
  try {
    execFileSync('git', ['check-ignore', 'opencode/dist/plugin.js'], { cwd: PACKAGE_ROOT, stdio: 'pipe' });
    // exit 0 = ignored (bad)
  } catch (err) {
    ignored = false;
    // exit non-zero = not ignored (good)
  }
  assert.equal(ignored, false, 'opencode/dist/plugin.js must NOT be ignored after the gitignore exception');
});

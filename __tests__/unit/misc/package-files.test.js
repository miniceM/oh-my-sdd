import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..', '..');
const PRODUCT_ROOT = path.join(REPOSITORY_ROOT, 'packages', 'product');
const OPENCODE_PLUGIN_ROOT = path.join(REPOSITORY_ROOT, 'packages', 'opencode-plugin');

test('public packages include their owned runtime resources', () => {
  const pkg = JSON.parse(readFileSync(path.join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files), 'package.json must have a "files" array');
  assert.ok(pkg.files.includes('content/'), 'files must include "content/"');
  assert.ok(pkg.files.includes('lib/'), 'product files must include its shared runtime library');
  const plugin = JSON.parse(readFileSync(path.join(OPENCODE_PLUGIN_ROOT, 'package.json'), 'utf8'));
  assert.ok(plugin.files.includes('scripts'), 'OpenCode bridge must include lifecycle wrappers');
  assert.ok(plugin.files.includes('lib'), 'OpenCode bridge must include synchronized shared resources');
});

test('npm pack --dry-run outputs both public package resource sets', () => {
  // npm pack writes the file listing to stderr, not stdout
  const result = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: PRODUCT_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32', // Windows needs shell for PATH resolution
  });
  assert.equal(result.error, undefined,
    `npm pack failed to start: ${result.error && result.error.message}`);
  assert.equal(result.status, 0,
    `npm pack exited ${result.status}; stderr: ${(result.stderr || '').slice(0, 500)}`);
  const output = ((result.stdout || '') + (result.stderr || '')).replaceAll('\\', '/');
  assert.match(output, /content\/lingma-baseline\.md/);
  const pluginResult = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: OPENCODE_PLUGIN_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(pluginResult.status, 0, `OpenCode pack failed: ${(pluginResult.stderr || '').slice(0, 500)}`);
  const pluginOutput = ((pluginResult.stdout || '') + (pluginResult.stderr || '')).replaceAll('\\', '/');
  assert.match(pluginOutput, /scripts\/uninstall\.mjs/);
  assert.match(pluginOutput, /lib\/opencode\/uninstall\.js/);
});

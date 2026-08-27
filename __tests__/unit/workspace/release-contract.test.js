import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PRODUCT_ROOT = path.join(REPO_ROOT, 'packages', 'product');
const OPENCODE_PLUGIN_ROOT = path.join(REPO_ROOT, 'packages', 'opencode-plugin');

const json = (file) => JSON.parse(readFileSync(file, 'utf8'));

test('two public workspaces are fixed to one version and use one root lockfile', () => {
  assert.equal(existsSync(path.join(PRODUCT_ROOT, 'package.json')), true);
  assert.equal(existsSync(path.join(OPENCODE_PLUGIN_ROOT, 'package.json')), true);

  const root = json(path.join(REPO_ROOT, 'package.json'));
  const product = json(path.join(PRODUCT_ROOT, 'package.json'));
  const plugin = json(path.join(OPENCODE_PLUGIN_ROOT, 'package.json'));

  assert.equal(root.private, true);
  assert.deepEqual(root.workspaces, ['packages/*']);
  assert.equal(product.version, plugin.version);
  assert.equal(existsSync(path.join(PRODUCT_ROOT, 'package-lock.json')), false);
  assert.equal(existsSync(path.join(OPENCODE_PLUGIN_ROOT, 'package-lock.json')), false);
});

test('release checker is available from the repository controller', () => {
  assert.equal(existsSync(path.join(REPO_ROOT, 'scripts', 'release-check.mjs')), true);
});

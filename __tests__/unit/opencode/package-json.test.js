/**
 * Test suite for opencode/package.json npm package configuration.
 *
 * TDD: These tests define the expected structure of the npm package.
 * They should FAIL until the package.json is created.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENCODE_DIR = resolve(__dirname, '../../../packages/opencode-plugin');
const PACKAGE_JSON_PATH = resolve(OPENCODE_DIR, 'package.json');

test('opencode/package.json exists', () => {
  assert.ok(existsSync(PACKAGE_JSON_PATH), 'opencode/package.json should exist');
});

test('package.json has required fields', async () => {
  if (!existsSync(PACKAGE_JSON_PATH)) {
    assert.skip('package.json does not exist yet');
    return;
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

  // Required fields
  assert.ok(pkg.name, 'name field is required');
  assert.ok(pkg.version, 'version field is required');
  assert.ok(pkg.description, 'description field is required');
  assert.ok(pkg.main, 'main field is required');
  assert.ok(pkg.types, 'types field is required');
  assert.ok(pkg.license, 'license field is required');
});

test('package.json has correct exports configuration', async () => {
  if (!existsSync(PACKAGE_JSON_PATH)) {
    assert.skip('package.json does not exist yet');
    return;
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

  assert.ok(pkg.exports, 'exports field is required');
  assert.ok(pkg.exports['.'], 'main export "." is required');
  assert.ok(pkg.exports['.'].import, 'import condition is required');
  assert.ok(pkg.exports['.'].types, 'types condition is required');

  // Should point to dist/ directory
  assert.ok(pkg.exports['.'].import.includes('dist'), 'import should point to dist/');
  assert.ok(pkg.exports['.'].types.includes('dist'), 'types should point to dist/');
});

test('package.json has peerDependencies for OpenCode SDK', async () => {
  if (!existsSync(PACKAGE_JSON_PATH)) {
    assert.skip('package.json does not exist yet');
    return;
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

  assert.ok(pkg.peerDependencies, 'peerDependencies field is required');
  assert.ok(pkg.peerDependencies['@opencode-ai/plugin'], '@opencode-ai/plugin peerDependency is required');
  assert.ok(pkg.peerDependencies['@opencode-ai/sdk'], '@opencode-ai/sdk peerDependency is required');

  // Version constraints should be reasonable
  const pluginVersion = pkg.peerDependencies['@opencode-ai/plugin'];
  assert.ok(
    pluginVersion.includes('>=') || pluginVersion.includes('^'),
    'plugin version should have a version constraint'
  );
});

test('package.json files field includes dist/', async () => {
  if (!existsSync(PACKAGE_JSON_PATH)) {
    assert.skip('package.json does not exist yet');
    return;
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

  assert.ok(pkg.files, 'files field is required');
  assert.ok(Array.isArray(pkg.files), 'files should be an array');
  assert.ok(pkg.files.includes('dist'), 'files should include dist/');
});

test('package.json has correct module type', async () => {
  if (!existsSync(PACKAGE_JSON_PATH)) {
    assert.skip('package.json does not exist yet');
    return;
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

  assert.equal(pkg.type, 'module', 'type should be "module" for ES modules');
});

test('package lifecycle separates pack sync from publish build', () => {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  assert.equal(pkg.scripts.build, 'tsc');
  assert.equal(pkg.scripts.prepack, 'npm run sync:resources');
  assert.equal(pkg.scripts.prepublishOnly, 'npm run sync:resources && npm run build');
});

test('package.json has keywords for discoverability', async () => {
  if (!existsSync(PACKAGE_JSON_PATH)) {
    assert.skip('package.json does not exist yet');
    return;
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

  assert.ok(pkg.keywords, 'keywords field is required');
  assert.ok(Array.isArray(pkg.keywords), 'keywords should be an array');
  assert.ok(pkg.keywords.includes('opencode'), 'keywords should include "opencode"');
  assert.ok(pkg.keywords.includes('plugin'), 'keywords should include "plugin"');
});

test('package.json has repository information', async () => {
  if (!existsSync(PACKAGE_JSON_PATH)) {
    assert.skip('package.json does not exist yet');
    return;
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'));

  assert.ok(pkg.repository, 'repository field is required');
  assert.ok(pkg.repository.type === 'git', 'repository type should be git');
  assert.ok(pkg.repository.url, 'repository url is required');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('types: re-exports PluginInput from @opencode-ai/plugin', () => {
  const dts = readFileSync('opencode/dist/types.d.ts', 'utf-8');
  assert.ok(dts.includes('PluginInput'), 'types.d.ts should declare PluginInput re-export');
});

test('types: re-exports Hooks from @opencode-ai/plugin', () => {
  const dts = readFileSync('opencode/dist/types.d.ts', 'utf-8');
  assert.ok(dts.includes('Hooks'), 'types.d.ts should declare Hooks re-export');
});

test('types: SDK version is >= 1.15.13', () => {
  // Check the declared version in package.json, not the installed one
  // (node_modules may not exist in CI when using --ignore-scripts)
  const opencodePkg = JSON.parse(readFileSync('opencode/package.json', 'utf-8'));
  const versionRange = opencodePkg.dependencies['@opencode-ai/plugin'];

  // Extract version from range (e.g., "^1.15.13" -> "1.15.13")
  const version = versionRange.replace(/^[\^~>=<]+/, '');
  const [major, minor] = version.split('.').map(Number);

  assert.ok(major > 1 || (major === 1 && minor >= 15),
    `Expected >=1.15.13, got ${version} (from ${versionRange})`);
});

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

test('types: SDK version is >= 1.15.13', async () => {
  const pkg = await import('../../../opencode/node_modules/@opencode-ai/plugin/package.json', { with: { type: 'json' } });
  const [major, minor] = pkg.default.version.split('.').map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 15), `Expected >=1.15.13, got ${pkg.default.version}`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildE2eEnv,
  createE2eSandbox,
  parseNpmPackJson,
  publishedCommands,
  writePluginLoader,
} from '../../../__tests__/helpers/opencode-e2e-harness.js';

test('OpenCode E2E harness isolates every mutable OpenCode and npm path', () => {
  const root = mkdtempSync(join(tmpdir(), 'oms-opencode-e2e-env-'));
  try {
    const env = buildE2eEnv({ repoRoot: process.cwd(), root });
    assert.equal(env.HOME, join(root, 'home'));
    assert.equal(env.USERPROFILE, join(root, 'home'));
    assert.equal(env.npm_config_prefix, join(root, 'prefix'));
    assert.equal(env.npm_config_cache, join(root, 'npm-cache'));
    assert.equal(env.OPENCODE_CONFIG, join(root, 'opencode.json'));
    assert.equal(env.OPENCODE_CONFIG_DIR, join(root, 'opencode-config'));
    assert.ok(env.PATH.startsWith(join(process.cwd(), 'scripts')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('OpenCode E2E harness publishes the six supported commands and excludes constitution', () => {
  const commands = publishedCommands(join(process.cwd(), 'opencode'));
  assert.deepEqual(commands, [
    'sdd-apply', 'sdd-doc', 'sdd-plan', 'sdd-review', 'sdd-spec', 'sdd-task',
  ]);
  assert.ok(!commands.includes('sdd-constitution'));
});

test('OpenCode E2E harness extracts npm pack JSON after lifecycle output', () => {
  const packed = parseNpmPackJson('[copy-resources] synced\n[{"filename":"plugin.tgz"}]\n');
  assert.deepEqual(packed, [{ filename: 'plugin.tgz' }]);
});

test('OpenCode E2E harness loader re-exports only the globally installed tarball plugin', () => {
  const root = mkdtempSync(join(tmpdir(), 'oms-opencode-e2e-loader-'));
  const packageRoot = join(process.cwd(), 'opencode');
  try {
    const loader = writePluginLoader({ root, packageRoot });
    assert.ok(existsSync(loader));
    const source = readFileSync(loader, 'utf8');
    assert.match(source, /export \{ OhMySddPlugin \}/);
    assert.match(source, /file:/);
    assert.match(source, /dist\/index\.js/);
    assert.ok(!source.includes("@cli-tools/oh-my-sdd-opencode'"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('OpenCode E2E sandbox creates disposable project and artifact roots', () => {
  const sandbox = createE2eSandbox(process.cwd());
  try {
    assert.ok(existsSync(sandbox.home));
    assert.ok(existsSync(sandbox.projectDir));
    assert.ok(existsSync(sandbox.artifactsDir));
    assert.equal(sandbox.env.OPENCODE_CONFIG, join(sandbox.root, 'opencode.json'));
  } finally {
    sandbox.cleanup();
    rmSync(sandbox.artifactsDir, { recursive: true, force: true });
  }
  assert.ok(!existsSync(sandbox.root));
});

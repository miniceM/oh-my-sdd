import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HOOKS_DIR } from '../../../opencode/dist/paths.js';
import { runHook } from '../../../opencode/dist/runner.js';

const TEST_HOOKS = [
  'test-happy.js',
  'test-timeout.js',
  'test-nonzero.js',
  'test-bad-json.js',
];

function createTestHooks() {
  mkdirSync(HOOKS_DIR, { recursive: true });

  writeFileSync(
    join(HOOKS_DIR, 'test-happy.js'),
    `let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ console.log(JSON.stringify({permissionDecision:'deny'})); });`,
  );

  writeFileSync(
    join(HOOKS_DIR, 'test-timeout.js'),
    `setTimeout(()=>{}, 60000);`,
  );

  writeFileSync(
    join(HOOKS_DIR, 'test-nonzero.js'),
    `process.exit(1);`,
  );

  writeFileSync(
    join(HOOKS_DIR, 'test-bad-json.js'),
    `let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ console.log('not json{{{'); });`,
  );
}



describe('runHook', () => {
  before(() => {
    createTestHooks();
  });

  after(async () => {
    for (const h of TEST_HOOKS) {
      try { rmSync(join(HOOKS_DIR, h), { force: true }); } catch { /* ignore */ }
    }
  });

  it('happy path: hook writes valid JSON → resolves with parsed object', async () => {
    const result = await runHook('test-happy.js', { tool_name: 'Write', tool_input: {} }, {
      timeoutMs: 5000,
    });
    assert.deepEqual(result, { permissionDecision: 'deny' });
  });

  it('timeout: hook hangs → resolves with {} after timeoutMs', async () => {
    const result = await runHook('test-timeout.js', {}, { timeoutMs: 200 });
    assert.deepEqual(result, {});
  });

  it('non-zero exit: hook exits 1 → resolves with {}', async () => {
    const result = await runHook('test-nonzero.js', {}, { timeoutMs: 5000 });
    assert.deepEqual(result, {});
  });

  it('spawn failure: hook file does not exist → resolves with {}', async () => {
    const result = await runHook('nonexistent-hook-xyz.js', {}, { timeoutMs: 3000 });
    assert.deepEqual(result, {});
  });

  it('bad JSON: hook writes non-JSON stdout → resolves with {}', async () => {
    const result = await runHook('test-bad-json.js', {}, { timeoutMs: 5000 });
    assert.deepEqual(result, {});
  });

  it('passes CLAUDE_PLUGIN_ROOT env var to spawned hook', async () => {
    const hookName = 'test-env-check.js';
    writeFileSync(
      join(HOOKS_DIR, hookName),
      `let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ console.log(JSON.stringify({root: process.env.CLAUDE_PLUGIN_ROOT})); });`,
    );
    try {
      const result = await runHook(hookName, {}, { timeoutMs: 5000 });
      assert.ok(typeof result.root === 'string', 'CLAUDE_PLUGIN_ROOT should be set');
      assert.ok(result.root.length > 0, 'CLAUDE_PLUGIN_ROOT should be non-empty');
    } finally {
      rmSync(join(HOOKS_DIR, hookName), { force: true });
    }
  });

  it('custom env vars are passed through options.env', async () => {
    const hookName = 'test-custom-env.js';
    writeFileSync(
      join(HOOKS_DIR, hookName),
      `let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ console.log(JSON.stringify({val: process.env.OMS_TEST_VAR})); });`,
    );
    try {
      const result = await runHook(hookName, {}, {
        timeoutMs: 5000,
        env: { OMS_TEST_VAR: 'hello-42' },
      });
      assert.equal(result.val, 'hello-42');
    } finally {
      rmSync(join(HOOKS_DIR, hookName), { force: true });
    }
  });

  it('default timeoutMs is 5000 when options.timeoutMs is omitted', async () => {
    const start = Date.now();
    const result = await runHook('test-timeout.js', {});
    const elapsed = Date.now() - start;
    assert.deepEqual(result, {});
    assert.ok(elapsed < 10000, `should timeout around 5s, took ${elapsed}ms`);
  });
});

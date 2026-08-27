/**
 * Integration test: SDD Ring-aware write gate in pre-tool-use.js.
 *
 * Sets up a temp directory with an openspec/changes/<slug>/.meta.json
 * containing an SDD context, then spawns the pre-tool-use hook to verify
 * that the policy blocks or allows writes based on the current Ring.
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { runHook } from '../helpers/spawn-hook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.resolve(__dirname, '..', '..', 'packages', 'product', 'hooks', 'pre-tool-use.js');

async function makeSddProject(ring = 'apply') {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'sdd-gate-'));
  const changeDir = path.join(tmpDir, 'openspec', 'changes', 'test-change');
  await mkdir(changeDir, { recursive: true });
  await writeFile(
    path.join(changeDir, '.meta.json'),
    JSON.stringify({
      change_id: 'TEST01',
      sdd: {
        ring,
        branch: 'feat/test',
        spec: { composite: 'abc' },
        plan: { composite: 'def' },
      },
    }, null, 2),
  );
  return tmpDir;
}

describe('SDD policy gate in pre-tool-use', () => {
  let tmpDir;
  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  test('blocks Write to openspec/specs/ during apply ring', async () => {
    tmpDir = await makeSddProject('apply');
    const result = await runHook(HOOK_PATH, {
      tool_name: 'Write',
      tool_input: {
        filePath: path.join(tmpDir, 'openspec', 'specs', 'auth', 'spec.md'),
        content: '# Auth spec',
      },
      cwd: tmpDir,
    });
    assert.equal(result.exitCode, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput?.permissionDecisionReason, /SDD workflow gate/);
  });

  test('blocks Edit to proposal.md during apply ring', async () => {
    tmpDir = await makeSddProject('apply');
    const result = await runHook(HOOK_PATH, {
      tool_name: 'Edit',
      tool_input: {
        filePath: path.join(tmpDir, 'openspec', 'changes', 'test-change', 'proposal.md'),
        oldString: 'old',
        newString: 'new',
      },
      cwd: tmpDir,
    });
    assert.equal(result.exitCode, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput?.permissionDecisionReason, /proposal\.md/);
  });

  test('allows Write to source code during apply ring', async () => {
    tmpDir = await makeSddProject('apply');
    const result = await runHook(HOOK_PATH, {
      tool_name: 'Write',
      tool_input: {
        filePath: path.join(tmpDir, 'src', 'app.js'),
        content: 'console.log("hello");',
      },
      cwd: tmpDir,
    });
    assert.equal(result.exitCode, 0);
    const out = JSON.parse(result.stdout);
    // Should be {} or soft warning, but NOT deny.
    assert.notEqual(out.hookSpecificOutput?.permissionDecision, 'deny');
  });

  test('blocks source code Write during spec ring', async () => {
    tmpDir = await makeSddProject('spec');
    const result = await runHook(HOOK_PATH, {
      tool_name: 'Write',
      tool_input: {
        filePath: path.join(tmpDir, 'src', 'handler.ts'),
        content: 'export function handle() {}',
      },
      cwd: tmpDir,
    });
    assert.equal(result.exitCode, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput?.permissionDecisionReason, /plan not complete/);
  });

  test('allows Bash command even during spec ring (not subject to policy)', async () => {
    tmpDir = await makeSddProject('spec');
    const result = await runHook(HOOK_PATH, {
      tool_name: 'Bash',
      tool_input: {
        command: 'echo hello',
      },
      cwd: tmpDir,
    });
    assert.equal(result.exitCode, 0);
    const out = JSON.parse(result.stdout);
    assert.notEqual(out.hookSpecificOutput?.permissionDecision, 'deny');
  });

  test('allows writes when no SDD project exists', async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'no-sdd-'));
    const result = await runHook(HOOK_PATH, {
      tool_name: 'Write',
      tool_input: {
        filePath: path.join(tmpDir, 'src', 'app.js'),
        content: 'console.log("no sdd");',
      },
      cwd: tmpDir,
    });
    assert.equal(result.exitCode, 0);
    const out = JSON.parse(result.stdout);
    assert.notEqual(out.hookSpecificOutput?.permissionDecision, 'deny');
  });

  test('HARD_RULE still takes priority over SDD policy', async () => {
    tmpDir = await makeSddProject('apply');
    // Write content with a hardcoded AWS key — HARD_RULE should fire first.
    const result = await runHook(HOOK_PATH, {
      tool_name: 'Write',
      tool_input: {
        filePath: path.join(tmpDir, 'src', 'config.js'),
        content: 'const KEY = "AKIAIOSFODNN7EXAMPLE";',
      },
      cwd: tmpDir,
    });
    assert.equal(result.exitCode, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput?.permissionDecision, 'deny');
    // The reason should mention HARD_RULE, not SDD policy.
    assert.match(out.hookSpecificOutput?.permissionDecisionReason, /HARD_RULE/);
  });
});

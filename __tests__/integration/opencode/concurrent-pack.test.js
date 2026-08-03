import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OPENCODE_DIR = join(process.cwd(), 'opencode');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PRIMARY_DELEGATES = [
  'brainstorming',
  'writing-plans',
  'executing-plans',
  'subagent-driven-development',
  'requesting-code-review',
];
const THIS_TEST = '__tests__/integration/opencode/concurrent-pack.test.js';

function relevantStatus(output) {
  return output
    .split('\n')
    .filter((line) => line && !line.endsWith(THIS_TEST))
    .join('\n');
}

function parsePackManifest(output) {
  const json = output.match(/(^|\n)(\[\s*\{[\s\S]*\}\s*\])\s*$/)?.[2];
  assert.ok(json, `npm pack did not emit a JSON manifest:\n${output}`);
  return JSON.parse(json);
}

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...options,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('concurrent package syncs are serialized and leave the worktree unchanged', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oms-concurrent-pack-'));
  try {
    const before = await run('git', ['status', '--porcelain'], { cwd: process.cwd() });
    assert.equal(before.code, 0, before.stderr);

    const runs = [0, 1].map((index) => {
      const cache = join(root, `cache-${index}`);
      const destination = join(root, `pack-${index}`);
      mkdirSync(cache, { recursive: true });
      mkdirSync(destination, { recursive: true });
      return run(NPM, [
        'pack',
        '--dry-run',
        '--json',
        '--silent',
        '--cache', cache,
        '--pack-destination', destination,
      ], { cwd: OPENCODE_DIR });
    });

    for (const result of await Promise.all(runs)) {
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const manifest = parsePackManifest(result.stdout);
      const files = manifest[0].files.map(({ path }) => path);
      for (const skill of PRIMARY_DELEGATES) {
        assert.ok(
          files.includes(`delegated-skills/${skill}/SKILL.md`),
          `package must include delegated-skills/${skill}/SKILL.md`,
        );
      }
    }

    const after = await run('git', ['status', '--porcelain'], { cwd: process.cwd() });
    assert.equal(after.code, 0, after.stderr);
    assert.equal(
      relevantStatus(after.stdout),
      relevantStatus(before.stdout),
      'concurrent pack must leave the worktree unchanged (and clean when started clean)',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

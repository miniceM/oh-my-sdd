import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

function setupGitRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-git-'));
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git branch -m main', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email test@test.com', { cwd: dir });
  execSync('git config user.name Test', { cwd: dir });
  return dir;
}

test('computeCodeDelta returns zeros for empty diff', async (t) => {
  const dir = setupGitRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'a.ts'), 'const a = 1;\n');
  execSync('git add . && git commit -m init', { cwd: dir, stdio: 'ignore' });
  const head = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();

  const { computeCodeDelta } = await import('../../hooks/lib/git-diff.js');
  const delta = await computeCodeDelta(head, 'HEAD', dir);
  assert.equal(delta.files_changed, 0);
  assert.equal(delta.lines_added, 0);
  assert.equal(delta.lines_deleted, 0);
});

test('computeCodeDelta aggregates added lines by language', async (t) => {
  const dir = setupGitRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'a.ts'), 'const a = 1;\n');
  execSync('git add . && git commit -m init', { cwd: dir, stdio: 'ignore' });
  const head = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();

  writeFileSync(path.join(dir, 'a.ts'), 'const a = 1;\nconst b = 2;\n');
  writeFileSync(path.join(dir, 'b.md'), '# Title\n');
  execSync('git add .', { cwd: dir, stdio: 'ignore' });

  const { computeCodeDelta } = await import('../../hooks/lib/git-diff.js');
  const delta = await computeCodeDelta(head, 'HEAD', dir);
  assert.equal(delta.files_changed, 2);
  assert.equal(delta.by_lang.ts, 1);
  assert.equal(delta.by_lang.md, 1);
  assert.ok(delta.lines_added >= 2);
});

test('computeCodeDelta handles binary files gracefully', async (t) => {
  const dir = setupGitRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'a.ts'), 'x\n');
  execSync('git add . && git commit -m init', { cwd: dir, stdio: 'ignore' });
  const head = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();

  // PNG magic + NUL terminator forces git's binary heuristic (4 bytes alone are
  // treated as text by git). NUL byte guarantees classification as binary.
  writeFileSync(path.join(dir, 'img.bin'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
  execSync('git add .', { cwd: dir, stdio: 'ignore' });

  const { computeCodeDelta } = await import('../../hooks/lib/git-diff.js');
  const delta = await computeCodeDelta(head, 'HEAD', dir);
  assert.equal(delta.files_changed, 1);
  assert.equal(delta.lines_added, 0); // binary files report -
});

test('getCurrentHead returns null outside git repo', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-nogit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { getCurrentHead } = await import('../../hooks/lib/git-diff.js');
  const head = await getCurrentHead(dir);
  assert.equal(head, null);
});

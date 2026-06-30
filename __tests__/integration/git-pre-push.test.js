import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PRE_PUSH_CHECK = path.join(PROJECT_ROOT, 'hooks', 'git', 'pre-push-check.js');

function setupGitRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-prepush-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  // 初始 commit，让 HEAD 消息可读
  writeFileSync(path.join(dir, 'a.txt'), 'init\n');
  execFileSync('git', ['add', 'a.txt'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', '[T1] feat: init'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

// pre-push 的 stdin 格式: <localRef> <localSha> <remoteRef> <remoteSha>
function runPrePush(cwd, stdinText, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [PRE_PUSH_CHECK], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.stdin.end(stdinText);
  });
}

test('pre-push: 正常 push 到 feature 分支通过', async () => {
  const dir = setupGitRepo();
  try {
    const stdin = 'refs/heads/feature abc123 refs/heads/feature def456';
    const result = await runPrePush(dir, stdin);
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-push: 正常 push 到 main 通过（非 force）', async () => {
  const dir = setupGitRepo();
  try {
    const stdin = 'refs/heads/main abc123 refs/heads/main def456';
    const result = await runPrePush(dir, stdin);
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-push: force push 到 main 阻断', async () => {
  const dir = setupGitRepo();
  try {
    const stdin = '+refs/heads/main abc123 refs/heads/main def456';
    const result = await runPrePush(dir, stdin);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('destructive-git-force-main'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-push: force push 到 master 阻断', async () => {
  const dir = setupGitRepo();
  try {
    const stdin = '+refs/heads/master abc123 refs/heads/master def456';
    const result = await runPrePush(dir, stdin);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('force push'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-push: force push 到 feature 分支通过', async () => {
  const dir = setupGitRepo();
  try {
    const stdin = '+refs/heads/feature abc123 refs/heads/feature def456';
    const result = await runPrePush(dir, stdin);
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-push: force push 到 main 有 override 绕过', async () => {
  const dir = setupGitRepo();
  try {
    // 修改 HEAD commit 消息加 override
    writeFileSync(path.join(dir, 'b.txt'), 'b\n');
    execFileSync('git', ['add', 'b.txt'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', '[T2] feat: add b\n\n[OVERRIDE] destructive-git-force-main: 测试'], { cwd: dir, stdio: 'ignore' });

    const stdin = '+refs/heads/main abc123 refs/heads/main def456';
    const result = await runPrePush(dir, stdin);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stderr.includes('OVERRIDE'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-push: 空 stdin 通过', async () => {
  const dir = setupGitRepo();
  try {
    const result = await runPrePush(dir, '');
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-push: 多 ref 中一个 force push 到 main 阻断', async () => {
  const dir = setupGitRepo();
  try {
    const stdin = 'refs/heads/feature abc refs/heads/feature def\n+refs/heads/main 123 refs/heads/main 456';
    const result = await runPrePush(dir, stdin);
    assert.equal(result.exitCode, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
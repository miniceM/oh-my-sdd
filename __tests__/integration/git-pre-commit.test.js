import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PRE_COMMIT_CHECK = path.join(PROJECT_ROOT, 'hooks', 'git', 'pre-commit-check.js');

function setupGitRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-precommit-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['branch', '-m', 'main'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

// 直接调用 pre-commit-check.js（模拟 git hook 触发）
function runPreCommit(cwd, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [PRE_COMMIT_CHECK], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

test('pre-commit: 干净的 staged 文件通过', async () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'clean.js'), "const x = 1;\n");
    execFileSync('git', ['add', 'clean.js'], { cwd: dir, stdio: 'ignore' });

    const result = await runPreCommit(dir);
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-commit: 含 AWS AK → 阻断', async () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'secret.js'), "const key = 'AKIA1234567890ABCDEF';\n");
    execFileSync('git', ['add', 'secret.js'], { cwd: dir, stdio: 'ignore' });

    const result = await runPreCommit(dir);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('hardcoded-aws-ak'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-commit: 含 OpenAI sk → 阻断', async () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'secret.js'), "const sk = 'sk-abcdefghij1234567890abcdefghij12';\n");
    execFileSync('git', ['add', 'secret.js'], { cwd: dir, stdio: 'ignore' });

    const result = await runPreCommit(dir);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('hardcoded-sk'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-commit: 空 staged 通过', async () => {
  const dir = setupGitRepo();
  try {
    const result = await runPreCommit(dir);
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-commit: 多文件中一个违规 → 阻断', async () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'clean.js'), "const x = 1;\n");
    writeFileSync(path.join(dir, 'secret.js'), "const key = 'AKIA1234567890ABCDEF';\n");
    execFileSync('git', ['add', 'clean.js', 'secret.js'], { cwd: dir, stdio: 'ignore' });

    const result = await runPreCommit(dir);
    assert.equal(result.exitCode, 1);
    assert.ok(result.stderr.includes('hardcoded-aws-ak'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-commit: 环境变量 OMS_OVERRIDE_RULES 绕过', async () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'secret.js'), "const key = 'AKIA1234567890ABCDEF';\n");
    execFileSync('git', ['add', 'secret.js'], { cwd: dir, stdio: 'ignore' });

    const result = await runPreCommit(dir, { OMS_OVERRIDE_RULES: 'hardcoded-aws-ak' });
    assert.equal(result.exitCode, 0);
    assert.ok(result.stderr.includes('OVERRIDE'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-commit: 删除的文件不扫描（diff-filter）', async () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'a.js'), "const x = 1;\n");
    execFileSync('git', ['add', 'a.js'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', '[T1] feat: init'], { cwd: dir, stdio: 'ignore' });

    // 删除并 stage
    execFileSync('git', ['rm', 'a.js'], { cwd: dir, stdio: 'ignore' });
    const result = await runPreCommit(dir);
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
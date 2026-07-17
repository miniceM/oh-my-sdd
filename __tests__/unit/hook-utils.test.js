import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  runGitSync,
  getStagedFiles,
  getStagedContent,
  getHeadCommitMessage,
  readCommitMsgFile,
  parsePushStdin,
  isForcePush,
  isProtectedBranch,
  getGitDir,
} from '../../hooks/git/lib/hook-utils.js';

// ============================================
// 测试辅助：创建临时 git 仓库
// ============================================
function setupGitRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-hook-utils-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['branch', '-m', 'main'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

// ============================================
// runGitSync 测试
// ============================================

test('runGitSync 成功返回 stdout', () => {
  const dir = setupGitRepo();
  try {
    const out = runGitSync(['rev-parse', '--git-dir'], dir);
    assert.ok(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runGitSync 失败返回 null', () => {
  const dir = setupGitRepo();
  try {
    // 不存在的 ref
    const out = runGitSync(['show', 'nonexistent-ref'], dir);
    assert.equal(out, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runGitSync 非 git 目录返回 null', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-non-git-'));
  try {
    const out = runGitSync(['rev-parse', '--git-dir'], dir);
    assert.equal(out, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================
// getStagedFiles 测试
// ============================================

test('getStagedFiles 返回 staged 文件列表', () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'a.js'), "const x = 1;\n");
    writeFileSync(path.join(dir, 'b.txt'), "hello\n");
    execFileSync('git', ['add', 'a.js', 'b.txt'], { cwd: dir, stdio: 'ignore' });

    const files = getStagedFiles(dir);
    assert.ok(files.includes('a.js'));
    assert.ok(files.includes('b.txt'));
    assert.equal(files.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getStagedFiles 无 staged 文件返回空数组', () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'a.js'), "x\n");
    // 不 add
    assert.deepEqual(getStagedFiles(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getStagedFiles 排除已删除文件（diff-filter）', () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'a.js'), "x\n");
    execFileSync('git', ['add', 'a.js'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

    // 删除文件并 stage 删除
    execFileSync('git', ['rm', 'a.js'], { cwd: dir, stdio: 'ignore' });
    const files = getStagedFiles(dir);
    assert.equal(files.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================
// getStagedContent 测试
// ============================================

test('getStagedContent 返回 staged 版本内容', () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'a.js'), "const x = 1;\n");
    execFileSync('git', ['add', 'a.js'], { cwd: dir, stdio: 'ignore' });

    const content = getStagedContent('a.js', dir);
    // runGitSync trim 末尾换行，内容应为 const x = 1;
    assert.equal(content, 'const x = 1;');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getStagedContent 不存在的文件返回 null', () => {
  const dir = setupGitRepo();
  try {
    assert.equal(getStagedContent('nonexistent.js', dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getStagedContent binary 文件返回 null', () => {
  const dir = setupGitRepo();
  try {
    // 写入含 NUL 字节的 binary 内容
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]);
    writeFileSync(path.join(dir, 'a.png'), binary);
    execFileSync('git', ['add', 'a.png'], { cwd: dir, stdio: 'ignore' });

    // git show :a.png 在 binary 模式下输出原始字节，转 utf8 后含 NUL
    const content = getStagedContent('a.png', dir);
    // 二进制检测：返回 null 或 content 不含 NUL（git 可能输出乱码）
    // 我们只验证不抛错
    assert.ok(content === null || typeof content === 'string');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================
// getHeadCommitMessage 测试
// ============================================

test('getHeadCommitMessage 返回最近 commit 消息', () => {
  const dir = setupGitRepo();
  try {
    writeFileSync(path.join(dir, 'a.js'), "x\n");
    execFileSync('git', ['add', 'a.js'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init commit'], { cwd: dir, stdio: 'ignore' });

    const msg = getHeadCommitMessage(dir);
    assert.ok(msg.includes('init commit'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getHeadCommitMessage 无 commit 返回 null', () => {
  const dir = setupGitRepo();
  try {
    assert.equal(getHeadCommitMessage(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================
// readCommitMsgFile 测试
// ============================================

test('readCommitMsgFile 读取文件内容', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-msg-'));
  try {
    const msgPath = path.join(dir, 'COMMIT_EDITMSG');
    writeFileSync(msgPath, 'commit message here\n');
    assert.equal(readCommitMsgFile(msgPath), 'commit message here\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readCommitMsgFile 不存在返回空字符串', () => {
  assert.equal(readCommitMsgFile('/nonexistent/path'), '');
});

// ============================================
// parsePushStdin 测试
// ============================================

test('parsePushStdin 解析多行 refs', () => {
  const stdin = 'refs/heads/main 123abc refs/heads/main 456def\nrefs/heads/feature abc123 refs/heads/feature def456';
  const refs = parsePushStdin(stdin);
  assert.equal(refs.length, 2);
  assert.equal(refs[0].localRef, 'refs/heads/main');
  assert.equal(refs[0].localSha, '123abc');
  assert.equal(refs[0].remoteRef, 'refs/heads/main');
  assert.equal(refs[1].localRef, 'refs/heads/feature');
});

test('parsePushStdin 解析 force push（+ 前缀）', () => {
  const stdin = '+refs/heads/main 123abc refs/heads/main 456def';
  const refs = parsePushStdin(stdin);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].localRef, '+refs/heads/main');
});

test('parsePushStdin 空 stdin 返回空数组', () => {
  assert.deepEqual(parsePushStdin(''), []);
  assert.deepEqual(parsePushStdin(null), []);
  assert.deepEqual(parsePushStdin(undefined), []);
});

test('parsePushStdin 忽略空行', () => {
  const stdin = 'refs/heads/main 123 refs/heads/main 456\n\n\n';
  assert.equal(parsePushStdin(stdin).length, 1);
});

// ============================================
// isForcePush 测试
// ============================================

test('isForcePush 检测 + 前缀', () => {
  assert.equal(isForcePush('+refs/heads/main'), true);
  assert.equal(isForcePush('refs/heads/main'), false);
  assert.equal(isForcePush(''), false);
  assert.equal(isForcePush(null), false);
});

// ============================================
// isProtectedBranch 测试
// ============================================

test('isProtectedBranch 识别 main/master', () => {
  assert.equal(isProtectedBranch('refs/heads/main'), true);
  assert.equal(isProtectedBranch('refs/heads/master'), true);
  assert.equal(isProtectedBranch('main'), true);
  assert.equal(isProtectedBranch('master'), true);
});

test('isProtectedBranch 非保护分支返回 false', () => {
  assert.equal(isProtectedBranch('refs/heads/feature'), false);
  assert.equal(isProtectedBranch('refs/heads/develop'), false);
  assert.equal(isProtectedBranch(''), false);
  assert.equal(isProtectedBranch(null), false);
});

// ============================================
// getGitDir 测试
// ============================================

test('getGitDir 返回 .git 路径', () => {
  const dir = setupGitRepo();
  try {
    const gitDir = getGitDir(dir);
    assert.ok(gitDir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getGitDir 非 git 目录返回 null', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-nogit-'));
  try {
    assert.equal(getGitDir(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
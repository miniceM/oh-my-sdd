import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  installHook,
  uninstallHook,
  installAll,
  uninstallAll,
  statusAll,
  getHookStatus,
  HOOK_TYPES,
} from '../../hooks/git/lib/hook-installer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PACKAGE_ROOT = PROJECT_ROOT;

const MARKER_PREFIX = '# oh-my-sdd-git-hook:';

function setupGitRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-installer-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['branch', '-m', 'main'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function readHook(hooksDir, type) {
  return readFileSync(path.join(hooksDir, type), 'utf8');
}

// ============================================
// installHook 测试
// ============================================

test('installHook 创建新 hook 文件含 marker', () => {
  const dir = setupGitRepo();
  try {
    const result = installHook('pre-commit', PACKAGE_ROOT, dir);
    assert.equal(result.action, 'created');

    const hooksDir = path.join(dir, '.git', 'hooks');
    const content = readHook(hooksDir, 'pre-commit');
    assert.ok(content.includes(`${MARKER_PREFIX} pre-commit`), 'must contain oms marker');
    assert.ok(content.includes(PACKAGE_ROOT), 'must固化 package root');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('installHook 幂等：重复 install 覆盖不重复', () => {
  const dir = setupGitRepo();
  try {
    installHook('pre-commit', PACKAGE_ROOT, dir);
    const result = installHook('pre-commit', PACKAGE_ROOT, dir);
    assert.equal(result.action, 'updated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('installHook 用户已有 hook 备份到 .oms-backup', () => {
  const dir = setupGitRepo();
  try {
    const hooksDir = path.join(dir, '.git', 'hooks');
    writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\necho custom\n');

    const result = installHook('pre-commit', PACKAGE_ROOT, dir);
    assert.equal(result.action, 'replaced-with-backup');
    assert.equal(result.backedUp, true);

    // 原文件备份
    const backup = readHook(hooksDir, 'pre-commit.oms-backup');
    assert.ok(backup.includes('echo custom'));
    // 新文件是 oms hook
    const cur = readHook(hooksDir, 'pre-commit');
    assert.ok(cur.includes(MARKER_PREFIX));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================
// uninstallHook 测试
// ============================================

test('uninstallHook 删除 oms hook', () => {
  const dir = setupGitRepo();
  try {
    installHook('pre-commit', PACKAGE_ROOT, dir);
    const result = uninstallHook('pre-commit', dir);
    assert.equal(result.action, 'removed');
    assert.ok(!existsSync(path.join(dir, '.git', 'hooks', 'pre-commit')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('uninstallHook 恢复用户备份', () => {
  const dir = setupGitRepo();
  try {
    const hooksDir = path.join(dir, '.git', 'hooks');
    writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\necho custom\n');
    installHook('pre-commit', PACKAGE_ROOT, dir);

    const result = uninstallHook('pre-commit', dir);
    assert.equal(result.action, 'restored-backup');
    assert.equal(result.restored, true);

    const restored = readHook(hooksDir, 'pre-commit');
    assert.ok(restored.includes('echo custom'));
    assert.ok(!existsSync(path.join(hooksDir, 'pre-commit.oms-backup')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('uninstallHook 非 oms 管理的 hook 跳过', () => {
  const dir = setupGitRepo();
  try {
    const hooksDir = path.join(dir, '.git', 'hooks');
    writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\necho custom\n');

    const result = uninstallHook('pre-commit', dir);
    assert.equal(result.action, 'not-managed');
    // 文件保留
    assert.ok(existsSync(path.join(hooksDir, 'pre-commit')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================
// installAll / uninstallAll 测试
// ============================================

test('installAll 安装全部 4 个 hook', () => {
  const dir = setupGitRepo();
  try {
    const result = installAll(PACKAGE_ROOT, dir);
    assert.equal(result.ok, true);

    for (const type of HOOK_TYPES) {
      assert.equal(getHookStatus(type, dir), 'installed', `${type} 应已安装`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('installAll 非 git 仓库返回失败', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-nongit-'));
  try {
    const result = installAll(PACKAGE_ROOT, dir);
    assert.equal(result.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('installAll 后 uninstallAll 完全清理', () => {
  const dir = setupGitRepo();
  try {
    installAll(PACKAGE_ROOT, dir);
    const result = uninstallAll(dir);
    assert.equal(result.ok, true);

    for (const type of HOOK_TYPES) {
      assert.ok(!existsSync(path.join(dir, '.git', 'hooks', type)), `${type} 应已删除`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================
// status 测试
// ============================================

test('statusAll 输出 INSTALLED / NOT INSTALLED', () => {
  const dir = setupGitRepo();
  try {
    installHook('pre-commit', PACKAGE_ROOT, dir);
    const status = statusAll(dir);
    assert.ok(status.includes('pre-commit'));
    assert.ok(status.includes('INSTALLED'));
    assert.ok(status.includes('NOT INSTALLED'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('statusAll 识别 user-owned hook', () => {
  const dir = setupGitRepo();
  try {
    const hooksDir = path.join(dir, '.git', 'hooks');
    writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\necho custom\n');
    const status = statusAll(dir);
    assert.ok(status.includes('USER-OWNED'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('statusAll 非 git 仓库标记 NOT A GIT REPO', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-nongit-status-'));
  try {
    const status = statusAll(dir);
    assert.ok(status.includes('NOT A GIT REPO'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================
// wrapper 脚本内容验证
// ============================================

test('installHook 生成的 wrapper 含正确的 check script 路径', () => {
  const dir = setupGitRepo();
  try {
    installHook('pre-commit', PACKAGE_ROOT, dir);
    const content = readHook(path.join(dir, '.git', 'hooks'), 'pre-commit');
    assert.ok(content.includes('pre-commit-check.js'), 'must reference check script');
    assert.ok(content.includes('exec'), 'must exec node');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('commit-msg wrapper 透传 $1 参数', () => {
  const dir = setupGitRepo();
  try {
    installHook('commit-msg', PACKAGE_ROOT, dir);
    const content = readHook(path.join(dir, '.git', 'hooks'), 'commit-msg');
    assert.ok(content.includes('"$@"'), 'must pass "$@" for $1');
    assert.ok(content.includes('commit-msg-check.js'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
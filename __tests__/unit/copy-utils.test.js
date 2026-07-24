/**
 * Tests for copy-utils.js - File copy utilities
 *
 * Focus: recursive directory copying (bug fix for brainstorming/scripts/)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { copyDir } from '../../hooks/lib/copy-utils.js';

test('copyDir: copies files recursively when recursive: true', async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-test-'));

  try {
    // Create source structure: file + subdirectory with files
    const srcDir = path.join(tmpdir, 'src');
    const subDir = path.join(srcDir, 'scripts');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'SKILL.md'), '# Test Skill');
    fs.writeFileSync(path.join(subDir, 'helper.js'), 'console.log("help");');
    fs.writeFileSync(path.join(subDir, 'server.cjs'), 'console.log("server");');

    // Copy with recursive: true
    const targetDir = path.join(tmpdir, 'target');
    const count = copyDir(srcDir, targetDir, { recursive: true });

    // Verify count (3 files)
    assert.equal(count, 3, 'Should copy 3 files (1 top-level + 2 in scripts/)');

    // Verify structure
    assert.ok(fs.existsSync(path.join(targetDir, 'SKILL.md')), 'SKILL.md should exist');
    assert.ok(fs.existsSync(path.join(targetDir, 'scripts', 'helper.js')), 'scripts/helper.js should exist');
    assert.ok(fs.existsSync(path.join(targetDir, 'scripts', 'server.cjs')), 'scripts/server.cjs should exist');

    // Verify content
    assert.equal(
      fs.readFileSync(path.join(targetDir, 'SKILL.md'), 'utf8'),
      '# Test Skill',
      'File content should match'
    );
  } finally {
    // Cleanup
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test('copyDir: copies files only (not subdirs) when recursive: false or unset', async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-test-'));

  try {
    // Create source: file + subdirectory
    const srcDir = path.join(tmpdir, 'src');
    const subDir = path.join(srcDir, 'scripts');
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'SKILL.md'), '# Test Skill');
    fs.writeFileSync(path.join(subDir, 'helper.js'), 'console.log("help");');

    // Copy without recursive flag (default: false)
    const targetDir = path.join(tmpdir, 'target');
    const count = copyDir(srcDir, targetDir);

    // Should only copy 1 file (SKILL.md), skip scripts/ directory
    assert.equal(count, 1, 'Should copy only top-level files');
    assert.ok(fs.existsSync(path.join(targetDir, 'SKILL.md')), 'SKILL.md should exist');
    assert.ok(!fs.existsSync(path.join(targetDir, 'scripts')), 'scripts/ should not be copied');
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test('copyDir: respects filter function', async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-test-'));

  try {
    const srcDir = path.join(tmpdir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'test.md'), 'content');
    fs.writeFileSync(path.join(srcDir, 'test.js'), 'code');
    fs.writeFileSync(path.join(srcDir, 'test.txt'), 'text');

    // Copy only .md files
    const targetDir = path.join(tmpdir, 'target');
    const count = copyDir(srcDir, targetDir, { filter: f => f.endsWith('.md') });

    assert.equal(count, 1, 'Should copy only .md file');
    assert.ok(fs.existsSync(path.join(targetDir, 'test.md')), 'test.md should exist');
    assert.ok(!fs.existsSync(path.join(targetDir, 'test.js')), 'test.js should be filtered out');
    assert.ok(!fs.existsSync(path.join(targetDir, 'test.txt')), 'test.txt should be filtered out');
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test('copyDir: returns 0 for non-existent source', () => {
  const count = copyDir('/nonexistent/path', '/tmp/target');
  assert.equal(count, 0, 'Should return 0 for non-existent source');
});

test('copyDir: creates nested directories on demand', async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-test-'));

  try {
    const srcDir = path.join(tmpdir, 'src');
    const nestedSrc = path.join(srcDir, 'deeply', 'nested', 'scripts');
    fs.mkdirSync(nestedSrc, { recursive: true });
    fs.writeFileSync(path.join(nestedSrc, 'run.sh'), '#!/bin/bash');

    // Copy with recursive: true
    const targetDir = path.join(tmpdir, 'target');
    const count = copyDir(srcDir, targetDir, { recursive: true });

    assert.equal(count, 1, 'Should copy nested file');
    assert.ok(
      fs.existsSync(path.join(targetDir, 'deeply', 'nested', 'scripts', 'run.sh')),
      'Nested file should exist'
    );
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test('copyDir: handles empty subdirectories', async () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-test-'));

  try {
    const srcDir = path.join(tmpdir, 'src');
    fs.mkdirSync(path.join(srcDir, 'empty-dir'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'SKILL.md'), 'content');

    // Copy with recursive: true
    const targetDir = path.join(tmpdir, 'target');
    const count = copyDir(srcDir, targetDir, { recursive: true });

    // Only 1 file copied, empty dir skipped (no files to count)
    assert.equal(count, 1, 'Should count only files, not empty dirs');
    assert.ok(fs.existsSync(path.join(targetDir, 'empty-dir')), 'Empty dir should be created');
  } finally {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});
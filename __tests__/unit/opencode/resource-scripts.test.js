import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { copyDirSafe } from '../../../opencode/scripts/postinstall.mjs';
import { shouldCopy, syncResourceTree } from '../../../opencode/scripts/copy-resources.mjs';

function fixture() {
  return mkdtempSync(join(tmpdir(), 'oms-resource-test-'));
}

test('postinstall preserves an existing skill when its backup fails', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    mkdirSync(join(srcRoot, 'sdd-spec'), { recursive: true });
    mkdirSync(join(dstRoot, 'sdd-spec'), { recursive: true });
    writeFileSync(join(srcRoot, 'sdd-spec', 'SKILL.md'), 'plugin version');
    writeFileSync(join(dstRoot, 'sdd-spec', 'SKILL.md'), 'user version');

    const warnings = [];
    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'skills', {
      cpSync: (src, dst, options) => {
        if (dst.includes('.oh-my-sdd-backup-')) throw new Error('backup denied');
        cpSync(src, dst, options);
      },
      warn: (message) => warnings.push(message),
      now: () => 123,
    });

    assert.equal(installed, 0);
    assert.equal(readFileSync(join(dstRoot, 'sdd-spec', 'SKILL.md'), 'utf8'), 'user version');
    assert.ok(warnings.some((message) => message.includes('preserving existing target')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('postinstall backs up the existing command before replacing it', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    mkdirSync(srcRoot, { recursive: true });
    mkdirSync(dstRoot, { recursive: true });
    writeFileSync(join(srcRoot, 'sdd-plan.md'), 'plugin version');
    writeFileSync(join(dstRoot, 'sdd-plan.md'), 'user version');

    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'commands', {
      warn: () => {},
      now: () => 123,
    });

    assert.equal(installed, 1);
    assert.equal(readFileSync(join(dstRoot, 'sdd-plan.md'), 'utf8'), 'plugin version');
    assert.equal(
      readFileSync(join(dstRoot, 'sdd-plan.md.oh-my-sdd-backup-123'), 'utf8'),
      'user version',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('postinstall upgrades a skill when auxiliary resources change', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    const srcSkill = join(srcRoot, 'sdd-spec');
    const dstSkill = join(dstRoot, 'sdd-spec');
    mkdirSync(join(srcSkill, 'scripts'), { recursive: true });
    mkdirSync(join(dstSkill, 'scripts'), { recursive: true });
    writeFileSync(join(srcSkill, 'SKILL.md'), 'same instructions');
    writeFileSync(join(dstSkill, 'SKILL.md'), 'same instructions');
    writeFileSync(join(srcSkill, 'scripts', 'run.mjs'), 'new helper');
    writeFileSync(join(dstSkill, 'scripts', 'run.mjs'), 'old helper');
    writeFileSync(join(dstSkill, 'scripts', 'removed.mjs'), 'stale helper');

    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'skills', {
      warn: () => {},
      now: () => 123,
    });

    assert.equal(installed, 1);
    assert.equal(readFileSync(join(dstSkill, 'scripts', 'run.mjs'), 'utf8'), 'new helper');
    assert.equal(existsSync(join(dstSkill, 'scripts', 'removed.mjs')), false);
    assert.equal(
      readFileSync(join(`${dstSkill}.oh-my-sdd-backup-123`, 'scripts', 'run.mjs'), 'utf8'),
      'old helper',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('postinstall safely replaces file-directory type conflicts', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    mkdirSync(join(srcRoot, 'sdd-skill'), { recursive: true });
    mkdirSync(join(dstRoot, 'sdd-command.md'), { recursive: true });
    writeFileSync(join(srcRoot, 'sdd-skill', 'SKILL.md'), 'plugin skill');
    writeFileSync(join(srcRoot, 'sdd-command.md'), 'plugin command');
    writeFileSync(join(dstRoot, 'sdd-skill'), 'user file');
    writeFileSync(join(dstRoot, 'sdd-command.md', 'user.txt'), 'user directory');

    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'resources', {
      warn: () => {},
      now: () => 123,
    });

    assert.equal(installed, 2);
    assert.equal(readFileSync(join(dstRoot, 'sdd-skill', 'SKILL.md'), 'utf8'), 'plugin skill');
    assert.equal(readFileSync(join(dstRoot, 'sdd-command.md'), 'utf8'), 'plugin command');
    assert.equal(readFileSync(join(dstRoot, 'sdd-skill.oh-my-sdd-backup-123'), 'utf8'), 'user file');
    assert.equal(
      readFileSync(join(dstRoot, 'sdd-command.md.oh-my-sdd-backup-123', 'user.txt'), 'utf8'),
      'user directory',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('postinstall restores the existing target when replacement fails', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    const src = join(srcRoot, 'sdd-plan.md');
    const dst = join(dstRoot, 'sdd-plan.md');
    mkdirSync(srcRoot, { recursive: true });
    mkdirSync(dstRoot, { recursive: true });
    writeFileSync(src, 'plugin version');
    writeFileSync(dst, 'user version');

    const warnings = [];
    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'commands', {
      cpSync: (from, to, options) => {
        if (from === src && to === dst) throw new Error('replacement denied');
        cpSync(from, to, options);
      },
      warn: (message) => warnings.push(message),
      now: () => 123,
    });

    assert.equal(installed, 0);
    assert.equal(readFileSync(dst, 'utf8'), 'user version');
    assert.ok(warnings.some((message) => message.includes('restored existing target')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync excludes declared noise directories', () => {
  const root = fixture();
  try {
    const src = join(root, 'src');
    const dst = join(root, 'dst');
    mkdirSync(join(src, 'skill'), { recursive: true });
    mkdirSync(join(src, 'node_modules', 'bad'), { recursive: true });
    mkdirSync(join(src, '__tests__'), { recursive: true });
    writeFileSync(join(src, 'skill', 'SKILL.md'), 'ok');
    writeFileSync(join(src, 'node_modules', 'bad', 'index.js'), 'bad');
    writeFileSync(join(src, '__tests__', 'x.test.js'), 'bad');

    syncResourceTree(src, dst);

    assert.equal(shouldCopy('node_modules'), false);
    assert.ok(existsSync(join(dst, 'skill', 'SKILL.md')));
    assert.equal(existsSync(join(dst, 'node_modules')), false);
    assert.equal(existsSync(join(dst, '__tests__')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

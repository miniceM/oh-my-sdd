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

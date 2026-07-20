import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { HOOKS_DIR, PLUGIN_ROOT } from '../../../opencode/dist/paths.js';

describe('paths module constants', () => {
  it('HOOKS_DIR is an absolute path ending with /hooks', () => {
    assert.ok(HOOKS_DIR.startsWith('/'), `HOOKS_DIR should be absolute: ${HOOKS_DIR}`);
    assert.ok(
      HOOKS_DIR.endsWith('/hooks') || HOOKS_DIR.endsWith('\\hooks'),
      `HOOKS_DIR should end with /hooks: ${HOOKS_DIR}`,
    );
  });

  it('PLUGIN_ROOT is the parent directory of HOOKS_DIR', () => {
    const expectedRoot = resolve(HOOKS_DIR, '..');
    assert.equal(resolve(PLUGIN_ROOT), expectedRoot);
  });

  it('PLUGIN_ROOT is an absolute path', () => {
    assert.ok(PLUGIN_ROOT.startsWith('/'), `PLUGIN_ROOT should be absolute: ${PLUGIN_ROOT}`);
  });

  it('PLUGIN_ROOT does not contain unresolved ".." segments', () => {
    assert.ok(!PLUGIN_ROOT.includes('..'), `PLUGIN_ROOT should be fully resolved: ${PLUGIN_ROOT}`);
  });

  it('PLUGIN_ROOT is suitable as CLAUDE_PLUGIN_ROOT env var for spawned hooks', () => {
    assert.ok(PLUGIN_ROOT.length > 0);
    assert.ok(PLUGIN_ROOT.length < 4096, 'path length should be reasonable');
  });
});

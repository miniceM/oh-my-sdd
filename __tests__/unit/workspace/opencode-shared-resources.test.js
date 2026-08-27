import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PRODUCT_ROOT } from '../../helpers/workspace-layout.js';

test('product package owns the OpenCode resource lifecycle source', () => {
  for (const file of ['ownership.js', 'agents.js', 'uninstall.js']) {
    assert.equal(existsSync(path.join(PRODUCT_ROOT, 'lib', 'opencode', file)), true, file);
  }
});

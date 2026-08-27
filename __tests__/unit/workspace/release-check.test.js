import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkReleaseContract } from '../../../scripts/release-check.mjs';

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'oms-release-check-'));
  const productRoot = path.join(root, 'packages', 'product');
  const opencodeRoot = path.join(root, 'packages', 'opencode-plugin');
  writeJson(path.join(root, 'package.json'), { private: true, workspaces: ['packages/*'] });
  writeJson(path.join(productRoot, 'package.json'), { name: '@cli-tools/oh-my-sdd', version: '0.2.1' });
  writeJson(path.join(opencodeRoot, 'package.json'), { name: '@cli-tools/oh-my-sdd-opencode', version: '0.2.1' });
  writeJson(path.join(productRoot, '.claude-plugin', 'plugin.json'), { version: '0.2.1' });
  writeJson(path.join(productRoot, '.claude-plugin', 'marketplace.json'), { plugins: [{ version: '0.2.1' }] });
  writeJson(path.join(root, '.changeset', 'config.json'), {
    fixed: [['@cli-tools/oh-my-sdd', '@cli-tools/oh-my-sdd-opencode']],
  });
  return { root, productRoot, opencodeRoot };
}

test('release check reports mismatched OpenCode snapshot as a failure', (t) => {
  const paths = fixture();
  t.after(() => rmSync(paths.root, { recursive: true, force: true }));

  const result = checkReleaseContract({
    repoRoot: paths.root,
    productRoot: paths.productRoot,
    opencodeRoot: paths.opencodeRoot,
    compareTree: () => false,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /OpenCode resource snapshot differs: skills -> oms-skills/);
});

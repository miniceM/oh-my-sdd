import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MIN_NODE_VERSION } from '../../../lib/platform.js';

const root = process.cwd();

test('all package and documentation entry points require Node 22', () => {
  const rootPackage = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const opencodePackage = JSON.parse(readFileSync(path.join(root, 'opencode', 'package.json'), 'utf8'));
  const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
  const installer = readFileSync(path.join(root, 'install', 'main.js'), 'utf8');
  const ci = readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

  assert.equal(MIN_NODE_VERSION, '22.0.0');
  assert.equal(rootPackage.engines.node, '>=22.0.0');
  assert.equal(opencodePackage.engines.node, '>=22.0.0');
  assert.match(readme, /Node\.js\s*[≥>]\s*22/);
  assert.match(installer, /MIN_NODE_VERSION/);
  assert.doesNotMatch(installer, /18\.0\.0/);
  assert.match(ci, /node:\s*\[22\]/);
});

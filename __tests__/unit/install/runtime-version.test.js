import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MIN_NODE_VERSION } from '../../../packages/product/lib/platform.js';

const root = process.cwd();

test('all package, documentation, and CI entry points support Node 18+', () => {
  const productPackage = JSON.parse(readFileSync(path.join(root, 'packages', 'product', 'package.json'), 'utf8'));
  const opencodePackage = JSON.parse(readFileSync(path.join(root, 'packages', 'opencode-plugin', 'package.json'), 'utf8'));
  const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
  const installer = readFileSync(path.join(root, 'packages', 'product', 'install', 'main.js'), 'utf8');
  const ci = readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');

  assert.equal(MIN_NODE_VERSION, '18.0.0');
  assert.equal(productPackage.engines.node, '>=18.0.0');
  assert.equal(opencodePackage.engines.node, '>=18.0.0');
  assert.match(readme, /Node\.js\s*[≥>]\s*18/);
  assert.match(installer, /MIN_NODE_VERSION/);
  assert.match(ci, /node:\s*\[18,\s*20,\s*22\]/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INSTALL_FILE = path.resolve(__dirname, '..', '..', 'hooks', 'lib', 'install-opencode.js');

test('install-opencode.js does not import spawn from node:child_process (no compile process)', () => {
  const src = readFileSync(INSTALL_FILE, 'utf8');
  // accept "node:child_process" import only if it doesn't destructure 'spawn'
  const cpImport = src.match(/import\s*\{[^}]*\}\s*from\s*['"]node:child_process['"]/);
  if (cpImport) {
    assert.ok(
      !/spawn/.test(cpImport[0]),
      'import { ... } from "node:child_process" must not include "spawn" — no compile process needed'
    );
  }
  // also check top-level spawn reference (e.g. default-style or destructured elsewhere)
  assert.ok(
    !/^\s*spawn\s*\(/m.test(src),
    'install-opencode.js must not call spawn(...) — compile process removed'
  );
});

test('install-opencode.js does not define compile() or buildOpenCodePlugin() functions', () => {
  const src = readFileSync(INSTALL_FILE, 'utf8');
  assert.ok(
    !/function\s+compile\s*\(/.test(src) && !/const\s+compile\s*=/.test(src),
    'install-opencode.js must not define compile() function'
  );
  assert.ok(
    !/function\s+buildOpenCodePlugin\s*\(/.test(src) && !/const\s+buildOpenCodePlugin\s*=/.test(src),
    'install-opencode.js must not define buildOpenCodePlugin() function'
  );
});

test('install-opencode.js main flow does not call buildOpenCodePlugin', () => {
  const src = readFileSync(INSTALL_FILE, 'utf8');
  // main flow is installForOpenCode function — search for buildOpenCodePlugin references
  assert.ok(
    !/buildOpenCodePlugin\s*\(/.test(src),
    'install-opencode.js must not call buildOpenCodePlugin(...) — build is publisher concern, not installer'
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const workflow = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');

test('CI runs the Node 18/20/22 matrix and enforces coverage', () => {
  assert.match(workflow, /node:\s*\[18,\s*20,\s*22\]/);
  assert.match(workflow, /npm run test:coverage/);
});

test('smoke-check runs for pull requests with an isolated HOME and the current uninstall entry', () => {
  const smoke = workflow.slice(workflow.indexOf('smoke-check:'));

  assert.doesNotMatch(smoke, /github\.ref == 'refs\/heads\/main'/);
  assert.match(smoke, /TESTHOME=\$\(mktemp -d\)/);
  assert.match(smoke, /HOME=\$TESTHOME USERPROFILE=\$TESTHOME node install\/uninstall\.js/);
  assert.doesNotMatch(smoke, /node uninstall\.js/);
});

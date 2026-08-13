import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const workflow = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');

test('CI runs the Node 18/20/22 matrix and enforces coverage in a stable dedicated job', () => {
  assert.match(workflow, /node:\s*\[18,\s*20,\s*22\]/);
  const testJob = workflow.slice(workflow.indexOf('  test:'), workflow.indexOf('  coverage:'));
  const coverageJob = workflow.slice(workflow.indexOf('  coverage:'), workflow.indexOf('  smoke-check:'));
  assert.match(testJob, /npm test/);
  assert.doesNotMatch(testJob, /test:coverage/);
  assert.match(coverageJob, /node-version:\s*22/);
  assert.match(coverageJob, /npm run test:coverage/);
});

test('smoke-check runs for pull requests with an isolated HOME and the current uninstall entry', () => {
  const smoke = workflow.slice(workflow.indexOf('smoke-check:'));

  assert.doesNotMatch(smoke, /github\.ref == 'refs\/heads\/main'/);
  assert.match(smoke, /TESTHOME=\$\(mktemp -d\)/);
  assert.match(smoke, /HOME=\$TESTHOME USERPROFILE=\$TESTHOME node install\/uninstall\.js/);
  assert.doesNotMatch(smoke, /node uninstall\.js/);
});

test('Windows CI explicitly runs the no-Bash mock CLI contract', () => {
  const testJob = workflow.slice(workflow.indexOf('  test:'), workflow.indexOf('  coverage:'));
  assert.match(testJob, /if:\s*runner\.os\s*==\s*'Windows'/);
  assert.match(testJob, /node --test __tests__\/unit\/scripts\/mock-cli\.test\.js/);
});

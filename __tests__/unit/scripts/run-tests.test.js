import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNodeArgs,
  parseLineCoverage,
  validateCoverage,
} from '../../../scripts/run-tests.js';

test('coverage mode uses the Node native test coverage collector', () => {
  assert.deepEqual(
    buildNodeArgs(['a.test.js'], { coverage: true }),
    ['--experimental-test-coverage', '--test', 'a.test.js'],
  );
  assert.deepEqual(buildNodeArgs(['a.test.js'], { coverage: false }), ['--test', 'a.test.js']);
});

test('coverage parser reads the all-files line percentage across Node table formatting', () => {
  const output = [
    '\u2139 file      | line % | branch % | funcs % | uncovered lines',
    '\u2139 all files |  84.25 |    76.00 |   88.00 |',
  ].join('\n');

  assert.equal(parseLineCoverage(output), 84.25);
  assert.deepEqual(validateCoverage(output, 80), { actual: 84.25, minimum: 80 });
});

test('coverage gate rejects missing or sub-80 percent reports', () => {
  assert.throws(() => validateCoverage('no coverage report', 80), /summary not found/i);
  assert.throws(
    () => validateCoverage('all files | 79.99 | 90.00 | 95.00 |', 80),
    /79\.99%.*80%/,
  );
});

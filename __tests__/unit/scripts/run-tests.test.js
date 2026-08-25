import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import {
  buildNodeArgs,
  OPENCODE_RESOURCE_SYNC_SCRIPT,
  parseLineCoverage,
  syncOpenCodeResources,
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

test('OpenCode resource synchronization runs the project script with inherited stdio', async () => {
  const child = new EventEmitter();
  let received;
  const spawnFn = (...args) => {
    received = args;
    queueMicrotask(() => child.emit('close', 0));
    return child;
  };

  await syncOpenCodeResources({ spawnFn });

  assert.deepEqual(received, [
    process.execPath,
    [OPENCODE_RESOURCE_SYNC_SCRIPT],
    { cwd: new URL('../../../', import.meta.url).pathname.slice(0, -1), stdio: 'inherit' },
  ]);
});

test('OpenCode resource synchronization rejects a nonzero child exit', async () => {
  const child = new EventEmitter();
  const spawnFn = () => {
    queueMicrotask(() => child.emit('close', 17));
    return child;
  };

  await assert.rejects(syncOpenCodeResources({ spawnFn }), /synchronization failed with code 17/i);
});

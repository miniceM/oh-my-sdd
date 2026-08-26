import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildNodeArgs,
  main,
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
    { cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), stdio: 'inherit' },
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

test('OpenCode resource synchronization rejects a child process error', async () => {
  const child = new EventEmitter();
  const spawnFn = () => {
    queueMicrotask(() => child.emit('error', new Error('sync launcher unavailable')));
    return child;
  };

  await assert.rejects(syncOpenCodeResources({ spawnFn }), /sync launcher unavailable/);
});

test('main waits for OpenCode resources before starting the Node test child', async () => {
  const events = [];
  const testChild = new EventEmitter();
  const syncResources = async () => {
    events.push('sync-start');
    await new Promise((resolve) => {
      queueMicrotask(() => {
        events.push('sync-resolved');
        resolve();
      });
    });
  };
  const spawnFn = () => {
    events.push('test-spawn');
    queueMicrotask(() => testChild.emit('close', 0));
    return testChild;
  };

  await main({
    findTestsFn: async () => ['/tmp/example.test.js'],
    spawnFn,
    syncResources,
  });

  assert.deepEqual(events, ['sync-start', 'sync-resolved', 'test-spawn']);
});

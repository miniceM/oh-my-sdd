/**
 * Tests for install/common/announce.js - Shared progress output helper
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { announce } from '../../../../packages/product/install/common/announce.js';

describe('announce', () => {
  it('writes message + newline to stderr', () => {
    const writes = [];
    mock.method(process.stderr, 'write', (s) => { writes.push(s); return true; });
    try {
      announce('hello');
      assert.deepEqual(writes, ['hello\n']);
    } finally {
      mock.restoreAll();
    }
  });

  it('handles empty string', () => {
    const writes = [];
    mock.method(process.stderr, 'write', (s) => { writes.push(s); return true; });
    try {
      announce('');
      assert.deepEqual(writes, ['\n']);
    } finally {
      mock.restoreAll();
    }
  });

  it('handles multi-line messages', () => {
    const writes = [];
    mock.method(process.stderr, 'write', (s) => { writes.push(s); return true; });
    try {
      announce('line1\nline2');
      assert.deepEqual(writes, ['line1\nline2\n']);
    } finally {
      mock.restoreAll();
    }
  });
});

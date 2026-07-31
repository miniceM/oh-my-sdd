/**
 * Tests for install/common/detect.js - CLI detection helpers
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCliInPath, isDirPresent } from '../../../../install/common/detect.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

describe('isCliInPath', () => {
  it('returns true for node (always available)', () => {
    assert.equal(isCliInPath('node'), true);
  });

  it('returns false for a nonsense command name', () => {
    assert.equal(isCliInPath('definitely-not-a-real-cli-xyz-123'), false);
  });

  it('returns false for empty string', () => {
    // Empty string should fail gracefully
    assert.equal(isCliInPath(''), false);
  });
});

describe('isDirPresent', () => {
  it('returns true for tmpdir()', () => {
    assert.equal(isDirPresent(tmpdir()), true);
  });

  it('returns false for a nonexistent path', () => {
    assert.equal(isDirPresent(join(tmpdir(), 'does-not-exist-xyz-123')), false);
  });

  it('returns true for an existing file path (existsSync behavior)', () => {
    // Use a known file - package.json should exist
    const pkgPath = join(process.cwd(), 'package.json');
    if (existsSync(pkgPath)) {
      // isDirPresent uses existsSync - returns true for any existing path
      // This is correct behavior - caller should use fs.statSync if they need dir-specific check
      assert.equal(isDirPresent(pkgPath), true);
    }
  });
});
/**
 * Test utilities for unit/integration tests.
 *
 * Provides helper functions to avoid polluting production logs
 * and simplify test setup/teardown.
 */

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';

/**
 * Run test with isolated environment variables.
 * Automatically restores original values after test.
 *
 * @param {object} overrides - Environment variables to set
 * @param {function} fn - Test function to run
 * @returns {*} - Return value from test function
 *
 * @example
 * withTestEnv({ OMS_LOG_FILE: '/tmp/test.log' }, () => {
 *   // test code here
 * });
 */
export function withTestEnv(overrides, fn) {
  const original = {};

  // Save original values
  for (const [k, v] of Object.entries(overrides)) {
    original[k] = process.env[k];
    process.env[k] = v;
  }

  try {
    return fn();
  } finally {
    // Restore original values
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

/**
 * Create temporary directory for test.
 * Automatically cleans up after test.
 *
 * @param {function} fn - Test function, receives temp dir path
 * @returns {*} - Return value from test function
 *
 * @example
 * await withTempDir((tmpDir) => {
 *   const testFile = join(tmpDir, 'test.log');
 *   // test code here
 * });
 */
export function withTempDir(fn) {
  const tmpDir = join(tmpdir(), `oms-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    return fn(tmpDir);
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* best effort */ }
  }
}

/**
 * Reset all module-level caches for test isolation.
 * Calls resetForTest() on all modules that export it.
 */
export function resetAllModules() {
  // Import modules that have resetForTest()
  try {
    const baseline = require('../../opencode/dist/baseline.js');
    if (typeof baseline.resetForTest === 'function') {
      baseline.resetForTest();
    }
  } catch { /* module not loaded */ }

  try {
    const logger = require('../../opencode/dist/logger.js');
    if (typeof logger.resetForTest === 'function') {
      logger.resetForTest();
    }
  } catch { /* module not loaded */ }
}

/**
 * Create test log file path in temp directory.
 * @returns {string} - Test log file path
 */
export function getTestLogFile() {
  const tmpDir = join(tmpdir(), 'oms-test-logs');
  mkdirSync(tmpDir, { recursive: true });
  return join(tmpDir, `test-${Date.now()}.log`);
}
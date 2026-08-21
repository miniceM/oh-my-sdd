import assert from 'node:assert/strict';
import test from 'node:test';
import { installerBanner } from '../../../bin/oms-welcome.js';

test('installerBanner renders the shared logo without login welcome content', () => {
  const output = installerBanner();

  assert.match(output, /____/);
  assert.match(output, /oh-my-sdd/);
  assert.doesNotMatch(output, /Quick start/);
});

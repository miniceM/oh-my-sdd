import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeAdapter } from '../../../../install/hosts/claude-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

describe('ClaudeAdapter', () => {
  it('extends HostAdapter', () => {
    assert.ok(Object.getPrototypeOf(ClaudeAdapter) === HostAdapter);
  });

  it('has id = "claude"', () => {
    assert.equal(ClaudeAdapter.id, 'claude');
  });

  it('has a display name', () => {
    assert.equal(typeof ClaudeAdapter.displayName, 'string');
    assert.ok(ClaudeAdapter.displayName.length > 0);
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof ClaudeAdapter.isInstalled(), 'boolean');
  });

  it('install() is an async function', () => {
    assert.equal(ClaudeAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is overridden (not the default no-op)', () => {
    assert.notEqual(ClaudeAdapter.uninstall, HostAdapter.uninstall);
  });
});
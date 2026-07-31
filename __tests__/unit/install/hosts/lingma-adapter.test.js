import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LingmaAdapter } from '../../../../install/hosts/lingma-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

describe('LingmaAdapter', () => {
  it('extends HostAdapter', () => {
    assert.ok(Object.getPrototypeOf(LingmaAdapter) === HostAdapter);
  });

  it('has id = "lingma"', () => {
    assert.equal(LingmaAdapter.id, 'lingma');
  });

  it('has a display name', () => {
    assert.equal(typeof LingmaAdapter.displayName, 'string');
    assert.ok(LingmaAdapter.displayName.length > 0);
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof LingmaAdapter.isInstalled(), 'boolean');
  });

  it('install() is an async function', () => {
    assert.equal(LingmaAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is an async function', () => {
    assert.equal(LingmaAdapter.uninstall.constructor.name, 'AsyncFunction');
  });
});
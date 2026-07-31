import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KiloCodeAdapter } from '../../../../install/hosts/kilocode-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

describe('KiloCodeAdapter', () => {
  it('extends HostAdapter', () => {
    assert.ok(Object.getPrototypeOf(KiloCodeAdapter) === HostAdapter);
  });

  it('has id = "kilocode"', () => {
    assert.equal(KiloCodeAdapter.id, 'kilocode');
  });

  it('has a display name', () => {
    assert.equal(typeof KiloCodeAdapter.displayName, 'string');
    assert.ok(KiloCodeAdapter.displayName.length > 0);
  });

  it('isInstalled() returns boolean', () => {
    assert.equal(typeof KiloCodeAdapter.isInstalled(), 'boolean');
  });

  it('install() is an async function', () => {
    assert.equal(KiloCodeAdapter.install.constructor.name, 'AsyncFunction');
  });

  it('uninstall() is an async function', () => {
    assert.equal(KiloCodeAdapter.uninstall.constructor.name, 'AsyncFunction');
  });

  it('has capabilities defined', () => {
    assert.ok(KiloCodeAdapter.capabilities);
    assert.equal(KiloCodeAdapter.capabilities.hooks, false);
    assert.equal(KiloCodeAdapter.capabilities.baselineEnforcement, 'advisory');
  });
});
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HostAdapter } from '../../../install/host-adapter.js';

describe('HostAdapter', () => {
  it('has required static properties', () => {
    assert.equal(HostAdapter.id, 'abstract');
    assert.equal(HostAdapter.displayName, 'Abstract Host');
  });

  it('has isInstalled() returning false by default', () => {
    assert.equal(HostAdapter.isInstalled(), false);
  });

  it('has preflight() as no-op by default', () => {
    // Should not throw
    HostAdapter.preflight({ PACKAGE_ROOT: '/tmp', announce: () => {} });
  });

  it('install() throws "not implemented" by default', async () => {
    await assert.rejects(
      () => HostAdapter.install({ PACKAGE_ROOT: '/tmp', announce: () => {} }),
      /not implemented/
    );
  });

  it('uninstall() is a no-op by default (optional)', async () => {
    // Should not throw — uninstall is optional
    await HostAdapter.uninstall({ PACKAGE_ROOT: '/tmp', announce: () => {} });
  });
});
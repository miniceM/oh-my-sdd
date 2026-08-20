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

  it('describes its default installation-plan facts without side effects', () => {
    const result = HostAdapter.describe({
      PACKAGE_ROOT: '/tmp',
      announce: () => assert.fail('describe() must not announce'),
    });

    assert.deepEqual(result, {
      id: 'abstract',
      display_name: 'Abstract Host',
      detected: false,
      dependencies: [],
      capabilities: [],
      resources: [],
      risks: [],
      recommendation: {
        action: 'skip',
        reason: 'adapter has no plan facts',
      },
    });
  });

  it('uses isInstalled() to report whether the host is detected', () => {
    const originalIsInstalled = HostAdapter.isInstalled;
    HostAdapter.isInstalled = () => true;

    try {
      assert.equal(HostAdapter.describe({ PACKAGE_ROOT: '/tmp' }).detected, true);
    } finally {
      HostAdapter.isInstalled = originalIsInstalled;
    }
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

// __tests__/unit/install/hosts/adapter-consistency.test.js
//
// This test uses the registry dynamically (listTools + getAdapter) so that
// adding a new adapter (e.g., KiloCode) requires ZERO changes here.
// The test automatically picks up any adapter registered in host-registry.js.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listTools, getAdapter } from '../../../../packages/product/install/host-registry.js';
import { HostAdapter } from '../../../../packages/product/install/host-adapter.js';

describe('HostAdapter interface consistency', () => {
  const toolIds = listTools();

  // Verify all registered adapters conform to HostAdapter interface
  for (const id of toolIds) {
    const Adapter = getAdapter(id);

    describe(`${id}Adapter`, () => {
      it('extends HostAdapter', () => {
        assert.equal(Object.getPrototypeOf(Adapter), HostAdapter);
      });

      it(`has id = "${id}"`, () => {
        assert.equal(Adapter.id, id);
      });

      it('has a non-empty displayName', () => {
        assert.equal(typeof Adapter.displayName, 'string');
        assert.ok(Adapter.displayName.length > 0);
      });

      it('isInstalled() returns boolean', () => {
        assert.equal(typeof Adapter.isInstalled(), 'boolean');
      });

      it('preflight() is a function', () => {
        assert.equal(typeof Adapter.preflight, 'function');
      });

      it('install() is an async function', () => {
        assert.equal(Adapter.install.constructor.name, 'AsyncFunction');
      });

      it('uninstall() is an async function', () => {
        assert.equal(Adapter.uninstall.constructor.name, 'AsyncFunction');
      });
    });
  }

  // Single test for uniqueness across all adapters
  it('all adapter ids are unique', () => {
    const ids = toolIds;
    assert.equal(new Set(ids).size, ids.length, 'Duplicate adapter ids found');
  });
});

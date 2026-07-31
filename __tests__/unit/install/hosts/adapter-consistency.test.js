import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeAdapter } from '../../../../install/hosts/claude-adapter.js';
import { LingmaAdapter } from '../../../../install/hosts/lingma-adapter.js';
import { OpenCodeAdapter } from '../../../../install/hosts/opencode-adapter.js';
import { HostAdapter } from '../../../../install/host-adapter.js';

const ALL_ADAPTERS = [
  { name: 'Claude', Adapter: ClaudeAdapter, expectedId: 'claude' },
  { name: 'Lingma', Adapter: LingmaAdapter, expectedId: 'lingma' },
  { name: 'OpenCode', Adapter: OpenCodeAdapter, expectedId: 'opencode' },
];

describe('adapter interface consistency', () => {
  for (const { name, Adapter, expectedId } of ALL_ADAPTERS) {
    describe(`${name}Adapter`, () => {
      it('extends HostAdapter', () => {
        assert.equal(Object.getPrototypeOf(Adapter), HostAdapter);
      });

      it(`has id = "${expectedId}"`, () => {
        assert.equal(Adapter.id, expectedId);
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

      it('has unique id among all adapters', () => {
        const ids = ALL_ADAPTERS.map((a) => a.Adapter.id);
        assert.equal(new Set(ids).size, ids.length);
      });
    });
  }
});
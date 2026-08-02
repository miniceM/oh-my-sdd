import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAdapter, listTools, detectDefault } from '../../../install/host-registry.js';

describe('host-registry', () => {
  it('getAdapter returns the Claude adapter for "claude"', () => {
    const Adapter = getAdapter('claude');
    assert.equal(Adapter.id, 'claude');
  });

  it('getAdapter returns the Lingma adapter for "lingma"', () => {
    const Adapter = getAdapter('lingma');
    assert.equal(Adapter.id, 'lingma');
  });

  it('getAdapter returns the OpenCode adapter for "opencode"', () => {
    const Adapter = getAdapter('opencode');
    assert.equal(Adapter.id, 'opencode');
  });

  it('getAdapter throws for unknown tool with helpful message', () => {
    assert.throws(
      () => getAdapter('nonexistent'),
      /未知工具: nonexistent。支持: .*claude.*lingma.*opencode.*kilocode/
    );
  });

  it('listTools returns all registered tool ids', () => {
    const tools = listTools();
    assert.deepEqual(tools.sort(), ['claude', 'kilocode', 'lingma', 'opencode']);
  });

  it('detectDefault returns a string', () => {
    const def = detectDefault();
    assert.equal(typeof def, 'string');
    // In CI, probably no host is installed, so fallback to 'claude'
    assert.ok(['claude', 'kilocode', 'lingma', 'opencode'].includes(def));
  });
});

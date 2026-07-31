// install/host-registry.js — Registry of host adapters.
//
// Adding a new host: import the adapter class and add one entry to REGISTRY.
// That's it. No changes to install/main.js or any dispatcher switch-case.

import { ClaudeAdapter } from './hosts/claude-adapter.js';
import { LingmaAdapter } from './hosts/lingma-adapter.js';
import { OpenCodeAdapter } from './hosts/opencode-adapter.js';

const REGISTRY = new Map([
  ['claude',   ClaudeAdapter],
  ['lingma',   LingmaAdapter],
  ['opencode', OpenCodeAdapter],
]);

/**
 * Look up the adapter class for a given tool id.
 * Throws with a helpful message listing supported tools if not found.
 * @param {string} tool - Tool identifier ('claude', 'lingma', 'opencode')
 * @returns {typeof import('./host-adapter.js').HostAdapter}
 */
export function getAdapter(tool) {
  const adapter = REGISTRY.get(tool);
  if (!adapter) {
    const supported = [...REGISTRY.keys()].join(', ');
    throw new Error(`未知工具: ${tool}。支持: ${supported}`);
  }
  return adapter;
}

/** List all registered tool ids. */
export function listTools() { return [...REGISTRY.keys()]; }

/**
 * Detect the default tool based on what's installed.
 * Returns the first host whose isInstalled() returns true,
 * falling back to 'claude' (v0.1 backward-compat behavior).
 * @returns {string}
 */
export function detectDefault() {
  for (const [id, Adapter] of REGISTRY) {
    if (Adapter.isInstalled()) return id;
  }
  return 'claude';
}
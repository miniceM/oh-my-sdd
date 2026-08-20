import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildInstallationPlan } from '../../../../install/control-plane/plan.js';

class KiloStyleAdapter {
  static id = 'kilocode';
  static displayName = 'Kilo Code';

  static describe() {
    return {
      id: this.id,
      display_name: this.displayName,
      dependencies: [{ name: 'kilo', available: true }],
      capabilities: {
        write_prevention: {
          supported: false,
          evidence: 'host lacks PreToolUse',
          level: 'advisory',
        },
      },
      resources: [{ kind: 'instructions', path: '~/.config/kilo/AGENTS.md' }],
      risks: [{ category: 'enforcement', level: 'advisory' }],
    };
  }
}

describe('buildInstallationPlan', () => {
  it('builds a versioned normalized host plan without altering advisory capabilities', () => {
    const plan = buildInstallationPlan({ adapters: [KiloStyleAdapter], ctx: {} });

    assert.equal(plan.schema_version, 1);
    assert.deepEqual(plan.hosts, [{
      id: 'kilocode',
      display_name: 'Kilo Code',
      dependencies: [{ name: 'kilo', available: true }],
      capabilities: {
        write_prevention: {
          supported: false,
          evidence: 'host lacks PreToolUse',
          level: 'advisory',
        },
      },
      resources: [{ kind: 'instructions', path: '~/.config/kilo/AGENTS.md' }],
      risks: [{ category: 'enforcement', level: 'advisory' }],
      recommendation: {
        action: 'install',
        reason: 'Ready to install oh-my-sdd resources.',
      },
    }]);
  });

  it('turns adapter describe errors into actionable host facts', () => {
    class BrokenAdapter {
      static id = 'broken';
      static displayName = 'Broken Host';
      static describe() { throw new Error('cannot inspect host'); }
    }

    const plan = buildInstallationPlan({ adapters: [BrokenAdapter], ctx: {} });

    assert.deepEqual(plan.hosts[0], {
      id: 'broken',
      display_name: 'Broken Host',
      dependencies: [],
      capabilities: {},
      resources: [],
      risks: [{ category: 'inspection', level: 'error', message: 'cannot inspect host' }],
      recommendation: {
        action: 'inspect',
        reason: 'Resolve the host inspection error before installing.',
      },
    });
  });
});

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

class DetectedAdapter {
  static id = 'detected-host';

  static describe() {
    return { detected: true };
  }
}

class UndetectedAdapter {
  static id = 'undetected-host';

  static describe() {
    return { detected: false };
  }
}

describe('buildInstallationPlan', () => {
  it('retains explicit host detection facts and normalizes malformed values to false', () => {
    class MalformedDetectionAdapter {
      static id = 'malformed-host';

      static describe() {
        return { detected: 'yes' };
      }
    }

    const plan = buildInstallationPlan({
      adapters: [DetectedAdapter, UndetectedAdapter, MalformedDetectionAdapter],
      ctx: {},
    });

    assert.deepEqual(plan.hosts.map((host) => host.detected), [true, false, false]);
  });

  it('builds a versioned normalized host plan without altering advisory capabilities', () => {
    const plan = buildInstallationPlan({ adapters: [KiloStyleAdapter], ctx: {} });

    assert.equal(plan.schema_version, 1);
    assert.deepEqual(plan.hosts, [{
      id: 'kilocode',
      display_name: 'Kilo Code',
      detected: false,
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
      detected: false,
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

  it('recommends repairing required unavailable dependencies before installation', () => {
    class MissingDependenciesAdapter {
      static id = 'claude';
      static displayName = 'Claude Code';
      static describe() {
        return {
          dependencies: [
            { name: 'node', required: true, available: false },
            { name: 'openspec', required: true, available: false },
            { name: 'iam', required: true, available: false },
          ],
        };
      }
    }

    const plan = buildInstallationPlan({ adapters: [MissingDependenciesAdapter], ctx: {} });

    assert.deepEqual(plan.hosts[0].recommendation, {
      action: 'repair',
      reason: 'Install or update required dependencies before installing: node, openspec, iam.',
    });
  });

  it('uses static adapter metadata when describe facts omit host identity', () => {
    class MetadataOnlyAdapter {
      static id = 'claude';
      static displayName = 'Claude Code';
      static describe() { return { dependencies: [] }; }
    }

    const plan = buildInstallationPlan({ adapters: [MetadataOnlyAdapter], ctx: {} });

    assert.equal(plan.hosts[0].id, 'claude');
    assert.equal(plan.hosts[0].display_name, 'Claude Code');
  });

  it('normalizes a missing adapter as an inspection error instead of throwing', () => {
    const plan = buildInstallationPlan({ adapters: [null], ctx: {} });

    assert.deepEqual(plan.hosts[0], {
      id: 'unknown',
      display_name: 'unknown',
      detected: false,
      dependencies: [],
      capabilities: {},
      resources: [],
      risks: [{
        category: 'inspection',
        level: 'error',
        message: 'Adapter does not provide describe().',
      }],
      recommendation: {
        action: 'inspect',
        reason: 'Resolve the host inspection error before installing.',
      },
    });
  });

  for (const [description, value] of [
    ['null', null],
    ['a primitive', 'not host facts'],
    ['a Promise', Promise.resolve({ id: 'eventually' })],
  ]) {
    it(`turns a describe() result of ${description} into an inspection error`, () => {
      class InvalidDescriptionAdapter {
        static describe() { return value; }
      }

      const plan = buildInstallationPlan({ adapters: [InvalidDescriptionAdapter], ctx: {} });

      assert.equal(plan.hosts[0].risks[0].category, 'inspection');
      assert.equal(plan.hosts[0].risks[0].level, 'error');
      assert.equal(plan.hosts[0].recommendation.action, 'inspect');
    });
  }
});

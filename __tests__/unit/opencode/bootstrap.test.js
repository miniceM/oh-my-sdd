import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bootstrapOpenCodeResources } from '../../../opencode/scripts/resource-bootstrap.mjs';

function fixture() {
  return mkdtempSync(join(tmpdir(), 'oms-bootstrap-test-'));
}

function skill(root, name) {
  const dir = join(root, 'oms-skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `# ${name}\n`);
}

test('bootstrap projects OpenCode discovery resources and records verified activation atomically', () => {
  const root = fixture();
  try {
    skill(root, 'sdd-plan');
    const commands = join(root, '.opencode', 'commands');
    mkdirSync(commands, { recursive: true });
    writeFileSync(join(commands, 'sdd-plan.md'), '# plan\n');
    const delegated = join(root, 'delegated-skills', 'brainstorming');
    mkdirSync(delegated, { recursive: true });
    writeFileSync(join(delegated, 'SKILL.md'), '# brainstorming\n');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.9.9' }));
    const home = join(root, 'home');

    const result = bootstrapOpenCodeResources({
      pluginRoot: root,
      home,
      delegatedSkillNames: ['brainstorming'],
    });

    assert.equal(result.state, 'verified');
    assert.deepEqual(result.failed_resources, []);
    assert.ok(existsSync(join(home, '.config', 'opencode', 'skills', 'sdd-plan', 'SKILL.md')));
    assert.ok(existsSync(join(home, '.config', 'opencode', 'skills', 'brainstorming', 'SKILL.md')));
    assert.ok(existsSync(join(home, '.config', 'opencode', 'commands', 'sdd-plan.md')));
    const activation = JSON.parse(readFileSync(join(home, '.oh-my-sdd', 'opencode-activation.json'), 'utf8'));
    assert.equal(activation.schema, 1);
    assert.equal(activation.plugin_version, '9.9.9');
    assert.equal(activation.state, 'verified');
    assert.deepEqual(activation.registered_hooks, []);
    assert.equal(activation.resource_digest, result.resource_digest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bootstrap degrades for user-drifted resource without preventing activation', () => {
  const root = fixture();
  try {
    skill(root, 'sdd-plan');
    mkdirSync(join(root, '.opencode', 'commands'), { recursive: true });
    const home = join(root, 'home');
    bootstrapOpenCodeResources({ pluginRoot: root, home, delegatedSkillNames: [] });
    const target = join(home, '.config', 'opencode', 'skills', 'sdd-plan');
    writeFileSync(join(target, 'SKILL.md'), '# user copy\n');

    const result = bootstrapOpenCodeResources({ pluginRoot: root, home, delegatedSkillNames: [] });

    assert.equal(result.state, 'degraded');
    assert.deepEqual(result.drifted_resources, ['oms-skill:sdd-plan']);
    assert.deepEqual(result.failed_resources, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

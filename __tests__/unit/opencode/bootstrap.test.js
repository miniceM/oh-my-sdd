import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bootstrapOpenCodeResources } from '../../../opencode/scripts/resource-bootstrap.mjs';
import { readOwnershipManifest, uninstallOwnedResources } from '../../../opencode/scripts/resource-ownership.mjs';

const FIXED_NOW = Date.parse('2026-08-25T12:00:00.000Z');

function fixture() {
  return mkdtempSync(join(tmpdir(), 'oms-bootstrap-test-'));
}

function skill(root, name) {
  const dir = join(root, 'oms-skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `# ${name}\n`);
}

function bootstrap(root, home, options = {}) {
  return bootstrapOpenCodeResources({
    pluginRoot: root,
    home,
    configDir: join(home, '.config', 'opencode'),
    ...options,
  });
}

test('bootstrap projects OpenCode discovery resources and records verified activation atomically', () => {
  const root = fixture();
  try {
    skill(root, 'sdd-plan');
    for (const dir of ['dist', 'hooks', 'lib', 'content']) mkdirSync(join(root, dir), { recursive: true });
    const commands = join(root, '.opencode', 'commands');
    mkdirSync(commands, { recursive: true });
    writeFileSync(join(commands, 'sdd-plan.md'), '# plan\n');
    const delegated = join(root, 'delegated-skills', 'brainstorming');
    mkdirSync(delegated, { recursive: true });
    writeFileSync(join(delegated, 'SKILL.md'), '# brainstorming\n');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '9.9.9' }));
    const home = join(root, 'home');

    const result = bootstrap(root, home, {
      delegatedSkillNames: ['brainstorming'],
      now: () => FIXED_NOW,
    });

    assert.equal(result.state, 'verified');
    assert.deepEqual(result.failed_resources, []);
    assert.ok(existsSync(join(home, '.config', 'opencode', 'skills', 'sdd-plan', 'SKILL.md')));
    assert.ok(existsSync(join(home, '.config', 'opencode', 'skills', 'brainstorming', 'SKILL.md')));
    assert.ok(existsSync(join(home, '.config', 'opencode', 'commands', 'sdd-plan.md')));
    const activation = JSON.parse(readFileSync(join(home, '.oh-my-sdd', 'opencode-activation.json'), 'utf8'));
    assert.equal(activation.schema_version, 1);
    assert.equal(activation.plugin_version, '9.9.9');
    assert.equal(activation.state, 'verified');
    assert.equal(activation.activated_at, '2026-08-25T12:00:00.000Z');
    assert.deepEqual(activation.registered_hooks, []);
    assert.equal(activation.resource_digest, result.resource_digest);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bootstrap fails when required package runtime assets are absent', () => {
  const root = fixture();
  try {
    skill(root, 'sdd-plan');
    mkdirSync(join(root, '.opencode', 'commands'), { recursive: true });
    const result = bootstrap(root, join(root, 'home'), { delegatedSkillNames: [] });
    assert.equal(result.state, 'failed');
    assert.deepEqual(result.failed_resources.sort(), ['runtime:content', 'runtime:dist', 'runtime:hooks', 'runtime:lib']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('managed upgrade retains created ownership so uninstall deletes it', () => {
  const root = fixture();
  try {
    skill(root, 'sdd-plan');
    mkdirSync(join(root, '.opencode', 'commands'), { recursive: true });
    for (const dir of ['dist', 'hooks', 'lib', 'content']) mkdirSync(join(root, dir), { recursive: true });
    const home = join(root, 'home');
    bootstrap(root, home, { delegatedSkillNames: [] });
    writeFileSync(join(root, 'oms-skills', 'sdd-plan', 'SKILL.md'), '# upgraded\n');
    bootstrap(root, home, { delegatedSkillNames: [] });
    const manifest = join(home, '.oh-my-sdd', 'opencode-npm-resources.json');
    const record = readOwnershipManifest(manifest).find((item) => item.resource_name === 'sdd-plan');
    assert.equal(record.created, true);
    assert.equal(record.backup, null);
    uninstallOwnedResources({ manifestPath: manifest, allowedRoots: [join(home, '.config', 'opencode')] });
    assert.equal(existsSync(join(home, '.config', 'opencode', 'skills', 'sdd-plan')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('resource update restores the previous resource when replacement copy fails', () => {
  const root = fixture();
  try {
    skill(root, 'sdd-plan');
    mkdirSync(join(root, '.opencode', 'commands'), { recursive: true });
    for (const dir of ['dist', 'hooks', 'lib', 'content']) mkdirSync(join(root, dir), { recursive: true });
    const home = join(root, 'home');
    bootstrap(root, home, { delegatedSkillNames: [] });
    const source = join(root, 'oms-skills', 'sdd-plan', 'SKILL.md');
    writeFileSync(source, '# upgraded\n');
    let calls = 0;
    const result = bootstrap(root, home, { delegatedSkillNames: [],
      copySync(...args) {
        calls += 1;
        if (calls === 2) throw new Error('simulated copy failure');
        return cpSync(...args);
      },
    });
    assert.equal(result.state, 'failed');
    assert.equal(readFileSync(join(home, '.config', 'opencode', 'skills', 'sdd-plan', 'SKILL.md'), 'utf8'), '# sdd-plan\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('activation state replaces its record without leaving temporary files', () => {
  const root = fixture();
  try {
    skill(root, 'sdd-plan');
    mkdirSync(join(root, '.opencode', 'commands'), { recursive: true });
    for (const dir of ['dist', 'hooks', 'lib', 'content']) mkdirSync(join(root, dir), { recursive: true });
    const home = join(root, 'home');
    bootstrap(root, home, { delegatedSkillNames: [] });
    bootstrap(root, home, { delegatedSkillNames: [] });
    assert.deepEqual(readdirSync(join(home, '.oh-my-sdd')).sort(), ['opencode-activation.json', 'opencode-npm-resources.json']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('bootstrap degrades for user-drifted resource without preventing activation', () => {
  const root = fixture();
  try {
    skill(root, 'sdd-plan');
    mkdirSync(join(root, '.opencode', 'commands'), { recursive: true });
    for (const dir of ['dist', 'hooks', 'lib', 'content']) mkdirSync(join(root, dir), { recursive: true });
    const home = join(root, 'home');
    bootstrap(root, home, { delegatedSkillNames: [] });
    const target = join(home, '.config', 'opencode', 'skills', 'sdd-plan');
    writeFileSync(join(target, 'SKILL.md'), '# user copy\n');

    const result = bootstrap(root, home, { delegatedSkillNames: [] });

    assert.equal(result.state, 'degraded');
    assert.deepEqual(result.drifted_resources, ['oms-skill:sdd-plan']);
    assert.deepEqual(result.failed_resources, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

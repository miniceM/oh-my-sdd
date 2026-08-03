import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { runSddPlanHarness } from '../../helpers/opencode-command-harness.js';

const worktreeRoot = process.cwd();
const npmExecPath = process.env.npm_execpath ?? path.join(
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '--global'], {
    encoding: 'utf8',
  }).trim(),
  'npm',
  'bin',
  'npm-cli.js',
);

function runNpm(args, options) {
  return execFileSync(process.execPath, [npmExecPath, ...args], options);
}

function withInstalledResources(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-sdd-plan-harness-'));
  const home = path.join(root, 'home');
  const prefix = path.join(root, 'prefix');
  const cache = path.join(root, 'cache');
  const pack = path.join(root, 'pack');
  const shims = path.join(root, 'bin');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(pack, { recursive: true });
  fs.mkdirSync(shims, { recursive: true });
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(shims, 'node.cmd'), `@"${process.execPath}" %*\r\n`);
  } else {
    fs.symlinkSync(process.execPath, path.join(shims, 'node'));
    fs.symlinkSync('/bin/sh', path.join(shims, 'sh'));
  }
  const env = {
    HOME: home,
    USERPROFILE: home,
    PATH: shims,
    npm_config_prefix: prefix,
    npm_config_cache: cache,
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.ComSpec ? { ComSpec: process.env.ComSpec } : {}),
  };
  try {
    assert.equal(fs.existsSync(path.join(shims, 'claude')), false, 'isolated PATH must not expose claude');
    const packed = JSON.parse(runNpm([
      'pack', '--ignore-scripts', '--json', '--pack-destination', pack,
    ], {
      cwd: path.join(worktreeRoot, 'opencode'),
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    runNpm([
      'install', '--global', '--legacy-peer-deps', '--foreground-scripts',
      path.join(pack, packed[0].filename),
    ], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return run(home, env);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('installed /sdd-plan resolves superpowers namespace and chains approved design', () => {
  withInstalledResources((home) => {
    const result = runSddPlanHarness({ home, approved: true });

    assert.deepEqual(result.events, [
      'main-skill-loaded',
      'brainstorming-question',
      'brainstorming-approval-requested',
      'brainstorming-approved',
      'writing-plans-started',
    ]);
    assert.equal(result.delegatedSkills.brainstorming, 'brainstorming');
    assert.equal(result.delegatedSkills.writingPlans, 'writing-plans');
    assert.deepEqual(result.resolutions.map(({ requested, normalized, mode }) => ({
      requested, normalized, mode,
    })), [
      {
        requested: 'superpowers:brainstorming',
        normalized: 'brainstorming',
        mode: 'skill-file',
      },
      {
        requested: 'superpowers:writing-plans',
        normalized: 'writing-plans',
        mode: 'skill-file',
      },
    ]);
    assert.match(
      result.resolutions[0].source.replaceAll('\\', '/'),
      /\.config\/opencode\/skills\/brainstorming\/SKILL\.md$/,
    );
  });
});

test('unapproved design does not enter writing-plans', () => {
  withInstalledResources((home) => {
    const result = runSddPlanHarness({ home, approved: false });

    assert.deepEqual(result.events, [
      'main-skill-loaded',
      'brainstorming-question',
      'brainstorming-approval-requested',
    ]);
    assert.equal(result.events.includes('writing-plans-started'), false);
  });
});

test('missing brainstorming skill uses inline content resolution and continues', () => {
  withInstalledResources((home) => {
    fs.rmSync(path.join(home, '.config', 'opencode', 'skills', 'brainstorming'), {
      recursive: true,
      force: true,
    });
    fs.rmSync(path.join(home, '.agents', 'skills', 'brainstorming'), {
      recursive: true,
      force: true,
    });

    const result = runSddPlanHarness({ home, approved: true });

    assert.deepEqual(result.events, [
      'main-skill-loaded',
      'inline-content-resolution',
      'brainstorming-question',
      'brainstorming-approval-requested',
      'brainstorming-approved',
      'writing-plans-started',
    ]);
    assert.equal(result.resolutions[0].mode, 'inline-content-resolution');
    assert.equal(result.resolutions[0].source, null);
  });
});

test('missing writing-plans skill uses inline content resolution and continues', () => {
  withInstalledResources((home) => {
    for (const base of [path.join(home, '.config', 'opencode'), path.join(home, '.agents')]) {
      fs.rmSync(path.join(base, 'skills', 'writing-plans'), { recursive: true, force: true });
    }

    const result = runSddPlanHarness({ home, approved: true });

    assert.deepEqual(result.events, [
      'main-skill-loaded',
      'brainstorming-question',
      'brainstorming-approval-requested',
      'brainstorming-approved',
      'inline-content-resolution',
      'writing-plans-started',
    ]);
    assert.equal(result.resolutions[1].mode, 'inline-content-resolution');
    assert.equal(result.resolutions[1].source, null);
  });
});

test('main skill without brainstorming interaction semantics fails explicitly', () => {
  withInstalledResources((home) => {
    const mainSkill = path.join(home, '.config', 'opencode', 'skills', 'sdd-plan', 'SKILL.md');
    const content = fs.readFileSync(mainSkill, 'utf8').replaceAll('问问题', '');
    fs.writeFileSync(mainSkill, content);

    assert.throws(
      () => runSddPlanHarness({ home, approved: true }),
      /missing brainstorming question semantics/,
    );
  });
});

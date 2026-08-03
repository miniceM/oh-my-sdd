import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { runSddPlanHarness } from '../../helpers/opencode-command-harness.js';

const worktreeRoot = process.cwd();

function withInstalledResources(run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-sdd-plan-harness-'));
  try {
    execFileSync(process.execPath, ['scripts/postinstall.mjs'], {
      cwd: path.join(worktreeRoot, 'opencode'),
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: 'pipe',
    });
    return run(home);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
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
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { evaluateWritePolicy } from '../../../lib/sdd-policy.js';

const CWD = '/projects/myapp';
const CHANGE_DIR = '/projects/myapp/openspec/changes/feat-login';

function evaluate(overrides) {
  return evaluateWritePolicy({
    cwd: CWD,
    changeDir: CHANGE_DIR,
    ...overrides,
  });
}

// ============================================
// Fail-open on missing context
// ============================================

describe('fail-open on incomplete context', () => {
  test('allows when filePath is empty', () => {
    assert.ok(evaluate({ filePath: '', ring: 'apply' }).allowed);
  });

  test('allows when ring is missing', () => {
    assert.ok(evaluate({ filePath: '/tmp/foo.js', ring: undefined }).allowed);
  });

  test('allows when changeDir is missing', () => {
    assert.ok(evaluate({ filePath: '/tmp/foo.js', ring: 'apply', changeDir: undefined }).allowed);
  });

  test('allows for unknown ring name', () => {
    assert.ok(evaluate({ filePath: '/tmp/foo.js', ring: 'bogus' }).allowed);
  });
});

// ============================================
// Rule 1: apply/review must not modify main specs
// ============================================

describe('Rule 1: protect openspec/specs/ during apply/review', () => {
  test('blocks write to openspec/specs/ during apply', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'openspec', 'specs', 'auth', 'spec.md'),
      ring: 'apply',
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /openspec\/specs/);
  });

  test('blocks write to openspec/specs/ during review', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'openspec', 'specs', 'auth', 'spec.md'),
      ring: 'review',
    });
    assert.equal(result.allowed, false);
  });

  test('allows write to openspec/specs/ during spec ring', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'openspec', 'specs', 'auth', 'spec.md'),
      ring: 'spec',
    });
    assert.ok(result.allowed);
  });

  test('allows write to openspec/specs/ during plan ring', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'openspec', 'specs', 'auth', 'spec.md'),
      ring: 'plan',
    });
    assert.ok(result.allowed);
  });
});

// ============================================
// Rule 2: apply must not modify frozen inputs
// ============================================

describe('Rule 2: protect frozen inputs during apply', () => {
  test('blocks editing proposal.md during apply', () => {
    const result = evaluate({
      filePath: path.join(CHANGE_DIR, 'proposal.md'),
      ring: 'apply',
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /proposal\.md/);
  });

  test('blocks editing design.md during apply', () => {
    const result = evaluate({
      filePath: path.join(CHANGE_DIR, 'design.md'),
      ring: 'apply',
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /design\.md/);
  });

  test('blocks editing delta specs during apply', () => {
    const result = evaluate({
      filePath: path.join(CHANGE_DIR, 'specs', 'auth', 'spec.md'),
      ring: 'apply',
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /delta specs/);
  });

  test('allows editing tasks.md during apply', () => {
    const result = evaluate({
      filePath: path.join(CHANGE_DIR, 'tasks.md'),
      ring: 'apply',
    });
    assert.ok(result.allowed);
  });

  test('allows editing .meta.json during apply', () => {
    const result = evaluate({
      filePath: path.join(CHANGE_DIR, '.meta.json'),
      ring: 'apply',
    });
    assert.ok(result.allowed);
  });
});

// ============================================
// Rule 3: spec ring blocks source code writes
// ============================================

describe('Rule 3: spec ring blocks source code', () => {
  test('blocks writing .js files outside openspec during spec', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'src', 'app.js'),
      ring: 'spec',
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /plan not complete/);
  });

  test('allows writing .md files outside openspec during spec', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'docs', 'readme.md'),
      ring: 'spec',
    });
    assert.ok(result.allowed);
  });

  test('allows writing inside openspec/ during spec', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'openspec', 'changes', 'feat-login', 'proposal.md'),
      ring: 'spec',
    });
    assert.ok(result.allowed);
  });

  test('allows writing .ts files during plan ring', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'src', 'index.ts'),
      ring: 'plan',
    });
    assert.ok(result.allowed);
  });
});

// ============================================
// Rule 4: review/finalized blocks source code
// ============================================

describe('Rule 4: review/finalized blocks source code', () => {
  test('blocks .py during review', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'src', 'main.py'),
      ring: 'review',
    });
    assert.equal(result.allowed, false);
    assert.match(result.reason, /sdd-apply/);
  });

  test('blocks .ts during finalized', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'src', 'app.ts'),
      ring: 'finalized',
    });
    assert.equal(result.allowed, false);
  });

  test('allows .json config during review', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'package.json'),
      ring: 'review',
    });
    assert.ok(result.allowed);
  });

  test('allows openspec files during review', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'openspec', 'changes', 'feat-login', 'review.md'),
      ring: 'review',
    });
    assert.ok(result.allowed);
  });
});

// ============================================
// Normal development (non-SDD)
// ============================================

describe('normal development passthrough', () => {
  test('allows any write during apply to source code', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'src', 'handler.js'),
      ring: 'apply',
    });
    assert.ok(result.allowed);
  });

  test('allows any write during task ring', () => {
    const result = evaluate({
      filePath: path.join(CWD, 'src', 'handler.js'),
      ring: 'task',
    });
    assert.ok(result.allowed);
  });
});

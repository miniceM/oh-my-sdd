import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

import { addValidationRecord, checkPrePrReadiness, checkPrSubmissionReadiness } from '../../../packages/product/lib/sdd-validation.js';
import { readMeta, writeMeta } from '../../../packages/product/lib/sdd-context.js';

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), 'sdd-val-test-'));
}

// ============================================
// addValidationRecord
// ============================================

describe('addValidationRecord', () => {
  let tmpDir;
  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    await writeMeta(tmpDir, { change_id: 'TEST01', sdd: { ring: 'review' } });
  });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  test('appends a record to sdd.validation', async () => {
    const records = await addValidationRecord(tmpDir, {
      type: 'test',
      ring: 'review',
      head: 'abc1234567890abcdef1234567890abcdef123456',
      spec_composite: 'spec-hash',
      plan_composite: 'plan-hash',
      summary: 'All tests passed',
      result: 'pass',
      command: 'npm test',
    });
    assert.equal(records.length, 1);
    assert.equal(records[0].type, 'test');
    assert.equal(records[0].result, 'pass');
    assert.ok(records[0].checked_at);
  });

  test('truncates summary to 200 chars', async () => {
    const longSummary = 'x'.repeat(300);
    const records = await addValidationRecord(tmpDir, {
      type: 'test',
      ring: 'review',
      summary: longSummary,
      result: 'pass',
    });
    assert.equal(records[0].summary.length, 200);
  });

  test('limits to 50 records (FIFO)', async () => {
    for (let i = 0; i < 55; i++) {
      await addValidationRecord(tmpDir, {
        type: 'test',
        ring: 'review',
        summary: `run ${i}`,
        result: 'pass',
      });
    }
    const meta = await readMeta(tmpDir);
    assert.equal(meta.sdd.validation.length, 50);
    // Oldest (runs 0-4) should have been trimmed.
    assert.match(meta.sdd.validation[0].summary, /run 5/);
  });
});

// ============================================
// checkPrePrReadiness
// ============================================

describe('checkPrePrReadiness', () => {
  test('reports missing types when no validation records', async () => {
    const sdd = { ring: 'review' };
    const result = await checkPrePrReadiness('/tmp', sdd);
    assert.equal(result.ready, false);
    assert.ok(result.missing.length > 0);
    assert.ok(result.missing.includes('test'));
  });

  test('ready when all required types pass with matching fingerprints', async () => {
    const sdd = {
      ring: 'review',
      spec: { composite: 'spec-hash' },
      plan: { composite: 'plan-hash' },
      validation: [
        { type: 'test', result: 'pass', head: null, spec_composite: 'spec-hash', plan_composite: 'plan-hash' },
        { type: 'review', result: 'pass', head: null, spec_composite: 'spec-hash', plan_composite: 'plan-hash' },
        { type: 'constitution', result: 'pass', head: null, spec_composite: 'spec-hash', plan_composite: 'plan-hash' },
        { type: 'openspec-validate', result: 'pass', head: null, spec_composite: 'spec-hash', plan_composite: 'plan-hash' },
      ],
    };
    // Pass null cwd to skip Git HEAD check.
    const result = await checkPrePrReadiness('/tmp', sdd, null);
    assert.equal(result.ready, true);
  });

  test('reports stale when spec composite drifted', async () => {
    const sdd = {
      ring: 'review',
      spec: { composite: 'new-spec-hash' },
      plan: { composite: 'plan-hash' },
      validation: [
        { type: 'test', result: 'pass', head: null, spec_composite: 'old-spec-hash', plan_composite: 'plan-hash' },
        { type: 'review', result: 'pass', head: null, spec_composite: 'old-spec-hash', plan_composite: 'plan-hash' },
        { type: 'constitution', result: 'pass', head: null, spec_composite: 'new-spec-hash', plan_composite: 'plan-hash' },
        { type: 'openspec-validate', result: 'pass', head: null, spec_composite: 'new-spec-hash', plan_composite: 'plan-hash' },
      ],
    };
    const result = await checkPrePrReadiness('/tmp', sdd, null);
    assert.equal(result.ready, false);
    assert.ok(result.stale.length >= 1);
    assert.ok(result.stale.some(s => s.includes('test') && s.includes('spec changed')));
  });

  test('ignores failed records', async () => {
    const sdd = {
      ring: 'review',
      validation: [
        { type: 'test', result: 'fail', summary: 'oops' },
      ],
    };
    const result = await checkPrePrReadiness('/tmp', sdd, null);
    assert.equal(result.ready, false);
    assert.ok(result.missing.includes('test'));
  });
});

// ============================================
// checkPrSubmissionReadiness
// ============================================

describe('checkPrSubmissionReadiness', () => {
  const readySdd = {
    ring: 'review',
    spec: { composite: 'spec-hash' },
    plan: { composite: 'plan-hash' },
    validation: [
      { type: 'test', result: 'pass', spec_composite: 'spec-hash', plan_composite: 'plan-hash' },
      { type: 'review', result: 'pass', spec_composite: 'spec-hash', plan_composite: 'plan-hash' },
      { type: 'constitution', result: 'pass', spec_composite: 'spec-hash', plan_composite: 'plan-hash' },
      { type: 'openspec-validate', result: 'pass', spec_composite: 'spec-hash', plan_composite: 'plan-hash' },
    ],
  };

  test('requires SDD context', async () => {
    const result = await checkPrSubmissionReadiness({}, '/tmp', null);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /SDD context/);
  });

  test('requires review ring', async () => {
    const result = await checkPrSubmissionReadiness({ sdd: { ring: 'apply' } }, '/tmp', null);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /review/);
  });

  test('requires archive completion', async () => {
    const result = await checkPrSubmissionReadiness({ sdd: readySdd }, '/tmp', null);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /archive/i);
  });

  test('rejects existing PR URL', async () => {
    const result = await checkPrSubmissionReadiness({
      archive_done_at: '2026-01-01',
      pr_url: 'https://...',
      sdd: readySdd,
    }, '/tmp', null);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /PR URL.*already/i);
  });

  test('requires fresh pre-PR validation', async () => {
    const result = await checkPrSubmissionReadiness({
      archive_done_at: '2026-01-01',
      sdd: { ring: 'review' },
    }, '/tmp', null);
    assert.equal(result.allowed, false);
    assert.match(result.reason, /validation/i);
  });

  test('rejects validation when its spec composite has drifted', async () => {
    const result = await checkPrSubmissionReadiness({
      archive_done_at: '2026-01-01',
      sdd: {
        ...readySdd,
        spec: { composite: 'current-spec-hash' },
        validation: readySdd.validation.map(record => ({
          ...record,
          spec_composite: 'validated-spec-hash',
        })),
      },
    }, '/tmp', null);

    assert.equal(result.allowed, false);
    assert.match(result.reason, /pre-PR validation.*stale/i);
  });

  test('rejects validation when its plan composite has drifted', async () => {
    const result = await checkPrSubmissionReadiness({
      archive_done_at: '2026-01-01',
      sdd: {
        ...readySdd,
        plan: { composite: 'current-plan-hash' },
        validation: readySdd.validation.map(record => ({
          ...record,
          plan_composite: 'validated-plan-hash',
        })),
      },
    }, '/tmp', null);

    assert.equal(result.allowed, false);
    assert.match(result.reason, /pre-PR validation.*stale/i);
  });

  test('rejects validation when Git HEAD has drifted', async () => {
    const tmpDir = await makeTmpDir();
    try {
      execFileSync('git', ['init'], { cwd: tmpDir });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir });
      await writeFile(path.join(tmpDir, 'README.md'), '# test\n');
      execFileSync('git', ['add', 'README.md'], { cwd: tmpDir });
      execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir });
      const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim();
      const staleHead = currentHead === '0'.repeat(40) ? '1'.repeat(40) : '0'.repeat(40);

      const result = await checkPrSubmissionReadiness({
        archive_done_at: '2026-01-01',
        sdd: {
          ...readySdd,
          validation: readySdd.validation.map(record => ({
            ...record,
            head: staleHead,
          })),
        },
      }, '/tmp', tmpDir);

      assert.equal(result.allowed, false);
      assert.match(result.reason, /pre-PR validation.*stale/i);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('allows archive delivery before PR creation with fresh validation', async () => {
    const result = await checkPrSubmissionReadiness({
      archive_done_at: '2026-01-01',
      sdd: readySdd,
    }, '/tmp', null);
    assert.equal(result.allowed, true);
  });
});

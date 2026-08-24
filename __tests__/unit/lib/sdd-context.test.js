import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  fingerprint,
  fingerprintFiles,
  compositeFingerprint,
  readMeta,
  writeMeta,
  readSddContext,
  freezeRing,
  isRingStale,
  verifyUpstreamFingerprints,
  listActiveChanges,
  resolveChange,
  isDopCompletionPending,
  RINGS,
  RING_ORDINAL,
} from '../../../lib/sdd-context.js';

// ============================================
// DOP completion intent
// ============================================

describe('isDopCompletionPending', () => {
  test('returns true only for pending completion intent', () => {
    assert.equal(isDopCompletionPending({ dop_completion: { status: 'pending' } }), true);
    assert.equal(isDopCompletionPending({ dop_completion: { status: 'succeeded' } }), false);
    assert.equal(isDopCompletionPending({}), false);
  });
});

// ============================================
// Helpers
// ============================================

async function makeTmpDir() {
  return mkdtemp(path.join(os.tmpdir(), 'sdd-ctx-test-'));
}

async function makeChangeDir(root, slug, metaContent = {}) {
  const changeDir = path.join(root, 'openspec', 'changes', slug);
  await mkdir(changeDir, { recursive: true });
  if (Object.keys(metaContent).length > 0) {
    await writeFile(
      path.join(changeDir, '.meta.json'),
      JSON.stringify(metaContent, null, 2),
    );
  }
  return changeDir;
}

// ============================================
// fingerprint
// ============================================

describe('fingerprint', () => {
  test('produces deterministic SHA-256 hex', () => {
    const a = fingerprint('hello world');
    const b = fingerprint('hello world');
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  test('normalizes CRLF to LF', () => {
    const lf = fingerprint('line1\nline2\n');
    const crlf = fingerprint('line1\r\nline2\r\n');
    assert.equal(lf, crlf);
  });

  test('trims trailing whitespace', () => {
    const a = fingerprint('content');
    const b = fingerprint('content   \n\n');
    assert.equal(a, b);
  });

  test('different content → different hash', () => {
    assert.notEqual(fingerprint('aaa'), fingerprint('bbb'));
  });
});

// ============================================
// fingerprintFiles
// ============================================

describe('fingerprintFiles', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  test('returns sorted fingerprints for existing files', async () => {
    await writeFile(path.join(tmpDir, 'a.md'), 'aaa');
    await writeFile(path.join(tmpDir, 'b.md'), 'bbb');
    const result = await fingerprintFiles(tmpDir, ['b.md', 'a.md']);
    const keys = Object.keys(result);
    assert.deepEqual(keys, ['a.md', 'b.md']); // Sorted.
    assert.match(result['a.md'], /^[0-9a-f]{64}$/);
  });

  test('skips missing files silently', async () => {
    await writeFile(path.join(tmpDir, 'a.md'), 'aaa');
    const result = await fingerprintFiles(tmpDir, ['a.md', 'missing.md']);
    assert.equal(Object.keys(result).length, 1);
    assert.ok(result['a.md']);
  });
});

// ============================================
// compositeFingerprint
// ============================================

describe('compositeFingerprint', () => {
  test('returns null for empty map', () => {
    assert.equal(compositeFingerprint({}), null);
  });

  test('deterministic for same input', () => {
    const map = { 'a.md': 'abc123', 'b.md': 'def456' };
    assert.equal(compositeFingerprint(map), compositeFingerprint(map));
  });

  test('order-independent (sorted internally)', () => {
    const a = compositeFingerprint({ 'b.md': 'def', 'a.md': 'abc' });
    const b = compositeFingerprint({ 'a.md': 'abc', 'b.md': 'def' });
    assert.equal(a, b);
  });
});

// ============================================
// readMeta / writeMeta
// ============================================

describe('readMeta / writeMeta', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  test('readMeta returns null for missing file', async () => {
    assert.equal(await readMeta(tmpDir), null);
  });

  test('writeMeta creates and merges', async () => {
    await writeMeta(tmpDir, { change_id: 'ARD001' });
    const meta = await readMeta(tmpDir);
    assert.equal(meta.change_id, 'ARD001');

    await writeMeta(tmpDir, { pr_url: 'https://example.com' });
    const updated = await readMeta(tmpDir);
    assert.equal(updated.change_id, 'ARD001'); // Preserved.
    assert.equal(updated.pr_url, 'https://example.com');
  });
});

// ============================================
// freezeRing
// ============================================

describe('freezeRing', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  test('writes ring + handoff to sdd context', async () => {
    await writeMeta(tmpDir, { change_id: 'TEST01' });
    const sdd = await freezeRing(tmpDir, 'spec', {
      fingerprints: { 'proposal.md': 'aaa' },
      composite: 'bbb',
    }, { branch: 'feat/test' });

    assert.equal(sdd.ring, 'spec');
    assert.equal(sdd.branch, 'feat/test');
    assert.equal(sdd.spec.composite, 'bbb');
    assert.ok(sdd.spec.frozen_at);
  });

  test('invalidates downstream rings on re-freeze', async () => {
    await writeMeta(tmpDir, { change_id: 'TEST01' });
    await freezeRing(tmpDir, 'spec', { composite: 'aaa' });
    await freezeRing(tmpDir, 'plan', { composite: 'bbb' });
    await freezeRing(tmpDir, 'apply', { head: 'cafecafe' });

    // Re-freeze spec → plan and apply should be stale.
    const sdd = await freezeRing(tmpDir, 'spec', { composite: 'ccc' });
    assert.equal(sdd.plan.stale, true);
    assert.equal(sdd.apply.stale, true);
    assert.match(sdd.plan.stale_reason, /spec/);
  });

  test('rejects unknown ring name', async () => {
    await assert.rejects(
      () => freezeRing(tmpDir, 'bogus', {}),
      /Unknown SDD ring/,
    );
  });

  test('sets branch and worktree', async () => {
    const sdd = await freezeRing(tmpDir, 'spec', {}, {
      branch: 'feat/x',
      worktree: '/tmp/wt',
    });
    assert.equal(sdd.branch, 'feat/x');
    assert.equal(sdd.worktree, '/tmp/wt');
  });
});

// ============================================
// isRingStale
// ============================================

describe('isRingStale', () => {
  test('returns not stale for null sdd (legacy)', () => {
    const result = isRingStale(null, 'plan');
    assert.equal(result.stale, false);
  });

  test('returns not stale if ring not yet frozen', () => {
    const result = isRingStale({ ring: 'spec' }, 'plan');
    assert.equal(result.stale, false);
  });

  test('returns stale if marked stale', () => {
    const result = isRingStale({
      ring: 'spec',
      plan: { stale: true, stale_reason: 'test' },
    }, 'plan');
    assert.equal(result.stale, true);
    assert.match(result.reason, /test/);
  });
});

// ============================================
// verifyUpstreamFingerprints
// ============================================

describe('verifyUpstreamFingerprints', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  test('returns valid when no fingerprints recorded', async () => {
    const result = await verifyUpstreamFingerprints(tmpDir, 'spec', {});
    assert.equal(result.valid, true);
  });

  test('detects fingerprint mismatch', async () => {
    await writeFile(path.join(tmpDir, 'proposal.md'), 'original');
    const fp = fingerprint('original');
    const comp = compositeFingerprint({ 'proposal.md': fp });

    // Now change the file.
    await writeFile(path.join(tmpDir, 'proposal.md'), 'changed');

    const sdd = {
      spec: {
        fingerprints: { 'proposal.md': fp },
        composite: comp,
      },
    };
    const result = await verifyUpstreamFingerprints(tmpDir, 'spec', sdd);
    assert.equal(result.valid, false);
    assert.match(result.reason, /proposal\.md/);
  });

  test('returns valid when fingerprints match', async () => {
    await writeFile(path.join(tmpDir, 'proposal.md'), 'original');
    const fp = fingerprint('original');
    const comp = compositeFingerprint({ 'proposal.md': fp });

    const sdd = {
      spec: {
        fingerprints: { 'proposal.md': fp },
        composite: comp,
      },
    };
    const result = await verifyUpstreamFingerprints(tmpDir, 'spec', sdd);
    assert.equal(result.valid, true);
  });
});

// ============================================
// listActiveChanges / resolveChange
// ============================================

describe('listActiveChanges', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  test('returns empty for non-SDD project', async () => {
    const result = await listActiveChanges(tmpDir);
    assert.deepEqual(result, []);
  });

  test('lists changes with meta', async () => {
    await makeChangeDir(tmpDir, 'feat-login', { change_id: 'ARD001' });
    await makeChangeDir(tmpDir, 'fix-logout', { change_id: 'ARD002' });
    const result = await listActiveChanges(tmpDir);
    assert.equal(result.length, 2);
  });

  test('skips archive directory', async () => {
    await makeChangeDir(tmpDir, 'archive', {});
    await makeChangeDir(tmpDir, 'real-change', { change_id: 'ARD003' });
    const result = await listActiveChanges(tmpDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].slug, 'real-change');
  });

  test('filters by branch', async () => {
    await makeChangeDir(tmpDir, 'a', {
      change_id: 'A',
      sdd: { branch: 'feat/a' },
    });
    await makeChangeDir(tmpDir, 'b', {
      change_id: 'B',
      sdd: { branch: 'feat/b' },
    });
    const result = await listActiveChanges(tmpDir, { branch: 'feat/a' });
    assert.equal(result.length, 1);
    assert.equal(result[0].slug, 'a');
  });
});

describe('resolveChange', () => {
  let tmpDir;
  beforeEach(async () => { tmpDir = await makeTmpDir(); });
  afterEach(async () => { await rm(tmpDir, { recursive: true, force: true }); });

  test('resolves by slug', async () => {
    await makeChangeDir(tmpDir, 'my-change', { change_id: 'ARD001' });
    const { change, ambiguous } = await resolveChange(tmpDir, { slug: 'my-change' });
    assert.ok(change);
    assert.equal(change.slug, 'my-change');
    assert.equal(ambiguous, null);
  });

  test('resolves single active change', async () => {
    await makeChangeDir(tmpDir, 'only-one', { change_id: 'ARD001' });
    const { change, ambiguous } = await resolveChange(tmpDir);
    assert.ok(change);
    assert.equal(change.slug, 'only-one');
  });

  test('returns ambiguous when multiple changes', async () => {
    await makeChangeDir(tmpDir, 'a', { change_id: 'A' });
    await makeChangeDir(tmpDir, 'b', { change_id: 'B' });
    const { change, ambiguous } = await resolveChange(tmpDir);
    assert.equal(change, null);
    assert.ok(ambiguous);
    assert.equal(ambiguous.length, 2);
  });

  test('returns null for missing slug', async () => {
    const { change } = await resolveChange(tmpDir, { slug: 'nope' });
    assert.equal(change, null);
  });
});

// ============================================
// RINGS constants
// ============================================

describe('RINGS constants', () => {
  test('has 6 rings in order', () => {
    assert.equal(RINGS.length, 6);
    assert.deepEqual(RINGS, ['spec', 'plan', 'task', 'apply', 'review', 'finalized']);
  });

  test('RING_ORDINAL maps correctly', () => {
    assert.equal(RING_ORDINAL.spec, 0);
    assert.equal(RING_ORDINAL.finalized, 5);
  });
});

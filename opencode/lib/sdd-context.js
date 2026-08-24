/**
 * SDD Ring handoff context — reader/writer for the `sdd` field in
 * openspec/changes/<slug>/.meta.json.
 *
 * Provides deterministic fingerprinting of spec/plan/task artifacts so that
 * downstream Rings can detect when upstream inputs have changed (stale).
 *
 * The `sdd` field is backward-compatible: old changes without it are readable
 * and get populated on the next successful Ring freeze.
 *
 * Ring lifecycle (ordinal):
 *   spec(1) → plan(2) → task(3) → apply(4) → review(5) → finalized(6)
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// ============================================
// Constants
// ============================================

/** Ordered Ring names. Index = ordinal (spec=0 … finalized=5). */
export const RINGS = ['spec', 'plan', 'task', 'apply', 'review', 'finalized'];

/** Ring name → ordinal lookup. */
export const RING_ORDINAL = Object.fromEntries(RINGS.map((r, i) => [r, i]));

// ============================================
// Fingerprinting
// ============================================

/**
 * Compute a deterministic SHA-256 fingerprint for file content.
 * Normalizes CRLF → LF and trims trailing whitespace to avoid
 * cross-platform drift.
 */
export function fingerprint(content) {
  const normalized = String(content).replace(/\r\n/g, '\n').trimEnd();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Compute fingerprints for a set of files relative to a base directory.
 * Returns a sorted object: { relativePath: sha256hex, ... }.
 * Missing files are silently skipped.
 */
export async function fingerprintFiles(basePath, relativePaths) {
  const result = {};
  const sorted = [...relativePaths].sort();
  for (const rel of sorted) {
    try {
      const content = await readFile(path.join(basePath, rel), 'utf8');
      result[rel] = fingerprint(content);
    } catch {
      // File missing or unreadable — skip.
    }
  }
  return result;
}

/**
 * Compute a single composite fingerprint from a fingerprint map.
 * Deterministic: sorts keys, concatenates "key=hash\n", then SHA-256.
 */
export function compositeFingerprint(fingerprintMap) {
  const entries = Object.entries(fingerprintMap).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;
  const blob = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  return createHash('sha256').update(blob, 'utf8').digest('hex');
}

// ============================================
// .meta.json I/O
// ============================================

/**
 * Read .meta.json from a change directory.
 * Returns the parsed object, or null if the file is missing/corrupt.
 */
export async function readMeta(changeDir) {
  try {
    const raw = await readFile(path.join(changeDir, '.meta.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write .meta.json to a change directory (atomic-ish: write in place).
 * Preserves all existing fields; merges the provided partial.
 */
export async function writeMeta(changeDir, partial) {
  const existing = (await readMeta(changeDir)) ?? {};
  const merged = { ...existing, ...partial };
  await writeFile(
    path.join(changeDir, '.meta.json'),
    JSON.stringify(merged, null, 2) + '\n',
    { mode: 0o644 },
  );
  return merged;
}

// ============================================
// SDD context read/write
// ============================================

/**
 * Read the `sdd` sub-object from a change's .meta.json.
 * Returns null for old changes that don't have it yet.
 */
export async function readSddContext(changeDir) {
  const meta = await readMeta(changeDir);
  return meta?.sdd ?? null;
}

/**
 * Whether archive metadata records an outstanding DOP completion intent.
 *
 * @param {object} meta - Full .meta.json content.
 * @returns {boolean}
 */
export function isDopCompletionPending(meta) {
  return meta?.dop_completion?.status === 'pending';
}

/**
 * Shape of the sdd context stored in .meta.json:
 *
 * {
 *   ring: 'spec' | 'plan' | 'task' | 'apply' | 'review' | 'finalized',
 *   branch: string | null,
 *   worktree: string | null,
 *   spec: { fingerprints: { 'proposal.md': hash, 'specs/cap/spec.md': hash, ... }, composite: hash, frozen_at: ISO },
 *   plan: { fingerprints: { 'design.md': hash, 'tasks.md': hash }, composite: hash, frozen_at: ISO },
 *   apply: { tasks_fingerprint: hash, head: gitSHA, frozen_at: ISO },
 *   validation: { ... }  // managed by sdd-validation.js (#36)
 * }
 */

/**
 * Freeze a Ring: write the sdd context for the completed Ring.
 *
 * @param {string} changeDir - Absolute path to the change directory.
 * @param {string} ring - Ring name that just completed.
 * @param {object} handoff - Ring-specific handoff data.
 * @param {object} [options] - Optional: { branch, worktree }.
 * @returns {object} The full updated sdd context.
 */
export async function freezeRing(changeDir, ring, handoff, options = {}) {
  if (!RINGS.includes(ring)) {
    throw new Error(`Unknown SDD ring: ${ring}`);
  }
  const meta = (await readMeta(changeDir)) ?? {};
  const sdd = meta.sdd ?? {};

  sdd.ring = ring;
  if (options.branch !== undefined) sdd.branch = options.branch;
  if (options.worktree !== undefined) sdd.worktree = options.worktree;
  sdd[ring] = { ...handoff, frozen_at: new Date().toISOString() };

  // Invalidate downstream Rings when an upstream Ring is re-frozen.
  const ord = RING_ORDINAL[ring];
  for (let i = ord + 1; i < RINGS.length; i++) {
    const downstreamRing = RINGS[i];
    if (sdd[downstreamRing]) {
      sdd[downstreamRing].stale = true;
      sdd[downstreamRing].stale_reason =
        `upstream ring '${ring}' was re-frozen at ${sdd[ring].frozen_at}`;
    }
  }

  await writeMeta(changeDir, { sdd });
  return sdd;
}

// ============================================
// Staleness detection
// ============================================

/**
 * Check whether a Ring's handoff is stale relative to its upstream inputs.
 *
 * @param {object} sdd - The sdd context object.
 * @param {string} ring - The Ring to check.
 * @returns {{ stale: boolean, reason?: string }}
 */
export function isRingStale(sdd, ring) {
  if (!sdd) return { stale: false, reason: 'no sdd context (legacy change)' };
  const data = sdd[ring];
  if (!data) return { stale: false, reason: `ring '${ring}' not yet frozen` };
  if (data.stale) return { stale: true, reason: data.stale_reason ?? 'marked stale' };
  return { stale: false };
}

/**
 * Verify that upstream fingerprints still match the current files on disk.
 * Returns { valid: true } or { valid: false, reason, expected, actual }.
 *
 * @param {string} changeDir - Absolute path to the change directory.
 * @param {string} upstreamRing - Ring whose fingerprints to verify ('spec' or 'plan').
 * @param {object} sdd - The sdd context object.
 */
export async function verifyUpstreamFingerprints(changeDir, upstreamRing, sdd) {
  if (!sdd?.[upstreamRing]?.fingerprints) {
    return { valid: true, reason: 'no fingerprints recorded (legacy)' };
  }
  const recorded = sdd[upstreamRing].fingerprints;
  const current = await fingerprintFiles(changeDir, Object.keys(recorded));
  const recordedComposite = sdd[upstreamRing].composite;
  const currentComposite = compositeFingerprint(current);

  if (recordedComposite && currentComposite && recordedComposite !== currentComposite) {
    // Find which files differ.
    const diffs = [];
    for (const [file, hash] of Object.entries(recorded)) {
      if (current[file] !== hash) {
        diffs.push(file);
      }
    }
    return {
      valid: false,
      reason: `upstream '${upstreamRing}' files changed: ${diffs.join(', ')}`,
      expected: recordedComposite,
      actual: currentComposite,
    };
  }
  return { valid: true };
}

// ============================================
// Change discovery
// ============================================

/**
 * List all active (non-archived) changes in a project, with optional
 * branch filtering.
 *
 * @param {string} cwd - Project root.
 * @param {object} [options] - { branch: string } to filter by branch.
 * @returns {Array<{ slug: string, changeDir: string, meta: object, sdd: object|null }>}
 */
export async function listActiveChanges(cwd, options = {}) {
  const changesDir = path.join(cwd, 'openspec', 'changes');
  let entries;
  try {
    entries = await readdir(changesDir, { withFileTypes: true });
  } catch {
    return []; // Not an SDD project.
  }
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'archive') continue;
    const changeDir = path.join(changesDir, entry.name);
    const meta = await readMeta(changeDir);
    if (!meta) continue;
    const sdd = meta.sdd ?? null;
    if (options.branch && sdd?.branch && sdd.branch !== options.branch) continue;
    results.push({ slug: entry.name, changeDir, meta, sdd });
  }
  return results;
}

/**
 * Resolve which change to use. If there's exactly one active change
 * (optionally filtered by branch), return it. If multiple, return null
 * with the list so the caller can ask the user to choose.
 *
 * @param {string} cwd - Project root.
 * @param {object} [options] - { slug, branch }.
 * @returns {{ change: object|null, ambiguous: object[]|null }}
 */
export async function resolveChange(cwd, options = {}) {
  if (options.slug) {
    const changeDir = path.join(cwd, 'openspec', 'changes', options.slug);
    const meta = await readMeta(changeDir);
    if (!meta) return { change: null, ambiguous: null };
    return {
      change: { slug: options.slug, changeDir, meta, sdd: meta.sdd ?? null },
      ambiguous: null,
    };
  }
  const all = await listActiveChanges(cwd, { branch: options.branch });
  if (all.length === 1) return { change: all[0], ambiguous: null };
  if (all.length > 1) return { change: null, ambiguous: all };
  return { change: null, ambiguous: null };
}

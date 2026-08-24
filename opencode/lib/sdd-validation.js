/**
 * SDD validation records — bind test/review/constitution results to the
 * current change revision so /sdd-review can verify freshness.
 *
 * Each validation record is stored in .meta.json under sdd.validation[].
 * Records become stale when any upstream fingerprint (spec, plan, apply HEAD)
 * changes, or when Git HEAD drifts from the apply snapshot.
 *
 * This module does NOT replace DOP or openspec archive — it only proves that
 * existing checks still correspond to current artifacts.
 */
import { readMeta, writeMeta, compositeFingerprint } from './sdd-context.js';
import { getCurrentHead } from './git-diff.js';

// ============================================
// Validation record types
// ============================================

/**
 * @typedef {object} ValidationRecord
 * @property {string} type - Check type: 'test'|'review'|'constitution'|'openspec-validate'|'override-scan'.
 * @property {string} ring - Ring during which the check ran.
 * @property {string} head - Git HEAD at time of check.
 * @property {string} spec_composite - Composite fingerprint of spec artifacts.
 * @property {string} plan_composite - Composite fingerprint of plan artifacts.
 * @property {string} [tasks_fingerprint] - Tasks file fingerprint (if apply).
 * @property {string} summary - Short summary (max 200 chars, no secrets).
 * @property {string} result - 'pass'|'fail'|'warn'.
 * @property {string} command - Command/check that was run (sanitized).
 * @property {string} checked_at - ISO timestamp.
 */

/**
 * Add a validation record to the change's sdd context.
 *
 * @param {string} changeDir - Absolute path to the change directory.
 * @param {ValidationRecord} record - The record to add.
 * @returns {object} The updated sdd.validation array.
 */
export async function addValidationRecord(changeDir, record) {
  const meta = (await readMeta(changeDir)) ?? {};
  const sdd = meta.sdd ?? {};
  const validation = sdd.validation ?? [];

  // Sanitize: no secrets in summary or command.
  const safe = {
    type: String(record.type ?? 'unknown'),
    ring: String(record.ring ?? 'unknown'),
    head: String(record.head ?? '').slice(0, 40),
    spec_composite: String(record.spec_composite ?? ''),
    plan_composite: String(record.plan_composite ?? ''),
    summary: String(record.summary ?? '').slice(0, 200),
    result: String(record.result ?? 'unknown'),
    command: String(record.command ?? '').slice(0, 120),
    checked_at: record.checked_at ?? new Date().toISOString(),
  };
  if (record.tasks_fingerprint) {
    safe.tasks_fingerprint = String(record.tasks_fingerprint);
  }

  validation.push(safe);

  // Keep at most 50 records to avoid unbounded growth.
  while (validation.length > 50) validation.shift();

  sdd.validation = validation;
  await writeMeta(changeDir, { sdd: { ...meta.sdd, validation } });
  return validation;
}

/**
 * Check whether all required validations for PR creation are fresh.
 * "Fresh" means the record's head, spec_composite, and plan_composite
 * match the current state.
 *
 * @param {string} changeDir - Absolute path to the change directory.
 * @param {object} sdd - The sdd context.
 * @param {string} [cwd] - Project root for Git HEAD lookup.
 * @returns {{ ready: boolean, stale: string[], missing: string[] }}
 */
export async function checkPrePrReadiness(changeDir, sdd, cwd) {
  const requiredTypes = ['test', 'review', 'constitution', 'openspec-validate'];
  const validation = sdd?.validation ?? [];
  const currentHead = cwd ? await getCurrentHead(cwd) : null;

  const specComposite = sdd?.spec?.composite ?? null;
  const planComposite = sdd?.plan?.composite ?? null;

  const stale = [];
  const missing = [];

  for (const reqType of requiredTypes) {
    // Find the most recent record of this type with result=pass.
    const records = validation
      .filter(v => v.type === reqType && v.result === 'pass')
      .reverse(); // Most recent first.

    if (records.length === 0) {
      missing.push(reqType);
      continue;
    }

    const latest = records[0];

    // Check HEAD drift.
    if (currentHead && latest.head && latest.head !== currentHead) {
      stale.push(`${reqType}: HEAD drifted (was ${latest.head.slice(0, 7)}, now ${currentHead.slice(0, 7)})`);
      continue;
    }

    // Check spec fingerprint drift.
    if (specComposite && latest.spec_composite && latest.spec_composite !== specComposite) {
      stale.push(`${reqType}: spec changed since check`);
      continue;
    }

    // Check plan fingerprint drift.
    if (planComposite && latest.plan_composite && latest.plan_composite !== planComposite) {
      stale.push(`${reqType}: plan changed since check`);
      continue;
    }
  }

  return {
    ready: stale.length === 0 && missing.length === 0,
    stale,
    missing,
  };
}

/**
 * Check whether archive delivery is ready for PR submission. Archive must
 * have completed, no PR may be recorded yet, and validations must be fresh.
 *
 * @param {object} meta - Full .meta.json content.
 * @param {string} changeDir - Absolute path to the change directory.
 * @param {string} [cwd] - Project root.
 * @returns {{ allowed: boolean, reason?: string }}
 */
export async function checkPrSubmissionReadiness(meta, changeDir, cwd) {
  if (!meta?.sdd) {
    return { allowed: false, reason: 'No SDD context. Run /sdd-review first.' };
  }
  const ring = meta.sdd.ring;
  if (ring !== 'review') {
    return { allowed: false, reason: `Current ring is '${ring}', expected 'review'.` };
  }
  if (!meta.archive_done_at) {
    return { allowed: false, reason: 'Archive is not complete.' };
  }
  if (meta.pr_url) {
    return { allowed: false, reason: 'PR URL is already recorded.' };
  }
  const validation = await checkPrePrReadiness(changeDir, meta.sdd, cwd);
  if (!validation.ready) {
    return { allowed: false, reason: 'Pre-PR validation is missing or stale.' };
  }
  return { allowed: true };
}

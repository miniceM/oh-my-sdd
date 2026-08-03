#!/usr/bin/env node
/**
 * copy-resources.mjs — Sync parent-project resources into opencode/ layout.
 *
 * Source of truth is the parent repo:
 *   <repo>/skills/    → opencode/skills/
 *                   → opencode/oms-skills/          (tracked npm source)
 *                   → opencode/.opencode/skills/   (OpenCode convention)
 *                   → opencode/.agents/skills/     (Claude Code / Codex convention)
 *   <repo>/content/   → opencode/content/          (baseline + welcome + auth)
 *   <repo>/hooks/     → opencode/hooks/            (PreToolUse etc. runtime hooks)
 *
 * Command resources:
 *   - opencode/.opencode/commands/    ← slash command definitions (authored here)
 *   - opencode/.agents/command/       ← generated mirror of the above
 *   - opencode/src/, opencode/dist/   ← TypeScript source + compiled output
 *
 * Bound to `prepack` and `prepublishOnly` so local installs and publishes ship fresh
 * mirrors. Concurrent runs serialize on a per-destination lock; each tree is copied
 * to a sibling staging path and atomically renamed only after the copy succeeds.
 *
 * Fail-fast: if any parent source dir is missing, exit non-zero. Silent otherwise.
 */

import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENCODE_DIR = resolve(__dirname, '..');
const ROOT_DIR = resolve(OPENCODE_DIR, '..');

// [sourceRelToRoot, destRelToOpencode]
const SYNC_MAP = [
  ['skills', 'skills'],
  ['skills', 'oms-skills'],
  ['skills', '.opencode/skills'],
  ['skills', '.agents/skills'],
  ['content', 'content'],
  ['hooks', 'hooks'],
];

// Files / dirs to skip inside any synced tree (never escape parent repo noise).
const EXCLUDE_BASENAMES = new Set([
  'node_modules',
  '__tests__',
  '.DS_Store',
  '.git',
  '.gitignore',
  'coverage',
]);

export function shouldCopy(name) {
  return !EXCLUDE_BASENAMES.has(name);
}

/**
 * Run a synchronous operation while holding an exclusive per-destination lock.
 *
 * @param {string} lockPath directory used as the cross-process lock
 * @param {() => unknown} operation work to execute while the lock is held
 * @param {{ timeoutMs?: number, pollMs?: number, mkdirSync?: Function, rmSync?: Function }} [ops]
 * @returns {unknown} the operation result
 */
export function withSyncLock(lockPath, operation, ops = {}) {
  const makeDirectory = ops.mkdirSync ?? mkdirSync;
  const remove = ops.rmSync ?? rmSync;
  const timeoutMs = ops.timeoutMs ?? 10_000;
  const pollMs = ops.pollMs ?? 25;
  const startedAt = Date.now();
  const signal = new Int32Array(new SharedArrayBuffer(4));

  while (true) {
    try {
      makeDirectory(lockPath);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`[copy-resources] timed out waiting for lock: ${lockPath}`);
      }
      Atomics.wait(signal, 0, 0, pollMs);
    }
  }

  try {
    return operation();
  } finally {
    remove(lockPath, { recursive: true, force: true });
  }
}

export function syncResourceTree(src, dst, ops = {}) {
  const copy = ops.cpSync ?? cpSync;
  const exists = ops.existsSync ?? existsSync;
  const rename = ops.renameSync ?? renameSync;
  const remove = ops.rmSync ?? rmSync;
  const suffix = `${process.pid}-${randomUUID()}`;
  const staging = `${dst}.oh-my-sdd-sync.staging-${suffix}`;
  const backup = `${dst}.oh-my-sdd-sync.backup-${suffix}`;
  const lock = `${dst}.oh-my-sdd-sync.lock`;

  mkdirSync(dirname(dst), { recursive: true });
  return withSyncLock(lock, () => {
    let movedExisting = false;
    try {
      copy(src, staging, {
        recursive: true,
        force: true,
        filter: (source) => shouldCopy(basename(source)),
      });
      if (exists(dst)) {
        rename(dst, backup);
        movedExisting = true;
      }
      try {
        rename(staging, dst);
      } catch (error) {
        if (movedExisting && !exists(dst)) rename(backup, dst);
        throw error;
      }
      if (movedExisting) remove(backup, { recursive: true, force: true });
    } catch (error) {
      if (movedExisting && exists(backup) && !exists(dst)) rename(backup, dst);
      throw error;
    } finally {
      remove(staging, { recursive: true, force: true });
      if (exists(backup) && exists(dst)) remove(backup, { recursive: true, force: true });
    }
  }, {
    timeoutMs: ops.lockTimeoutMs,
    pollMs: ops.lockPollMs,
    mkdirSync: ops.mkdirSync,
    rmSync: remove,
  });
}

export function syncCommandLayouts(opencodeDir = OPENCODE_DIR) {
  syncResourceTree(
    join(opencodeDir, '.opencode', 'commands'),
    join(opencodeDir, '.agents', 'command'),
  );
}

export function main() {
  let failed = false;
  for (const [fromRel, toRel] of SYNC_MAP) {
  const src = join(ROOT_DIR, fromRel);
  const dst = join(OPENCODE_DIR, toRel);

  if (!existsSync(src) || !statSync(src).isDirectory()) {
    console.error(`[copy-resources] MISSING source: ${src}`);
    failed = true;
    continue;
  }

  try {
    syncResourceTree(src, dst);
    console.log(`[copy-resources] OK  ${fromRel} -> ${toRel}`);
  } catch (err) {
    console.error(`[copy-resources] FAIL ${fromRel} -> ${toRel}: ${err.message}`);
    failed = true;
  }
  }

  try {
    syncCommandLayouts();
    console.log('[copy-resources] OK  .opencode/commands -> .agents/command');
  } catch (err) {
    console.error(`[copy-resources] FAIL .opencode/commands -> .agents/command: ${err.message}`);
    failed = true;
  }

  if (failed) {
    throw new Error('[copy-resources] one or more syncs failed');
  }

  console.log('[copy-resources] all resources synced');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

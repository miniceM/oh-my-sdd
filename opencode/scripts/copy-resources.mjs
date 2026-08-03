#!/usr/bin/env node
/**
 * copy-resources.mjs — Sync parent-project resources into opencode/ layout.
 *
 * Source of truth is the parent repo:
 *   <repo>/skills/    → opencode/skills/
 *                   → opencode/.opencode/skills/   (OpenCode convention)
 *                   → opencode/.agents/skills/     (Claude Code / Codex convention)
 *   <repo>/content/   → opencode/content/          (baseline + welcome + auth)
 *   <repo>/hooks/     → opencode/hooks/            (PreToolUse etc. runtime hooks)
 *
 * Command resources:
 *   - opencode/.opencode/command/     ← slash command definitions (authored here)
 *   - opencode/.agents/command/       ← generated mirror of the above
 *   - opencode/src/, opencode/dist/   ← TypeScript source + compiled output
 *
 * Bound to `prepublishOnly` in package.json so `npm publish` always ships fresh
 * mirrors. Idempotent: rm -rf destination then cp -R source.
 *
 * Fail-fast: if any parent source dir is missing, exit non-zero. Silent otherwise.
 */

import { cpSync, existsSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENCODE_DIR = resolve(__dirname, '..');
const ROOT_DIR = resolve(OPENCODE_DIR, '..');

// [sourceRelToRoot, destRelToOpencode]
const SYNC_MAP = [
  ['skills', 'skills'],
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

export function syncResourceTree(src, dst) {
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, {
    recursive: true,
    force: true,
    filter: (source) => shouldCopy(basename(source)),
  });
}

export function syncCommandLayouts(opencodeDir = OPENCODE_DIR) {
  syncResourceTree(
    join(opencodeDir, '.opencode', 'command'),
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
    console.log('[copy-resources] OK  .opencode/command -> .agents/command');
  } catch (err) {
    console.error(`[copy-resources] FAIL .opencode/command -> .agents/command: ${err.message}`);
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

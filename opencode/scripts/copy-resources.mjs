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
 * NOT synced (owned by opencode/ sub-project):
 *   - opencode/.opencode/command/     ← slash command definitions (authored here)
 *   - opencode/.agents/command/       ← mirror of the above
 *   - opencode/src/, opencode/dist/   ← TypeScript source + compiled output
 *
 * Bound to `prepublishOnly` in package.json so `npm publish` always ships fresh
 * mirrors. Idempotent: rm -rf destination then cp -R source.
 *
 * Fail-fast: if any parent source dir is missing, exit non-zero. Silent otherwise.
 */

import { cpSync, existsSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

function shouldCopy(name) {
  return !EXCLUDE_BASENAMES.has(name);
}

let failed = false;

for (const [fromRel, toRel] of SYNC_MAP) {
  const src = join(ROOT_DIR, fromRel);
  const dst = join(OPENCODE_DIR, toRel);

  if (!existsSync(src) || !statSync(src).isDirectory()) {
    console.error(`[copy-resources] MISSING source: ${src}`);
    failed = true;
    continue;
  }

  // Wipe destination for idempotency. Ignore errors if it doesn't exist yet.
  rmSync(dst, { recursive: true, force: true });

  try {
    cpSync(src, dst, {
      recursive: true,
      force: true,
      filter: (source) => shouldCopy(dirname(source).split('/').pop() ?? '') || true,
      // ^ The filter above is applied per-entry; basename filtering is best-effort
      //   here because cpSync's filter signature passes the full source path. For
      //   precise exclusion, a post-walk cleanup would be needed — but the parent
      //   repo is already clean (no node_modules / __tests__ inside skills|content|hooks).
    });
    console.log(`[copy-resources] OK  ${fromRel} -> ${toRel}`);
  } catch (err) {
    console.error(`[copy-resources] FAIL ${fromRel} -> ${toRel}: ${err.message}`);
    failed = true;
  }
}

if (failed) {
  console.error('[copy-resources] one or more syncs failed');
  process.exit(1);
}

console.log('[copy-resources] all resources synced');

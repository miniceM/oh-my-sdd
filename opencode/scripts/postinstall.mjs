#!/usr/bin/env node
/**
 * postinstall.mjs — Install plugin-provided skills & commands into OpenCode's
 * global discovery paths.
 *
 * Background:
 *   OpenCode does NOT scan `.opencode/skills/` or `.opencode/command/` inside
 *   npm-installed plugin packages. It only scans:
 *     - `~/.config/opencode/skills/<name>/SKILL.md`     (global skills)
 *     - `~/.config/opencode/command/<name>.md`          (global commands)
 *     - `<project>/.opencode/skills/` & `<project>/.opencode/command/` (project-level)
 *     - `~/.claude/skills/`, `~/.agents/skills/`        (external / cross-tool)
 *
 *   So after `npm install -g @enterprise/oh-my-sdd-opencode`, this script
 *   copies the plugin's bundled skills & commands to `~/.config/opencode/`
 *   (and mirrors to `~/.agents/` for Claude Code / Codex).
 *
 * Conflict handling:
 *   - If target exists AND its content differs from source → backup to
 *     `<target>.oh-my-sdd-backup-<timestamp>` before overwrite.
 *   - If target exists AND content matches → skip silently (idempotent).
 *   - If target missing → copy.
 *
 * Scope guard:
 *   - Only copies skills whose directory name matches the plugin's known set
 *     (sdd-*, api-design, business-modeling, db-conventions, doc-writer,
 *     fe-*, security-check, testing-strategy). This avoids clobbering user's
 *     unrelated skills that happen to be in the same layout.
 *   - Command files are scoped by filename prefix `sdd-*.md`.
 *
 * Failure mode:
 *   - Never exits non-zero — postinstall failures shouldn't break `npm install`.
 *   - Logs warnings to stderr, errors get swallowed with console.warn.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

// Home-dir targets (OpenCode's global discovery paths).
const HOME = homedir();
const OPENCODE_SKILLS_DIR = join(HOME, '.config', 'opencode', 'skills');
const OPENCODE_COMMAND_DIR = join(HOME, '.config', 'opencode', 'command');
const AGENTS_SKILLS_DIR = join(HOME, '.agents', 'skills');
const AGENTS_COMMAND_DIR = join(HOME, '.agents', 'command');

// Plugin-side source dirs (mirrored into `.opencode/` and `.agents/` by
// copy-resources.mjs — we read from `.opencode/` which is canonical).
const PLUGIN_SKILLS_SRC = join(PLUGIN_ROOT, '.opencode', 'skills');
const PLUGIN_COMMAND_SRC = join(PLUGIN_ROOT, '.opencode', 'command');

// Scope guards — only install skills/commands we know we own.
const OWNED_SKILL_PREFIXES = [
  'sdd-',
  'api-design',
  'business-modeling',
  'db-conventions',
  'doc-writer',
  'fe-',
  'security-check',
  'testing-strategy',
];
const OWNED_COMMAND_PREFIXES = ['sdd-'];

function isOwnedSkill(name) {
  return OWNED_SKILL_PREFIXES.some((p) => name === p || name.startsWith(p));
}
function isOwnedCommand(name) {
  return OWNED_COMMAND_PREFIXES.some((p) => name.startsWith(p));
}

function fileContentEqual(a, b) {
  try {
    const ca = readFileSync(a);
    const cb = readFileSync(b);
    return ca.equals(cb);
  } catch {
    return false;
  }
}

export function copyDirSafe(srcDir, dstDir, filterFn, label, ops = {}) {
  const exists = ops.existsSync ?? existsSync;
  const stat = ops.statSync ?? statSync;
  const mkdir = ops.mkdirSync ?? mkdirSync;
  const readdir = ops.readdirSync ?? readdirSync;
  const copy = ops.cpSync ?? cpSync;
  const contentEqual = ops.fileContentEqual ?? fileContentEqual;
  const warn = ops.warn ?? console.warn;
  const now = ops.now ?? Date.now;

  if (!exists(srcDir) || !stat(srcDir).isDirectory()) {
    warn(`[postinstall] ${label}: source missing ${srcDir}`);
    return 0;
  }
  mkdir(dstDir, { recursive: true });

  const entries = readdir(srcDir);
  let installed = 0;
  for (const name of entries) {
    if (!filterFn(name)) continue;
    const src = join(srcDir, name);
    const dst = join(dstDir, name);

    if (exists(dst)) {
      // directory (skill) or file (command)?
      const srcStat = stat(src);
      let backupSucceeded = true;
      if (srcStat.isDirectory()) {
        // compare SKILL.md only — cheapest signal
        const srcSkill = join(src, 'SKILL.md');
        const dstSkill = join(dst, 'SKILL.md');
        if (exists(srcSkill) && exists(dstSkill) && contentEqual(srcSkill, dstSkill)) {
          continue; // identical, skip
        }
        // backup existing then overwrite
        const backup = `${dst}.oh-my-sdd-backup-${now()}`;
        try {
          copy(dst, backup, { recursive: true });
          warn(`[postinstall] ${label}: backed up ${name} -> ${backup}`);
        } catch (e) {
          backupSucceeded = false;
          warn(`[postinstall] ${label}: backup failed for ${name}; preserving existing target: ${e.message}`);
        }
      } else {
        if (contentEqual(src, dst)) continue;
        const backup = `${dst}.oh-my-sdd-backup-${now()}`;
        try {
          copy(src, backup);
          warn(`[postinstall] ${label}: backed up ${name} -> ${backup}`);
        } catch (e) {
          backupSucceeded = false;
          warn(`[postinstall] ${label}: backup failed for ${name}; preserving existing target: ${e.message}`);
        }
      }
      if (!backupSucceeded) continue;
    }

    try {
      copy(src, dst, { recursive: true });
      installed++;
    } catch (e) {
      warn(`[postinstall] ${label}: copy failed ${name}: ${e.message}`);
    }
  }
  return installed;
}

export function main() {
  const results = [];

  const n1 = copyDirSafe(PLUGIN_SKILLS_SRC, OPENCODE_SKILLS_DIR, isOwnedSkill, 'opencode-skills');
  results.push(`opencode-skills: ${n1}`);

  const n2 = copyDirSafe(PLUGIN_COMMAND_SRC, OPENCODE_COMMAND_DIR, isOwnedCommand, 'opencode-commands');
  results.push(`opencode-commands: ${n2}`);

  // Mirror to ~/.agents/ for Claude Code / Codex compatibility.
  const n3 = copyDirSafe(PLUGIN_SKILLS_SRC, AGENTS_SKILLS_DIR, isOwnedSkill, 'agents-skills');
  results.push(`agents-skills: ${n3}`);

  const n4 = copyDirSafe(PLUGIN_COMMAND_SRC, AGENTS_COMMAND_DIR, isOwnedCommand, 'agents-commands');
  results.push(`agents-commands: ${n4}`);

  console.log(`[postinstall] oh-my-sdd installed: ${results.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    // Never break `npm install`.
    console.warn(`[postinstall] oh-my-sdd: ${e.message}`);
  }
}

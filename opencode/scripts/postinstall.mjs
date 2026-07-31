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
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
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

/** Compare complete resource trees without following symbolic links. */
export function treeContentEqual(a, b, ops = {}) {
  const exists = ops.existsSync ?? existsSync;
  const lstat = ops.lstatSync ?? lstatSync;
  const readdir = ops.readdirSync ?? readdirSync;
  const readlink = ops.readlinkSync ?? readlinkSync;
  const contentEqual = ops.fileContentEqual ?? fileContentEqual;

  try {
    if (!exists(a) || !exists(b)) return false;
    const aStat = lstat(a);
    const bStat = lstat(b);

    if (aStat.isSymbolicLink() || bStat.isSymbolicLink()) {
      return aStat.isSymbolicLink()
        && bStat.isSymbolicLink()
        && readlink(a) === readlink(b);
    }
    if (aStat.isDirectory() !== bStat.isDirectory()) return false;
    if (aStat.isFile() !== bStat.isFile()) return false;
    if (aStat.isFile()) return contentEqual(a, b);
    if (!aStat.isDirectory()) return false;

    const aEntries = [...readdir(a)].sort();
    const bEntries = [...readdir(b)].sort();
    if (aEntries.length !== bEntries.length) return false;
    return aEntries.every((name, index) => (
      name === bEntries[index]
      && treeContentEqual(join(a, name), join(b, name), ops)
    ));
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
  const remove = ops.rmSync ?? rmSync;
  const resourcesEqual = ops.treeContentEqual ?? ((a, b) => treeContentEqual(a, b, ops));
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
      if (resourcesEqual(src, dst)) continue;

      const backupStamp = now();
      let backup = `${dst}.oh-my-sdd-backup-${backupStamp}`;
      let suffix = 1;
      while (exists(backup)) backup = `${dst}.oh-my-sdd-backup-${backupStamp}-${suffix++}`;

      try {
        // Always copy the existing destination: it is the user data at risk.
        copy(dst, backup, { recursive: true, force: false, errorOnExist: true });
        warn(`[postinstall] ${label}: backed up ${name} -> ${backup}`);
      } catch (e) {
        warn(`[postinstall] ${label}: backup failed for ${name}; preserving existing target: ${e.message}`);
        continue;
      }

      try {
        // Replace rather than merge so deleted helper resources do not linger.
        remove(dst, { recursive: true, force: true });
      } catch (e) {
        warn(`[postinstall] ${label}: could not replace ${name}; preserving existing target: ${e.message}`);
        continue;
      }

      try {
        copy(src, dst, { recursive: true });
        installed++;
      } catch (e) {
        warn(`[postinstall] ${label}: copy failed ${name}: ${e.message}`);
        try {
          remove(dst, { recursive: true, force: true });
          copy(backup, dst, { recursive: true });
          warn(`[postinstall] ${label}: restored existing target ${name} from ${backup}`);
        } catch (restoreError) {
          warn(`[postinstall] ${label}: restore failed for ${name}; backup remains at ${backup}: ${restoreError.message}`);
        }
      }
      continue;
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

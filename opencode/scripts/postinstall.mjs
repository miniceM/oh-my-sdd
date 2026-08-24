#!/usr/bin/env node
/**
 * postinstall.mjs — Install plugin-provided skills & commands into OpenCode's
 * global discovery paths.
 *
 * Background:
 *   OpenCode does NOT scan `.opencode/skills/` or `.opencode/commands/` inside
 *   npm-installed plugin packages. It only scans:
 *     - `~/.config/opencode/skills/<name>/SKILL.md`     (global skills)
 *     - `~/.config/opencode/commands/<name>.md`         (global commands)
 *     - `<project>/.opencode/skills/` & `<project>/.opencode/commands/` (project-level)
 *     - `~/.claude/skills/`, `~/.agents/skills/`        (external / cross-tool)
 *
 *   So after OpenCode installs `@cli-tools/oh-my-sdd-opencode`, this script
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
 *   - OMS skills and third-party delegated skills use separate bundled source
 *     trees and separate allowlists. Delegated skills are vendored from a
 *     pinned release; postinstall never executes a package manager or network
 *     installer.
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

import {
  readOwnershipManifest,
  resourceDigest,
  writeOwnershipManifest,
} from './resource-ownership.mjs';
import {
  getAgentsPath,
  getOpenCodeConfigDir,
  upsertManagedAgentsBlock,
} from './agents-md.mjs';
import { getBodyForInjection } from '../lib/constitution.js';
import { bootstrapOpenCodeResources } from './resource-bootstrap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

// Home-dir targets (OpenCode's global discovery paths).
const HOME = homedir();
const OPENCODE_CONFIG_DIR = getOpenCodeConfigDir(HOME);
const OPENCODE_SKILLS_DIR = join(OPENCODE_CONFIG_DIR, 'skills');
const OPENCODE_COMMANDS_DIR = join(OPENCODE_CONFIG_DIR, 'commands');
const OPENCODE_AGENTS_MD = getAgentsPath(HOME);
const AGENTS_SKILLS_DIR = join(HOME, '.agents', 'skills');
const AGENTS_COMMAND_DIR = join(HOME, '.agents', 'command');
const OWNERSHIP_MANIFEST = join(HOME, '.oh-my-sdd', 'opencode-npm-resources.json');

// Plugin-side source dirs. `oms-skills/` is tracked and explicitly packaged so
// `npm install -g .` from a clean clone cannot depend on ignored build mirrors.
const PLUGIN_SKILLS_SRC = join(PLUGIN_ROOT, 'oms-skills');
const PLUGIN_COMMAND_SRC = join(PLUGIN_ROOT, '.opencode', 'commands');
const DELEGATED_SKILLS_SRC = join(PLUGIN_ROOT, 'delegated-skills');

/**
 * Pinned source of the vendored superpowers delegation skills.
 * Postinstall installs from the bundled `delegated-skills/` tree only; it never
 * runs a network installer, so this constant documents the exact upstream
 * release the pinned tree was vendored from.
 */
export const DELEGATED_SKILLS_SOURCE = 'bundled superpowers-zh@1.5.0';

/**
 * Strongly required delegation skills (5) shipped in `delegated-skills/`.
 * A command such as `/sdd-plan` resolves `superpowers:<name>` against these
 * unnamespaced skill directories; when one is missing, the command falls back
 * to inline content resolution instead of failing. Read-only frozen array.
 */
export const DELEGATED_SKILL_NAMES = Object.freeze([
  'brainstorming',
  'writing-plans',
  'executing-plans',
  'subagent-driven-development',
  'requesting-code-review',
]);

/**
 * Transitive support skills (3) vendored alongside the strongly required ones.
 * They are installed so that delegated workflows (worktrees, branch finishing,
 * TDD) keep working in a pure OpenCode environment. Read-only frozen array.
 */
export const DELEGATED_SUPPORT_SKILL_NAMES = Object.freeze([
  'using-git-worktrees',
  'finishing-a-development-branch',
  'test-driven-development',
]);
const ALL_DELEGATED_SKILL_NAMES = Object.freeze([
  ...DELEGATED_SKILL_NAMES,
  ...DELEGATED_SUPPORT_SKILL_NAMES,
]);

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

function isDelegatedSkill(name) {
  return ALL_DELEGATED_SKILL_NAMES.includes(name)
    && existsSync(join(DELEGATED_SKILLS_SRC, name, 'SKILL.md'));
}

function recordResult(summary, status, name) {
  if (!summary) return;
  summary[status] = (summary[status] ?? 0) + 1;
  if (!summary.names) summary.names = {};
  if (!summary.names[status]) summary.names[status] = [];
  summary.names[status].push(name);
}

function ownershipMetadata(ops, name) {
  if (typeof ops.ownershipMetadata === 'function') return ops.ownershipMetadata(name);
  return ops.ownershipMetadata ?? {};
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
  const ownership = ops.ownership ?? new Map();
  const recordOwnership = ops.recordOwnership ?? (() => {});
  const digest = ops.resourceDigest ?? resourceDigest;

  if (!exists(srcDir) || !stat(srcDir).isDirectory()) {
    warn(`[postinstall] ${label}: source missing ${srcDir}`);
    recordResult(ops.summary, 'failed', '<source>');
    return 0;
  }
  mkdir(dstDir, { recursive: true });

  const entries = readdir(srcDir);
  let installed = 0;
  for (const name of entries) {
    if (!filterFn(name)) continue;
    const src = join(srcDir, name);
    const dst = join(dstDir, name);
    const prior = ownership.get(dst);

    if (exists(dst)) {
      if (resourcesEqual(src, dst)) {
        if (prior) {
          recordOwnership({
            ...prior,
            ...ownershipMetadata(ops, name),
            installed_digest: digest(dst),
          });
        }
        recordResult(ops.summary, 'unchanged', name);
        continue;
      }

      if (prior) {
        let currentDigest;
        try {
          currentDigest = digest(dst);
        } catch {
          warn(`[postinstall] ${label}: cannot verify owned resource ${name}; preserving existing target`);
          recordResult(ops.summary, 'preserved', name);
          continue;
        }
        if (currentDigest !== prior.installed_digest) {
          warn(`[postinstall] ${label}: ${name} was modified after install; preserving user changes`);
          recordResult(ops.summary, 'preserved', name);
          continue;
        }
      }

      const backupStamp = now();
      const suffixName = prior ? 'oh-my-sdd-rollback' : 'oh-my-sdd-backup';
      let backup = `${dst}.${suffixName}-${backupStamp}`;
      let suffix = 1;
      while (exists(backup)) backup = `${dst}.${suffixName}-${backupStamp}-${suffix++}`;

      if (prior && !prior.created && (!prior.backup || !exists(prior.backup))) {
        warn(`[postinstall] ${label}: original backup missing for ${name}; preserving existing target`);
        recordResult(ops.summary, 'preserved', name);
        continue;
      }

      try {
        // Always copy the existing destination: it is the user data at risk.
        copy(dst, backup, { recursive: true, force: false, errorOnExist: true });
        if (!prior) warn(`[postinstall] ${label}: backed up ${name} -> ${backup}`);
      } catch (e) {
        warn(`[postinstall] ${label}: backup failed for ${name}; preserving existing target: ${e.message}`);
        recordResult(ops.summary, 'preserved', name);
        continue;
      }

      try {
        // Replace rather than merge so deleted helper resources do not linger.
        remove(dst, { recursive: true, force: true });
      } catch (e) {
        warn(`[postinstall] ${label}: could not replace ${name}; preserving existing target: ${e.message}`);
        recordResult(ops.summary, 'preserved', name);
        continue;
      }

      try {
        copy(src, dst, { recursive: true });
        const record = prior ?? { target: dst, backup, created: false };
        recordOwnership({
          ...record,
          ...ownershipMetadata(ops, name),
          installed_digest: digest(dst),
        });
        installed++;
        recordResult(ops.summary, 'installed', name);
        if (prior) {
          try {
            remove(backup, { recursive: true, force: true });
          } catch (cleanupError) {
            warn(`[postinstall] ${label}: rollback cleanup failed for ${name}: ${cleanupError.message}`);
          }
        }
      } catch (e) {
        warn(`[postinstall] ${label}: copy failed ${name}: ${e.message}`);
        recordResult(ops.summary, 'failed', name);
        try {
          remove(dst, { recursive: true, force: true });
          copy(backup, dst, { recursive: true });
          warn(`[postinstall] ${label}: restored existing target ${name} from ${backup}`);
          remove(backup, { recursive: true, force: true });
        } catch (restoreError) {
          warn(`[postinstall] ${label}: restore failed for ${name}; backup remains at ${backup}: ${restoreError.message}`);
        }
      }
      continue;
    }

    try {
      copy(src, dst, { recursive: true });
      const record = prior ?? { target: dst, backup: null, created: true };
      recordOwnership({
        ...record,
        ...ownershipMetadata(ops, name),
        installed_digest: digest(dst),
      });
      installed++;
      recordResult(ops.summary, 'installed', name);
    } catch (e) {
      warn(`[postinstall] ${label}: copy failed ${name}: ${e.message}`);
      recordResult(ops.summary, 'failed', name);
      remove(dst, { recursive: true, force: true });
    }
  }
  return installed;
}

function createSummary() {
  return { installed: 0, unchanged: 0, preserved: 0, failed: 0, names: {} };
}

function formatSummary(summary) {
  return `installed=${summary.installed}, unchanged=${summary.unchanged}, preserved=${summary.preserved}, failed=${summary.failed}`;
}

function findMissingDelegatedSkills() {
  return ALL_DELEGATED_SKILL_NAMES.filter((name) => (
    !existsSync(join(DELEGATED_SKILLS_SRC, name, 'SKILL.md'))
  ));
}

export function main() {
  // Compatibility entrypoint for npm installs. Native `opencode plugin` installs
  // do not run postinstall; the plugin calls this same bootstrap on load.
  bootstrapOpenCodeResources();
  const results = [];
  const records = readOwnershipManifest(OWNERSHIP_MANIFEST);
  const ownership = new Map(records.map((record) => [record.target, record]));
  const recordOwnership = (record) => {
    ownership.set(record.target, record);
    writeOwnershipManifest(OWNERSHIP_MANIFEST, [...ownership.values()]);
  };
  const ops = { ownership, recordOwnership };

  const omsOpenCode = createSummary();
  const omsAgents = createSummary();
  const delegatedOpenCode = createSummary();
  const delegatedAgents = createSummary();
  const commandsOpenCode = createSummary();
  const commandsAgents = createSummary();

  const n1 = copyDirSafe(
    PLUGIN_SKILLS_SRC,
    OPENCODE_SKILLS_DIR,
    isOwnedSkill,
    'opencode-skills',
    {
      ...ops,
      summary: omsOpenCode,
      ownershipMetadata: (name) => ({ resource_kind: 'oms-skill', resource_name: name }),
    },
  );
  results.push(`opencode-skills: ${n1}`);

  const commandOps = {
    ...ops,
    ownershipMetadata: (name) => ({ resource_kind: 'oms-command', resource_name: name }),
  };
  const n2 = copyDirSafe(
    PLUGIN_COMMAND_SRC,
    OPENCODE_COMMANDS_DIR,
    isOwnedCommand,
    'opencode-commands',
    { ...commandOps, summary: commandsOpenCode },
  );
  results.push(`opencode-commands: ${n2}`);

  // Mirror to ~/.agents/ for Claude Code / Codex compatibility.
  const n3 = copyDirSafe(
    PLUGIN_SKILLS_SRC,
    AGENTS_SKILLS_DIR,
    isOwnedSkill,
    'agents-skills',
    {
      ...ops,
      summary: omsAgents,
      ownershipMetadata: (name) => ({ resource_kind: 'oms-skill', resource_name: name }),
    },
  );
  results.push(`agents-skills: ${n3}`);

  const n4 = copyDirSafe(
    PLUGIN_COMMAND_SRC,
    AGENTS_COMMAND_DIR,
    isOwnedCommand,
    'agents-commands',
    { ...commandOps, summary: commandsAgents },
  );
  results.push(`agents-commands: ${n4}`);

  const delegatedOps = {
    ...ops,
    ownershipMetadata: (name) => ({
      resource_kind: 'delegated-skill',
      resource_name: name,
      resource_source: DELEGATED_SKILLS_SOURCE,
    }),
  };
  const n5 = copyDirSafe(
    DELEGATED_SKILLS_SRC,
    OPENCODE_SKILLS_DIR,
    isDelegatedSkill,
    'opencode-delegated-skills',
    { ...delegatedOps, summary: delegatedOpenCode },
  );
  results.push(`opencode-delegated-skills: ${n5}`);

  const n6 = copyDirSafe(
    DELEGATED_SKILLS_SRC,
    AGENTS_SKILLS_DIR,
    isDelegatedSkill,
    'agents-delegated-skills',
    { ...delegatedOps, summary: delegatedAgents },
  );
  results.push(`agents-delegated-skills: ${n6}`);

  try {
    const baselinePath = join(PLUGIN_ROOT, 'content', 'enterprise-baseline.md');
    const baseline = getBodyForInjection(readFileSync(baselinePath, 'utf8'));
    upsertManagedAgentsBlock(OPENCODE_AGENTS_MD, baseline);
    results.push('opencode-agents-md: updated');
  } catch (error) {
    results.push('opencode-agents-md: failed');
    console.warn(`[postinstall] opencode AGENTS.md: ${error.message}`);
  }

  const missing = findMissingDelegatedSkills();
  for (const name of missing) {
    recordResult(delegatedOpenCode, 'failed', name);
    recordResult(delegatedAgents, 'failed', name);
  }
  console.log(
    `[postinstall] oms-skills: opencode ${formatSummary(omsOpenCode)}; agents ${formatSummary(omsAgents)}`,
  );
  console.log(
    `[postinstall] commands: opencode ${formatSummary(commandsOpenCode)}; agents ${formatSummary(commandsAgents)}`,
  );
  console.log(
    `[postinstall] delegated-skills: source=${DELEGATED_SKILLS_SOURCE}; names=${DELEGATED_SKILL_NAMES.join(',')}; supporting-dependencies=${DELEGATED_SUPPORT_SKILL_NAMES.join(',')}; missing-dependencies: ${missing.length === 0 ? 'none' : missing.join(',')}; opencode ${formatSummary(delegatedOpenCode)}; agents ${formatSummary(delegatedAgents)}`,
  );

  console.log(`[postinstall] resource changes this run: ${results.join(', ')}`);
  console.log('[postinstall] uninstall: run oms-opencode-uninstall (npm does not run uninstall lifecycle scripts)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    // Never break `npm install`.
    console.warn(`[postinstall] oh-my-sdd: ${e.message}`);
  }
}

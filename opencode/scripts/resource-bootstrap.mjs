/** Shared, package-local resource activation for OpenCode plugin loading. */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOpenCodeConfigDir } from './agents-md.mjs';
import { readOwnershipManifest, resourceDigest, writeOwnershipManifest } from './resource-ownership.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DELEGATED_SKILL_NAMES = Object.freeze([
  'brainstorming', 'writing-plans', 'executing-plans', 'subagent-driven-development',
  'requesting-code-review', 'using-git-worktrees', 'finishing-a-development-branch', 'test-driven-development',
]);
const ownedSkill = (name) => /^(sdd-|api-design$|business-modeling$|db-conventions$|doc-writer$|fe-|security-check$|testing-strategy$)/.test(name);
const ownedCommand = (name) => name.startsWith('sdd-') && name.endsWith('.md');

function equal(a, b) {
  try { return resourceDigest(a) === resourceDigest(b); } catch { return false; }
}
function activationPath(home) { return join(home, '.oh-my-sdd', 'opencode-activation.json'); }
function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  // `rename` replaces in-place on supported Windows/Unix filesystems. Do not
  // delete the old record first: a crash must leave either complete version.
  renameSync(temp, path);
}
function packageVersion(root) {
  try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? 'unknown'; } catch { return 'unknown'; }
}

/**
 * Projects only resources that OpenCode cannot discover inside an npm package.
 * Returns a structured result and never throws for ordinary copy/drift failures.
 */
export function bootstrapOpenCodeResources(options = {}) {
  const pluginRoot = options.pluginRoot ?? ROOT;
  const home = options.home ?? homedir();
  const configDir = options.configDir ?? getOpenCodeConfigDir(home);
  const manifestPath = options.manifestPath ?? join(home, '.oh-my-sdd', 'opencode-npm-resources.json');
  const delegated = options.delegatedSkillNames ?? DELEGATED_SKILL_NAMES;
  const copy = options.copySync ?? cpSync;
  const ownership = new Map(readOwnershipManifest(manifestPath).map((item) => [item.target, item]));
  const drifted_resources = [];
  const failed_resources = [];
  const installed = [];
  const project = (source, destination, kind, name) => {
    const label = `${kind}:${name}`;
    if (!existsSync(source)) { failed_resources.push(label); return; }
    try {
      const prior = ownership.get(destination);
      if (existsSync(destination) && !equal(source, destination)) {
        if (prior && resourceDigest(destination) !== prior.installed_digest) {
          drifted_resources.push(label);
          return;
        }
        // A resource created by OMS has no user original to back up. Preserve
        // that ownership across upgrades so uninstall removes it, rather than
        // restoring a previous OMS version as if it belonged to the user.
        const backup = prior ? prior.backup : `${destination}.oh-my-sdd-backup-${Date.now()}`;
        const rollback = backup ?? `${destination}.oh-my-sdd-rollback-${Date.now()}`;
        mkdirSync(dirname(rollback), { recursive: true });
        copy(destination, rollback, { recursive: true, force: false, errorOnExist: true });
        rmSync(destination, { recursive: true, force: true });
        try {
          copy(source, destination, { recursive: true });
        } catch (error) {
          try { copy(rollback, destination, { recursive: true }); } catch { /* retain rollback for recovery */ }
          throw error;
        }
        if (!backup) rmSync(rollback, { recursive: true, force: true });
        ownership.set(destination, { target: destination, backup, created: prior?.created ?? false, installed_digest: resourceDigest(destination), resource_kind: kind, resource_name: name });
      } else if (!existsSync(destination)) {
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(source, destination, { recursive: true });
        ownership.set(destination, { target: destination, backup: null, created: true, installed_digest: resourceDigest(destination), resource_kind: kind, resource_name: name });
      }
      installed.push(label);
    } catch { failed_resources.push(label); }
  };
  const skills = join(pluginRoot, 'oms-skills');
  const commands = join(pluginRoot, '.opencode', 'commands');
  const delegatedRoot = join(pluginRoot, 'delegated-skills');
  for (const name of ['dist', 'hooks', 'lib', 'content']) {
    if (!existsSync(join(pluginRoot, name)) || !statSync(join(pluginRoot, name)).isDirectory()) {
      failed_resources.push(`runtime:${name}`);
    }
  }
  if (!existsSync(skills) || !statSync(skills).isDirectory()) failed_resources.push('oms-skills:<source>');
  else for (const name of readdirSync(skills)) if (ownedSkill(name)) project(join(skills, name), join(configDir, 'skills', name), 'oms-skill', name);
  if (!existsSync(commands) || !statSync(commands).isDirectory()) failed_resources.push('oms-command:<source>');
  else for (const name of readdirSync(commands)) if (ownedCommand(name)) project(join(commands, name), join(configDir, 'commands', name), 'oms-command', name);
  for (const name of delegated) project(join(delegatedRoot, name), join(configDir, 'skills', name), 'delegated-skill', name);
  try { writeOwnershipManifest(manifestPath, [...ownership.values()]); } catch { failed_resources.push('ownership-manifest'); }
  const resource_digest = resourceDigest(pluginRoot);
  const result = {
    schema_version: 1, plugin_version: packageVersion(pluginRoot), resource_digest, activated_at: new Date().toISOString(),
    registered_hooks: options.registeredHooks ?? [],
    state: failed_resources.length ? 'failed' : drifted_resources.length ? 'degraded' : 'verified',
    drifted_resources, failed_resources,
  };
  try { atomicJson(activationPath(home), result); } catch (error) { throw new Error(`cannot record OpenCode activation: ${error.message}`); }
  return result;
}

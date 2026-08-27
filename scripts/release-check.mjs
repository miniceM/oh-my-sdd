#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, '..');
const PUBLIC_PACKAGES = ['@cli-tools/oh-my-sdd', '@cli-tools/oh-my-sdd-opencode'];
const SNAPSHOT_MAP = [
  ['skills', 'skills'],
  ['skills', 'oms-skills'],
  ['skills', '.opencode/skills'],
  ['skills', '.agents/skills'],
  ['content', 'content'],
  ['hooks', 'hooks'],
  ['lib', 'lib'],
];

function readJson(file, errors) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`Cannot read JSON: ${file} (${error.message})`);
    return null;
  }
}

function treeDigest(root) {
  if (!existsSync(root)) return null;
  const hash = createHash('sha256');
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const file = join(directory, entry.name);
      hash.update(relative(root, file)).update('\0');
      if (entry.isDirectory()) {
        hash.update('directory\0');
        visit(file);
      } else if (entry.isFile()) {
        hash.update('file\0').update(readFileSync(file));
      } else {
        hash.update(statSync(file).isSymbolicLink() ? 'symbolic-link\0' : 'other\0');
      }
    }
  };
  visit(root);
  return hash.digest('hex');
}

function defaultCompareTree(source, destination) {
  const sourceDigest = treeDigest(source);
  return sourceDigest !== null && sourceDigest === treeDigest(destination);
}

export function checkReleaseContract({
  repoRoot = DEFAULT_REPO_ROOT,
  productRoot = join(repoRoot, 'packages', 'product'),
  opencodeRoot = join(repoRoot, 'packages', 'opencode-plugin'),
  compareTree = defaultCompareTree,
} = {}) {
  const errors = [];
  const root = readJson(join(repoRoot, 'package.json'), errors);
  const product = readJson(join(productRoot, 'package.json'), errors);
  const plugin = readJson(join(opencodeRoot, 'package.json'), errors);
  const claudePlugin = readJson(join(productRoot, '.claude-plugin', 'plugin.json'), errors);
  const marketplace = readJson(join(productRoot, '.claude-plugin', 'marketplace.json'), errors);
  const changesets = readJson(join(repoRoot, '.changeset', 'config.json'), errors);

  if (root?.private !== true) errors.push('Repository package.json must be private');
  if (JSON.stringify(root?.workspaces) !== JSON.stringify(['packages/*'])) errors.push('Repository workspaces must equal ["packages/*"]');
  if (product?.name !== PUBLIC_PACKAGES[0]) errors.push(`Product package name must equal ${PUBLIC_PACKAGES[0]}`);
  if (plugin?.name !== PUBLIC_PACKAGES[1]) errors.push(`OpenCode package name must equal ${PUBLIC_PACKAGES[1]}`);
  if (product?.version !== plugin?.version) errors.push('Public package versions must be identical');
  if (claudePlugin?.version !== product?.version) errors.push('Claude plugin descriptor version must equal product version');
  if (marketplace?.plugins?.[0]?.version !== product?.version) errors.push('Claude marketplace descriptor version must equal product version');
  if (existsSync(join(productRoot, 'package-lock.json'))) errors.push('Product workspace must not contain package-lock.json');
  if (existsSync(join(opencodeRoot, 'package-lock.json'))) errors.push('OpenCode workspace must not contain package-lock.json');
  if (!existsSync(join(repoRoot, 'package-lock.json'))) errors.push('Repository must contain package-lock.json');
  if (JSON.stringify(changesets?.fixed) !== JSON.stringify([PUBLIC_PACKAGES])) errors.push('Changesets fixed group must contain both public packages');

  for (const [from, to] of SNAPSHOT_MAP) {
    if (!compareTree(join(productRoot, from), join(opencodeRoot, to))) {
      errors.push(`OpenCode resource snapshot differs: ${from} -> ${to}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = checkReleaseContract();
  if (!result.ok) {
    process.stderr.write(`${result.errors.join('\n')}\n`);
    process.exitCode = 1;
  }
}

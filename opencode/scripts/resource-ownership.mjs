import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const MANIFEST_VERSION = 1;

/** Hash a complete file, directory, or symlink tree without following links. */
export function resourceDigest(target) {
  const hash = createHash('sha256');

  function visit(current, relativeName) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      hash.update(`link:${relativeName}\0${readlinkSync(current)}\0`);
      return;
    }
    if (stat.isFile()) {
      hash.update(`file:${relativeName}\0`);
      hash.update(readFileSync(current));
      hash.update('\0');
      return;
    }
    if (!stat.isDirectory()) {
      hash.update(`other:${relativeName}\0`);
      return;
    }
    hash.update(`dir:${relativeName}\0`);
    for (const name of readdirSync(current).sort()) {
      visit(resolve(current, name), relativeName ? `${relativeName}/${name}` : name);
    }
  }

  visit(target, '');
  return hash.digest('hex');
}

export function readOwnershipManifest(manifestPath) {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (parsed?.version !== MANIFEST_VERSION || !Array.isArray(parsed.resources)) return [];
    return parsed.resources.filter((record) => (
      typeof record?.target === 'string'
      && typeof record?.created === 'boolean'
      && (record.backup === null || typeof record.backup === 'string')
      && typeof record?.installed_digest === 'string'
    ));
  } catch {
    return [];
  }
}

/** Persist ownership atomically so an interrupted install keeps prior records. */
export function writeOwnershipManifest(manifestPath, resources) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  const temporary = `${manifestPath}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify({
    version: MANIFEST_VERSION,
    resources,
  }, null, 2) + '\n', { mode: 0o600 });
  try {
    renameSync(temporary, manifestPath);
  } catch (error) {
    // Windows cannot always replace an existing file with rename(). Keep the
    // temp-file write and use the smallest possible replacement window there.
    if (!existsSync(manifestPath)) throw error;
    rmSync(manifestPath, { force: true });
    renameSync(temporary, manifestPath);
  }
}

function isWithinAllowedRoot(target, allowedRoots) {
  const absolute = resolve(target);
  return allowedRoots.some((root) => {
    const rel = relative(resolve(root), absolute);
    return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
  });
}

function uniqueSibling(target, suffix, now) {
  const stamp = now();
  let candidate = `${target}.${suffix}-${stamp}`;
  let index = 1;
  while (existsSync(candidate)) candidate = `${target}.${suffix}-${stamp}-${index++}`;
  return candidate;
}

/** Remove npm-installed resources and restore every pre-install destination. */
export function uninstallOwnedResources({
  manifestPath,
  allowedRoots,
  warn = console.warn,
  now = Date.now,
}) {
  const resources = readOwnershipManifest(manifestPath);
  const remaining = [...resources];
  let removed = 0;
  let restored = 0;
  let preserved = 0;

  for (let index = resources.length - 1; index >= 0; index--) {
    const record = resources[index];
    if (!isWithinAllowedRoot(record.target, allowedRoots)) {
      warn(`[preuninstall] refusing out-of-scope target: ${record.target}`);
      continue;
    }
    if (record.backup && !isWithinAllowedRoot(record.backup, allowedRoots)) {
      warn(`[preuninstall] refusing out-of-scope backup: ${record.backup}`);
      continue;
    }
    if (record.backup && !existsSync(record.backup)) {
      warn(`[preuninstall] original backup missing; preserving target: ${record.target}`);
      continue;
    }

    if (existsSync(record.target)) {
      let unchanged = false;
      try {
        unchanged = resourceDigest(record.target) === record.installed_digest;
      } catch {
        // Preserve an unreadable target instead of deleting it blindly.
      }
      if (unchanged) {
        rmSync(record.target, { recursive: true, force: true });
      } else {
        const preservedPath = uniqueSibling(record.target, 'oh-my-sdd-modified', now);
        renameSync(record.target, preservedPath);
        warn(`[preuninstall] preserved modified resource: ${preservedPath}`);
        preserved++;
      }
    }

    if (record.backup) {
      mkdirSync(dirname(record.target), { recursive: true });
      renameSync(record.backup, record.target);
      restored++;
    } else if (record.created) {
      removed++;
    }

    const remainingIndex = remaining.findIndex((item) => item.target === record.target);
    if (remainingIndex >= 0) remaining.splice(remainingIndex, 1);
    if (remaining.length > 0) writeOwnershipManifest(manifestPath, remaining);
  }

  if (remaining.length === 0) rmSync(manifestPath, { force: true });
  return { removed, restored, preserved, remaining: remaining.length };
}

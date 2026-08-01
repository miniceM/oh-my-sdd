#!/usr/bin/env node
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { uninstallOwnedResources } from './resource-ownership.mjs';

const HOME = homedir();
const MANIFEST_PATH = join(HOME, '.oh-my-sdd', 'opencode-npm-resources.json');
const ALLOWED_ROOTS = [
  join(HOME, '.config', 'opencode', 'skills'),
  join(HOME, '.config', 'opencode', 'command'),
  join(HOME, '.agents', 'skills'),
  join(HOME, '.agents', 'command'),
];

export function main({
  manifestPath = MANIFEST_PATH,
  allowedRoots = ALLOWED_ROOTS,
  warn = console.warn,
} = {}) {
  const result = uninstallOwnedResources({ manifestPath, allowedRoots, warn });
  console.log(
    `[preuninstall] oh-my-sdd removed: ${result.removed}, restored: ${result.restored}, preserved: ${result.preserved}`,
  );
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[preuninstall] oh-my-sdd: ${error.message}`);
    process.exitCode = 1;
  }
}

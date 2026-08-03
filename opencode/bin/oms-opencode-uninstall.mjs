#!/usr/bin/env node
/**
 * Supported OpenCode package uninstaller.
 *
 * npm removed uninstall lifecycle hooks, so a plain `npm uninstall -g` cannot
 * restore resources copied into the user's discovery directories. This command
 * removes the global npm package first, then performs ownership-aware cleanup.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { main as cleanupOwnedResources } from '../scripts/uninstall.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'),
);

/**
 * Build the platform-specific command used to invoke npm.
 *
 * @param {string[]} args npm arguments.
 * @param {{platform?: string, comspec?: string}} [options] Platform overrides for tests.
 * @returns {{command: string, args: string[]}} Executable and argument vector.
 */
export function buildNpmInvocation(
  args,
  { platform = process.platform, comspec = process.env.ComSpec ?? process.env.COMSPEC } = {},
) {
  if (platform === 'win32') {
    return {
      command: comspec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', ...args],
    };
  }
  return { command: 'npm', args };
}

/**
 * Remove the global package, then clean resources recorded in its ownership manifest.
 * Cleanup is deliberately skipped when npm fails so the installation remains usable.
 *
 * @param {object} [options] Injectable process dependencies.
 * @returns {void}
 */
export function main({
  cleanup = cleanupOwnedResources,
  spawn = spawnSync,
  env = process.env,
  platform = process.platform,
  comspec = env.ComSpec ?? env.COMSPEC,
} = {}) {
  const invocation = buildNpmInvocation(
    ['uninstall', '--global', packageJson.name],
    { platform, comspec },
  );
  const result = spawn(
    invocation.command,
    invocation.args,
    { env, stdio: 'inherit' },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm uninstall exited with status ${result.status ?? 'unknown'}`);
  }

  cleanup();
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    main();
  } catch (error) {
    console.error(`[uninstall] oh-my-sdd OpenCode package: ${error.message}`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getStateDir } from '../lib/platform.js';
import { getAdapter, listTools } from './host-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = process.env.OMS_PACKAGE_ROOT ?? path.resolve(__dirname, '..');

// announce writes user-facing messages to stderr so npm preuninstall doesn't
// swallow them. npm hides preuninstall stdout; stderr always shows.
function announce(msg) {
  process.stderr.write(msg + '\n');
}

/**
 * Return whether this module is the process entry point on the current OS.
 */
function isDirectExecution(
  moduleUrl,
  entryArg,
  {
    platform = process.platform,
    pathApi = path,
    fileURLToPathFn = fileURLToPath,
  } = {},
) {
  if (!entryArg) return false;
  const modulePath = pathApi.resolve(fileURLToPathFn(moduleUrl));
  const entryPath = pathApi.resolve(entryArg);
  return platform === 'win32'
    ? modulePath.toLowerCase() === entryPath.toLowerCase()
    : modulePath === entryPath;
}

/**
 * Uninstall one registered host or every detected host.
 *
 * @param {{ purge?: boolean, tool?: string | null }} options uninstall options
 * @param {object} dependencies injectable collaborators used by tests
 * @returns {Promise<void>}
 */
async function main(
  { purge = false, tool } = {},
  {
    registry = { getAdapter, listTools },
    announce: report = announce,
    removeStateDir = () => rm(getStateDir(), { recursive: true, force: true }),
  } = {},
) {
  const targets = tool ? [tool] : registry.listTools();
  for (const hostId of targets) {
    const Adapter = registry.getAdapter(hostId);
    // Preserve the legacy default behavior: always attempt Claude cleanup so
    // users receive manual CLI instructions, while auto-cleaning other hosts
    // only when they are detected. An explicit --tool always runs its adapter.
    if (tool || hostId === 'claude' || Adapter.isInstalled()) {
      await Adapter.uninstall({ announce: report, PACKAGE_ROOT });
    }
  }

  if (purge) {
    report('→ --purge: 同时移除 ~/.oh-my-sdd/ 状态目录');
    await removeStateDir();
  } else {
    report('');
    report('✓ oh-my-sdd 已卸载');
    report('  状态文件保留在 ~/.oh-my-sdd/，重装可复用');
    report('  彻底清理请运行：oms-uninstall --purge');
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  const args = process.argv.slice(2);
  const purge = args.includes('--purge');
  const toolIdx = args.indexOf('--tool');
  const tool = toolIdx !== -1 ? args[toolIdx + 1] : null;
  main({ purge, tool }).catch((err) => {
    process.stderr.write(`❌ 卸载失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { isDirectExecution, main };

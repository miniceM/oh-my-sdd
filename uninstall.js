#!/usr/bin/env node
import { rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPluginInstallDir } from './hooks/lib/platform.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_DIR = path.join(path.dirname(getPluginInstallDir()), '..');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const MARKETPLACE_ID = 'oh-my-sdd';

async function removePluginFiles() {
  const dest = getPluginInstallDir();
  await rm(dest, { recursive: true, force: true });
}

async function deregisterMarketplace() {
  let settings;
  try {
    settings = JSON.parse(await readFile(SETTINGS_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  if (settings.extraKnownMarketplaces?.[MARKETPLACE_ID]) {
    delete settings.extraKnownMarketplaces[MARKETPLACE_ID];
    await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
  }
}

async function main({ purge = false } = {}) {
  process.stdout.write('→ 移除 ~/.claude/plugins/oh-my-sdd/\n');
  await removePluginFiles();
  process.stdout.write('→ 从 settings.json 注销 marketplace\n');
  await deregisterMarketplace();
  if (purge) {
    const { getStateDir } = await import('./hooks/lib/platform.js');
    process.stdout.write('→ --purge: 同时移除 ~/.oh-my-sdd/ 状态目录\n');
    const { rm } = await import('node:fs/promises');
    await rm(getStateDir(), { recursive: true, force: true });
  } else {
    process.stdout.write('\n✓ oh-my-sdd 已卸载\n');
    process.stdout.write('  状态文件保留在 ~/.oh-my-sdd/，重装可复用\n');
    process.stdout.write('  彻底清理请运行：oms-uninstall --purge\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const purge = process.argv.includes('--purge');
  main({ purge }).catch((err) => {
    process.stderr.write(`❌ 卸载失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { main };

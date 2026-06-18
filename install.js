#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, access, constants, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkNodeVersion, getPluginInstallDir, getStateDir, isIamInPath
} from './hooks/lib/platform.js';
import { saveConfig, DEFAULT_CONFIG } from './hooks/lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = __dirname;
const CLAUDE_DIR = path.join(path.dirname(getPluginInstallDir()), '..'); // ~/.claude
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const MARKETPLACE_ID = 'oh-my-sdd';

async function preflight() {
  if (!checkNodeVersion('18.0.0')) {
    process.stderr.write(`❌ Node 版本过低。需要 >= 18.0.0，当前 ${process.version}\n`);
    process.exit(1);
  }
  if (!(await isIamInPath())) {
    process.stderr.write('⚠️  未检测到 iam CLI。可继续安装，但首次会话将提示安装。\n');
    process.stderr.write('    安装后请运行 oms-login 完成身份认证。\n');
  }
}

async function copyPluginFiles() {
  const dest = getPluginInstallDir();
  await mkdir(path.dirname(dest), { recursive: true });
  // Remove existing installation (if upgrading)
  if (existsSync(dest)) {
    await rm(dest, { recursive: true, force: true });
  }
  // Copy the relevant subdirs
  const subdirs = ['commands', 'skills', 'content', 'hooks', 'bin'];
  for (const sub of subdirs) {
    await cp(path.join(PACKAGE_ROOT, sub), path.join(dest, sub), { recursive: true });
  }
  // Copy .claude-plugin/ directory (contains plugin.json manifest)
  await cp(path.join(PACKAGE_ROOT, '.claude-plugin'), path.join(dest, '.claude-plugin'), { recursive: true });
  // Copy other root manifests (skip any not yet shipped — forward-compatible during
  // staggered releases where e.g. README.md or uninstall.js lag behind)
  for (const f of ['package.json', 'install.js', 'uninstall.js', 'README.md']) {
    if (!existsSync(path.join(PACKAGE_ROOT, f))) continue;
    await cp(path.join(PACKAGE_ROOT, f), path.join(dest, f));
  }
  // marketplace.json stays at root (per superpowers reference)
  await cp(path.join(PACKAGE_ROOT, 'marketplace.json'), path.join(dest, 'marketplace.json'));
  return dest;
}

async function ensureStateDir() {
  await mkdir(getStateDir(), { recursive: true, mode: 0o700 });
  // Initialize config with defaults if not present
  try {
    await access(path.join(getStateDir(), 'config.json'), constants.F_OK);
  } catch {
    await saveConfig(DEFAULT_CONFIG);
  }
}

async function registerMarketplace() {
  // Read existing settings
  let settings = {};
  try {
    settings = JSON.parse(await readFile(SETTINGS_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  settings.extraKnownMarketplaces = settings.extraKnownMarketplaces ?? {};
  settings.extraKnownMarketplaces[MARKETPLACE_ID] = {
    source: getPluginInstallDir(),
    installedAt: new Date().toISOString(),
  };

  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

async function main() {
  await preflight();
  process.stdout.write('→ 检查 Node 版本与 iam CLI\n');
  process.stdout.write('→ 复制插件文件到 ~/.claude/plugins/oh-my-sdd/\n');
  const dest = await copyPluginFiles();
  process.stdout.write(`  完成：${dest}\n`);
  process.stdout.write('→ 初始化 ~/.oh-my-sdd/ 状态目录\n');
  await ensureStateDir();
  process.stdout.write('→ 在 settings.json 注册本地 marketplace\n');
  await registerMarketplace();
  process.stdout.write('\n✓ oh-my-sdd 安装完成\n\n');
  process.stdout.write('下一步：\n');
  process.stdout.write('  1. 运行 `oms-login` 完成 iam 身份认证\n');
  process.stdout.write('  2. 重启 Claude Code\n');
  process.stdout.write('  3. 在新会话里使用 /sdd-spec 等命令\n');
}

// Only run main when invoked directly, not when imported
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
    process.exit(1);
  });
}

export { main, copyPluginFiles, ensureStateDir, registerMarketplace, preflight };

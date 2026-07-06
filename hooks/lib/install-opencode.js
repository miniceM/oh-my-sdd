// install-opencode.js — OpenCode 工具的安装/卸载实现。
//
// 与 install-claude.js / install-qoder.js 对称：每个工具一个独立模块。
//
// OpenCode 路径特有逻辑：
//   1. skills 复制到 ~/.config/opencode/skills/
//   2. baseline 注入到 ~/.config/opencode/AGENTS.md（哨兵块追加，保留用户内容）
//   3. 编译 opencode/src/plugin.ts → dist/plugin.js（Bun 自动加载）
//   4. 复制 dist/ 到 ~/.config/opencode/plugins/oh-my-sdd/
//   5. 写入哨兵文件 ~/.oh-my-sdd/baseline-opencode.sentinel
//
// 卸载：
//   1. 删 skills 目录
//   2. 删 plugin 目录
//   3. 从 AGENTS.md 删除哨兵块（不破坏用户内容）
//   4. 删哨兵文件
//
// 共享 utilities 见 install-shared.js。

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

import {
  SENTINEL_BEGIN, SENTINEL_END, SENTINEL_RE,
  writeSentinel, readSentinel, sentinelPathFor, copyDirRecursive, copySkillsToDir,
} from './install-shared.js';

const HOME = homedir();

// ============================================
// OpenCode 路径常量
// ============================================
const OPENCODE_CONFIG_DIR = join(HOME, '.config', 'opencode');
const OPENCODE_SKILLS_DIR = join(OPENCODE_CONFIG_DIR, 'skills');
const OPENCODE_PLUGINS_DIR = join(OPENCODE_CONFIG_DIR, 'plugins');
const OPENCODE_PLUGIN_DEST = join(OPENCODE_PLUGINS_DIR, 'oh-my-sdd');
const OPENCODE_AGENTS_MD = join(OPENCODE_CONFIG_DIR, 'AGENTS.md');

function announce(msg) {
  process.stderr.write(msg + '\n');
}

function isHomeDir(p) {
  try {
    return resolve(p) === resolve(HOME);
  } catch {
    return false;
  }
}

// ============================================
// Baseline 注入：AGENTS.md 哨兵块追加
// ============================================
async function injectOpenCodeBaseline(announce) {
  const baselinePath = resolve(dirname(new URL(import.meta.url).pathname), '..', '..', 'baseline', 'opencode.md');
  const baseline = await readFile(baselinePath, 'utf8');
  // strip frontmatter from block content（AGENTS.md 不需要 oh-my-sdd frontmatter）
  const bodyOnly = baseline.replace(/^---[\s\S]*?---\n/, '');

  const block = `${SENTINEL_BEGIN}\n${bodyOnly.trim()}\n${SENTINEL_END}\n`;

  await mkdir(OPENCODE_CONFIG_DIR, { recursive: true });

  let existing = '';
  if (existsSync(OPENCODE_AGENTS_MD)) {
    existing = await readFile(OPENCODE_AGENTS_MD, 'utf8');
  }

  // 去掉旧哨兵块（幂等：重装只保留一份）
  const cleaned = existing.replace(SENTINEL_RE, '').replace(/\n+$/, '\n');
  const newContent = cleaned + (cleaned ? '\n' : '') + block;

  await writeFile(OPENCODE_AGENTS_MD, newContent, { mode: 0o644 });
  announce(`  ✓ baseline 已注入（哨兵块）: ${OPENCODE_AGENTS_MD}`);
}

// ============================================
// TS plugin 编译（Bun 自动加载 dist/）
// ============================================
function compile(opencodeDir, announce) {
  return new Promise((resolveCb) => {
    const proc = spawn('npx', ['tsc'], {
      cwd: opencodeDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        announce('  ✓ OpenCode plugin 编译成功');
      } else {
        announce(`  ⚠️  OpenCode plugin 编译失败 (exit ${code}): ${stderr.slice(0, 500)}`);
        announce('     请手动运行: cd opencode && npm install && npm run build');
      }
      resolveCb();
    });
    proc.on('error', (err) => {
      announce(`  ⚠️  编译命令失败: ${err.message}`);
      resolveCb();
    });
  });
}

async function buildOpenCodePlugin(packageRoot, announce) {
  const opencodeDir = join(packageRoot, 'opencode');
  const distDir = join(opencodeDir, 'dist');
  const pluginTs = join(opencodeDir, 'src', 'plugin.ts');

  if (!existsSync(pluginTs)) {
    announce('  ⚠️  OpenCode plugin 源文件不存在，跳过编译');
    return false;
  }

  // 检查 dist 是否已存在且比 src 新
  if (existsSync(join(distDir, 'plugin.js'))) {
    try {
      const [srcStat, distStat] = await Promise.all([stat(pluginTs), stat(join(distDir, 'plugin.js'))]);
      if (distStat.mtimeMs > srcStat.mtimeMs) {
        announce('  ✓ OpenCode plugin 已编译（跳过）');
        return true;
      }
    } catch {
      // stat 失败 → 重新编译
    }
  }

  await compile(opencodeDir, announce);
  return true;
}

async function installOpenCodePluginToHome(packageRoot, announce) {
  const distSrc = join(packageRoot, 'opencode', 'dist');
  if (!existsSync(join(distSrc, 'plugin.js'))) {
    announce('  ⚠️  OpenCode plugin dist 不存在，跳过安装');
    return;
  }

  await mkdir(OPENCODE_PLUGIN_DEST, { recursive: true });
  await copyDirRecursive(distSrc, OPENCODE_PLUGIN_DEST);
  announce(`  ✓ OpenCode plugin 已安装: ${OPENCODE_PLUGIN_DEST}`);
}

// ============================================
// 安装主入口
// ============================================
export async function installForOpenCode({ PACKAGE_ROOT }) {
  if (isHomeDir(process.cwd())) {
    announce('⚠️  当前目录是 HOME 目录，建议 cd 到项目目录后再装（继续执行但会有副作用）');
  }

  announce('→ 安装 OpenCode 适配');
  await copySkillsToDir(join(PACKAGE_ROOT, 'skills'), OPENCODE_SKILLS_DIR, announce);
  await injectOpenCodeBaseline(announce);
  await writeSentinel('opencode', OPENCODE_AGENTS_MD, 'OH-MY-SDD:BEGIN/END', announce);
  await buildOpenCodePlugin(PACKAGE_ROOT, announce);
  await installOpenCodePluginToHome(PACKAGE_ROOT, announce);

  announce('');
  announce('✓ oh-my-sdd (OpenCode) 安装完成');
  announce('  重启 OpenCode 即可加载 skills + 规则门禁');
}

// ============================================
// 卸载
// ============================================
async function rmIfExists(p) {
  if (existsSync(p)) {
    await rm(p, { recursive: true, force: true });
    return true;
  }
  return false;
}

export async function uninstallForOpenCode() {
  announce('→ 卸载 OpenCode 适配');

  // 1. rm skills 目录
  const skillsRemoved = await rmIfExists(OPENCODE_SKILLS_DIR);
  if (skillsRemoved) announce(`  ✓ 已删除: ${OPENCODE_SKILLS_DIR}`);

  // 2. rm plugin 目录
  const pluginRemoved = await rmIfExists(OPENCODE_PLUGIN_DEST);
  if (pluginRemoved) announce(`  ✓ 已删除: ${OPENCODE_PLUGIN_DEST}`);

  // 3. 从 AGENTS.md 删除哨兵块（不破坏用户内容）
  if (existsSync(OPENCODE_AGENTS_MD)) {
    const content = await readFile(OPENCODE_AGENTS_MD, 'utf8');
    const cleaned = content.replace(SENTINEL_RE, '').trim();
    if (cleaned.length === 0) {
      await rm(OPENCODE_AGENTS_MD, { force: true });
      announce(`  ✓ AGENTS.md 全部为哨兵块，已删除: ${OPENCODE_AGENTS_MD}`);
    } else if (cleaned !== content) {
      await writeFile(OPENCODE_AGENTS_MD, cleaned + '\n', { mode: 0o644 });
      announce(`  ✓ 已从 AGENTS.md 移除 oh-my-sdd 哨兵块: ${OPENCODE_AGENTS_MD}`);
    } else {
      announce('  (AGENTS.md 无 oh-my-sdd 哨兵块，跳过)');
    }
  }

  // 4. 哨兵文件清理
  const sentinel = await readSentinel('opencode');
  if (sentinel) {
    await rmIfExists(sentinelPathFor('opencode'));
    announce(`  ✓ 已删除哨兵文件`);
  }
}

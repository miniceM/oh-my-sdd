// install-opencode.js — OpenCode 工具的安装/卸载实现。
//
// 与 install-claude.js / install-lingma.js 对称：每个工具一个独立模块。
//
// OpenCode 路径特有逻辑：
//   1. skills 复制到 ~/.config/opencode/skills/
//   2. baseline 注入到 ~/.config/opencode/AGENTS.md（哨兵块追加，保留用户内容）
//   3. 复制 ship 的 dist/plugin.js 到 ~/.config/opencode/plugins/oh-my-sdd/
//      （dist 是开发者/CI 编译产物，由 prepublishOnly + CI 保证最新；用户机器零编译）
//   4. 注册 plugin 到 ~/.config/opencode/opencode.json 的 plugin 数组
//      （OpenCode 只从该数组加载插件；不注册 = plugin 永不生效）
//   5. 写入哨兵文件 ~/.oh-my-sdd/baseline-opencode.sentinel
//
// 卸载：
//   1. 删 skills 目录
//   2. 从 opencode.json plugin 数组移除 oh-my-sdd 入口（保留其他插件）
//   3. 删 plugin 目录
//   4. 从 AGENTS.md 删除哨兵块（不破坏用户内容）
//   5. 删哨兵文件
//
// 共享 utilities 见 install-shared.js。

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
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
const OPENCODE_CONFIG_JSON = join(OPENCODE_CONFIG_DIR, 'opencode.json');
// opencode.json 中 plugin 数组的入口路径。opencode.json 位于 OPENCODE_CONFIG_DIR，
// plugin 路径是相对该目录的。优先用新 install 布局（dist/ 子目录），
// 旧布局（顶层 plugin.js）作 fallback（plugin.js 内部探针同时支持两种）。
const PLUGIN_ENTRY_DIST = './plugins/oh-my-sdd/dist/plugin.js';
const PLUGIN_ENTRY_TOPLEVEL = './plugins/oh-my-sdd/plugin.js';

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

async function installOpenCodePluginToHome(packageRoot, announce) {
  const distSrc = join(packageRoot, 'opencode', 'dist');
  if (!existsSync(join(distSrc, 'plugin.js'))) {
    announce('  ⚠️  OpenCode plugin dist 不存在，跳过安装');
    return;
  }

  // 删旧目录 -> 完整重新复制（幂等）
  await rm(OPENCODE_PLUGIN_DEST, { recursive: true, force: true });
  await mkdir(OPENCODE_PLUGIN_DEST, { recursive: true });
  await copyDirRecursive(distSrc, OPENCODE_PLUGIN_DEST);

  // 复制 hooks/ 到插件目录同级，供 runHook 查找
  const hooksSrc = join(packageRoot, 'hooks');
  const hooksDest = join(OPENCODE_PLUGIN_DEST, 'hooks');
  await copyDirRecursive(hooksSrc, hooksDest);

  announce(`  ✓ OpenCode plugin + hooks 已安装: ${OPENCODE_PLUGIN_DEST}`);
}

// ============================================
// opencode.json plugin 数组注册/反注册
//
// OpenCode 只从 opencode.json 的 plugin 数组加载插件。复制 plugin.js 到 plugins/
// 目录不会自动生效——必须显式注册入口。两种 install 布局都需要此步。
//
// 行为：
//   - 读现有 opencode.json（不存在则用 {}）
//   - 损坏 JSON：备份为 .bak，重建为空对象（不阻断安装）
//   - plugin 字段不存在或不是数组：创建/替换为数组
//   - 已含 oh-my-sdd 入口：跳过（幂等）
//   - 入口路径按实际安装布局选择：dist/ 优先，回退到顶层
// ============================================

// 探测当前 install 布局的 plugin 入口路径。
// 优先 dist/（新 install 布局），回退到顶层（legacy 布局）。
function detectPluginEntry() {
  if (existsSync(join(OPENCODE_PLUGIN_DEST, 'dist', 'plugin.js'))) {
    return PLUGIN_ENTRY_DIST;
  }
  if (existsSync(join(OPENCODE_PLUGIN_DEST, 'plugin.js'))) {
    return PLUGIN_ENTRY_TOPLEVEL;
  }
  // 都没装好——让 install 流程中 installOpenCodePluginToHome 之前/之后
  // 调用能拿到一个默认值；这里返回 dist/ 路径，install 时 opencode 会报 404
  // 但不会阻断 install（更糟的体验是 silent skip）
  return PLUGIN_ENTRY_DIST;
}

export async function registerOpenCodePlugin(announce, opts = {}) {
  const configPath = opts.configPath ?? OPENCODE_CONFIG_JSON;
  const entry = opts.entry ?? detectPluginEntry();
  await mkdir(dirname(configPath), { recursive: true });

  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(await readFile(configPath, 'utf8'));
    } catch (err) {
      const backup = `${configPath}.bak-${Date.now()}`;
      await writeFile(backup, await readFile(configPath, 'utf8'), { mode: 0o644 });
      announce(`  ⚠️  现有 ${configPath} JSON 损坏，已备份到 ${backup}，重建为空对象`);
      config = {};
    }
  }

  if (config.plugin && !Array.isArray(config.plugin)) {
    announce('  ⚠️  opencode.json plugin 字段已存在但不是数组，跳过注册（保留用户配置）');
    return false;
  }

  if (!Array.isArray(config.plugin)) config.plugin = [];
  if (config.plugin.includes(entry)) {
    announce(`  (opencode.json plugin 数组已含 ${entry}，跳过)`);
    return false;
  }

  config.plugin.push(entry);
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o644 });
  announce(`  ✓ opencode.json plugin 数组已注册: ${entry}`);
  return true;
}

export async function unregisterOpenCodePlugin(announce, opts = {}) {
  const configPath = opts.configPath ?? OPENCODE_CONFIG_JSON;
  if (!existsSync(configPath)) {
    announce('  (opencode.json 不存在，跳过反注册)');
    return false;
  }

  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    announce('  ⚠️  opencode.json JSON 损坏，跳过反注册');
    return false;
  }

  if (!Array.isArray(config.plugin) || config.plugin.length === 0) {
    announce('  (opencode.json plugin 数组为空或不存在，跳过反注册)');
    return false;
  }

  // 同时移除两种可能的入口（dist/ 和顶层），保持幂等
  const targets = new Set([PLUGIN_ENTRY_DIST, PLUGIN_ENTRY_TOPLEVEL]);
  const before = config.plugin.length;
  config.plugin = config.plugin.filter((p) => !targets.has(p));
  const removed = before - config.plugin.length;
  if (removed === 0) {
    announce('  (opencode.json plugin 数组无 oh-my-sdd 入口，跳过)');
    return false;
  }

  // plugin 数组空了可以删键（保持 JSON 干净）；非空则保留
  if (config.plugin.length === 0) {
    delete config.plugin;
  }
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o644 });
  announce(`  ✓ opencode.json plugin 数组已移除 ${removed} 个 oh-my-sdd 入口: ${configPath}`);
  return true;
}

// ============================================
// Disable / Enable（只改 opencode.json，不碰磁盘文件）
// ============================================

export async function disableOpenCodePlugin(announceFn, opts = {}) {
  const configPath = opts.configPath ?? OPENCODE_CONFIG_JSON;
  if (!existsSync(configPath)) {
    announceFn('  (opencode.json 不存在，无法 disable)');
    return false;
  }

  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    announceFn('  ⚠️  opencode.json JSON 损坏，无法 disable');
    return false;
  }

  config['oh-my-sdd'] = config['oh-my-sdd'] ?? {};
  config['oh-my-sdd'].disabled = true;

  if (Array.isArray(config.plugin)) {
    const targets = new Set([PLUGIN_ENTRY_DIST, PLUGIN_ENTRY_TOPLEVEL]);
    config.plugin = config.plugin.filter((p) => !targets.has(p));
    if (config.plugin.length === 0) delete config.plugin;
  }

  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o644 });
  announceFn(`  ✓ OpenCode plugin disabled (entry removed from ${configPath})`);
  return true;
}

export async function enableOpenCodePlugin(announceFn, opts = {}) {
  const configPath = opts.configPath ?? OPENCODE_CONFIG_JSON;
  const entry = opts.entry ?? detectPluginEntry();

  if (!existsSync(configPath)) {
    announceFn('  (opencode.json 不存在，无法 enable)');
    return false;
  }

  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    announceFn('  ⚠️  opencode.json JSON 损坏，无法 enable');
    return false;
  }

  if (config['oh-my-sdd']) {
    delete config['oh-my-sdd'].disabled;
    if (Object.keys(config['oh-my-sdd']).length === 0) delete config['oh-my-sdd'];
  }

  if (!Array.isArray(config.plugin)) config.plugin = [];
  if (!config.plugin.includes(entry)) {
    config.plugin.push(entry);
  }

  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o644 });
  announceFn(`  ✓ OpenCode plugin enabled (entry added to ${configPath})`);
  return true;
}

// ============================================
// 安装主入口
// ============================================
export async function installForOpenCode({ PACKAGE_ROOT, announce }) {
  if (isHomeDir(process.cwd())) {
    announce('⚠️  当前目录是 HOME 目录，建议 cd 到项目目录后再装（继续执行但会有副作用）');
  }

  announce('→ 安装 OpenCode 适配');
  await copySkillsToDir(join(PACKAGE_ROOT, 'skills'), OPENCODE_SKILLS_DIR, announce);
  await injectOpenCodeBaseline(announce);
  await writeSentinel('opencode', OPENCODE_AGENTS_MD, 'OH-MY-SDD:BEGIN/END', announce);
  await installOpenCodePluginToHome(PACKAGE_ROOT, announce);
  await registerOpenCodePlugin(announce);

  announce('');
  announce('✓ oh-my-sdd (OpenCode) 安装完成');
  announce('');
  announce('下一步：');
  announce('  1. 重启 OpenCode（加载新 skills + plugin）');
  announce('  2. 在项目目录打开 OpenCode，baseline 规则已注入 ~/.config/opencode/AGENTS.md');
  announce('  3. plugin 已注册到 ~/.config/opencode/opencode.json（必须存在才生效）');
  announce('  4. 测试企业约束：问 "你的身份是什么？"，应回复"企业 SDD Agent"');
  announce('');
  announce('卸载（仅清 OpenCode）：oms-uninstall --tool opencode   # 保留 ~/.oh-my-sdd/ 状态目录');
  announce('完整卸载：npm uninstall -g @cli-tools/oh-my-sdd   # preuninstall 自动清三套产物');
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

  // 2. 从 opencode.json plugin 数组移除 oh-my-sdd 入口（先于删 plugin 目录，
  //    顺序不重要但保留用户其他 plugin 入口是核心要求）
  await unregisterOpenCodePlugin(announce);

  // 3. rm plugin 目录
  const pluginRemoved = await rmIfExists(OPENCODE_PLUGIN_DEST);
  if (pluginRemoved) announce(`  ✓ 已删除: ${OPENCODE_PLUGIN_DEST}`);

  // 4. 从 AGENTS.md 删除哨兵块（不破坏用户内容）
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

  // 5. 哨兵文件清理
  const sentinel = await readSentinel('opencode');
  let sentinelRemoved = false;
  if (sentinel) {
    sentinelRemoved = await rmIfExists(sentinelPathFor('opencode'));
    announce(`  ✓ 已删除哨兵文件`);
  }

  // Summary
  const removed = [];
  if (skillsRemoved) removed.push('skills 目录');
  if (pluginRemoved) removed.push('plugin 目录');
  if (sentinelRemoved) removed.push('哨兵文件');
  removed.push('opencode.json plugin 入口');
  removed.push('AGENTS.md 哨兵块');

  announce('');
  announce('📋 卸载摘要：');
  announce(`  删除了 ${removed.length} 项 OpenCode 适配`);
  if (removed.length > 0) {
    announce(`  · ${removed.join('\n  · ')}`);
  }
  announce('');
  announce('提示：oh-my-sdd 状态目录 (~/.oh-my-sdd/) 保留，下次安装无需重新认证。');
  announce('如需完全清除：rm -rf ~/.oh-my-sdd/');
}

// install-opencode.js — OpenCode 安装/卸载实现。
//
// 与 install-lingma.js / install-claude.js 对称。
//
// OpenCode 路径特有逻辑：
//   1. 编译 opencode/src/*.ts → opencode/dist/*.js（用根 build:opencode script）
//   2. 复制 opencode/dist/ → ~/.config/opencode/plugins/oh-my-sdd/
//   3. 在 ~/.config/opencode/opencode.json 加 "plugin": ["oh-my-sdd"]
//   4. 共享 ~/.oh-my-sdd/ 状态目录（与 Claude/Lingma 不变量）
//
// 卸载：
//   1. 删 ~/.config/opencode/plugins/oh-my-sdd/
//   2. 从 opencode.json 移除 "oh-my-sdd" 入口
//   3. 保留 ~/.oh-my-sdd/（除非 --purge）
//
// 与 lingma 路径不同：OpenCode 用 TypeScript 插件（运行时 .js 文件），
// 不是纯 skills/rules 复制。所以 install 流程包含 tsc 编译步骤。
//
// Windows 不支持：OpenCode 主要跑在 macOS/Linux，Windows 安装路径留 TODO。

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const HOME = homedir();

// ============================================
// OpenCode 路径常量
// ============================================
const OPENCODE_CONFIG_DIR = join(HOME, '.config', 'opencode');
const OPENCODE_PLUGINS_DIR = join(OPENCODE_CONFIG_DIR, 'plugins');
const OPENCODE_PLUGIN_DIR = join(OPENCODE_PLUGINS_DIR, 'oh-my-sdd');
const OPENCODE_JSON = join(OPENCODE_CONFIG_DIR, 'opencode.json');

function announce(msg) {
  process.stderr.write(msg + '\n');
}

// ============================================
// 探测 OpenCode 是否安装
// ============================================
export function isOpenCodeInstalled() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['opencode'], { stdio: 'ignore' });
    return true;
  } catch {
    // fallback: 检测 ~/.config/opencode/ 目录
    return existsSync(OPENCODE_CONFIG_DIR);
  }
}

// ============================================
// 编译 opencode/src → opencode/dist
// ============================================
function buildOpencodePlugin(packageRoot) {
  announce('  编译 opencode TypeScript → JavaScript...');
  execFileSync('npm', ['run', 'build:opencode', '--silent'], {
    cwd: packageRoot,
    stdio: 'pipe',
  });
  announce('  ✓ 编译完成');
}

// ============================================
// 复制 opencode/dist → ~/.config/opencode/plugins/oh-my-sdd/
// ============================================
function copyDistToPluginDir(packageRoot) {
  const distDir = join(packageRoot, 'opencode', 'dist');
  if (!existsSync(distDir)) {
    throw new Error(`opencode/dist/ 不存在，请先跑 npm run build:opencode`);
  }
  mkdirSync(OPENCODE_PLUGIN_DIR, { recursive: true });
  const files = readdirSync(distDir);
  for (const f of files) {
    copyFileSync(join(distDir, f), join(OPENCODE_PLUGIN_DIR, f));
  }
  announce(`  ✓ 复制到: ${OPENCODE_PLUGIN_DIR}`);
}

// ============================================
// 修改 opencode.json 加 "plugin": ["oh-my-sdd"]
// ============================================
function patchOpencodeJson() {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(OPENCODE_JSON, 'utf8'));
  } catch { /* fresh */ }
  const plugins = Array.isArray(cfg.plugin) ? [...cfg.plugin] : [];
  if (!plugins.includes('oh-my-sdd')) {
    plugins.push('oh-my-sdd');
  }
  cfg.plugin = plugins;
  mkdirSync(dirname(OPENCODE_JSON), { recursive: true });
  writeFileSync(OPENCODE_JSON, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o644 });
  announce(`  ✓ opencode.json 已加 "plugin": ["oh-my-sdd"]`);
}

// ============================================
// 安装主入口
// ============================================
export async function installForOpencode({ PACKAGE_ROOT, announce: ann = announce }) {
  ann('→ 安装 OpenCode 适配');

  // soft check: OpenCode 是否在
  if (!isOpenCodeInstalled()) {
    ann('⚠️  未检测到 OpenCode。继续安装（plugin 写到目录里等用户用），但 OpenCode 不在时不生效。');
    ann('    安装: https://opencode.ai');
  }

  buildOpencodePlugin(PACKAGE_ROOT);
  copyDistToPluginDir(PACKAGE_ROOT);
  patchOpencodeJson();

  ann('');
  ann('✓ oh-my-sdd (OpenCode) 安装完成');
  ann('');
  ann('下一步：');
  ann('  1. 启动 OpenCode（自动加载 oh-my-sdd 插件）');
  ann('  2. 在 OpenCode 中试 /sdd-spec <change-name>');
  ann('  3. 测试 HARD_RULE：写一个含 AKIA 硬编码的文件，应被阻断');
  ann('');
  ann('卸载（仅清 opencode）：oms-uninstall --tool opencode');
  ann('完整卸载：npm uninstall -g @cli-tools/oh-my-sdd');
}

// ============================================
// 卸载
// ============================================
function rmIfExists(p) {
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    return true;
  }
  return false;
}

export async function uninstallForOpencode() {
  announce('→ 卸载 OpenCode 适配');

  // 1. 删 plugin 目录
  if (rmIfExists(OPENCODE_PLUGIN_DIR)) {
    announce(`  ✓ 已删除: ${OPENCODE_PLUGIN_DIR}`);
  }

  // 2. 从 opencode.json 移除 "oh-my-sdd"
  if (existsSync(OPENCODE_JSON)) {
    let cfg;
    try {
      cfg = JSON.parse(readFileSync(OPENCODE_JSON, 'utf8'));
    } catch {
      announce('  ⚠️  opencode.json JSON 损坏，跳过');
      cfg = null;
    }
    if (cfg && Array.isArray(cfg.plugin)) {
      cfg.plugin = cfg.plugin.filter((p) => p !== 'oh-my-sdd');
      if (cfg.plugin.length === 0) delete cfg.plugin;
      writeFileSync(OPENCODE_JSON, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o644 });
      announce(`  ✓ 已从 opencode.json 移除 "oh-my-sdd"`);
    }
  }

  // 3. 保留 ~/.oh-my-sdd/ 状态目录（除非 --purge 由 caller 处理）
}

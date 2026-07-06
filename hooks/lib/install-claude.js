// install-claude.js — Claude Code 路径的安装/卸载实现。
//
// 与 install-targets.js 对称：后者处理 OpenCode 和通义灵码 Qoder CN。
//
// Claude 路径特有逻辑：
//   1. 注册 marketplace（`claude plugin marketplace add`）
//   2. 安装 plugin（`claude plugin install oh-my-sdd@oh-my-sdd`）
//   3. 安装 Claude CLI wrapper（拦截原 claude，注入企业 baseline）
//
// 与通用路径的关系：
//   - hooks/*.js 零修改（与 OpenCode/Qoder 共用）
//   - skills 仍走 ~/.claude/skills/（plugin marketplace 自动处理）
//   - baseline 走 ~/.config/claude-enterprise/baseline.md（wrapper 注入）
//
// 失败语义：Claude CLI 缺失时，调用 ensureStateDir()（smoke-check 依赖此副作用）
// 然后 process.exit(1)，由 main() 调度器捕获。

import { execFileSync, spawn } from 'node:child_process';
import { installWrapper, findClaudeOriginal } from './wrapper.js';
import { ensureStateDir } from './state-dir.js';

const MARKETPLACE_NAME = 'oh-my-sdd';
const PLUGIN_NAME = 'oh-my-sdd';

function announce(msg) {
  process.stderr.write(msg + '\n');
}

export function isClaudeInstalled() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['claude'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runClaude(args) {
  return new Promise((resolve) => {
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: -1, stdout: '', stderr: err.message }));
  });
}

async function registerMarketplace(packageRoot) {
  // Register (or refresh) the marketplace pointing at our package directory.
  // `claude plugin marketplace add` is idempotent — re-running on upgrade just
  // refreshes the cache.
  const result = await runClaude(['plugin', 'marketplace', 'add', packageRoot]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('already') || out.includes('exists') || out.includes('replace')) {
      announce('  (marketplace 已注册，跳过)');
    } else {
      process.stderr.write(`⚠️  claude plugin marketplace add 失败 (exit ${result.code}):\n`);
      process.stderr.write(result.stderr || result.stdout || '(no output)\n');
      process.stderr.write(`    请手动运行：claude plugin marketplace add ${packageRoot}\n`);
    }
    return;
  }
  announce(`  ✓ 已注册 marketplace：${packageRoot}`);
}

async function installPlugin() {
  const result = await runClaude(['plugin', 'install', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
  if (result.code !== 0) {
    const out = (result.stderr + result.stdout).toLowerCase();
    if (out.includes('already') || out.includes('installed')) {
      announce('  (plugin 已安装，跳过)');
    } else {
      process.stderr.write(`⚠️  claude plugin install 失败 (exit ${result.code}):\n`);
      process.stderr.write(result.stderr || result.stdout || '(no output)\n');
      process.stderr.write(`    请手动运行：claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
    }
    return;
  }
  announce(`  ✓ 已安装 plugin：${PLUGIN_NAME}@${MARKETPLACE_NAME}`);
}

/**
 * Claude Code 安装主入口。
 *
 * @param {Object} options
 * @param {string} options.PACKAGE_ROOT - 插件根目录绝对路径
 * @returns {Promise<void>}
 */
export async function installForClaude({ PACKAGE_ROOT }) {
  announce('→ 检查 Node 版本与 iam CLI');
  // preflight 由 main() 调度器统一调用，此处不重复

  if (!isClaudeInstalled()) {
    process.stderr.write('\n❌ 未检测到 claude CLI。请手动执行：\n');
    process.stderr.write(`  claude plugin marketplace add ${PACKAGE_ROOT}\n`);
    process.stderr.write(`  claude plugin install ${PLUGIN_NAME}@${MARKETPLACE_NAME}\n`);
    // 先创建 state dir + config，再退出。smoke-check 依赖此副作用存在性
    // 验证 install 流程走到了初始化阶段，而不管 claude CLI 是否存在。
    await ensureStateDir();
    process.exit(1);
  }

  announce('→ 初始化 ~/.oh-my-sdd/ 状态目录');
  await ensureStateDir();

  announce('→ 注册 marketplace');
  await registerMarketplace(PACKAGE_ROOT);

  announce('→ 安装 plugin');
  await installPlugin();

  // 安装 Claude wrapper（自动注入企业规则）
  const originalClaude = findClaudeOriginal();
  if (originalClaude) {
    announce('→ 安装 Claude CLI wrapper（企业规则自动注入）');
    await installWrapper(PACKAGE_ROOT, announce);
  } else {
    announce('⚠️  Claude CLI wrapper 未安装（未找到原 Claude）');
    announce('    安装 Claude CLI 后，运行 npm reinstall @cli-tools/oh-my-sdd');
  }

  announce('');
  announce('✓ oh-my-sdd (Claude Code) 安装完成');
  announce('');
  announce('下一步：');
  announce('  1. 重启终端（使 PATH 生效）');
  announce('  2. 运行 `oms-login` 完成 iam 身份认证');
  announce('  3. 重启 Claude Code (或 /reload-plugins)');
  announce('  4. 测试企业约束: claude "你的身份是什么？"');
  announce('');
  announce('绕过企业约束: claude --no-enterprise ...');
}

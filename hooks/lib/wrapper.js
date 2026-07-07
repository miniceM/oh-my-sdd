import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, rm, access, constants } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { isWindows, getHomeDir } from './platform.js';

// ============================================
// 目录配置（用户级，无需管理员权限）
// ============================================
export function getWrapperBinDir() {
  if (isWindows()) {
    return path.join(getHomeDir(), 'bin');
  }
  return path.join(getHomeDir(), '.local', 'bin');
}

export function getEnterpriseConfigDir() {
  if (isWindows()) {
    return path.join(getHomeDir(), 'AppData', 'Roaming', 'ClaudeEnterprise');
  }
  return path.join(getHomeDir(), '.config', 'claude-enterprise');
}

export function getRulesPath() {
  return path.join(getEnterpriseConfigDir(), 'baseline.md');
}

// ============================================
// 查找原 Claude binary
// ============================================
export function findClaudeOriginal() {
  const wrapperDir = getWrapperBinDir();
  const homeDir = getHomeDir();

  // 优先使用备份 symlink（即使在 wrapper 目录也有效）
  const backupName = isWindows() ? 'claude-original.exe' : 'claude-original';
  const backupPath = path.join(wrapperDir, backupName);
  if (existsSync(backupPath)) {
    // 备份 symlink 或不同文件名，可以使用
    return backupPath;
  }

  // 常见安装位置（按优先级）
  const locations = isWindows()
    ? [
        path.join(homeDir, 'AppData', 'Local', 'Claude', 'claude.exe'),
        path.join(homeDir, '.claude', 'bin', 'claude.exe'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Claude', 'claude.exe'),
      ]
    : [
        path.join(homeDir, '.claude', 'bin', 'claude'),
        '/usr/local/bin/claude',
        '/usr/bin/claude',
        '/opt/homebrew/bin/claude',  // Homebrew (macOS Apple Silicon)
        '/Applications/Claude.app/Contents/MacOS/claude',
      ];

  for (const loc of locations) {
    if (existsSync(loc)) {
      const locDir = path.dirname(loc);
      if (locDir !== wrapperDir) {
        return loc;
      }
    }
  }

  // 从 PATH 查找（排除 wrapper 目录）
  const cmd = isWindows() ? 'where' : 'which';
  try {
    const result = execFileSync(cmd, ['claude'], { encoding: 'utf8' }).trim();
    const resultDir = path.dirname(result);
    if (resultDir !== wrapperDir) {
      return result;
    }
  } catch {
    // PATH 中未找到
  }

  return null;
}

// ============================================
// 检查 wrapper 是否已安装
// ============================================
export function isWrapperInstalled() {
  const binDir = getWrapperBinDir();
  const wrapperName = isWindows() ? 'claude.ps1' : 'claude';
  const wrapperPath = path.join(binDir, wrapperName);
  return existsSync(wrapperPath);
}

// ============================================
// 安装 wrapper
// ============================================
export async function installWrapper(packageRoot, announce = console.log) {
  const binDir = getWrapperBinDir();
  const configDir = getEnterpriseConfigDir();
  const rulesPath = getRulesPath();

  // 查找原 Claude
  const originalClaude = findClaudeOriginal();
  if (!originalClaude) {
    announce('⚠️  未找到 Claude CLI，wrapper 安装跳过');
    announce('    请先安装 Claude CLI 后手动运行：oms-wrapper-install');
    return false;
  }

  announce(`  查找到原 Claude: ${originalClaude}`);

  // 创建目录
  await mkdir(binDir, { recursive: true });
  await mkdir(configDir, { recursive: true });

  // 备份原 binary
  const backupName = isWindows() ? 'claude-original.exe' : 'claude-original';
  const backupPath = path.join(binDir, backupName);

  if (existsSync(backupPath)) {
    announce('  (备份已存在，跳过)');
  } else {
    // Windows symlink 需管理员权限，用复制替代
    if (isWindows()) {
      await copyFile(originalClaude, backupPath);
    } else {
      // POSIX 用 symlink（节省空间）
      try {
        await access(originalClaude, constants.F_OK);
        // symlink 指向原文件
        const { symlink } = await import('node:fs/promises');
        await symlink(originalClaude, backupPath);
      } catch {
        // symlink 失败时用复制
        await copyFile(originalClaude, backupPath);
      }
    }
    announce(`  ✓ 已备份原 Claude: ${backupPath}`);
  }

  // 安装 wrapper scripts
  const wrapperSourceDir = path.join(packageRoot, 'wrappers');

  if (isWindows()) {
    // Windows: 安装 .ps1 和 .bat
    await copyFile(
      path.join(wrapperSourceDir, 'claude.ps1'),
      path.join(binDir, 'claude.ps1')
    );
    await copyFile(
      path.join(wrapperSourceDir, 'claude.bat'),
      path.join(binDir, 'claude.bat')
    );
    announce(`  ✓ 已安装 wrapper: ${path.join(binDir, 'claude.ps1')}`);
  } else {
    // POSIX: 安装 .sh
    const wrapperPath = path.join(binDir, 'claude');
    await copyFile(path.join(wrapperSourceDir, 'claude.sh'), wrapperPath);
    // 确保可执行
    const { chmod } = await import('node:fs/promises');
    await chmod(wrapperPath, 0o755);
    announce(`  ✓ 已安装 wrapper: ${wrapperPath}`);
  }

  // 安装规则文件（content/ 是单一源，与 session-start.js 注入路径一致）
  const rulesSource = path.join(packageRoot, 'content', 'enterprise-baseline.md');
  if (existsSync(rulesSource)) {
    await copyFile(rulesSource, rulesPath);
    announce(`  ✓ 已安装规则: ${rulesPath}`);
  } else {
    announce('⚠️  规则文件不存在，使用 --append-system-prompt-file 需手动配置');
  }

  // 配置 PATH
  return await configurePath(binDir, announce);
}

// ============================================
// 配置 PATH
// ============================================
async function configurePath(binDir, announce) {
  if (isWindows()) {
    // Windows: 修改用户级 PATH 环境变量
    const currentPath = process.env.PATH || '';
    if (currentPath.includes(binDir)) {
      announce('  (PATH 已包含 bin 目录)');
      return true;
    }

    // 使用 PowerShell 修改用户级 PATH
    try {
      // 先获取当前用户 PATH
      const psGetPath = `[Environment]::GetEnvironmentVariable("PATH", "User")`;
      let currentUserPath = '';
      try {
        const result = execFileSync('powershell', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psGetPath
        ], { encoding: 'utf8' });
        currentUserPath = result.trim();
      } catch {
        currentUserPath = currentPath;
      }

      if (!currentUserPath.includes(binDir)) {
        const newPath = `${binDir};${currentUserPath}`;
        const psSetPath = `[Environment]::SetEnvironmentVariable("PATH", "${newPath}", "User")`;
        execFileSync('powershell', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psSetPath
        ]);
        announce(`  ✓ 已添加 ${binDir} 到用户 PATH`);
        announce('  ⚠️  请重启终端生效');
      }
      return true;
    } catch (err) {
      announce(`⚠️  PATH 配置失败: ${err.message}`);
      announce(`    请手动添加 ${binDir} 到 PATH`);
      return false;
    }
  } else {
    // POSIX: 修改 shell config
    const homeDir = getHomeDir();
    const shellConfigs = ['.zshrc', '.bashrc', '.bash_profile'];
    const pathLine = `export PATH="${binDir}:$PATH"`;

    for (const cfg of shellConfigs) {
      const cfgPath = path.join(homeDir, cfg);
      if (existsSync(cfgPath)) {
        const { readFile } = await import('node:fs/promises');
        const content = await readFile(cfgPath, 'utf8');
        if (content.includes(binDir) || content.includes('.local/bin')) {
          announce('  (PATH 已配置)');
          return true;
        }
      }
    }

    // 添加到 .zshrc（macOS 默认）或 .bashrc（Linux 默认）
    const targetCfg = process.platform === 'darwin' ? '.zshrc' : '.bashrc';
    const targetPath = path.join(homeDir, targetCfg);

    try {
      const { appendFile } = await import('node:fs/promises');
      const header = '\n# Claude Enterprise wrapper (oh-my-sdd)\n';
      await appendFile(targetPath, header + pathLine + '\n');
      announce(`  ✓ 已配置 PATH 到 ~/.${targetCfg}`);
      announce('  ⚠️  请运行: source ~/.' + targetCfg + ' 或重启终端');
      return true;
    } catch (err) {
      announce(`⚠️  PATH 配置失败: ${err.message}`);
      announce(`    请手动添加到 ~/.${targetCfg}: ${pathLine}`);
      return false;
    }
  }
}

// ============================================
// 卸载 wrapper
// ============================================
export async function uninstallWrapper(announce = console.log) {
  const binDir = getWrapperBinDir();

  // 删除 wrapper scripts
  const wrapperFiles = isWindows()
    ? ['claude.ps1', 'claude.bat', 'claude-original.exe']
    : ['claude', 'claude-original'];

  for (const file of wrapperFiles) {
    const filePath = path.join(binDir, file);
    if (existsSync(filePath)) {
      await rm(filePath, { force: true });
      announce(`  ✓ 已删除: ${filePath}`);
    }
  }

  // 询问删除规则文件
  const rulesPath = getRulesPath();
  if (existsSync(rulesPath)) {
    // 默认保留规则文件（用户可能有自定义）
    announce(`  规则文件保留: ${rulesPath}`);
    announce('    若需删除，请手动执行');
  }

  // 从 PATH 移除（可选）
  announce('  PATH 配置保留（不影响其他工具）');

  announce('✓ wrapper 卸载完成');
  announce('  原 Claude CLI 不受影响，可正常使用');
  return true;
}

// ============================================
// 验证安装
// ============================================
export function verifyWrapper(announce = console.log) {
  const binDir = getWrapperBinDir();
  const rulesPath = getRulesPath();

  // 检查 wrapper
  const wrapperName = isWindows() ? 'claude.ps1' : 'claude';
  const wrapperPath = path.join(binDir, wrapperName);
  if (existsSync(wrapperPath)) {
    announce(`✓ Wrapper: ${wrapperPath}`);
  } else {
    announce('✗ Wrapper 未安装');
    return false;
  }

  // 检查备份
  const backupName = isWindows() ? 'claude-original.exe' : 'claude-original';
  const backupPath = path.join(binDir, backupName);
  if (existsSync(backupPath)) {
    announce(`✓ 原 Claude 备份: ${backupPath}`);
  } else {
    announce('⚠ 原 Claude 备份不存在');
  }

  // 检查规则
  if (existsSync(rulesPath)) {
    announce(`✓ 规则文件: ${rulesPath}`);
  } else {
    announce('✗ 规则文件不存在');
    return false;
  }

  // 检查 PATH
  const currentPath = process.env.PATH || '';
  if (currentPath.includes(binDir)) {
    announce('✓ PATH 已包含 bin 目录');
  } else {
    announce('⚠ PATH 未包含 bin 目录（请重启终端）');
  }

  return true;
}
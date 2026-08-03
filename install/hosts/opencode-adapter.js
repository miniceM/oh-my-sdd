// install/hosts/opencode-adapter.js — OpenCode 安装/卸载入口。
//
// Production installs register the npm package in opencode.json. OpenCode
// resolves and updates the package; local plugin paths are retained only for
// backwards-compatible uninstall cleanup.
//
// Windows 不支持：OpenCode 主要跑在 macOS/Linux。

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { HostAdapter } from '../host-adapter.js';
import { rmIfExistsSync } from '../common/fs.js';
import { isCliInPath, isDirPresent } from '../common/detect.js';
import { SDD_COMMANDS } from '../../lib/command-generator.js';
import { patchOpencodeJson, unpatchOpencodeJson } from '../common/config-patcher.js';
import { removeSentinelBlock } from '../common/sentinel.js';
import { main as cleanupNpmResources } from '../../opencode/scripts/uninstall.mjs';
import {
  OPENCODE_PLUGIN_DIR,
  OPENCODE_COMMANDS_DIR,
  OPENCODE_CONFIG_DIR,
  OPENCODE_AGENTS_MD,
} from '../../lib/paths.js';

export class OpenCodeAdapter extends HostAdapter {
  static id = 'opencode';
  static displayName = 'OpenCode';

  static isInstalled() {
    if (isCliInPath('opencode')) return true;
    // fallback: 检测 ~/.config/opencode/ 目录
    return isDirPresent(OPENCODE_CONFIG_DIR);
  }

  static preflight(ctx) {
    if (!this.isInstalled()) {
      ctx.announce('⚠️  未检测到 OpenCode。继续安装，但 OpenCode 不在时不生效。');
      ctx.announce('    安装: https://opencode.ai');
    }
  }

  static async install(ctx) {
    const { announce } = ctx;

    announce('→ 安装 OpenCode 适配');
    announce('');
    announce('  通过 npm 插件安装（由 OpenCode 自动安装和更新）');
    patchOpencodeJson();

    announce('');
    announce('✓ oh-my-sdd (OpenCode) npm 插件安装完成');
    announce('');
    announce('下一步：');
    announce('  1. 启动 OpenCode（自动安装并加载 oh-my-sdd 插件）');
    announce('  2. 在 OpenCode 中试 /sdd-spec <change-name>');
    announce('');
    announce('卸载：oms-uninstall --tool opencode');
  }

  static async uninstall(ctx) {
    const { announce } = ctx;

    announce('→ 卸载 OpenCode 适配');

    // 1. 删 plugin 目录
    if (rmIfExistsSync(OPENCODE_PLUGIN_DIR)) {
      announce(`  ✓ 已删除: ${OPENCODE_PLUGIN_DIR}`);
    }

    // 2. 删 command 文件
    if (existsSync(OPENCODE_COMMANDS_DIR)) {
      let removed = 0;
      for (const cmd of SDD_COMMANDS) {
        const f = join(OPENCODE_COMMANDS_DIR, `${cmd.name}.md`);
        if (rmIfExistsSync(f)) {
          removed++;
        }
      }
      if (removed > 0) {
        announce(`  ✓ 已删除 ${removed} 个 slash command 文件`);
      }
    }

    // 3. 从 opencode.json 移除
    unpatchOpencodeJson();

    // 4. 精准移除 fallback AGENTS.md 中的 OMS 区块，保留用户内容
    if (existsSync(OPENCODE_AGENTS_MD)) {
      const existing = readFileSync(OPENCODE_AGENTS_MD, 'utf8');
      const preserved = removeSentinelBlock(existing);
      if (preserved.length === 0) unlinkSync(OPENCODE_AGENTS_MD);
      else writeFileSync(OPENCODE_AGENTS_MD, preserved);
    }

    // 5. 清理 npm postinstall 写入的资源，并恢复被覆盖前的用户文件。
    cleanupNpmResources({
      warn: (message) => announce(`  ⚠️  ${message}`),
      log: (message) => announce(`  ✓ ${message}`),
    });

    // 6. 保留其余 ~/.oh-my-sdd/ 状态（除非 --purge 由 caller 处理）
  }
}

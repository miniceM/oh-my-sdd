// install/hosts/opencode-adapter.js — OpenCode 安装/卸载入口。
//
// Production installs register the npm package in opencode.json. OpenCode
// resolves and updates the package; local plugin paths are retained only for
// backwards-compatible uninstall cleanup.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { HostAdapter } from '../host-adapter.js';
import { rmIfExistsSync } from '../common/fs.js';
import { isCliInPath, isDirPresent } from '../common/detect.js';
import { patchOpencodeJson, unpatchOpencodeJson } from '../common/config-patcher.js';
import { removeSentinelBlock } from '../common/sentinel.js';
import { main as cleanupNpmResources } from '../../opencode/scripts/uninstall.mjs';
import {
  OPENCODE_PLUGIN_DIR,
  OPENCODE_CONFIG_DIR,
  OPENCODE_AGENTS_MD,
  OPENCODE_JSON,
  OPENCODE_COMMANDS_DIR,
  OPENCODE_PLUGIN_ENTRY,
} from '../../lib/paths.js';

function inspectAvailability(check, source) {
  try {
    const available = Boolean(check());
    return { available, state: available ? 'available' : 'missing', source };
  } catch (error) {
    return {
      available: false, state: 'unknown', source,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export class OpenCodeAdapter extends HostAdapter {
  static id = 'opencode';
  static displayName = 'OpenCode';

  static isInstalled() {
    if (isCliInPath('opencode')) return true;
    // fallback: 检测 ~/.config/opencode/ 目录
    return isDirPresent(OPENCODE_CONFIG_DIR);
  }

  static describe() {
    const cli = inspectAvailability(() => isCliInPath('opencode'), 'opencode CLI PATH probe');
    const config = inspectAvailability(
      () => isDirPresent(OPENCODE_CONFIG_DIR),
      `configuration directory probe: ${OPENCODE_CONFIG_DIR}`,
    );
    const detected = cli.available || config.available;
    const detectionState = detected ? 'available'
      : (cli.state === 'unknown' || config.state === 'unknown' ? 'unknown' : 'missing');

    return {
      id: this.id,
      display_name: this.displayName,
      detected,
      dependencies: [
        {
          name: 'node', required: true, available: true, state: 'available',
          version: { state: 'available', value: process.version }, source: 'current Node.js process',
        },
        { name: 'opencode', required: false, ...cli, version: { state: 'unknown', reason: 'PATH discovery does not retain a CLI version.' } },
        { name: 'opencode-config', required: false, ...config, version: { state: 'unknown', reason: 'Configuration directory presence has no version evidence.' } },
      ],
      capabilities: {
        host_runtime: {
          supported: detected,
          level: detectionState === 'unknown' ? 'unknown' : 'detected',
          evidence: detected ? (cli.available ? cli.source : config.source) : 'OpenCode CLI and configuration directory were not detected.',
          version: { state: 'unknown', reason: 'The adapter only performs availability probes.' },
        },
        write_prevention: {
          supported: false,
          level: 'unknown',
          evidence: 'Plugin registration writes configuration only; runtime loading and write prevention require host-runtime evidence.',
        },
      },
      resources: [
        { type: 'config', path: OPENCODE_JSON, action: 'patch', owned: true },
        {
          type: 'npm-plugin', id: OPENCODE_PLUGIN_ENTRY, path: OPENCODE_JSON,
          action: 'register-plugin', enforcement: 'registered', owned: true,
        },
        { type: 'plugin-resources', path: OPENCODE_PLUGIN_DIR, action: 'synchronize', owned: true },
        { type: 'commands', path: OPENCODE_COMMANDS_DIR, action: 'synchronize', owned: true },
        { type: 'agents', path: OPENCODE_AGENTS_MD, action: 'update', owned: true },
        { type: 'runtime', path: OPENCODE_CONFIG_DIR, action: 'await-host-load', owned: false },
      ],
      risks: [
        {
          category: 'runtime', level: 'warning',
          message: 'Registering the npm plugin does not prove that OpenCode has downloaded, loaded, or enforced it; wait for the host runtime to load it.',
        },
      ],
      recommendation: {
        action: detectionState === 'unknown' ? 'inspect' : 'install',
        reason: 'Register the npm plugin and synchronize resources, then start OpenCode and verify runtime loading separately.',
      },
    };
  }

  static preflight(ctx) {
    if (!this.isInstalled()) {
      ctx.announce('⚠️  未检测到 OpenCode。继续安装，但 OpenCode 不在时不生效。');
      ctx.announce('    安装: https://opencode.ai');
    }
  }

  static async inspectRuntime(ctx = {}) {
    const hasConfig = existsSync(OPENCODE_JSON);
    let isRegistered = false;
    if (hasConfig) {
      try {
        const config = JSON.parse(readFileSync(OPENCODE_JSON, "utf8"));
        const plugins = Array.isArray(config.plugin) ? config.plugin : [];
        isRegistered = plugins.includes(OPENCODE_PLUGIN_ENTRY);
      } catch {}
    }
    return {
      written: {
        state: hasConfig ? "verified" : "missing",
        evidence: hasConfig ? "Config exists at " + OPENCODE_JSON : "Config file missing",
      },
      registered: {
        state: isRegistered ? "verified" : "missing",
        evidence: isRegistered ? "Plugin " + OPENCODE_PLUGIN_ENTRY + " registered in config" : "Plugin entry missing from config",
      },
      loaded: { state: "unknown", reason: "OpenCode host launch evidence unavailable" },
      enforced: { state: "unknown", reason: "Write prevention evidence requires active runtime" },
    };
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

    // 2. 从 opencode.json 移除
    unpatchOpencodeJson();

    // 3. 精准移除 fallback AGENTS.md 中的 OMS 区块，保留用户内容
    if (existsSync(OPENCODE_AGENTS_MD)) {
      const existing = readFileSync(OPENCODE_AGENTS_MD, 'utf8');
      const preserved = removeSentinelBlock(existing);
      if (preserved.length === 0) unlinkSync(OPENCODE_AGENTS_MD);
      else writeFileSync(OPENCODE_AGENTS_MD, preserved);
    }

    // 4. 仅通过 ownership manifest 清理 npm postinstall 写入的资源。
    // 用户修改过的 command 会被保留为带 .oh-my-sdd-modified-* 后缀的同级文件。
    cleanupNpmResources({
      warn: (message) => announce(`  ⚠️  ${message}`),
      log: (message) => announce(`  ✓ ${message}`),
    });

    // 5. 保留其余 ~/.oh-my-sdd/ 状态（除非 --purge 由 caller 处理）
  }
}

// install/hosts/opencode-adapter.js — OpenCode 安装/卸载入口。
//
// Production installs delegate plugin registration to the OpenCode CLI; local
// plugin paths are retained only for backwards-compatible uninstall cleanup.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HostAdapter } from '../host-adapter.js';
import { rmIfExistsSync } from '../common/fs.js';
import { isCliInPath } from '../common/detect.js';
import { unpatchOpencodeJson } from '../common/config-patcher.js';
import { removeSentinelBlock } from '../common/sentinel.js';
import { getHomeDir } from '../../lib/platform.js';
import { main as cleanupNpmResources } from '../../opencode/scripts/uninstall.mjs';
import { readOwnershipManifest, resourceDigest } from '../../opencode/scripts/resource-ownership.mjs';
import { getAgentsPath, getOpenCodeConfigDir } from '../../opencode/scripts/agents-md.mjs';
import { executePlan, summarizeExecution } from '../control-plane/executor.js';
import {
  OPENCODE_PLUGIN_ENTRY,
} from '../../lib/paths.js';

const DEFERRED_LOAD_ACTION = '重启 OpenCode 后完成插件加载；随后可运行 oms doctor --tool opencode 查看注册状态。';

export function buildOpenCodeInvocation(
  args,
  { platform = process.platform, comspec = process.env.ComSpec } = {},
) {
  if (platform === 'win32') {
    return {
      command: comspec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'opencode', ...args],
    };
  }
  return { command: 'opencode', args };
}

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

function inspectCliVersion(available) {
  if (!available) {
    return { state: 'unknown', value: 'unknown', reason: 'OpenCode CLI was not found on PATH.' };
  }
  try {
    const value = execFileSync('opencode', ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return value
      ? { state: 'available', value, source: 'opencode --version' }
      : { state: 'unknown', value: 'unknown', reason: 'opencode --version returned no output.' };
  } catch (error) {
    return {
      state: 'unknown',
      value: 'unknown',
      reason: `Unable to run opencode --version: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function getOpenCodePaths() {
  // Do not rely on os.homedir() alone here. On Linux, Node may resolve the
  // passwd database home even when a caller deliberately supplies HOME (as
  // the installer tests and isolated package managers do). All OpenCode
  // paths must follow the effective process environment so a sandbox cannot
  // leak writes into the invoking user's real home directory.
  const home = getHomeDir();
  const configDir = getOpenCodeConfigDir(home);
  return {
    configDir,
    pluginDir: join(configDir, 'plugins', 'oh-my-sdd'),
    json: join(configDir, 'opencode.json'),
    commandsDir: join(configDir, 'commands'),
    skillsDir: join(configDir, 'skills'),
    agents: getAgentsPath(home),
    manifest: join(home, '.oh-my-sdd', 'opencode-npm-resources.json'),
  };
}

function dependency(name, { required, available, state, source, version, reason } = {}) {
  return {
    name,
    required,
    classification: required ? 'required' : 'optional',
    available,
    state,
    source,
    version: version || { state: 'unknown', value: 'unknown', reason: reason || 'Version evidence unavailable.' },
    ...(reason ? { reason } : {}),
  };
}

function readRuntimeConfig() {
  const paths = getOpenCodePaths();
  if (!existsSync(paths.json)) {
    return { state: 'missing', path: paths.json, reason: `Config file missing: ${paths.json}` };
  }
  try {
    return { state: 'valid', path: paths.json, config: JSON.parse(readFileSync(paths.json, 'utf8')) };
  } catch (error) {
    return { state: 'invalid', path: paths.json, reason: `Invalid JSON in ${paths.json}: ${error.message}` };
  }
}

function postinstallEvidence() {
  const paths = getOpenCodePaths();
  const manifest = paths.manifest;
  const checks = [
    [paths.skillsDir, 'OpenCode managed skills directory'],
    [paths.commandsDir, 'OpenCode managed commands directory'],
    [paths.agents, 'OpenCode AGENTS.md'],
    [manifest, 'npm ownership manifest'],
  ];
  const missingChecks = checks.filter(([path]) => !existsSync(path));
  const manifestRecords = readOwnershipManifest(manifest);
  const missingTargets = manifestRecords
    .filter((record) => !existsSync(record.target))
    .map((record) => record.target);
  const drifted = manifestRecords.map((record) => {
    if (!existsSync(record.target)) return null;
    try {
      const current = resourceDigest(record.target);
      return current === record.installed_digest ? null : { ...record, current_digest: current };
    } catch {
      return { ...record, current_digest: null };
    }
  }).filter(Boolean);
  if (drifted.length > 0) {
    const first = drifted[0];
    return {
      state: 'drifted',
      path: first.target,
      current_digest: first.current_digest,
      expected_digest: first.installed_digest,
      evidence: `npm ownership manifest digest mismatch detected at ${first.target}`,
      reason: `User modification detected in ${first.target}; OMS will not overwrite it.`,
      next_action: 'Review the user change and handle it manually; repair preserves modified resources.',
    };
  }
  if (missingChecks.length === 0 && missingTargets.length === 0 && manifestRecords.length > 0) {
    return { state: 'verified', evidence: 'npm postinstall resources and ownership manifest are present' };
  }
  return {
    state: 'pending',
    paths: [...missingChecks.map(([path]) => path), ...missingTargets],
    evidence: `Checked npm lifecycle outputs: ${checks.map(([path, label]) => `${label} (${path})`).join('; ')}`,
    reason: `npm lifecycle has not completed; missing ${[
      ...missingChecks.map(([path, label]) => `${label} (${path})`),
      ...missingTargets,
    ].join(', ') || 'valid ownership records'}`,
    next_action: 'Start OpenCode to run the plugin lifecycle, then run oms doctor --tool opencode.',
  };
}

export class OpenCodeAdapter extends HostAdapter {
  static id = 'opencode';
  static displayName = 'OpenCode';

  static isInstalled() {
    if (isCliInPath('opencode')) return true;
    // A bare config directory is common on runner images and is not enough
    // evidence that OpenCode is installed. Require its actual config file for
    // the non-CLI fallback to avoid selecting OpenCode during default install.
    return existsSync(getOpenCodePaths().json);
  }

  static describe() {
    const paths = getOpenCodePaths();
    const cli = inspectAvailability(() => isCliInPath('opencode'), 'opencode CLI PATH probe');
    const config = inspectAvailability(
      () => existsSync(paths.json),
      `configuration file probe: ${paths.json}`,
    );
    const detected = cli.available || config.available;
    const detectionState = detected ? 'available'
      : (cli.state === 'unknown' || config.state === 'unknown' ? 'unknown' : 'missing');
    const cliVersion = inspectCliVersion(cli.available);

    return {
      id: this.id,
      display_name: this.displayName,
      detected,
      scope: {
        kind: 'global',
        path: paths.configDir,
        project_supported: false,
        reason: 'oms-install manages the global OpenCode configuration; project-level resources are owned by npm postinstall.',
      },
      dependencies: [
        dependency('node', {
          required: true,
          available: true,
          state: 'available',
          source: 'current Node.js process',
          version: { state: 'available', value: process.version, source: 'process.version' },
        }),
        dependency('opencode', {
          required: false,
          available: cli.available,
          state: cli.state,
          source: cli.source,
          version: cliVersion,
          reason: cliVersion.reason,
        }),
        dependency('opencode-config', {
          required: false,
          available: config.available,
          state: config.state,
          source: config.source,
          version: { state: 'unknown', value: 'unknown', reason: 'Configuration directory presence has no version evidence.' },
        }),
      ],
      capabilities: {
        host_runtime: {
          supported: detected,
          level: detectionState === 'available' ? 'detected' : detectionState,
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
        {
          type: 'npm-plugin', id: OPENCODE_PLUGIN_ENTRY, path: paths.configDir,
          action: 'install-plugin-native', phase: 'install', owner: 'OpenCode CLI', scope: 'global', enforcement: 'registered', owned: true,
        },
        { type: 'plugin-resources', path: paths.skillsDir, action: 'synchronize', phase: 'postinstall', owner: 'npm-plugin', scope: 'global', owned: true },
        { type: 'commands', path: paths.commandsDir, action: 'synchronize', phase: 'postinstall', owner: 'npm-plugin', scope: 'global', owned: true },
        { type: 'agents', path: paths.agents, action: 'update', phase: 'postinstall', owner: 'npm-plugin', scope: 'global', owned: true },
        { type: 'runtime', path: paths.configDir, action: 'await-host-load', phase: 'runtime', owner: 'OpenCode', scope: 'global', owned: false },
      ],
      risks: [
        {
          category: 'runtime', level: 'warning',
          message: 'Registering the npm plugin does not prove that OpenCode has downloaded, loaded, or enforced it; wait for the host runtime to load it.',
        },
        ...(!cli.available ? [{
          category: 'dependency', level: 'warning',
          message: 'OpenCode CLI was not detected. Install it from https://opencode.ai, then start OpenCode and rerun oms doctor --tool opencode.',
        }] : []),
      ],
      recommendation: {
        action: detectionState === 'unknown' ? 'inspect' : 'install',
        reason: 'Register the npm plugin and synchronize resources, then start OpenCode and verify runtime loading separately.',
      },
    };
  }

  static preflight(ctx) {
    const facts = this.describe(ctx);
    const cli = facts.dependencies.find((item) => item.name === 'opencode');
    if (cli?.available !== true) {
      ctx.announce('⚠️  未检测到 OpenCode。继续安装，但 OpenCode 不在时不生效。');
      ctx.announce('    安装: https://opencode.ai');
      ctx.announce('    后续：安装并启动 OpenCode，然后执行 oms doctor --tool opencode');
    }
  }

  static async inspectRuntime(ctx = {}) {
    const paths = getOpenCodePaths();
    const runtimeConfig = readRuntimeConfig();
    const isRegistered = runtimeConfig.state === 'valid'
      && Array.isArray(runtimeConfig.config.plugin)
      && runtimeConfig.config.plugin.includes(OPENCODE_PLUGIN_ENTRY);
    const invalid = runtimeConfig.state === 'invalid';
    return {
      written: {
        state: runtimeConfig.state === 'valid' ? 'verified' : (invalid ? 'unknown' : 'missing'),
        path: paths.json,
        evidence: runtimeConfig.state === 'valid' ? "Config exists at " + paths.json : null,
        reason: runtimeConfig.reason || null,
      },
      registered: {
        state: invalid ? 'unknown' : (isRegistered ? "verified" : "missing"),
        path: paths.json,
        evidence: isRegistered ? "Plugin " + OPENCODE_PLUGIN_ENTRY + " registered in config" : null,
        reason: invalid ? runtimeConfig.reason : (isRegistered ? null : "Plugin entry missing from config"),
      },
      postinstall: postinstallEvidence(),
      loaded: {
        state: "unknown",
        evidence: "No OpenCode host launch event was observed by oms-install",
        reason: "OpenCode host launch evidence unavailable",
      },
      enforced: {
        state: "unknown",
        evidence: "No active OpenCode runtime write-prevention probe was observed by oms-install",
        reason: "Write prevention evidence requires active runtime",
      },
    };
  }

  static async install(ctx) {
    const usedFallbackPlan = !ctx.plan;
    const plan = ctx.plan || { schema_version: 1, hosts: [this.describe(ctx)] };
    const events = [];
    for await (const event of executePlan(plan, {
      applyResource: async (resource, resourceCtx) => this.applyResource(resource, { ...ctx, ...resourceCtx }),
    })) {
      events.push(event);
      if (event.status === 'running') ctx.announce(`→ ${event.message}`);
      else if (event.status === 'succeeded') ctx.announce(`✓ ${event.message}`);
      else if (event.status === 'warning') ctx.announce(`⚠️  ${event.message}${event.reason ? `：${event.reason}` : ''}`);
      else if (event.status !== 'deferred') ctx.announce(`❌ ${event.message}${event.reason ? `：${event.reason}` : ''}`);
    }
    const result = summarizeExecution(plan, events);
    if (usedFallbackPlan && result.status === 'succeeded') {
      ctx.announce('✓ oh-my-sdd (OpenCode) npm 插件安装完成');
    }
    return result;
  }

  static async applyResource(resource, ctx = {}) {
    if (resource?.phase === 'postinstall') {
      return {
        status: 'deferred',
        owned: resource.owned !== false,
        message: `${resource.type || 'resource'} will be completed by the npm plugin lifecycle.`,
        reason: 'Expected npm plugin lifecycle work has not run in this installation process.',
        next_action: DEFERRED_LOAD_ACTION,
      };
    }
    if (resource?.phase === 'runtime') {
      return {
        status: 'deferred',
        owned: false,
        message: 'OpenCode runtime loading will complete after restart.',
        reason: 'Expected runtime loading has no evidence until OpenCode restarts.',
        next_action: DEFERRED_LOAD_ACTION,
      };
    }
    if (resource?.action === 'install-plugin-native') {
      const runCommand = ctx.execFileSync || execFileSync;
      const args = ['plugin', OPENCODE_PLUGIN_ENTRY, '--global', '--force'];
      const invocation = buildOpenCodeInvocation(args, {
        platform: ctx.platform,
        comspec: ctx.comspec,
      });
      const retry = `Retry: opencode ${args.join(' ')}`;
      try {
        runCommand(invocation.command, invocation.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return {
          status: 'succeeded', owned: true,
          message: `Installed ${OPENCODE_PLUGIN_ENTRY} through the OpenCode CLI.`,
          next_action: DEFERRED_LOAD_ACTION,
        };
      } catch (error) {
        const output = [error?.stderr, error?.stdout]
          .map((value) => value == null ? '' : String(value).trim())
          .filter(Boolean)
          .join('\n') || error?.message || String(error);
        return {
          status: 'failed', owned: true,
          message: `Failed to install ${OPENCODE_PLUGIN_ENTRY} through the OpenCode CLI.`,
          reason: String(output).trim(),
          next_action: retry,
        };
      }
    }
    return {
      status: 'unsupported',
      owned: resource?.owned !== false,
      message: `Unsupported OpenCode repair resource: ${resource?.type || resource?.action || 'unknown'}`,
      reason: '该资源必须由 npm plugin lifecycle 或宿主运行时处理，adapter 不会伪造成功。',
      next_action: '运行 npm plugin lifecycle 或启动 OpenCode 后重试 doctor。',
    };
  }

  static async uninstall(ctx) {
    const { announce } = ctx;
    const paths = getOpenCodePaths();

    announce('→ 卸载 OpenCode 适配');

    // 1. 删 plugin 目录
    if (rmIfExistsSync(paths.pluginDir)) {
      announce(`  ✓ 已删除: ${paths.pluginDir}`);
    }

    // 2. 从 opencode.json 移除
    unpatchOpencodeJson({ configPath: paths.json });

    // 3. 精准移除 fallback AGENTS.md 中的 OMS 区块，保留用户内容
    if (existsSync(paths.agents)) {
      const existing = readFileSync(paths.agents, 'utf8');
      const preserved = removeSentinelBlock(existing);
      if (preserved.length === 0) unlinkSync(paths.agents);
      else writeFileSync(paths.agents, preserved);
    }

    // 4. 仅通过 ownership manifest 清理 npm postinstall 写入的资源。
    // 用户修改过的 command 会被保留为带 .oh-my-sdd-modified-* 后缀的同级文件。
    cleanupNpmResources({
      manifestPath: paths.manifest,
      configPath: paths.json,
      agentsPath: paths.agents,
      allowedRoots: [paths.skillsDir, paths.commandsDir, join(getHomeDir(), '.agents', 'skills'), join(getHomeDir(), '.agents', 'command')],
      warn: (message) => announce(`  ⚠️  ${message}`),
      log: (message) => announce(`  ✓ ${message}`),
    });

    // 5. 保留其余 ~/.oh-my-sdd/ 状态（除非 --purge 由 caller 处理）
  }
}

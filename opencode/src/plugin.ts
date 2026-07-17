/**
 * OpenCode Plugin adapter for oh-my-sdd.
 *
 * Why this file exists: oh-my-sdd 的 hooks/*.js 按 Claude Code 的 stdin/stdout
 * JSON 协议编写（事件名 SessionStart/PreToolUse，工具名 Write/Edit/MultiEdit），
 *OpenCode 的事件名（session.created/tool.execute.before）和工具名（write/edit
 * 小写）不同。需要一个薄适配层把 OpenCode 事件翻译成 hooks/*.js 期望的输入。
 *
 * 关键设计：不在 plugin.ts 里复制 hooks 业务逻辑（matchRules/iam/dop），
 * 通过 child_process.spawn 调用 Node 跑原始的 hooks/*.js——保持单源真相。
 *
 * 安装位置：~/.config/opencode/plugins/oh-my-sdd/{plugin.js,dist/plugin.js}
 * （新 install 走 dist/ 布局；老 install 是顶层 plugin.js；plugin 内部探针兼容）
 * 注意：仅复制到 plugins/ 目录**不生效**——必须把入口加到
 * ~/.config/opencode/opencode.json 的 plugin 数组（由 install-opencode.js 完成）。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 两种合法安装布局（向下兼容）：
//   A. 旧布局：.../plugins/oh-my-sdd/plugin.js + .../plugins/oh-my-sdd/hooks/
//   B. 新布局：.../plugins/oh-my-sdd/dist/plugin.js + .../plugins/oh-my-sdd/hooks/
// 探针：先看 hooks/ 是不是和 plugin.js 同级；不是就回退到上级目录
const SIBLING_HOOKS = join(__dirname, 'hooks', 'pre-tool-use.js');
const HOOKS_DIR = existsSync(SIBLING_HOOKS)
  ? join(__dirname, 'hooks')
  : join(__dirname, '..', 'hooks');
// PLUGIN_ROOT 是 hooks/ 的父目录，供 CLAUDE_PLUGIN_ROOT 注入（hooks 内部用它定位资源）
const PLUGIN_ROOT = join(HOOKS_DIR, '..');

// ============================================
// 工具名映射: OpenCode (小写) → Claude Code (大写)
// ============================================
// Claude Code hooks/pre-tool-use.js 硬编码匹配 'Edit'|'Write'|'MultiEdit'，
// OpenCode 的工具名是小写（'write'/'edit'）或完全不同（'apply_patch' ≈ MultiEdit）。
// 任何 OpenCode 工具调用 pre-tool-use.js 前必须先映射。
const TOOL_MAP: Record<string, string> = {
  write: 'Write',
  edit: 'Edit',
  apply_patch: 'MultiEdit',
};
const TRACKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

// ============================================
// hook 调用器：spawn node <hook>, stdin JSON in, stdout JSON out
// ============================================
interface RunHookOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
}

async function runHook(
  hookName: string,
  input: Record<string, unknown>,
  options: RunHookOptions = {}
): Promise<Record<string, unknown>> {
  const { timeoutMs = 5000 } = options;
  const hookPath = join(HOOKS_DIR, hookName);

  return new Promise((resolve) => {
    const proc = spawn('node', [hookPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, // hooks 依赖此 env 定位资源
        ...(options.env ?? {}),
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      // 超时 → 空响应（不阻断 OpenCode session）
      resolve({});
    }, timeoutMs);
    timer.unref?.();

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0 && code !== null) {
        // hook 异常退出：stderr 已写，不阻断
        // (oh-my-sdd 的 hooks 自带 fail-safe deny，但只在 PreToolUse 路径下)
      }
      const raw = stdout.trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        // 不是 JSON：忽略
        resolve({});
      }
    });

    proc.on('error', () => {
      clearTimeout(timer);
      // spawn 失败（node 不在 PATH 等）→ 静默降级
      resolve({});
    });

    // 写 stdin JSON 并关闭
    try {
      proc.stdin?.end(JSON.stringify(input));
    } catch {
      // stdin 写入失败：忽略
    }
  });
}

// ============================================
// 输入适配器: OpenCode 事件 → Claude Code stdin 协议
// ============================================

interface OpenCodeSessionInput {
  session_id?: string;
  cwd?: string;
}

function mapSessionStart(input: OpenCodeSessionInput): Record<string, unknown> {
  return {
    session_id: input.session_id ?? `oms-opencode-${Date.now()}`,
    cwd: input.cwd ?? process.cwd(),
  };
}

function mapSessionEnd(input: OpenCodeSessionInput): Record<string, unknown> {
  return {
    session_id: input.session_id ?? `oms-opencode-${Date.now()}`,
    cwd: input.cwd ?? process.cwd(),
  };
}

interface OpenCodeToolInput {
  tool: string;
  input?: {
    file_path?: string;
    content?: string;
    new_string?: string;
    edits?: Array<{ new_string?: string }>;
  };
}

function mapPreToolUse(input: OpenCodeToolInput): Record<string, unknown> | null {
  const mappedTool = TOOL_MAP[input.tool];
  if (!mappedTool || !TRACKED_TOOLS.has(mappedTool)) return null;

  const toolInput = input.input ?? {};
  return {
    tool_name: mappedTool,
    tool_input: {
      file_path: toolInput.file_path,
      // OpenCode 用 'content' 写整个文件，Claude Code 同
      content: toolInput.content,
      // OpenCode 用 'new_string' 做单点编辑，Claude Code 同
      new_string: toolInput.new_string,
      // OpenCode 的 apply_patch 没有 edits[]，但 pre-tool-use.js 兼容空数组
      edits: toolInput.edits,
    },
  };
}

function mapPostToolUse(input: OpenCodeToolInput): Record<string, unknown> | null {
  const mappedTool = TOOL_MAP[input.tool];
  if (!mappedTool || !TRACKED_TOOLS.has(mappedTool)) return null;
  return {
    tool_name: mappedTool,
    tool_input: input.input ?? {},
  };
}

// ============================================
// Plugin 导出
// ============================================

export const OhMySddPlugin = async (_ctx: unknown) => {
  return {
    // session.created ≈ Claude Code SessionStart
    'session.created': async (input: OpenCodeSessionInput) => {
      await runHook('session-start.js', mapSessionStart(input), { timeoutMs: 10000 });
      // baseline 通过 ~/.config/opencode/AGENTS.md 自动加载（install.js 写入），
      // 此处不做 prompt append（避免重复注入）
    },

    // session.deleted ≈ SessionEnd
    'session.deleted': async (input: OpenCodeSessionInput) => {
      await runHook('session-end.js', mapSessionEnd(input), { timeoutMs: 5000 });
    },

    // tool.execute.before ≈ Claude Code PreToolUse
    'tool.execute.before': async (
      input: OpenCodeToolInput,
      _output: unknown
    ) => {
      const stdinInput = mapPreToolUse(input);
      if (!stdinInput) return; // 非追踪工具 → 放行

      const result = await runHook('pre-tool-use.js', stdinInput, { timeoutMs: 5000 });

      // 关键：Claude Code 用 permissionDecision: deny 阻断
      // OpenCode 等价语义：在 hook handler 中 throw Error
      const decision = (result.hookSpecificOutput as any)?.permissionDecision;
      if (decision === 'deny') {
        const reason =
          (result.hookSpecificOutput as any)?.permissionDecisionReason ??
          'HARD_RULE violated';
        throw new Error(reason);
      }

      // soft rule warning：打印到 stderr 供用户看到
      if (result.additionalContext) {
        process.stderr.write(`⚠️ oh-my-sdd: ${result.additionalContext}\n`);
      }
    },

    // tool.execute.after ≈ PostToolUse
    'tool.execute.after': async (input: OpenCodeToolInput) => {
      const stdinInput = mapPostToolUse(input);
      if (!stdinInput) return;
      // post-tool-use 只做 telemetry，忽略返回
      await runHook('post-tool-use.js', stdinInput, { timeoutMs: 3000 });
    },
  };
};

// OpenCode plugin loader 期望 default export 或 named export 'plugin'
export default OhMySddPlugin;

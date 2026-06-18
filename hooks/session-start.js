#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAuthStatus, IamCliError, pickCredentialForSystem } from './lib/iam-cli.js';
import { getCurrentHead, getBranch, getRemote } from './lib/git-diff.js';
import { reportOrEnqueue, flush, shouldSkipTelemetry } from './lib/dop-client.js';
import { loadConfig } from './lib/config.js';
import { debug, warn, error } from './lib/log.js';
import { getStateDir } from './lib/platform.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? path.resolve(__dirname, '..');

// Hard timeouts to keep Claude Code session-start snappy. iam hanging or DOP
// stalling must never block the user from opening a session. Each lib accepts
// a timeoutMs option that kills the underlying child process / fetch socket.
const IAM_AUTH_TIMEOUT_MS = 5_000;   // getAuthStatus spawn + parse budget
const DOP_FLUSH_TIMEOUT_MS = 3_000;  // drain leftover queue at start
const DOP_REPORT_TIMEOUT_MS = 3_000; // session.start report
const STDIN_TIMEOUT_MS = 1_000;      // stdin read safety

async function readContent(name) {
  const p = path.join(PLUGIN_ROOT, 'content', name);
  try {
    return await readFile(p, 'utf8');
  } catch {
    return `[企业 baseline 占位：未能读取 ${name}]`;
  }
}

async function readPluginVersion() {
  try {
    const pkg = JSON.parse(await readFile(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    const timer = setTimeout(() => resolve(data), STDIN_TIMEOUT_MS);
    timer.unref?.();
  });
}

async function saveSessionMeta(sessionId, meta) {
  if (!sessionId) return;
  const dir = path.join(getStateDir(), 'sessions');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(dir, `${sessionId}.json`),
    JSON.stringify(meta, null, 2),
    { mode: 0o600 }
  );
}

async function getAuthState() {
  let status;
  try {
    // Native timeout: kills the iam child process on timeout so the hook
    // process doesn't wait on a dangling `sleep 60`.
    status = await getAuthStatus({ timeoutMs: IAM_AUTH_TIMEOUT_MS });
  } catch (err) {
    if (err instanceof IamCliError) {
      if (err.code === 'IAM_SPAWN_FAILED') return { state: 'NO_CLI', status: null, err };
      if (err.code === 'IAM_TIMEOUT') {
        warn(`iam auth status 超时 (${IAM_AUTH_TIMEOUT_MS}ms)，降级为 ERROR 状态`);
        return { state: 'ERROR', status: null, err };
      }
      return { state: 'ERROR', status: null, err };
    }
    return { state: 'ERROR', status: null, err };
  }
  const cfg = await loadConfig();
  const cred = pickCredentialForSystem(status, cfg.aih_system_name);
  if (cred && cred.status === 'logged') {
    return { state: 'OK', status, username: cred.username };
  }
  return { state: 'NEED_LOGIN', status };
}

async function buildAdditionalContext(authState) {
  switch (authState.state) {
    case 'OK':
      return await readContent('enterprise-baseline.md');
    case 'NEED_LOGIN':
      return await readContent('auth-required.md');
    case 'NO_CLI':
      return `⚠️ **未检测到 iam CLI**\n\n请先安装 iam（企业统一身份认证 CLI），然后运行 \`oms-login\` 完成认证。`;
    case 'ERROR':
      return `⚠️ **iam 服务异常**\n\n${authState.err?.message ?? ''}\n\n联系企业管理员。`;
    default:
      return '';
  }
}

async function reportSessionStart(stdin, username) {
  if (await shouldSkipTelemetry({ cwd: stdin.cwd })) return;
  const startSha = await getCurrentHead(stdin.cwd);
  const event = {
    event: 'session.start',
    session_id: stdin.session_id,
    user: username,
    cwd: stdin.cwd,
    git_branch: await getBranch(stdin.cwd),
    git_remote: await getRemote(stdin.cwd),
    plugin_version: await readPluginVersion(),
    start_sha: startSha,
    timestamp: new Date().toISOString(),
  };
  // Save start_sha + username for session-end to compute code_delta.
  try {
    await saveSessionMeta(stdin.session_id, { start_sha: startSha, username });
  } catch (err) {
    warn(`session meta 写入失败: ${err.message}`);
  }
  try {
    // Native fetch timeout via AbortController — on stall the socket is
    // actually closed, not just raced. Errors are enqueued by reportOrEnqueue.
    await reportOrEnqueue(event, { timeoutMs: DOP_REPORT_TIMEOUT_MS });
  } catch (err) {
    warn(`session.start 上报超时或失败: ${err.message}`);
  }
}

async function main() {
  // Drain any leftover queued events from a previous session first. Wrap in
  // try/catch + timeout: best-effort, must never block the hook.
  try {
    await flush({ timeoutMs: DOP_FLUSH_TIMEOUT_MS });
  } catch (err) {
    warn(`flush 失败: ${err.message}`);
  }

  const rawStdin = await readStdin();
  let stdin = {};
  try {
    stdin = rawStdin && rawStdin.trim() ? JSON.parse(rawStdin) : {};
  } catch {
    warn('stdin 不是 JSON，继续以空 stdin 处理');
  }
  if (!stdin.cwd) stdin.cwd = process.cwd();
  if (!stdin.session_id) stdin.session_id = `oms-${Date.now()}`;

  const authState = await getAuthState();
  const additionalContext = await buildAdditionalContext(authState);

  debug(`session-start 认证状态: ${authState.state}`);

  if (authState.state !== 'OK') {
    process.stderr.write(`⚠️ oh-my-sdd: 认证状态 ${authState.state}\n`);
  }

  if (authState.state === 'OK') {
    try {
      await reportSessionStart(stdin, authState.username);
    } catch (err) {
      warn(`session.start 上报失败: ${err.message}`);
    }
  }

  const output = {
    additionalContext,
    hookSpecificOutput: { hookEventName: 'SessionStart' },
  };
  process.stdout.write(JSON.stringify(output));
}

main().catch((err) => {
  error(`session-start 致命错误: ${err.stack ?? err.message}`);
  // Emit minimal valid output so Claude Code doesn't reject.
  try {
    process.stdout.write(JSON.stringify({
      additionalContext: '',
      hookSpecificOutput: { hookEventName: 'SessionStart' },
    }));
  } catch {
    // Last-ditch: nothing we can do.
  }
  process.exit(0);
});

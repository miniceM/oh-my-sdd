#!/usr/bin/env node
import { readFile, writeFile, mkdir, opendir, lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAuthStatus, IamCliError, isFullyAuthenticated, pickAnyLoggedUsername } from '../lib/iam-cli.js';
import { getCurrentHead, getBranch, getRemote } from '../lib/git-diff.js';
import { reportOrEnqueue, flush, shouldSkipTelemetry } from '../lib/dop-client.js';
import { loadConfig } from '../lib/config.js';
import { debug, warn, error } from '../lib/log.js';
import { getStateDir, sessionMetaPath, isIamInPath } from '../lib/platform.js';
import { checkForUpdates, buildUpdateNotification } from '../lib/update-check.js';
import { isDopCompletionPending } from '../lib/sdd-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? path.resolve(__dirname, '..');

// Hard timeouts to keep Claude Code session-start snappy. iam hanging or DOP
// stalling must never block the user from opening a session. Each lib accepts
// a timeoutMs option that kills the underlying child process / fetch socket.
const IAM_AUTH_TIMEOUT_MS = 5_000;   // getAuthStatus spawn + parse budget
const DOP_FLUSH_TIMEOUT_MS = 3_000;  // drain leftover queue at start
const DOP_REPORT_TIMEOUT_MS = 3_000; // session.start report
const DOP_CHANGE_VIEW_TIMEOUT_MS = 2_000; // archived DOP completion reconciliation
const STDIN_TIMEOUT_MS = 1_000;      // stdin read safety
const ARCHIVE_META_READ_TIMEOUT_MS = 250;
const MAX_PENDING_DOP_SCAN_ENTRIES = 50;
const MAX_PENDING_DOP_META_BYTES = 64 * 1024;
const PENDING_DOP_SCAN_BUDGET_MS = 500;

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
  const p = sessionMetaPath(sessionId);
  if (!p) return;
  const dir = path.join(getStateDir(), 'sessions');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(p, JSON.stringify(meta, null, 2), { mode: 0o600 });
}

async function getAuthState() {
  // 预检：iam 是否在 PATH 中。
  // Windows 上 spawn 找不到的 .cmd 时不会触发 'error' 事件，而是 exit code 1
  // + stderr "not recognized"——所以单独依赖 IAM_SPAWN_FAILED 会误判 ERROR。
  // isIamInPath() 显式探测，避免 Windows 上的 false negative。
  if (!isIamInPath()) {
    return { state: 'NO_CLI', status: null };
  }

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
  // Q3 决策：devops + gitee 两个系统都必须登录
  const requiredSystems = cfg.required_systems ?? 2;
  if (isFullyAuthenticated(status, requiredSystems)) {
    return { state: 'OK', status, username: pickAnyLoggedUsername(status) };
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
  // Save start_sha + username + started_at for session-end to compute
  // code_delta and session duration. started_at is captured here so
  // session.end can compute duration_sec; slash_commands is populated
  // later by user-prompt-submit.js (Task 10).
  try {
    await saveSessionMeta(stdin.session_id, {
      start_sha: startSha,
      username,
      started_at: new Date().toISOString(),
    });
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

  const pluginVersion = await readPluginVersion();

  // 并行执行认证检查和更新检测（非阻塞）
  const [authState, updateInfo] = await Promise.all([
    getAuthState(),
    checkForPluginUpdates(pluginVersion),
  ]);

  const additionalContext = await buildAdditionalContext(authState);

  debug(`session-start 认证状态: ${authState.state}`);

  if (authState.state !== 'OK') {
    process.stderr.write(`⚠️ oh-my-sdd: 认证状态 ${authState.state}\n`);
  }

  // 输出更新通知
  if (updateInfo?.hasUpdate) {
    process.stderr.write(updateInfo.stderr);
  }

  if (authState.state === 'OK') {
    try {
      await reportSessionStart(stdin, authState.username);
    } catch (err) {
      warn(`session.start 上报失败: ${err.message}`);
    }
  }

  // Archive-before-PR can leave a local completion intent behind when the
  // read/write DOP completion step failed. Reconcile it with a bounded,
  // read-only view before asking the user to retry.
  let pendingDopReminder = '';
  if (authState.state === 'OK') {
    try {
      const pendingCompletions = await scanPendingDopCompletions(stdin.cwd);
      const incompleteCompletions = (await Promise.all(pendingCompletions.map(async (change) => {
        const status = await getDopChangeStatus(change.change_id);
        return status === 'done' ? null : change;
      }))).filter(Boolean);
      if (incompleteCompletions.length > 0) {
        const lines = incompleteCompletions.map(c =>
          `  • ${c.slug} (change-id: ${c.change_id})`
        );
        const header = `⚠️ oh-my-sdd: ${incompleteCompletions.length} 个变更的 DOP 完成状态待补偿\n` +
                       `   请在确认后重试：\n`;
        const footer = `\n   命令：/sdd-review --retry-dop <slug>\n`;
        const msg = header + lines.join('\n') + footer;
        process.stderr.write(msg + '\n');
        pendingDopReminder = msg;
      }
    } catch (err) {
      debug(`扫描 pending DOP completion 失败（非阻塞）: ${err.message}`);
    }
  }

  // 构建最终 additionalContext
  let finalContext = additionalContext;
  if (updateInfo?.hasUpdate) {
    finalContext += updateInfo.additionalContext;
  }
  if (pendingDopReminder) {
    finalContext += `\n\n---\n${pendingDopReminder}`;
  }

  const output = {
    additionalContext: finalContext,
    hookSpecificOutput: { hookEventName: 'SessionStart' },
  };
  process.stdout.write(JSON.stringify(output));
}

// 更新检测（非阻塞）
async function checkForPluginUpdates(currentVersion) {
  try {
    const result = await checkForUpdates({ currentVersion });
    if (result.hasUpdate && result.latestVersion && result.bump) {
      return buildUpdateNotification({
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        bump: result.bump,
      });
    }
  } catch (err) {
    debug(`更新检测错误（非阻塞）: ${err.message}`);
  }
  return null;
}

// Runs only `dop change view <id> -j`, which is a read-only reconciliation
// probe. Never invoke a DOP completion command from SessionStart.
async function getDopChangeStatus(changeId) {
  return new Promise((resolve) => {
    execFile('dop', ['change', 'view', changeId, '-j'], {
      timeout: DOP_CHANGE_VIEW_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
      windowsHide: true,
    }, (err, stdout) => {
      if (err) {
        debug(`DOP change view ${changeId} 失败（将提示重试）: ${err.message}`);
        resolve(null);
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(typeof result.status === 'string' ? result.status.toLowerCase() : null);
      } catch {
        debug(`DOP change view ${changeId} 返回无效 JSON（将提示重试）`);
        resolve(null);
      }
    });
  });
}

// Scan archived changes because the local intent survives an archive when the
// post-PR DOP completion call needs compensation.
async function scanPendingDopCompletions(cwd) {
  const deadline = Date.now() + PENDING_DOP_SCAN_BUDGET_MS;
  const archiveDir = path.join(cwd, 'openspec', 'changes', 'archive');
  let archive;
  try {
    archive = await opendir(archiveDir);
  } catch {
    return [];  // 不是 SDD 项目，或尚无 archive
  }
  const pendingDopCompletions = [];
  let enumerated = 0;
  try {
    for await (const entry of archive) {
      if (Date.now() >= deadline || enumerated >= MAX_PENDING_DOP_SCAN_ENTRIES) break;
      enumerated += 1;
      if (!entry.isDirectory()) continue;

      const metaPath = path.join(archiveDir, entry.name, '.meta.json');
      try {
        const stats = await withRemainingScanBudget(() => lstat(metaPath), deadline);
        if (!stats.isFile()) continue;
        if (stats.size > MAX_PENDING_DOP_META_BYTES) continue;
        const meta = JSON.parse(await readArchiveMeta(metaPath, deadline));
        if (isDopCompletionPending(meta)) {
          pendingDopCompletions.push({
            slug: sanitizeReminderValue(entry.name),
            change_id: sanitizeReminderValue(meta.change_id),
          });
        }
      } catch {
        // 无 .meta.json、超时或 JSON 损坏 - 跳过
      }

      if (Date.now() >= deadline) break;
    }
  } catch {
    // 目录遍历异常 - 保持 fail-open
  } finally {
    try {
      await archive.close();
    } catch {
      // for-await 已关闭目录或 close 失败 - 无需影响 hook
    }
  }
  return pendingDopCompletions;
}

async function withRemainingScanBudget(operation, deadline) {
  const remainingBudgetMs = deadline - Date.now();
  if (remainingBudgetMs <= 0) throw new Error('archive metadata scan timed out');

  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('archive metadata scan timed out')),
          Math.min(ARCHIVE_META_READ_TIMEOUT_MS, remainingBudgetMs),
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readArchiveMeta(metaPath, deadline) {
  return withRemainingScanBudget(() => readFile(metaPath, 'utf8'), deadline);
}

function sanitizeReminderValue(value) {
  const sanitized = String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return sanitized || '(unknown)';
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

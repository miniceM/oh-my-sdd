#!/usr/bin/env node
import { readFile, unlink, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeCodeDelta } from './lib/git-diff.js';
import { reportOrEnqueue, shouldSkipTelemetry, flush } from './lib/dop-client.js';
import { getStateDir, sessionMetaPath } from './lib/platform.js';
import { info, warn, error } from './lib/log.js';

const SESSIONS_DIR = path.join(getStateDir(), 'sessions');

// Hard timeouts to keep Claude Code session-end snappy. iam/git/DOP stalls
// must never block the user from closing a session. Each lib accepts a
// timeoutMs option that kills the underlying child process / fetch socket.
const DOP_FLUSH_TIMEOUT_MS = 3_000;   // drain leftover queue at end
const DOP_REPORT_TIMEOUT_MS = 3_000;  // session.end report
const STDIN_TIMEOUT_MS = 1_000;       // stdin read safety
const ORPHAN_MAX_AGE_DAYS = 7;

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

async function loadSessionMeta(sessionId) {
  const p = sessionMetaPath(sessionId);
  if (!p) return null;
  try {
    const raw = await readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function deleteSessionMeta(sessionId) {
  const p = sessionMetaPath(sessionId);
  if (!p) return;
  try { await unlink(p); }
  catch (err) { if (err.code !== 'ENOENT') warn(`删除 session meta 失败: ${err.message}`); }
}

async function cleanupOrphans({ maxAgeDays = ORPHAN_MAX_AGE_DAYS, exclude = null } = {}) {
  try {
    const files = await readdir(SESSIONS_DIR);
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    // Sanitize exclude the same way sessionMetaPath does so the active
    // session's filename is matched correctly (and a malicious id can't
    // accidentally exclude an unrelated file).
    const excludeBase = exclude ? path.basename(sessionMetaPath(exclude) ?? '') : null;
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      // Never delete the active session's meta even if it exceeds maxAge.
      // An old session (open >7d) could still be sending session.end now.
      if (excludeBase && f === excludeBase) continue;
      const p = path.join(SESSIONS_DIR, f);
      const st = await stat(p);
      if (st.mtimeMs < cutoff) {
        await unlink(p).catch(() => {});
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') warn(`清理孤儿 session 失败: ${err.message}`);
  }
}

async function main() {
  // Drain any leftover queued events from this session first. Wrap in
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
    /* tolerate non-JSON stdin */
  }

  // Load session meta BEFORE cleanup. For a session open >7 days, cleanup
  // running first would delete this session's meta, silently dropping
  // session.end. We then exclude the active session_id from cleanup so a
  // long-running session's own meta is never deleted while being processed.
  const meta = await loadSessionMeta(stdin.session_id);

  await cleanupOrphans({ exclude: stdin.session_id });

  if (await shouldSkipTelemetry({ cwd: stdin.cwd })) {
    process.stdout.write('{}');
    return;
  }

  if (!meta) {
    info(`无 session meta for ${stdin.session_id}, 跳过 session.end`);
    process.stdout.write('{}');
    return;
  }

  let code_delta = { files_changed: 0, lines_added: 0, lines_deleted: 0, by_lang: {} };
  if (meta.start_sha) {
    try {
      // endRef is a dead param per Task 3 review; pass 'HEAD'. computeCodeDelta
      // uses single-commit form (`git diff --numstat <startSha>`) so uncommitted
      // session work is also captured.
      code_delta = await computeCodeDelta(meta.start_sha, 'HEAD', stdin.cwd);
    } catch (err) {
      warn(`computeCodeDelta 失败: ${err.message}`);
    }
  }

  const event = {
    event: 'session.end',
    session_id: stdin.session_id,
    user: meta.username,
    duration_sec: meta.started_at ? Math.floor((Date.now() - new Date(meta.started_at).getTime()) / 1000) : null,
    code_delta,
    slash_commands_used: meta.slash_commands ?? [],
    timestamp: new Date().toISOString(),
  };
  // Native fetch timeout via AbortController (see dop-client.js). On stall the
  // socket is actually closed, not just raced. Errors are enqueued by
  // reportOrEnqueue so the next session.start can retry.
  try {
    await reportOrEnqueue(event, { timeoutMs: DOP_REPORT_TIMEOUT_MS });
  } catch (err) {
    warn(`session.end 上报超时或失败: ${err.message}`);
  }

  await deleteSessionMeta(stdin.session_id);
  process.stdout.write('{}');
}

main().catch((err) => {
  error(`session-end 致命错误: ${err.stack ?? err.message}`);
  // Emit minimal valid JSON on stdout so Claude Code doesn't reject.
  try { process.stdout.write('{}'); } catch { /* last-ditch */ }
  process.exit(0);
});

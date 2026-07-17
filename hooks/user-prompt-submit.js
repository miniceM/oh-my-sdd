#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

import { reportOrEnqueue, shouldSkipTelemetry } from './lib/dop-client.js';
import { sessionMetaPath } from './lib/platform.js';
import { info, warn, error } from './lib/log.js';

// Hard timeouts to keep Claude Code prompt submission snappy. A stalled DOP
// POST must never delay the user's prompt. dop-client.js uses AbortController
// to actually close the socket on timeout (not just Promise.race).
const DOP_REPORT_TIMEOUT_MS = 3_000; // slash.invoked report
const STDIN_TIMEOUT_MS = 1_000;      // stdin read safety

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

// Claude Code wraps slash commands in <command-name>...</command-name> tags
// inside the prompt field. Parse the (command, args) pair if present.
// <command-args> is optional; missing args collapse to ''.
function parseSlashCommand(prompt) {
  if (!prompt) return null;
  const cmdMatch = prompt.match(/<command-name>([^<]+)<\/command-name>/);
  if (!cmdMatch) return null;
  const command = cmdMatch[1].trim();
  const argsMatch = prompt.match(/<command-args>([^<]*)<\/command-args>/);
  const args = argsMatch ? argsMatch[1].trim() : '';
  return { command, args };
}

// Load existing session meta, append the command name to slash_commands, and
// write back. Returns null if the meta file is missing — caller should skip
// the event report in that case (no session context to attribute it to).
async function loadAndUpdateSession(sessionId, commandName) {
  const p = sessionMetaPath(sessionId);
  if (!p) return null;
  let meta = {};
  try {
    meta = JSON.parse(await readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      info(`session meta 不存在 ${sessionId}, 跳过 slash 记录`);
      return null;
    }
    throw err;
  }
  meta.slash_commands = [...(meta.slash_commands ?? []), commandName];
  await writeFile(p, JSON.stringify(meta, null, 2), { mode: 0o600 });
  return meta;
}

async function main() {
  const rawStdin = await readStdin();
  let stdin = {};
  try {
    stdin = rawStdin && rawStdin.trim() ? JSON.parse(rawStdin) : {};
  } catch {
    /* tolerate non-JSON stdin */
  }

  // Short-circuit: no command tag → plain prompt, no meta update, no report.
  const parsed = parseSlashCommand(stdin.prompt);
  if (!parsed) {
    process.stdout.write('{}');
    return;
  }

  if (await shouldSkipTelemetry({ cwd: stdin.cwd })) {
    process.stdout.write('{}');
    return;
  }

  // No session meta → nothing to attribute the slash to; skip silently.
  const meta = await loadAndUpdateSession(stdin.session_id, parsed.command);
  if (!meta) {
    process.stdout.write('{}');
    return;
  }

  const event = {
    event: 'slash.invoked',
    session_id: stdin.session_id,
    user: meta.username,
    command: parsed.command,
    args: parsed.args,
    timestamp: new Date().toISOString(),
  };
  // Native fetch timeout via AbortController — on stall the socket is actually
  // closed, not just raced. Errors are enqueued by reportOrEnqueue so the next
  // session.start can retry.
  try {
    await reportOrEnqueue(event, { timeoutMs: DOP_REPORT_TIMEOUT_MS });
  } catch (err) {
    warn(`slash.invoked 上报失败: ${err.message}`);
  }

  process.stdout.write('{}');
}

main().catch((err) => {
  error(`user-prompt-submit 致命错误: ${err.stack ?? err.message}`);
  // Emit minimal valid JSON on stdout so Claude Code doesn't reject.
  try { process.stdout.write('{}'); } catch { /* last-ditch */ }
  process.exit(0);
});

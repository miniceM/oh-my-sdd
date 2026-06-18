import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import { enqueue, flush as flushQueue } from './event-queue.js';
import { warn } from './log.js';

// Quick in-memory retries inside reportOrEnqueue before falling back to disk
// queue. Prevents transient 5xx / network blips from ballooning queue.jsonl
// with slash.invoked events that would flood DOP on reconnect.
const MAX_REPORT_RETRIES = 2;
const REPORT_RETRY_BACKOFF_MS = 200;

// One-time warning flag for plaintext DOP endpoint. Enterprise should use https.
let httpWarningEmitted = false;

export async function shouldSkipTelemetry({ cwd }) {
  const cfg = await loadConfig();
  if (cfg.telemetry_disabled) return true;
  try {
    await access(path.join(cwd, '.sdd-no-telemetry'), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function report(event, { timeoutMs } = {}) {
  const cfg = await loadConfig();
  if (!cfg.dop_endpoint) {
    throw new Error('DOP endpoint 未配置');
  }

  // Warn once on plaintext endpoint. Allow localhost / 127.0.0.1 (typical
  // dev/test stub servers) without noise — no env escape hatch needed.
  const isLocalEndpoint = /localhost|127\.0\.0\.1/.test(cfg.dop_endpoint);
  if (!httpWarningEmitted
      && !cfg.dop_endpoint.startsWith('https://')
      && !isLocalEndpoint) {
    warn(`DOP endpoint 非 https，遥测数据可能明文传输: ${cfg.dop_endpoint}`);
    httpWarningEmitted = true;
  }

  const url = cfg.dop_endpoint.replace(/\/$/, '') + '/api/v1/events';
  // AbortController gives a real socket close on timeout (Node 16.14+/18+),
  // unlike Promise.race which leaves the fetch connection dangling.
  const controller = (typeof AbortController !== 'undefined' && timeoutMs > 0)
    ? new AbortController()
    : null;
  let timer = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
  }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: controller?.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError' || /aborted/i.test(err?.message ?? '')) {
      throw new Error(`DOP 上报超时 (${timeoutMs}ms)`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DOP 上报失败: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

export async function reportOrEnqueue(event, { timeoutMs } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_REPORT_RETRIES; attempt++) {
    try {
      await report(event, { timeoutMs });
      return; // success
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_REPORT_RETRIES) {
        await new Promise((r) => setTimeout(r, REPORT_RETRY_BACKOFF_MS * (attempt + 1)));
        continue;
      }
    }
  }
  // All retries exhausted — enqueue for later flush.
  warn(`DOP 上报失败 (${MAX_REPORT_RETRIES + 1} 次尝试)，入队重试: ${lastErr?.message ?? 'unknown'}`);
  await enqueue(event);
}

export async function flush({ timeoutMs } = {}) {
  return flushQueue((ev) => report(ev, { timeoutMs }));
}

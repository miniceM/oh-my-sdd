import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config.js';
import { enqueue, flush as flushQueue } from './event-queue.js';
import { warn } from './log.js';

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
  try {
    await report(event, { timeoutMs });
  } catch (err) {
    warn(`DOP 上报失败，入队重试: ${err.message}`);
    await enqueue(event);
  }
}

export async function flush({ timeoutMs } = {}) {
  return flushQueue((ev) => report(ev, { timeoutMs }));
}

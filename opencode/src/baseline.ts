/**
 * Load enterprise-baseline.md and prepare for system prompt injection.
 * Strips YAML frontmatter + Sync Impact Report (internal-only).
 *
 * Fail-OPEN: if file missing → return []. Baseline is guidance; HARD_RULE
 * enforcement still works via PreToolUse hook (fail-CLOSED) regardless.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getBaselinePath } from './paths.js';
import { log } from './logger.js';

export async function loadBaseline(): Promise<string[]> {
  const p = process.env.OMS_BASELINE_PATH ?? getBaselinePath();
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      log('warn', 'baseline file missing, skipping injection', { path: p });
      return [];
    }
    throw e;
  }
  // Strip YAML frontmatter
  const noFrontmatter = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
  // Strip Sync Impact Report block
  const noSync = noFrontmatter.replace(/<!--\s*Sync Impact Report\s*-->[\s\S]*?<!--\s*END Sync Impact Report\s*-->\n*/, '');
  // Split by ## headers — the split removes the "## " prefix, re-add it
  const sections = noSync
    .split(/^## /m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => `## ${s}`);
  return sections;
}

export function buildSystemPrompt(
  sections: string[],
  output: { system?: string[] },
): void {
  if (!output.system) output.system = [];
  output.system.push(...sections);
}

export function writeAgentsMdFallback(sections: string[]): void {
  if (process.platform === 'win32') {
    log('warn', 'AGENTS.md fallback not implemented on Windows', {});
    return;
  }
  const home = os.homedir();
  const p = path.join(home, '.config', 'opencode', 'AGENTS.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, sections.join('\n\n') + '\n');
  log('info', 'wrote AGENTS.md fallback', { path: p });
}

export function detectExperimentalHook(): boolean {
  const sdkVersion = process.env.OMS_OPENCODE_SDK_VERSION ?? '1.15.13';
  const parts = sdkVersion.split('.').map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  return major > 1 || (major === 1 && minor >= 15);
}

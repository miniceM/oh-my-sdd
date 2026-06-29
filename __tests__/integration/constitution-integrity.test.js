import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

import { loadBaseline, getBodyForInjection } from '../../hooks/lib/constitution.js';

const BASELINE_PATH = path.join(PROJECT_ROOT, 'content', 'enterprise-baseline.md');

// ---------- baseline schema integrity ----------

test('baseline has valid frontmatter with all required fields', async () => {
  const result = await loadBaseline(BASELINE_PATH);
  assert.equal(typeof result.frontmatter.oms_version, 'string');
  assert.match(result.frontmatter.oms_version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof result.frontmatter.ratified, 'string');
  assert.equal(typeof result.frontmatter.last_amended, 'string');
  // dates must be ISO format
  assert.match(result.frontmatter.ratified, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(result.frontmatter.last_amended, /^\d{4}-\d{2}-\d{2}$/);
});

test('baseline has Sync Impact Report', async () => {
  const result = await loadBaseline(BASELINE_PATH);
  assert.ok(result.syncReport, 'syncReport must be extracted');
  assert.match(result.syncReport, /BEGIN sync-impact-report/);
  assert.match(result.syncReport, /END sync-impact-report/);
});

test('baseline body has no frontmatter structure', async () => {
  const result = await loadBaseline(BASELINE_PATH);
  assert.ok(!result.body.match(/^---[\s\S]*?\n---\n/), 'body must not contain YAML frontmatter block');
  assert.ok(!result.body.includes('BEGIN sync-impact-report'), 'body must not contain Sync Report');
});

test('baseline body starts with heading', async () => {
  const result = await loadBaseline(BASELINE_PATH);
  assert.match(result.body, /^# 企业 SDD Agent 基线/);
});

test('baseline body contains HARD_RULE and SOFT_RULE references', async () => {
  const result = await loadBaseline(BASELINE_PATH);
  assert.match(result.body, /HARD_RULE/);
  assert.match(result.body, /SOFT_RULE/);
  assert.match(result.body, /Amendment Procedure/);
});

// ---------- token budget ----------

function estimateTokens(text) {
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#*_>\-]/g, ' ');
  const chineseChars = (stripped.match(/[一-鿿]/g) ?? []).length;
  const englishWords = (stripped.match(/[a-zA-Z]+/g) ?? []).length;
  const punctuation = (stripped.match(/[，。、；：？！,.;:!?]/g) ?? []).length;
  return Math.ceil(chineseChars / 2 + englishWords / 0.75 + punctuation / 4);
}

test('baseline body does not exceed 1000 token budget', async () => {
  const result = await loadBaseline(BASELINE_PATH);
  const tokens = estimateTokens(result.body);
  assert.ok(tokens <= 1000, `body tokens ${tokens} exceeds 1000 limit`);
  console.log(`  body tokens: ${tokens} / 1000`);
});

// ---------- injection contract (for wrapper) ----------

test('getBodyForInjection strips frontmatter + Sync Report', () => {
  const body = getBodyForInjection(readFileSync(BASELINE_PATH, 'utf8'));
  assert.ok(!body.includes('BEGIN sync-impact-report'), 'injected body must not leak sync report');
  assert.equal(body, body.trim(), 'injected body must be trimmed');
  assert.match(body, /^# 企业 SDD Agent 基线/, 'injected body must start with heading');
  // Must not contain a YAML frontmatter block (---\n...\n---\n)
  assert.ok(!body.match(/^---[\s\S]*?\n---\n/), 'injected body must not contain YAML frontmatter block');
});

// ---------- lint script integration ----------

test('check-baseline-tokens.mjs exits 0', () => {
  const lintPath = path.join(PROJECT_ROOT, 'scripts', 'check-baseline-tokens.mjs');
  const result = execFileSync('node', [lintPath], { encoding: 'utf8', env: { ...process.env } });
  assert.match(result, /baseline schema ok/);
  // Token under budget
  const match = result.match(/body tokens: (\d+) \/ 1000/);
  assert.ok(match, `expected token count output, got: ${result}`);
  const tokens = parseInt(match[1], 10);
  assert.ok(tokens <= 1000, `token count ${tokens} exceeds budget`);
});

// ---------- sdd-constitution skill exists ----------

test('sdd-constitution SKILL.md exists and references enterprise-baseline.md', () => {
  const skillPath = path.join(PROJECT_ROOT, 'skills', 'sdd-constitution', 'SKILL.md');
  const skill = readFileSync(skillPath, 'utf8');
  assert.match(skill, /enterprise-baseline\.md/, 'skill must reference baseline file');
  assert.match(skill, /Sync Impact Report/, 'skill must mention Sync Impact Report');
  assert.match(skill, /SemVer/, 'skill must mention SemVer versioning');
});
#!/usr/bin/env node
// baseline schema + token lint.
//
// Two checks run in one pass:
//   1. frontmatter: required fields present, oms_version is valid SemVer
//   2. body (after stripping frontmatter + Sync Impact Report): ≤ MAX_TOKENS
//
// Why a single script: install.js injects only the body, so the token budget
// applies to the body alone — but the frontmatter still needs to be valid
// because constitution.js / sdd-constitution depend on it for version parsing.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadBaseline,
  REQUIRED_FRONTMATTER_FIELDS,
  ConstitutionError,
} from '../hooks/lib/constitution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(__dirname, '..', 'content', 'enterprise-baseline.md');
const MAX_TOKENS = 1000;

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

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

let baseline;
try {
  baseline = await loadBaseline(baselinePath);
} catch (err) {
  if (err instanceof ConstitutionError) {
    fail(`baseline schema error (${err.field || 'unknown'}): ${err.message}`);
  }
  throw err;
}

for (const key of REQUIRED_FRONTMATTER_FIELDS) {
  if (!baseline.frontmatter[key]) {
    fail(`baseline frontmatter missing required field: ${key}`);
  }
}

const tokens = estimateTokens(baseline.body);
if (tokens > MAX_TOKENS) {
  fail(`baseline body token 估算超限: ${tokens} > ${MAX_TOKENS}`);
  console.error('   请精简正文,或拆到 skills/ 按需加载。');
  console.error('   注意:frontmatter 和 Sync Impact Report 已被剥离,不计入预算。');
  process.exit(1);
}

console.log(`✓ baseline schema ok`);
console.log(`  version: ${baseline.frontmatter.oms_version}`);
console.log(`  ratified: ${baseline.frontmatter.ratified}`);
console.log(`  body tokens: ${tokens} / ${MAX_TOKENS}`);

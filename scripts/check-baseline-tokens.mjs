#!/usr/bin/env node
// Approximate token counter for the baseline file.
// Uses heuristic: 1 token ≈ 2 Chinese chars or 0.75 English words.
// For exact counts, swap to tiktoken — but we stay zero-deps, so heuristic is fine.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(__dirname, '..', 'content', 'enterprise-baseline.md');
const MAX_TOKENS = 1000;

function estimateTokens(text) {
  // Strip markdown syntax
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')   // code blocks
    .replace(/`[^`]*`/g, ' ')           // inline code
    .replace(/[#*_>\-]/g, ' ');          // markdown punctuation

  const chineseChars = (stripped.match(/[一-鿿]/g) ?? []).length;
  const englishWords = (stripped.match(/[a-zA-Z]+/g) ?? []).length;
  const punctuation = (stripped.match(/[，。、；：？！,.;:!?]/g) ?? []).length;

  return Math.ceil(chineseChars / 2 + englishWords / 0.75 + punctuation / 4);
}

const text = await readFile(baselinePath, 'utf8');
const tokens = estimateTokens(text);

if (tokens > MAX_TOKENS) {
  console.error(`❌ baseline token 估算超限: ${tokens} > ${MAX_TOKENS}`);
  console.error('   请精简内容，或拆到 skills/ 按需加载。');
  process.exit(1);
}
console.log(`✓ baseline token 估算: ${tokens} / ${MAX_TOKENS}`);

#!/usr/bin/env node
// 跨平台测试运行器：列出 __tests__/ 下所有 .test.js 文件并执行。
//
// 解决 GitHub Actions Windows + PowerShell 上 `find | xargs` 失败、
// macOS 18/20 默认 bash 3.x 不支持 globstar (**) 的问题。
// 用 Node 原生 fs 列出文件，跨平台一致。

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(PROJECT_ROOT, '__tests__');

async function findTests(dir) {
  const out = [];
  async function walk(d) {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out.sort();
}

async function main() {
  const files = await findTests(TESTS_DIR);
  if (files.length === 0) {
    process.stderr.write('No test files found under __tests__/\n');
    process.exit(1);
  }

  process.stderr.write(`Running ${files.length} test file(s)...\n`);

  const child = spawn('node', ['--test', ...files], {
    stdio: 'inherit',
  });
  child.on('close', (code) => process.exit(code ?? 1));
}

main().catch((err) => {
  process.stderr.write(`test runner failed: ${err.message}\n`);
  process.exit(1);
});
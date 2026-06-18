#!/usr/bin/env node
import { main } from '../uninstall.js';

const purge = process.argv.includes('--purge');
main({ purge }).catch((err) => {
  process.stderr.write(`❌ 卸载失败：${err.stack ?? err.message}\n`);
  process.exit(1);
});

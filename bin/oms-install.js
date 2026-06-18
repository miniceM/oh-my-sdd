#!/usr/bin/env node
// Manual installer entry point (mirrors postinstall behavior for re-runs)
import { main } from '../install.js';

main().catch((err) => {
  process.stderr.write(`❌ 安装失败：${err.stack ?? err.message}\n`);
  process.exit(1);
});

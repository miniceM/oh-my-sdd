#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export * from '../lib/opencode/uninstall.js';
import { main } from '../lib/opencode/uninstall.js';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[uninstall] oh-my-sdd: ${error.message}`);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
// build-opencode-plugin.mjs — version sync + tsc build for opencode plugin.
//
// Purpose:
//   1. Sync root package.json version → opencode/package.json (single source of truth)
//   2. Rebuild opencode/dist/plugin.js via tsc
//   3. Staleness guard: exit 1 if dist/plugin.js is older than src/plugin.ts
//
// Called by:
//   - npm run build:opencode (local dev)
//   - npm run prepublishOnly (CI/publish)
//   - CI workflow (opencode-plugin-ci.yml)

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OPENCODE_DIR = resolve(ROOT, 'opencode');
const ROOT_PKG_PATH = resolve(ROOT, 'package.json');
const OPENCODE_PKG_PATH = resolve(OPENCODE_DIR, 'package.json');
const OPENCODE_SRC = resolve(OPENCODE_DIR, 'src', 'plugin.ts');
const OPENCODE_DIST = resolve(OPENCODE_DIR, 'dist', 'plugin.js');

function announce(msg) {
  process.stderr.write(`[build:opencode] ${msg}\n`);
}

function getRootVersion() {
  const pkg = JSON.parse(readFileSync(ROOT_PKG_PATH, 'utf8'));
  return pkg.version;
}

function getOpenCodeVersion() {
  try {
    const pkg = JSON.parse(readFileSync(OPENCODE_PKG_PATH, 'utf8'));
    return pkg.version;
  } catch {
    return null;
  }
}

function syncVersion(version) {
  const pkg = JSON.parse(readFileSync(OPENCODE_PKG_PATH, 'utf8'));
  if (pkg.version === version) {
    announce(`opencode/package.json version already ${version} (unchanged)`);
    return false;
  }
  const before = pkg.version;
  pkg.version = version;
  writeFileSync(OPENCODE_PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
  announce(`opencode/package.json version synced: ${before} \u2192 ${version}`);
  return true;
}

function stalenessGuard() {
  try {
    const srcMtime = statSync(OPENCODE_SRC).mtimeMs;
    const distMtime = statSync(OPENCODE_DIST).mtimeMs;
    if (distMtime < srcMtime) {
      announce('\u26a0\ufe0f  dist/plugin.js is stale (older than src/plugin.ts). Rebuilding...');
      return true; // stale
    }
    return false; // fresh
  } catch {
    // If either file doesn't exist, proceed with build
    return true;
  }
}

function build() {
  announce('Building opencode plugin...');
  execSync('npx tsc', {
    cwd: OPENCODE_DIR,
    stdio: 'inherit',
  });
  announce('Build complete.');
}

// ===== Main =====
try {
  const rootVersion = getRootVersion();
  announce(`Root version: ${rootVersion}`);

  const wasVersionChanged = syncVersion(rootVersion);
  const isStale = stalenessGuard();

  if (wasVersionChanged || isStale) {
    build();
  } else {
    announce('dist is fresh, version unchanged \u2014 skipping rebuild.');
  }
} catch (err) {
  process.stderr.write(`[build:opencode] ERROR: ${err.message}\n`);
  process.exit(1);
}

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  firstNpmPackEntry,
  parseNpmPackJson,
} from '../../helpers/opencode-e2e-harness.js';
import { resolveNpmCli } from '../../helpers/resolve-npm-cli.js';

const SOURCE_ROOT = process.cwd();

function copyRepositoryFixture(root) {
  const repository = join(root, 'repository');
  for (const name of ['skills', 'content', 'hooks', 'lib', 'opencode']) {
    cpSync(join(SOURCE_ROOT, name), join(repository, name), {
      recursive: true,
      filter: (source) => !['node_modules', '.git', '.worktrees'].includes(source.split(/[\\/]/).at(-1)),
    });
  }
  return repository;
}

function runNpm(args, options) {
  return spawnSync(process.execPath, [resolveNpmCli(), ...args], {
    ...options,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('clean OpenCode source can pack and install without opencode node_modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'oms-clean-pack-'));
  const home = join(root, 'home');
  const cache = join(root, 'cache');
  const prefix = join(root, 'prefix');
  const pack = join(root, 'pack');
  mkdirSync(home, { recursive: true });
  mkdirSync(cache, { recursive: true });
  mkdirSync(pack, { recursive: true });

  try {
    const repository = copyRepositoryFixture(root);
    const opencodeDir = join(repository, 'opencode');
    const opencodeNodeModules = join(opencodeDir, 'node_modules');
    assert.equal(existsSync(opencodeNodeModules), false, 'fixture must not contain opencode/node_modules');

    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      npm_config_cache: cache,
      npm_config_prefix: prefix,
    };
    const packedResult = runNpm([
      'pack', '--json', '--pack-destination', pack,
    ], { cwd: opencodeDir, env });
    assert.equal(
      packedResult.status,
      0,
      `npm pack failed\nstdout:\n${packedResult.stdout}\nstderr:\n${packedResult.stderr}`,
    );

    const manifest = parseNpmPackJson(packedResult.stdout, packedResult.stderr);
    const entry = firstNpmPackEntry(manifest, packedResult);
    const tarball = join(pack, entry.filename);
    assert.equal(existsSync(tarball), true);
    assert.equal(
      entry.files.some(({ path }) => path.replaceAll('\\', '/').includes('node_modules/')),
      false,
      'published tarball must not include development dependencies',
    );

    const installResult = runNpm([
      'install', '--global', '--legacy-peer-deps', '--foreground-scripts',
      '--dangerously-allow-all-scripts',
      tarball,
    ], { cwd: root, env });
    assert.equal(
      installResult.status,
      0,
      `tarball install failed\nstdout:\n${installResult.stdout}\nstderr:\n${installResult.stderr}`,
    );
    assert.match(installResult.stdout + installResult.stderr, /failed=0/);
    const installedPackage = process.platform === 'win32'
      ? join(prefix, 'node_modules', '@cli-tools', 'oh-my-sdd-opencode')
      : join(prefix, 'lib', 'node_modules', '@cli-tools', 'oh-my-sdd-opencode');
    assert.equal(existsSync(join(installedPackage, 'dist', 'index.js')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

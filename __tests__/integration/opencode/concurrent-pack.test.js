import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { resolveNpmCli } from '../../helpers/resolve-npm-cli.js';

const SOURCE_ROOT = process.cwd();
const PRIMARY_DELEGATES = [
  'brainstorming',
  'writing-plans',
  'executing-plans',
  'subagent-driven-development',
  'requesting-code-review',
];
function parsePackManifest(output) {
  const json = output.match(/(^|\n)(\[\s*\{[\s\S]*\}\s*\])\s*$/)?.[2];
  assert.ok(json, `npm pack did not emit a JSON manifest:\n${output}`);
  return JSON.parse(json);
}

function createRepositoryFixture(root) {
  const repository = join(root, 'repository');
  for (const name of ['skills', 'content', 'hooks', 'lib', 'opencode']) {
    cpSync(join(SOURCE_ROOT, name), join(repository, name), {
      recursive: true,
      filter: (source) => !['node_modules', '.git', '.worktrees'].includes(source.split(/[\\/]/).at(-1)),
    });
  }
  const opencodeDir = join(repository, 'opencode');
  // Drop every pre-copied mirror so the pack's prepack sync is the only way
  // these destinations can exist; the later assertions then prove the
  // concurrent syncs materialized complete trees.
  for (const rel of ['skills', '.opencode/skills', '.agents/skills', '.agents/command', 'content', 'hooks', 'lib']) {
    rmSync(join(opencodeDir, rel), { recursive: true, force: true });
  }
  const packagePath = join(opencodeDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  packageJson.scripts.prepack = 'npm run sync:resources';
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  return repository;
}

function directoryDigest(root) {
  const hash = createHash('sha256');
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) hash.update(relative(root, path)).update('\0').update(readFileSync(path));
    }
  };
  visit(root);
  return hash.digest('hex');
}

function findSyncResidue(root) {
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.includes('.oh-my-sdd-sync.')) found.push(path);
        else visit(path);
      }
    }
  };
  if (existsSync(root)) visit(root);
  return found;
}

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      ...options,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('concurrent package syncs are serialized and leave the worktree unchanged', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oms-concurrent-pack-'));
  try {
    const sourceMirror = join(SOURCE_ROOT, 'opencode', 'oms-skills');
    const sourceDigestBefore = directoryDigest(sourceMirror);
    const repository = createRepositoryFixture(root);
    const opencodeDir = join(repository, 'opencode');
    const npmCli = resolveNpmCli();

    const runs = [0, 1].map((index) => {
      const cache = join(root, `cache-${index}`);
      const destination = join(root, `pack-${index}`);
      mkdirSync(cache, { recursive: true });
      mkdirSync(destination, { recursive: true });
      return run(process.execPath, [npmCli,
        'pack',
        '--dry-run',
        '--json',
        '--silent',
        '--cache', cache,
        '--pack-destination', destination,
      ], { cwd: opencodeDir });
    });

    for (const result of await Promise.all(runs)) {
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const manifest = parsePackManifest(result.stdout);
      const files = manifest[0].files.map(({ path }) => path.replaceAll('\\', '/'));
      for (const skill of PRIMARY_DELEGATES) {
        assert.ok(
          files.includes(`delegated-skills/${skill}/SKILL.md`),
          `package must include delegated-skills/${skill}/SKILL.md`,
        );
      }
      for (const required of ['content/enterprise-baseline.md', 'hooks/hooks.json', 'lib/rules.js']) {
        assert.ok(
          files.includes(required),
          `package must include ${required} materialized by prepack sync`,
        );
      }
    }

    // Directly verify every sync destination tree equals its source: the fixture
    // packs run the real prepack synchronizer concurrently, so the final state
    // must be complete and correct rather than half-synced.
    const skillsSource = join(repository, 'skills');
    const skillsDigest = directoryDigest(skillsSource);
    for (const target of [
      join(opencodeDir, 'skills'),
      join(opencodeDir, 'oms-skills'),
      join(opencodeDir, '.opencode', 'skills'),
      join(opencodeDir, '.agents', 'skills'),
    ]) {
      assert.equal(directoryDigest(target), skillsDigest, `${target} must mirror the skills source`);
    }
    assert.equal(
      directoryDigest(join(opencodeDir, 'content')),
      directoryDigest(join(repository, 'content')),
      'content sync destination must mirror its source',
    );
    assert.equal(
      directoryDigest(join(opencodeDir, 'hooks')),
      directoryDigest(join(repository, 'hooks')),
      'hooks sync destination must mirror its source',
    );
    assert.equal(
      directoryDigest(join(opencodeDir, 'lib')),
      directoryDigest(join(repository, 'lib')),
      'lib sync destination must mirror its source',
    );
    assert.equal(
      directoryDigest(join(opencodeDir, '.agents', 'command')),
      directoryDigest(join(opencodeDir, '.opencode', 'commands')),
      'agents command mirror must match the authored commands',
    );
    assert.deepEqual(
      findSyncResidue(opencodeDir),
      [],
      'no staging, backup, or lock residue may survive concurrent packs',
    );
    assert.equal(directoryDigest(sourceMirror), sourceDigestBefore, 'fixture pack must not mutate source files');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

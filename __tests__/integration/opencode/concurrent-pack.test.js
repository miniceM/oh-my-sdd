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
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative } from 'node:path';

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

function resolveNpmCli() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return process.env.npm_execpath;
  }
  const candidates = [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    candidates.push(join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    const launcher = join(directory, process.platform === 'win32' ? 'npm.cmd' : 'npm');
    if (process.platform !== 'win32' && existsSync(launcher)) {
      try { candidates.push(realpathSync(launcher)); } catch { /* try the next candidate */ }
    }
  }
  const npmCli = candidates.find((candidate) => existsSync(candidate));
  assert.ok(npmCli, 'could not resolve npm-cli.js for shell-free package test');
  return npmCli;
}

function createRepositoryFixture(root) {
  const repository = join(root, 'repository');
  for (const name of ['skills', 'content', 'hooks', 'opencode']) {
    cpSync(join(SOURCE_ROOT, name), join(repository, name), {
      recursive: true,
      filter: (source) => !['node_modules', '.git', '.worktrees'].includes(source.split(/[\\/]/).at(-1)),
    });
  }
  const packagePath = join(repository, 'opencode', 'package.json');
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
      const files = manifest[0].files.map(({ path }) => path);
      for (const skill of PRIMARY_DELEGATES) {
        assert.ok(
          files.includes(`delegated-skills/${skill}/SKILL.md`),
          `package must include delegated-skills/${skill}/SKILL.md`,
        );
      }
    }
    assert.equal(directoryDigest(sourceMirror), sourceDigestBefore, 'fixture pack must not mutate source files');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

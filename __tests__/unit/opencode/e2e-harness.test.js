import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import {
  buildE2eEnv,
  createE2eSandbox,
  formatE2eFailure,
  firstNpmPackEntry,
  findJsonEnd,
  normalizeManifest,
  parseNpmPackJson,
  publishedCommands,
  publishedSkills,
  writePluginLoader,
} from '../../../__tests__/helpers/opencode-e2e-harness.js';
import {
  createFakeOpenCodeCli,
  createOpenCodeTestSandbox,
} from '../../../__tests__/helpers/opencode-test-env.js';

test('OpenCode test sandbox isolates every mutable OpenCode, npm, and temporary path', () => {
  const previousSentinel = process.env.OMS_E2E_TEST_SECRET;
  process.env.OMS_E2E_TEST_SECRET = 'must-not-reach-opencode';
  const sandbox = createOpenCodeTestSandbox(process.cwd());
  try {
    const { env, root } = sandbox;
    for (const value of [
      env.HOME, env.USERPROFILE, env.npm_config_prefix, env.npm_config_cache,
      env.XDG_CONFIG_HOME, env.OPENCODE_CONFIG, env.OPENCODE_CONFIG_DIR,
      env.TEMP, env.TMP, env.TMPDIR,
    ]) assert.ok(value.startsWith(root), `${value} must be inside ${root}`);
    assert.equal(env.PATH.split(delimiter)[0], join(process.cwd(), 'scripts'));
    assert.equal(env.OMS_E2E_TEST_SECRET, undefined);
    assert.ok(existsSync(sandbox.projectDir));
    assert.ok(existsSync(sandbox.artifactsDir));
  } finally {
    if (previousSentinel === undefined) delete process.env.OMS_E2E_TEST_SECRET;
    else process.env.OMS_E2E_TEST_SECRET = previousSentinel;
    sandbox.cleanup();
  }
});

test('fake OpenCode CLI records the native installation command and updates sandbox config', () => {
  const sandbox = createOpenCodeTestSandbox(process.cwd());
  try {
    const fake = createFakeOpenCodeCli(sandbox);
    const args = ['plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force'];
    const result = process.platform === 'win32'
      ? spawnSync(process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe', [
        '/d', '/s', '/c', fake.launcherPath, ...args,
      ], { env: fake.env, encoding: 'utf8' })
      : spawnSync(fake.launcherPath, args, { env: fake.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fake.readInvocations(), [[
      'plugin', '@cli-tools/oh-my-sdd-opencode', '--global', '--force',
    ]]);
    assert.ok(JSON.parse(readFileSync(sandbox.env.OPENCODE_CONFIG, 'utf8')).plugin
      .includes('@cli-tools/oh-my-sdd-opencode'));
    if (process.platform === 'win32') assert.match(fake.launcherPath, /\.cmd$/i);
  } finally {
    sandbox.cleanup();
  }
});

test('OpenCode E2E harness publishes the six supported commands and excludes constitution', () => {
  const commands = publishedCommands(join(process.cwd(), 'opencode'));
  assert.deepEqual(commands, [
    'sdd-apply', 'sdd-doc', 'sdd-plan', 'sdd-review', 'sdd-spec', 'sdd-task',
  ]);
  assert.ok(!commands.includes('sdd-constitution'));
});

test('OpenCode E2E harness derives every published OMS skill from the package', () => {
  const skills = publishedSkills(join(process.cwd(), 'opencode'));
  assert.ok(skills.length > 0);
  assert.ok(skills.includes('api-design'));
  assert.ok(skills.includes('sdd-apply'));
  assert.ok(!skills.includes('brainstorming'));
});

test('OpenCode E2E harness formats hook failures with environment and artifact context', () => {
  const detail = formatE2eFailure({
    phase: 'hook-env',
    platform: 'win32',
    node: 'v22.0.0',
    opencode: 'opencode-ai@1.18.15',
    artifactsDir: '/tmp/artifacts',
    output: 'expected denial was missing',
  });
  assert.match(detail, /phase=hook-env/);
  assert.match(detail, /platform=win32/);
  assert.match(detail, /node=v22\.0\.0/);
  assert.match(detail, /opencode=opencode-ai@1\.18\.15/);
  assert.match(detail, /artifacts=\/tmp\/artifacts/);
  assert.match(detail, /expected denial was missing/);
});

test('OpenCode E2E harness extracts npm pack JSON after lifecycle output', () => {
  const packed = parseNpmPackJson(
    '[copy-resources] synced\n[{"filename":"plugin.tgz"}]\nnotice: pack complete\n',
    'npm lifecycle diagnostics\n',
  );
  assert.deepEqual(packed, [{ filename: 'plugin.tgz' }]);
});

test('OpenCode E2E harness normalizes npm 12 object manifest with package name key', () => {
  const packed = parseNpmPackJson(
    '[copy-resources] { "status": "ok" }\n{"@cli-tools/oh-my-sdd-opencode":{"filename":"plugin-0.2.1.tgz","files":[]}}\nnotice: pack complete\n',
    'npm lifecycle diagnostics\n',
  );
  assert.deepEqual(packed, [{ filename: 'plugin-0.2.1.tgz', files: [] }]);
});

test('OpenCode E2E harness normalizes top-level object manifest', () => {
  const packed = parseNpmPackJson(
    '{"filename":"plugin-0.2.1.tgz","files":[]}\n',
    '',
  );
  assert.deepEqual(packed, [{ filename: 'plugin-0.2.1.tgz', files: [] }]);
});

test('OpenCode E2E harness reports stdout and stderr when npm pack JSON is missing', () => {
  assert.throws(
    () => parseNpmPackJson('[copy-resources] synced\nnot-json\n', 'npm pack failed\n'),
    /stdout:[\s\S]*not-json[\s\S]*stderr:[\s\S]*npm pack failed/,
  );
});

test('OpenCode E2E harness reports stdout and stderr when filename is missing', () => {
  assert.throws(
    () => firstNpmPackEntry([{}], { stdout: 'manifest stdout', stderr: 'manifest stderr' }),
    /filename[\s\S]*manifest stdout[\s\S]*manifest stderr/,
  );
});

test('CI workflows install OpenCode build dependencies without running root lifecycle scripts', () => {
  for (const workflowName of ['ci.yml', 'opencode-e2e.yml']) {
    const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', workflowName), 'utf8');
    assert.match(workflow, /npm (?:install|ci) --ignore-scripts/);
    assert.match(workflow, /npm ci --prefix opencode --ignore-scripts/);
  }
});

test('CI synchronizes generated OpenCode resources before test and coverage runs', () => {
  const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
  const syncStep = 'npm run sync:resources --prefix opencode';
  assert.ok(workflow.includes(syncStep));
  assert.ok(workflow.indexOf(syncStep) < workflow.indexOf('- run: npm test'));
  assert.ok(workflow.indexOf(syncStep) < workflow.indexOf('- run: npm run test:coverage'));
});

test('OpenCode E2E workflow uploads hidden failure artifacts', () => {
  const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'opencode-e2e.yml'), 'utf8');
  assert.match(workflow, /include-hidden-files:\s*true/);
});

test('OpenCode E2E workflow runs the AGENTS lifecycle tests on every platform', () => {
  const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'opencode-e2e.yml'), 'utf8');
  assert.match(workflow, /npm run --prefix opencode build/);
  assert.match(workflow, /npm run sync:resources --prefix opencode/);
  assert.match(workflow, /node --test __tests__\/unit\/opencode\/resource-scripts\.test\.js/);
});

test('OpenCode E2E workflow repeats resource sync against an existing destination', () => {
  const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'opencode-e2e.yml'), 'utf8');
  const syncCount = workflow.match(/npm run sync:resources --prefix opencode/g)?.length ?? 0;
  assert.ok(syncCount >= 2, `expected repeated resource sync, found ${syncCount} invocation(s)`);
});

test('OpenCode E2E workflow prepends repository mocks on Windows without Bash', () => {
  const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'opencode-e2e.yml'), 'utf8');
  assert.match(workflow, /if: runner\.os == 'Windows'/);
  assert.match(workflow, /shell: pwsh/);
  assert.match(workflow, /Add-Content -Path \$env:GITHUB_PATH/);
  assert.doesNotMatch(workflow, /name: Put repository mocks first on PATH\n\s+shell: bash/);
});

test('OpenCode E2E workflow owns dependency installation instead of the test body', () => {
  const source = readFileSync(join(process.cwd(), '__tests__', 'integration', 'opencode', 'real-cli-e2e.test.js'), 'utf8');
  assert.doesNotMatch(source, /execNpm\(\['ci', '--prefix', 'opencode'/);
});

test('OpenCode E2E harness loader re-exports only the globally installed tarball plugin', () => {
  const root = mkdtempSync(join(tmpdir(), 'oms-opencode-e2e-loader-'));
  const configDir = join(root, 'xdg-config', 'opencode');
  const packageRoot = join(process.cwd(), 'opencode');
  try {
    const loader = writePluginLoader({ configDir, packageRoot });
    assert.equal(loader, join(configDir, 'plugins', 'oh-my-sdd-e2e.js'));
    assert.equal(readFileSync(join(configDir, 'plugins', 'package.json'), 'utf8'), '{"type":"module"}\n');
    assert.ok(existsSync(loader));
    const source = readFileSync(loader, 'utf8');
    assert.match(source, /export \{ OhMySddPlugin \}/);
    assert.match(source, /file:/);
    assert.match(source, /dist\/index\.js/);
    assert.ok(!source.includes("@cli-tools/oh-my-sdd-opencode'"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('OpenCode E2E sandbox creates disposable project and artifact roots', () => {
  const sandbox = createE2eSandbox(process.cwd());
  try {
    assert.ok(existsSync(sandbox.home));
    assert.ok(existsSync(sandbox.projectDir));
    assert.ok(existsSync(sandbox.artifactsDir));
    assert.equal(sandbox.env.OPENCODE_CONFIG, join(sandbox.root, 'xdg-config', 'opencode', 'opencode.json'));
  } finally {
    sandbox.cleanup();
    rmSync(sandbox.artifactsDir, { recursive: true, force: true });
  }
  assert.ok(!existsSync(sandbox.root));
});

test('OpenCode E2E sandbox cleanup preserves failure artifacts for upload', () => {
  const sandbox = createE2eSandbox(process.cwd());
  const evidence = join(sandbox.artifactsDir, 'failure.log');
  try {
    writeFileSync(evidence, 'hook failure evidence');
    sandbox.cleanup();
    assert.equal(existsSync(evidence), true);
  } finally {
    rmSync(sandbox.artifactsDir, { recursive: true, force: true });
  }
});

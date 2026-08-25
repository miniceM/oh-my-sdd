import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

test('OpenCode E2E harness isolates every mutable OpenCode and npm path', () => {
  const root = mkdtempSync(join(tmpdir(), 'oms-opencode-e2e-env-'));
  const previousSentinel = process.env.OMS_E2E_TEST_SECRET;
  process.env.OMS_E2E_TEST_SECRET = 'must-not-reach-opencode';
  try {
    const env = buildE2eEnv({ repoRoot: process.cwd(), root });
    assert.equal(env.HOME, join(root, 'home'));
    assert.equal(env.USERPROFILE, join(root, 'home'));
    assert.equal(env.npm_config_prefix, join(root, 'prefix'));
    assert.equal(env.npm_config_cache, join(root, 'npm-cache'));
    assert.equal(env.XDG_CONFIG_HOME, join(root, 'xdg-config'));
    assert.equal(env.OPENCODE_CONFIG, join(root, 'xdg-config', 'opencode', 'opencode.json'));
    assert.equal(env.OPENCODE_CONFIG_DIR, join(root, 'xdg-config', 'opencode'));
    assert.ok(env.PATH.startsWith(join(process.cwd(), 'scripts')));
    assert.equal(env.OMS_E2E_TEST_SECRET, undefined);
  } finally {
    if (previousSentinel === undefined) delete process.env.OMS_E2E_TEST_SECRET;
    else process.env.OMS_E2E_TEST_SECRET = previousSentinel;
    rmSync(root, { recursive: true, force: true });
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

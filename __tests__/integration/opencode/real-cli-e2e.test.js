import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { rmSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';

import {
  createE2eSandbox,
  parseNpmPackJson,
  publishedCommands,
  writePluginLoader,
} from '../../helpers/opencode-e2e-harness.js';

const nodeMajor = Number(process.versions.node.split('.')[0]);
const enabled = process.env.OMS_OPENCODE_E2E === '1' && nodeMajor === 22;
const packageName = process.env.OPENCODE_PACKAGE ?? 'opencode-ai';
const version = process.env.OPENCODE_VERSION;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, { timeoutMs = 30_000, ...options }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function fail(phase, result, sandbox) {
  const detail = [
    `phase=${phase}`,
    `platform=${process.platform}`,
    `node=${process.version}`,
    `opencode=${packageName}@${version}`,
    `artifacts=${sandbox.artifactsDir}`,
    `timedOut=${result.timedOut ?? false}`,
    `stdout=${result.stdout}`,
    `stderr=${result.stderr}`,
  ].join('\n');
  assert.equal(result.code, 0, detail);
}

function stream(response, delta, finishReason = null) {
  response.write(`data: ${JSON.stringify({
    id: 'e2e',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`);
}

async function startProvider(transcript, projectDir) {
  const seenCases = new Set();
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const marker = body.match(/E2E_CASE=([a-z-]+)/)?.[1];
      transcript.push({ method: request.method, url: request.url, marker, body });
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
      const scriptedTools = {
        safe: ['write', { filePath: join(projectDir, 'safe.txt'), content: 'safe content' }],
        aws: ['write', { filePath: join(projectDir, 'aws.txt'), content: 'AKIAIOSFODNN7EXAMPLE' }],
        openai: ['write', { filePath: join(projectDir, 'openai.txt'), content: 'sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
        env: ['write', { filePath: join(projectDir, '.env'), content: 'SECRET=value' }],
        rm: ['bash', { command: 'rm -rf /' }],
        force: ['bash', { command: 'git push --force origin main' }],
      };
      if (marker && !seenCases.has(marker)) {
        seenCases.add(marker);
        const [name, args] = scriptedTools[marker];
        stream(response, {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: `call_${marker}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          }],
        }, 'tool_calls');
      } else {
        stream(response, { role: 'assistant', content: 'E2E command completed' });
        stream(response, {}, 'stop');
      }
      response.end('data: [DONE]\n\n');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test('real OpenCode CLI loads commands and the globally installed tarball plugin', {
  skip: !enabled && 'requires OMS_OPENCODE_E2E=1 on the pinned Node 22 runtime',
}, async () => {
  assert.ok(version, 'OPENCODE_VERSION is required when OMS_OPENCODE_E2E=1');
  const sandbox = createE2eSandbox(process.cwd());
  const transcript = [];
  let provider;
  let passed = false;
  try {
    execFileSync(npm, ['ci', '--prefix', 'opencode'], { cwd: process.cwd(), stdio: 'inherit' });
    const packed = parseNpmPackJson(execFileSync(npm, [
      'pack', '--json', '--pack-destination', sandbox.packDir,
    ], {
      cwd: join(process.cwd(), 'opencode'), env: sandbox.env, encoding: 'utf8',
    }));
    const tarball = join(sandbox.packDir, packed[0].filename);
    writeFileSync(join(sandbox.artifactsDir, 'tarball-manifest.json'), JSON.stringify(packed, null, 2));

    const install = await run(npm, [
      'install', '--global', '--foreground-scripts', '--legacy-peer-deps', tarball,
    ], { env: sandbox.env, cwd: sandbox.projectDir });
    writeFileSync(join(sandbox.artifactsDir, 'plugin-install.log'), `${install.stdout}\n${install.stderr}`);
    fail('install-plugin-tarball', install, sandbox);
    assert.match(`${install.stdout}\n${install.stderr}`, /failed=0/, 'postinstall must report no resource failures');

    const npmRoot = execFileSync(npm, ['root', '--global'], { env: sandbox.env, encoding: 'utf8' }).trim();
    const packageRoot = join(npmRoot, '@cli-tools', 'oh-my-sdd-opencode');
    writePluginLoader({ root: sandbox.root, packageRoot });
    assert.deepEqual(publishedCommands(packageRoot), [
      'sdd-apply', 'sdd-doc', 'sdd-plan', 'sdd-review', 'sdd-spec', 'sdd-task',
    ]);

    const cliInstall = await run(npm, [
      'install', '--global', '--foreground-scripts', `${packageName}@${version}`,
    ], { env: sandbox.env, cwd: sandbox.projectDir });
    writeFileSync(join(sandbox.artifactsDir, 'opencode-install.log'), `${cliInstall.stdout}\n${cliInstall.stderr}`);
    fail('install-opencode-cli', cliInstall, sandbox);

    provider = await startProvider(transcript, sandbox.projectDir);
    writeFileSync(sandbox.env.OPENCODE_CONFIG, JSON.stringify({
      '$schema': 'https://opencode.ai/config.json',
      provider: {
        openai: {
          options: { apiKey: 'e2e-not-a-secret', baseURL: provider.baseURL },
          models: { 'gpt-4o-mini': { name: 'gpt-4o-mini' } },
        },
      },
      model: 'openai/gpt-4o-mini',
      autoupdate: false,
    }, null, 2));

    const executable = process.platform === 'win32'
      ? join(sandbox.prefix, 'opencode.cmd')
      : join(sandbox.prefix, 'bin', 'opencode');
    for (const command of publishedCommands(packageRoot)) {
      const result = await run(executable, [
        'run', '--format', 'json', '--command', command, 'E2E command discovery',
      ], { env: sandbox.env, cwd: sandbox.projectDir, timeoutMs: 30_000 });
      writeFileSync(join(sandbox.artifactsDir, `${command}.log`), `${result.stdout}\n${result.stderr}`);
      fail(`command-${command}`, result, sandbox);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Unexpected server error/i);
    }
    for (const [name, expectedDecision] of [
      ['safe', 'allow'], ['aws', 'deny'], ['openai', 'deny'], ['env', 'deny'], ['rm', 'deny'], ['force', 'deny'],
    ]) {
      const result = await run(executable, ['run', '--format', 'json', `E2E_CASE=${name}`], {
        env: sandbox.env, cwd: sandbox.projectDir, timeoutMs: 30_000,
      });
      const output = `${result.stdout}\n${result.stderr}`;
      writeFileSync(join(sandbox.artifactsDir, `hook-${name}.log`), output);
      assert.equal(result.timedOut, false, `hook-${name} timed out; artifacts=${sandbox.artifactsDir}`);
      if (expectedDecision === 'allow') {
        fail(`hook-${name}`, result, sandbox);
      } else {
        assert.match(output, /HARD_RULE violated|hardcoded-|destructive-|env-file-edit/, `hook-${name}: ${output}`);
      }
    }
    assert.ok(transcript.length >= 12, 'scripted provider should observe commands and tool invocations');
    writeFileSync(join(sandbox.artifactsDir, 'provider-transcript.json'), JSON.stringify(transcript, null, 2));
    passed = true;
  } finally {
    if (provider) await provider.close();
    sandbox.cleanup();
    if (passed) rmSync(sandbox.artifactsDir, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import {
  createE2eSandbox,
  firstNpmPackEntry,
  formatE2eFailure,
  parseNpmPackJson,
  publishedCommands,
  publishedSkills,
  writePluginLoader,
} from '../../helpers/opencode-e2e-harness.js';

const nodeMajor = Number(process.versions.node.split('.')[0]);
export const supportedE2eNodeMajors = [18, 22];
const enabled = process.env.OMS_OPENCODE_E2E === '1' && supportedE2eNodeMajors.includes(nodeMajor);
const packageName = process.env.OPENCODE_PACKAGE ?? 'opencode-ai';
const version = process.env.OPENCODE_VERSION;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const defaultCommandTimeoutMs = process.platform === 'win32' ? 120_000 : 30_000;
export const commandTimeoutByNodeMajor = Object.freeze({
  18: 120_000,
  22: defaultCommandTimeoutMs,
});
const commandTimeoutMs = commandTimeoutByNodeMajor[nodeMajor] ?? defaultCommandTimeoutMs;
const cliInstallTimeoutMs = 120_000;
const managedAgentsMarker = '<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->';

test('real OpenCode E2E is eligible on every supported Node runtime', () => {
  assert.deepEqual(supportedE2eNodeMajors, [18, 22]);
});

test('real OpenCode E2E leaves Node 18 enough time to initialize the real CLI', () => {
  assert.equal(commandTimeoutByNodeMajor[18], 120_000);
});

test('real OpenCode E2E verifies write outcomes on disk, not only hook output', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'oms-opencode-write-outcome-'));
  try {
    const safePath = join(projectDir, 'safe.txt');
    writeFileSync(safePath, 'safe content');
    assertToolWriteFilesystemOutcome('safe', projectDir, 'safe write evidence');

    for (const [name, filename] of [['aws', 'aws.txt'], ['openai', 'openai.txt'], ['env', '.env']]) {
      writeFileSync(join(projectDir, filename), 'blocked secret');
      assert.throws(
        () => assertToolWriteFilesystemOutcome(name, projectDir, `${name} denial evidence`),
        new RegExp(`must not create ${filename.replace('.', '\\.')}`),
      );
      rmSync(join(projectDir, filename));
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

export function assertToolWriteFilesystemOutcome(name, projectDir, detail) {
  const paths = {
    safe: join(projectDir, 'safe.txt'),
    aws: join(projectDir, 'aws.txt'),
    openai: join(projectDir, 'openai.txt'),
    env: join(projectDir, '.env'),
  };
  const target = paths[name];
  if (!target) return;
  if (name === 'safe') {
    assert.ok(existsSync(target), `safe write must create safe.txt\n${detail}`);
    assert.equal(readFileSync(target, 'utf8'), 'safe content', `safe write content mismatch\n${detail}`);
    return;
  }
  assert.equal(existsSync(target), false, `denied write must not create ${name === 'env' ? '.env' : `${name}.txt`}\n${detail}`);
}

export function requestMessages(body) {
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

function messageText(message) {
  if (typeof message?.content === 'string') return message.content;
  if (!Array.isArray(message?.content)) return '';
  return message.content.map((part) => typeof part?.text === 'string' ? part.text : '').join('\n');
}

export function classifyProviderRequest(messages) {
  const text = messages.map(messageText).join('\n');
  if (text.includes('Generate a title for this conversation:')) return 'title';
  if (text.includes('Create a new anchored summary from the conversation history.')
    || text.includes('Update the anchored summary below using the conversation history above.')) {
    return 'compaction';
  }
  return 'normal';
}

export function hasMisplacedSystemMessage(messages) {
  return messages.some((message, index) => index > 0 && message?.role === 'system');
}

test('provider transcript classifies internal requests and rejects misplaced system messages', () => {
  const normal = [{ role: 'system', content: managedAgentsMarker }, { role: 'user', content: 'hello' }];
  const title = [{ role: 'user', content: 'Generate a title for this conversation:\nhello' }];
  const compaction = [{ role: 'user', content: 'Create a new anchored summary from the conversation history.' }];

  assert.equal(classifyProviderRequest(normal), 'normal');
  assert.equal(classifyProviderRequest(title), 'title');
  assert.equal(classifyProviderRequest(compaction), 'compaction');
  assert.equal(hasMisplacedSystemMessage(normal), false);
  assert.equal(hasMisplacedSystemMessage([...normal, { role: 'system', content: 'late' }]), true);
  assert.deepEqual(requestMessages('{"messages":[{"role":"user","content":"hello"}]}'), [
    { role: 'user', content: 'hello' },
  ]);
});

function quoteForCmd(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function npmInvocation(args) {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  }
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', [npm, ...args].map(quoteForCmd).join(' ')],
    };
  }
  return { command: npm, args };
}

function execNpm(args, options) {
  const invocation = npmInvocation(args);
  return execFileSync(invocation.command, invocation.args, options);
}

function execNpmWithOutput(args, options) {
  const invocation = npmInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    ...options,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(result.status, 0, `npm command failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function run(command, args, { timeoutMs = 30_000, ...options }) {
  return new Promise((resolve, reject) => {
    const isWindowsShim = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
    const child = spawn(command, args, { ...options, shell: isWindowsShim, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let timedOut = false;
    let forceKill;
    const killTree = () => {
      if (process.platform === 'win32' && child.pid) {
        try {
          execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
          return;
        } catch { /* Fall through to Node's direct child termination. */ }
      }
      child.kill('SIGTERM');
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
      forceKill = setTimeout(() => {
        if (child.exitCode === null) killTree();
      }, 1_000);
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      clearTimeout(forceKill);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      clearTimeout(forceKill);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function runNpm(args, options) {
  const invocation = npmInvocation(args);
  return run(invocation.command, invocation.args, options);
}

function fail(phase, result, sandbox) {
  const detail = formatE2eFailure({
    phase,
    opencode: `${packageName}@${version}`,
    artifactsDir: sandbox.artifactsDir,
    timedOut: result.timedOut ?? false,
    output: `stdout=${result.stdout}\nstderr=${result.stderr}`,
  });
  assert.equal(result.code, 0, detail);
}

function stream(response, delta, finishReason = null, usage) {
  response.write(`data: ${JSON.stringify({
    id: 'e2e',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(usage ? { usage } : {}),
  })}\n\n`);
}

async function startProvider(transcript, projectDir) {
  const seenCases = new Set();
  let overflowIssued = false;
  const server = createServer((request, response) => {
    if (request.method === 'GET' && request.url?.endsWith('/models')) {
      transcript.push({ method: request.method, url: request.url, marker: null, body: '' });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'gpt-4o-mini', object: 'model' }] }));
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const marker = body.match(/E2E_CASE=([a-z-]+)/)?.[1];
      const messages = requestMessages(body);
      const kind = classifyProviderRequest(messages);
      const shouldOverflow = kind === 'normal'
        && !overflowIssued
        && body.includes('Verify the managed enterprise instructions.');
      if (shouldOverflow) overflowIssued = true;
      transcript.push({ method: request.method, url: request.url, marker, kind, messages, body });
      if (hasMisplacedSystemMessage(messages)) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          error: { message: 'system message must be at the beginning', type: 'invalid_request_error' },
        }));
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
      const scriptedTools = {
        safe: ['write', { filePath: join(projectDir, 'safe.txt'), content: 'safe content' }],
        aws: ['write', { filePath: join(projectDir, 'aws.txt'), content: 'AKIAIOSFODNN7EXAMPLE' }],
        openai: ['write', { filePath: join(projectDir, 'openai.txt'), content: 'sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
        env: ['write', { filePath: join(projectDir, '.env'), content: 'SECRET=value' }],
        rm: ['bash', { command: 'rm -rf /' }],
        force: ['bash', { command: 'git push --force origin main' }],
      };
      if (marker && body.includes('"tools":') && !seenCases.has(marker)) {
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
        stream(response, {}, 'stop', {
          prompt_tokens: shouldOverflow ? 15_000 : 100,
          completion_tokens: 10,
          total_tokens: shouldOverflow ? 15_010 : 110,
        });
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
  skip: !enabled && 'requires OMS_OPENCODE_E2E=1 on supported Node 18 or 22',
}, async () => {
  assert.ok(version, 'OPENCODE_VERSION is required when OMS_OPENCODE_E2E=1');
  const sandbox = createE2eSandbox(process.cwd());
  const transcript = [];
  let provider;
  let passed = false;
  try {
    if (process.platform === 'win32') {
      execNpm([
        'install', '--prefix', sandbox.toolchainDir, '--ignore-scripts', '--no-package-lock', '--no-save',
        '@vscode/ripgrep-win32-x64@1.18.0',
      ], { cwd: sandbox.projectDir, env: sandbox.env, stdio: 'inherit' });
      sandbox.env.PATH = `${join(sandbox.toolchainDir, 'node_modules', '@vscode', 'ripgrep-win32-x64', 'bin')}${delimiter}${sandbox.env.PATH}`;
    }
    const packResult = execNpmWithOutput([
      'pack', '--json', '--pack-destination', sandbox.packDir,
    ], {
      cwd: join(process.cwd(), 'opencode'), env: sandbox.env, encoding: 'utf8',
    });
    const packed = parseNpmPackJson(packResult.stdout, packResult.stderr);
    const packEntry = firstNpmPackEntry(packed, packResult);
    const tarball = join(sandbox.packDir, packEntry.filename);
    writeFileSync(join(sandbox.artifactsDir, 'tarball-manifest.json'), JSON.stringify(packed, null, 2));

    const install = await runNpm([
      'install', '--global', '--foreground-scripts', '--legacy-peer-deps',
      '--dangerously-allow-all-scripts',
      tarball,
    ], { env: sandbox.env, cwd: sandbox.projectDir });
    writeFileSync(join(sandbox.artifactsDir, 'plugin-install.log'), `${install.stdout}\n${install.stderr}`);
    fail('install-plugin-tarball', install, sandbox);
    assert.match(`${install.stdout}\n${install.stderr}`, /failed=0/, 'postinstall must report no resource failures');

    const npmRoot = execNpm(['root', '--global'], { env: sandbox.env, encoding: 'utf8' }).trim();
    const packageRoot = join(npmRoot, '@cli-tools', 'oh-my-sdd-opencode');
    const loader = writePluginLoader({ configDir: sandbox.env.OPENCODE_CONFIG_DIR, packageRoot });
    assert.deepEqual(publishedCommands(packageRoot), [
      'sdd-apply', 'sdd-doc', 'sdd-plan', 'sdd-review', 'sdd-spec', 'sdd-task',
    ]);
    for (const skill of publishedSkills(packageRoot)) {
      const installedSkill = join(sandbox.env.OPENCODE_CONFIG_DIR, 'skills', skill, 'SKILL.md');
      const detail = formatE2eFailure({
        phase: `skill-${skill}`,
        opencode: `${packageName}@${version}`,
        artifactsDir: sandbox.artifactsDir,
        output: `expected installed skill=${installedSkill}`,
      });
      assert.ok(existsSync(installedSkill), detail);
      assert.match(readFileSync(installedSkill, 'utf8'), /\S/, detail);
    }

    const cliInstall = await runNpm([
      'install', '--global', '--foreground-scripts', `${packageName}@${version}`,
    ], { env: sandbox.env, cwd: sandbox.projectDir, timeoutMs: cliInstallTimeoutMs });
    writeFileSync(join(sandbox.artifactsDir, 'opencode-install.log'), `${cliInstall.stdout}\n${cliInstall.stderr}`);
    fail('install-opencode-cli', cliInstall, sandbox);

    provider = await startProvider(transcript, sandbox.projectDir);
    writeFileSync(sandbox.env.OPENCODE_CONFIG, JSON.stringify({
      '$schema': 'https://opencode.ai/config.json',
      provider: {
        e2e: {
          npm: '@ai-sdk/openai-compatible',
          name: 'E2E local provider',
          options: { apiKey: 'e2e-not-a-secret', baseURL: provider.baseURL },
          models: {
            'gpt-4o-mini': {
              name: 'gpt-4o-mini',
              limit: { context: 16_000, output: 1_000 },
            },
          },
        },
      },
      model: 'e2e/gpt-4o-mini',
      permission: { edit: 'allow', bash: 'allow', external_directory: 'allow' },
      autoupdate: false,
    }, null, 2));

    const executable = process.platform === 'win32'
      ? join(sandbox.prefix, 'opencode.cmd')
      : join(sandbox.prefix, 'bin', 'opencode');
    const conversation = await run(executable, [
      'run', '--print-logs', '--format', 'json', 'Verify the managed enterprise instructions.',
    ], { env: sandbox.env, cwd: sandbox.projectDir, timeoutMs: commandTimeoutMs });
    writeFileSync(join(sandbox.artifactsDir, 'conversation.log'), `${conversation.stdout}\n${conversation.stderr}`);
    fail('conversation', conversation, sandbox);

    const compact = await run(executable, [
      'run', '--continue', '--print-logs', '--format', 'json', 'Continue after the deterministic high-token turn.',
    ], { env: sandbox.env, cwd: sandbox.projectDir, timeoutMs: commandTimeoutMs });
    writeFileSync(join(sandbox.artifactsDir, 'compaction.log'), `${compact.stdout}\n${compact.stderr}`);
    fail('compaction', compact, sandbox);

    for (const command of publishedCommands(packageRoot)) {
      const result = await run(executable, [
        'run', '--print-logs', '--format', 'json', '--command', command, 'E2E command discovery',
      ], { env: sandbox.env, cwd: sandbox.projectDir, timeoutMs: commandTimeoutMs });
      writeFileSync(join(sandbox.artifactsDir, `${command}.log`), `${result.stdout}\n${result.stderr}`);
      fail(`command-${command}`, result, sandbox);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Unexpected server error/i, formatE2eFailure({
        phase: `command-${command}-startup`,
        opencode: `${packageName}@${version}`,
        artifactsDir: sandbox.artifactsDir,
        output: `${result.stdout}\n${result.stderr}`,
      }));
    }
    for (const [name, expectedDecision] of [
      ['safe', 'allow'], ['aws', 'deny'], ['openai', 'deny'], ['env', 'deny'], ['rm', 'deny'], ['force', 'deny'],
    ]) {
      const result = await run(executable, ['run', '--print-logs', '--format', 'json', `E2E_CASE=${name}`], {
        env: sandbox.env, cwd: sandbox.projectDir, timeoutMs: commandTimeoutMs,
      });
      const output = `${result.stdout}\n${result.stderr}`;
      writeFileSync(join(sandbox.artifactsDir, `hook-${name}.log`), output);
      const detail = formatE2eFailure({
        phase: `hook-${name}`,
        opencode: `${packageName}@${version}`,
        artifactsDir: sandbox.artifactsDir,
        timedOut: result.timedOut,
        output,
      });
      assert.equal(result.timedOut, false, detail);
      if (expectedDecision === 'allow') {
        fail(`hook-${name}`, result, sandbox);
      } else {
        assert.match(output, /HARD_RULE violated|hardcoded-|destructive-|env-file-edit/, detail);
      }
      assertToolWriteFilesystemOutcome(name, sandbox.projectDir, detail);
    }
    assert.ok(transcript.length >= 12, formatE2eFailure({
      phase: 'provider-transcript',
      opencode: `${packageName}@${version}`,
      artifactsDir: sandbox.artifactsDir,
      output: `expected at least 12 requests, actual=${transcript.length}`,
    }));
    const llmRequests = transcript.filter((entry) => Array.isArray(entry.messages) && entry.messages.length > 0);
    const normalRequests = llmRequests.filter((entry) => entry.kind === 'normal');
    const conversationRequests = normalRequests.filter((entry) => entry.body.includes('Verify the managed enterprise instructions.'));
    const titleRequests = llmRequests.filter((entry) => entry.kind === 'title');
    const compactionRequests = llmRequests.filter((entry) => entry.kind === 'compaction');
    assert.ok(normalRequests.length > 0, formatE2eFailure({
      phase: 'normal-request-transcript',
      opencode: `${packageName}@${version}`,
      artifactsDir: sandbox.artifactsDir,
      output: `request kinds=${llmRequests.map((entry) => entry.kind).join(',')}`,
    }));
    assert.ok(conversationRequests.length > 0, formatE2eFailure({
      phase: 'conversation-request-transcript',
      opencode: `${packageName}@${version}`,
      artifactsDir: sandbox.artifactsDir,
      output: 'the explicit normal conversation request was not observed',
    }));
    assert.ok(conversationRequests.every((entry) => entry.body.includes(managedAgentsMarker)), formatE2eFailure({
      phase: 'normal-request-agents',
      opencode: `${packageName}@${version}`,
      artifactsDir: sandbox.artifactsDir,
      output: 'the explicit normal conversation request must include the managed AGENTS baseline marker',
    }));
    assert.ok(titleRequests.length > 0, formatE2eFailure({
      phase: 'title-request-transcript',
      opencode: `${packageName}@${version}`,
      artifactsDir: sandbox.artifactsDir,
      output: `request kinds=${llmRequests.map((entry) => entry.kind).join(',')}`,
    }));
    assert.ok(titleRequests.every((entry) => !entry.body.includes(managedAgentsMarker)), formatE2eFailure({
      phase: 'title-request-agents-isolation',
      opencode: `${packageName}@${version}`,
      artifactsDir: sandbox.artifactsDir,
      output: 'title requests must not include the managed AGENTS baseline marker',
    }));
    assert.ok(compactionRequests.length > 0, formatE2eFailure({
      phase: 'compaction-request-transcript',
      opencode: `${packageName}@${version}`,
      artifactsDir: sandbox.artifactsDir,
      output: `request kinds=${llmRequests.map((entry) => entry.kind).join(',')}`,
    }));
    assert.ok(compactionRequests.every((entry) => !entry.body.includes(managedAgentsMarker)), formatE2eFailure({
      phase: 'compaction-request-agents-isolation',
      opencode: `${packageName}@${version}`,
      artifactsDir: sandbox.artifactsDir,
      output: 'compaction requests must not include the managed AGENTS baseline marker',
    }));
    writeFileSync(join(sandbox.artifactsDir, 'provider-transcript.json'), JSON.stringify(transcript, null, 2));
    passed = true;
  } finally {
    if (provider) await provider.close();
    writeFileSync(join(sandbox.artifactsDir, 'provider-transcript.json'), JSON.stringify(transcript, null, 2));
    sandbox.cleanup();
    if (passed) rmSync(sandbox.artifactsDir, { recursive: true, force: true });
  }
});

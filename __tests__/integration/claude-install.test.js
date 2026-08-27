import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const worktreeRoot = process.cwd();

test('--tool claude installs marketplace, plugin, wrapper, and baseline in an isolated home', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-install-claude-'));
  const fakeBin = path.join(fakeHome, 'fake-bin');
  const commandLog = path.join(fakeHome, 'claude-commands.log');
  const wrapperBin = process.platform === 'win32'
    ? path.join(fakeHome, 'bin')
    : path.join(fakeHome, '.local', 'bin');
  const wrapperName = process.platform === 'win32' ? 'claude.ps1' : 'claude';
  const backupName = process.platform === 'win32' ? 'claude-original.exe' : 'claude-original';
  const baselinePath = process.platform === 'win32'
    ? path.join(fakeHome, 'AppData', 'Roaming', 'ClaudeEnterprise', 'baseline.md')
    : path.join(fakeHome, '.config', 'claude-enterprise', 'baseline.md');

  fs.mkdirSync(fakeBin, { recursive: true });
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(fakeBin, 'claude.cmd'),
      '@echo %*>>%FAKE_CLAUDE_LOG%\r\n@exit /b 0\r\n',
    );
  } else {
    const executable = path.join(fakeBin, 'claude');
    fs.writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FAKE_CLAUDE_LOG"\n');
    fs.chmodSync(executable, 0o755);
  }

  try {
    execFileSync(process.execPath, ['packages/product/bin/oms-install.js', '--tool', 'claude', '-y'], {
      cwd: worktreeRoot,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
        FAKE_CLAUDE_LOG: commandLog,
      },
      stdio: 'pipe',
    });

    const commands = fs.readFileSync(commandLog, 'utf8');
    assert.match(commands, /plugin marketplace add/);
    assert.match(commands, /plugin install oh-my-sdd@oh-my-sdd/);
    assert.equal(fs.existsSync(path.join(wrapperBin, wrapperName)), true);
    assert.equal(fs.existsSync(path.join(wrapperBin, backupName)), true);
    assert.equal(fs.existsSync(baselinePath), true);
    assert.equal(fs.existsSync(path.join(fakeHome, '.oh-my-sdd', 'config.json')), true);
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

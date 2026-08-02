import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { main as uninstall } from '../../install/uninstall.js';

const worktreeRoot = process.cwd();

function makeHome(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('--tool opencode --purge uninstalls the host and removes shared state', () => {
  const fakeHome = makeHome('oms-uninstall-purge-');
  const stateDir = path.join(fakeHome, '.oh-my-sdd');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'marker'), 'state');

  try {
    execFileSync('node', ['bin/oms-uninstall.js', '--tool', 'opencode', '--purge'], {
      cwd: worktreeRoot,
      env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
      stdio: 'pipe',
    });

    assert.equal(fs.existsSync(stateDir), false, '--purge must run after a targeted uninstall');
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('targeted Claude uninstall is dispatched through the host registry', async () => {
  const calls = [];
  class FakeClaudeAdapter {
    static async uninstall(ctx) {
      calls.push(['uninstall', typeof ctx.announce, ctx.PACKAGE_ROOT]);
    }
  }

  await uninstall(
    { tool: 'claude' },
    {
      registry: {
        getAdapter(id) {
          calls.push(['getAdapter', id]);
          return FakeClaudeAdapter;
        },
        listTools() {
          throw new Error('targeted uninstall must not enumerate all hosts');
        },
      },
      announce() {},
    },
  );

  assert.deepEqual(calls, [
    ['getAdapter', 'claude'],
    ['uninstall', 'function', worktreeRoot],
  ]);
});

test('--tool claude uses the adapter for plugin, marketplace, legacy and wrapper cleanup', () => {
  const fakeHome = makeHome('oms-uninstall-claude-');
  const fakeBin = path.join(fakeHome, 'bin');
  const commandLog = path.join(fakeHome, 'claude-commands.log');
  const claudeDir = path.join(fakeHome, '.claude');
  const legacyPluginDir = path.join(claudeDir, 'plugins', 'oh-my-sdd');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const wrapperDir = process.platform === 'win32'
    ? path.join(fakeHome, 'bin')
    : path.join(fakeHome, '.local', 'bin');

  fs.mkdirSync(fakeBin, { recursive: true });
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(fakeBin, 'claude.cmd'), '@echo %*>>%FAKE_CLAUDE_LOG%\r\n@exit /b 0\r\n');
  } else {
    const executable = path.join(fakeBin, 'claude');
    fs.writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FAKE_CLAUDE_LOG"\n');
    fs.chmodSync(executable, 0o755);
  }

  fs.mkdirSync(legacyPluginDir, { recursive: true });
  fs.writeFileSync(path.join(legacyPluginDir, 'legacy.txt'), 'legacy');
  fs.writeFileSync(settingsPath, JSON.stringify({
    extraKnownMarketplaces: {
      'oh-my-sdd': { source: 'legacy' },
      userMarketplace: { source: 'user' },
    },
    userSetting: true,
  }));
  fs.mkdirSync(wrapperDir, { recursive: true });
  fs.writeFileSync(path.join(wrapperDir, process.platform === 'win32' ? 'claude.bat' : 'claude'), 'wrapper');

  const pathValue = `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`;
  try {
    execFileSync('node', ['bin/oms-uninstall.js', '--tool', 'claude'], {
      cwd: worktreeRoot,
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        PATH: pathValue,
        FAKE_CLAUDE_LOG: commandLog,
      },
      stdio: 'pipe',
    });

    const commands = fs.readFileSync(commandLog, 'utf8');
    assert.match(commands, /plugin uninstall oh-my-sdd@oh-my-sdd/);
    assert.match(commands, /plugin marketplace remove oh-my-sdd/);
    assert.equal(fs.existsSync(legacyPluginDir), false, 'legacy plugin directory must be removed');

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(settings.extraKnownMarketplaces['oh-my-sdd'], undefined);
    assert.deepEqual(settings.extraKnownMarketplaces.userMarketplace, { source: 'user' });
    assert.equal(settings.userSetting, true);
    assert.equal(
      fs.existsSync(path.join(wrapperDir, process.platform === 'win32' ? 'claude.bat' : 'claude')),
      false,
      'wrapper must be removed by ClaudeAdapter',
    );
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  }
});

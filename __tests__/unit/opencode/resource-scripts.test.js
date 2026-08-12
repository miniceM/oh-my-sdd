import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { copyDirSafe } from '../../../opencode/scripts/postinstall.mjs';
import {
  buildNpmInvocation,
  main as uninstallPackage,
} from '../../../opencode/bin/oms-opencode-uninstall.mjs';
import {
  main as uninstallOpenCode,
  unregisterOpenCodePlugin,
} from '../../../opencode/scripts/uninstall.mjs';
import {
  shouldCopy,
  syncCommandLayouts,
  syncResourceTree,
  withSyncLock,
} from '../../../opencode/scripts/copy-resources.mjs';
import {
  readOwnershipManifest,
  uninstallOwnedResources,
  writeOwnershipManifest,
} from '../../../opencode/scripts/resource-ownership.mjs';
import {
  getAgentsPath,
  removeManagedAgentsBlock,
  upsertManagedAgentsBlock,
} from '../../../opencode/scripts/agents-md.mjs';

function fixture() {
  return mkdtempSync(join(tmpdir(), 'oms-resource-test-'));
}

test('AGENTS helper creates one managed block and preserves user content', () => {
  const root = fixture();
  try {
    const file = join(root, '.config', 'opencode', 'AGENTS.md');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '## User rules\nkeep me\n');

    upsertManagedAgentsBlock(file, '## HARD_RULE\nno secrets');
    upsertManagedAgentsBlock(file, '## HARD_RULE\nupdated');

    const content = readFileSync(file, 'utf8');
    assert.equal(content.match(/OH-MY-SDD:BEGIN/g)?.length, 1);
    assert.match(content, /keep me/);
    assert.match(content, /updated/);
    assert.doesNotMatch(content, /no secrets/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('AGENTS helper removes only its block and deletes an empty plugin file', () => {
  const root = fixture();
  try {
    const file = join(root, 'AGENTS.md');
    upsertManagedAgentsBlock(file, '## Rule');
    assert.equal(removeManagedAgentsBlock(file), true);
    assert.equal(existsSync(file), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('AGENTS helper preserves whitespace-only user content outside its block', () => {
  const root = fixture();
  try {
    const file = join(root, 'AGENTS.md');
    upsertManagedAgentsBlock(file, '## Rule');
    writeFileSync(file, ` \n\t${readFileSync(file, 'utf8')}`);

    assert.equal(removeManagedAgentsBlock(file), true);
    assert.equal(existsSync(file), true);
    assert.equal(readFileSync(file, 'utf8'), ' \n\t');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('AGENTS helper resolves POSIX and Windows OpenCode config paths', () => {
  assert.equal(getAgentsPath('/home/alice', path.posix), '/home/alice/.config/opencode/AGENTS.md');
  assert.equal(
    getAgentsPath('C:\\Users\\alice', path.win32),
    'C:\\Users\\alice\\.config\\opencode\\AGENTS.md',
  );
});

test('postinstall manages one global AGENTS baseline block across upgrades', () => {
  const root = fixture();
  try {
    const home = join(root, 'home');
    const agentsPath = getAgentsPath(home);
    mkdirSync(dirname(agentsPath), { recursive: true });
    writeFileSync(agentsPath, '# User instructions\nkeep me\n');
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const options = { cwd: join(process.cwd(), 'opencode'), env, encoding: 'utf8' };

    execFileSync(process.execPath, ['scripts/postinstall.mjs'], options);
    execFileSync(process.execPath, ['scripts/postinstall.mjs'], options);

    const content = readFileSync(agentsPath, 'utf8');
    assert.equal(content.match(/OH-MY-SDD:BEGIN/g)?.length, 1);
    assert.match(content, /keep me/);
    assert.match(content, /HARD_RULE/);
    assert.doesNotMatch(content, /oms_version:/);
    assert.doesNotMatch(content, /<!-- BEGIN sync-impact-report/);
    assert.doesNotMatch(content, /END sync-impact-report -->/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('OpenCode uninstall removes only the managed AGENTS block', () => {
  const root = fixture();
  try {
    const agentsPath = join(root, 'AGENTS.md');
    upsertManagedAgentsBlock(agentsPath, '## Rule');
    const original = readFileSync(agentsPath, 'utf8');
    writeFileSync(agentsPath, `# User instructions\nkeep me\n${original}`);

    const result = uninstallOpenCode({
      agentsPath,
      manifestPath: join(root, 'missing-resources.json'),
      allowedRoots: [join(root, 'resources')],
      warn: () => {},
      log: () => {},
    });

    assert.equal(result.agentsRemoved, true);
    assert.equal(readFileSync(agentsPath, 'utf8'), '# User instructions\nkeep me\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const DELEGATED_SKILLS = [
  'brainstorming',
  'writing-plans',
  'executing-plans',
  'subagent-driven-development',
  'requesting-code-review',
  'using-git-worktrees',
  'finishing-a-development-branch',
  'test-driven-development',
];

test('postinstall preserves an existing skill when its backup fails', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    mkdirSync(join(srcRoot, 'sdd-spec'), { recursive: true });
    mkdirSync(join(dstRoot, 'sdd-spec'), { recursive: true });
    writeFileSync(join(srcRoot, 'sdd-spec', 'SKILL.md'), 'plugin version');
    writeFileSync(join(dstRoot, 'sdd-spec', 'SKILL.md'), 'user version');

    const warnings = [];
    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'skills', {
      cpSync: (src, dst, options) => {
        if (dst.includes('.oh-my-sdd-backup-')) throw new Error('backup denied');
        cpSync(src, dst, options);
      },
      warn: (message) => warnings.push(message),
      now: () => 123,
    });

    assert.equal(installed, 0);
    assert.equal(readFileSync(join(dstRoot, 'sdd-spec', 'SKILL.md'), 'utf8'), 'user version');
    assert.ok(warnings.some((message) => message.includes('preserving existing target')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('postinstall backs up the existing command before replacing it', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    mkdirSync(srcRoot, { recursive: true });
    mkdirSync(dstRoot, { recursive: true });
    writeFileSync(join(srcRoot, 'sdd-plan.md'), 'plugin version');
    writeFileSync(join(dstRoot, 'sdd-plan.md'), 'user version');

    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'commands', {
      warn: () => {},
      now: () => 123,
    });

    assert.equal(installed, 1);
    assert.equal(readFileSync(join(dstRoot, 'sdd-plan.md'), 'utf8'), 'plugin version');
    assert.equal(
      readFileSync(join(dstRoot, 'sdd-plan.md.oh-my-sdd-backup-123'), 'utf8'),
      'user version',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('postinstall upgrades a skill when auxiliary resources change', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    const srcSkill = join(srcRoot, 'sdd-spec');
    const dstSkill = join(dstRoot, 'sdd-spec');
    mkdirSync(join(srcSkill, 'scripts'), { recursive: true });
    mkdirSync(join(dstSkill, 'scripts'), { recursive: true });
    writeFileSync(join(srcSkill, 'SKILL.md'), 'same instructions');
    writeFileSync(join(dstSkill, 'SKILL.md'), 'same instructions');
    writeFileSync(join(srcSkill, 'scripts', 'run.mjs'), 'new helper');
    writeFileSync(join(dstSkill, 'scripts', 'run.mjs'), 'old helper');
    writeFileSync(join(dstSkill, 'scripts', 'removed.mjs'), 'stale helper');

    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'skills', {
      warn: () => {},
      now: () => 123,
    });

    assert.equal(installed, 1);
    assert.equal(readFileSync(join(dstSkill, 'scripts', 'run.mjs'), 'utf8'), 'new helper');
    assert.equal(existsSync(join(dstSkill, 'scripts', 'removed.mjs')), false);
    assert.equal(
      readFileSync(join(`${dstSkill}.oh-my-sdd-backup-123`, 'scripts', 'run.mjs'), 'utf8'),
      'old helper',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('postinstall safely replaces file-directory type conflicts', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    mkdirSync(join(srcRoot, 'sdd-skill'), { recursive: true });
    mkdirSync(join(dstRoot, 'sdd-command.md'), { recursive: true });
    writeFileSync(join(srcRoot, 'sdd-skill', 'SKILL.md'), 'plugin skill');
    writeFileSync(join(srcRoot, 'sdd-command.md'), 'plugin command');
    writeFileSync(join(dstRoot, 'sdd-skill'), 'user file');
    writeFileSync(join(dstRoot, 'sdd-command.md', 'user.txt'), 'user directory');

    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'resources', {
      warn: () => {},
      now: () => 123,
    });

    assert.equal(installed, 2);
    assert.equal(readFileSync(join(dstRoot, 'sdd-skill', 'SKILL.md'), 'utf8'), 'plugin skill');
    assert.equal(readFileSync(join(dstRoot, 'sdd-command.md'), 'utf8'), 'plugin command');
    assert.equal(readFileSync(join(dstRoot, 'sdd-skill.oh-my-sdd-backup-123'), 'utf8'), 'user file');
    assert.equal(
      readFileSync(join(dstRoot, 'sdd-command.md.oh-my-sdd-backup-123', 'user.txt'), 'utf8'),
      'user directory',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('postinstall restores the existing target when replacement fails', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    const src = join(srcRoot, 'sdd-plan.md');
    const dst = join(dstRoot, 'sdd-plan.md');
    mkdirSync(srcRoot, { recursive: true });
    mkdirSync(dstRoot, { recursive: true });
    writeFileSync(src, 'plugin version');
    writeFileSync(dst, 'user version');

    const warnings = [];
    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'commands', {
      cpSync: (from, to, options) => {
        if (from === src && to === dst) throw new Error('replacement denied');
        cpSync(from, to, options);
      },
      warn: (message) => warnings.push(message),
      now: () => 123,
    });

    assert.equal(installed, 0);
    assert.equal(readFileSync(dst, 'utf8'), 'user version');
    assert.ok(warnings.some((message) => message.includes('restored existing target')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('npm resource ownership restores user data and removes plugin-created resources', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    const manifestPath = join(root, 'state', 'resources.json');
    mkdirSync(join(srcRoot, 'sdd-spec'), { recursive: true });
    mkdirSync(dstRoot, { recursive: true });
    writeFileSync(join(srcRoot, 'sdd-spec', 'SKILL.md'), 'plugin-created');
    writeFileSync(join(srcRoot, 'sdd-plan'), 'plugin-v1');
    writeFileSync(join(dstRoot, 'sdd-plan'), 'user-original');

    const ownership = new Map();
    const recordOwnership = (record) => {
      ownership.set(record.target, record);
      writeOwnershipManifest(manifestPath, [...ownership.values()]);
    };
    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'resources', {
      ownership,
      recordOwnership,
      warn: () => {},
      now: () => 123,
    });

    assert.equal(installed, 2);
    assert.equal(readOwnershipManifest(manifestPath).length, 2);
    assert.equal(readFileSync(join(dstRoot, 'sdd-plan'), 'utf8'), 'plugin-v1');

    const result = uninstallOwnedResources({
      manifestPath,
      allowedRoots: [dstRoot],
      warn: () => {},
      now: () => 456,
    });

    assert.deepEqual(result, { removed: 1, restored: 1, preserved: 0, remaining: 0 });
    assert.equal(existsSync(join(dstRoot, 'sdd-spec')), false);
    assert.equal(readFileSync(join(dstRoot, 'sdd-plan'), 'utf8'), 'user-original');
    assert.equal(existsSync(manifestPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('npm resource upgrades retain the original user backup for uninstall', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    const target = join(dstRoot, 'sdd-plan.md');
    const manifestPath = join(root, 'state', 'resources.json');
    mkdirSync(srcRoot, { recursive: true });
    mkdirSync(dstRoot, { recursive: true });
    writeFileSync(join(srcRoot, 'sdd-plan.md'), 'plugin-v1');
    writeFileSync(target, 'user-original');

    const ownership = new Map();
    const recordOwnership = (record) => {
      ownership.set(record.target, record);
      writeOwnershipManifest(manifestPath, [...ownership.values()]);
    };
    const ops = { ownership, recordOwnership, warn: () => {}, now: () => 123 };
    copyDirSafe(srcRoot, dstRoot, () => true, 'commands', ops);
    const originalBackup = ownership.get(target).backup;

    writeFileSync(join(srcRoot, 'sdd-plan.md'), 'plugin-v2');
    copyDirSafe(srcRoot, dstRoot, () => true, 'commands', { ...ops, now: () => 124 });

    assert.equal(ownership.get(target).backup, originalBackup);
    assert.equal(readFileSync(target, 'utf8'), 'plugin-v2');
    uninstallOwnedResources({ manifestPath, allowedRoots: [dstRoot], warn: () => {} });
    assert.equal(readFileSync(target, 'utf8'), 'user-original');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('npm resource upgrades do not overwrite user modifications made after install', () => {
  const root = fixture();
  try {
    const srcRoot = join(root, 'src');
    const dstRoot = join(root, 'dst');
    const target = join(dstRoot, 'sdd-plan.md');
    const ownership = new Map();
    mkdirSync(srcRoot, { recursive: true });
    writeFileSync(join(srcRoot, 'sdd-plan.md'), 'plugin-v1');

    const recordOwnership = (record) => ownership.set(record.target, record);
    copyDirSafe(srcRoot, dstRoot, () => true, 'commands', {
      ownership,
      recordOwnership,
      warn: () => {},
    });
    writeFileSync(target, 'user-modified-plugin-resource');
    writeFileSync(join(srcRoot, 'sdd-plan.md'), 'plugin-v2');

    const warnings = [];
    const installed = copyDirSafe(srcRoot, dstRoot, () => true, 'commands', {
      ownership,
      recordOwnership,
      warn: (message) => warnings.push(message),
    });

    assert.equal(installed, 0);
    assert.equal(readFileSync(target, 'utf8'), 'user-modified-plugin-resource');
    assert.ok(warnings.some((message) => message.includes('preserving user changes')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('OpenCode package exposes an explicit ownership-aware uninstaller', () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'opencode', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.preuninstall, undefined, 'must not claim unsupported npm uninstall hooks');
  assert.equal(pkg.bin['oms-opencode-uninstall'], './bin/oms-opencode-uninstall.mjs');
  assert.ok(pkg.files.includes('bin'));
  assert.ok(pkg.files.includes('scripts'));
});

test('OpenCode uninstaller removes the npm package before cleaning owned resources', () => {
  const calls = [];
  uninstallPackage({
    cleanup: () => calls.push('cleanup'),
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    },
    env: { npm_config_prefix: '/tmp/test-prefix' },
    platform: 'linux',
  });

  assert.deepEqual(calls[0].args, [
    'uninstall',
    '--global',
    '@cli-tools/oh-my-sdd-opencode',
  ]);
  assert.equal(calls[1], 'cleanup');
});

test('OpenCode uninstaller preserves resources when npm uninstall fails', () => {
  let cleanupCalls = 0;

  assert.throws(
    () => uninstallPackage({
      cleanup: () => cleanupCalls++,
      spawn: () => ({ status: 1 }),
      platform: 'linux',
    }),
    /npm uninstall exited with status 1/,
  );
  assert.equal(cleanupCalls, 0);
});

test('OpenCode uninstaller invokes npm.cmd through ComSpec on Windows', () => {
  assert.deepEqual(
    buildNpmInvocation(
      ['uninstall', '--global', '@cli-tools/oh-my-sdd-opencode'],
      { platform: 'win32', comspec: 'C:\\Windows\\System32\\cmd.exe' },
    ),
    {
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        'npm.cmd',
        'uninstall',
        '--global',
        '@cli-tools/oh-my-sdd-opencode',
      ],
    },
  );
});

test('OpenCode uninstaller removes only OMS plugin entries from opencode.json', () => {
  const root = fixture();
  const configPath = join(root, 'opencode.json');
  try {
    writeFileSync(configPath, JSON.stringify({
      plugin: ['other-plugin', '@cli-tools/oh-my-sdd-opencode', './plugins/oh-my-sdd/index.js'],
      theme: 'user-theme',
    }));

    assert.equal(unregisterOpenCodePlugin({ configPath, warn: () => {} }), 2);
    assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), {
      plugin: ['other-plugin'],
      theme: 'user-theme',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('npm package exposes every delegated workflow skill from its canonical bundle', () => {
  const packageRoot = join(process.cwd(), 'opencode');
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

  assert.ok(
    pkg.files.includes('delegated-skills'),
    'npm files must include the canonical delegated-skills bundle',
  );
  assert.ok(pkg.files.includes('oms-skills'), 'npm files must include tracked OMS skills');
  assert.ok(
    existsSync(join(packageRoot, 'oms-skills', 'sdd-plan', 'SKILL.md')),
    'clean-clone npm source must contain the main sdd-plan skill',
  );
  for (const skill of DELEGATED_SKILLS) {
    assert.ok(
      existsSync(join(packageRoot, 'delegated-skills', skill, 'SKILL.md')),
      `delegated-skills/${skill}/SKILL.md should be packaged`,
    );
  }
});

test('postinstall delegated-skill exports document pinned source and read-only arrays', () => {
  const source = readFileSync(
    join(process.cwd(), 'opencode', 'scripts', 'postinstall.mjs'),
    'utf8',
  );
  const exportedDocs = {
    DELEGATED_SKILLS_SOURCE: [/pinned source/i],
    DELEGATED_SKILL_NAMES: [/\b5\b/, /strongly required|strong dependencies/i, /read-only|frozen/i],
    DELEGATED_SUPPORT_SKILL_NAMES: [/\b3\b/, /transitive support/i, /read-only|frozen/i],
  };

  for (const [name, required] of Object.entries(exportedDocs)) {
    const doc = source.match(
      new RegExp(`/\\*\\*[\\s\\S]*?\\*/\\s*export const ${name}\\b`),
    )?.[0];
    assert.ok(doc, `${name} must be preceded by a JSDoc block`);
    for (const pattern of required) {
      assert.match(doc, pattern, `${name} JSDoc must document ${pattern}`);
    }
  }
});

test('postinstall installs delegated skills into a clean OpenCode HOME with actionable diagnostics', () => {
  const home = fixture();
  try {
    const output = execFileSync('node', ['scripts/postinstall.mjs'], {
      cwd: join(process.cwd(), 'opencode'),
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf8',
    });

    for (const skill of DELEGATED_SKILLS) {
      assert.ok(
        existsSync(join(home, '.config', 'opencode', 'skills', skill, 'SKILL.md')),
        `${skill} should be discoverable from ~/.config/opencode/skills after postinstall`,
      );
      assert.match(output, new RegExp(`\\b${skill}\\b`), `${skill} should be named in diagnostics`);
    }

    const diagnosticLines = output.split(/\r?\n/);
    const omsLine = diagnosticLines.find((line) => /oms-skills/i.test(line));
    const delegatedLine = diagnosticLines.find((line) => /delegated-skills/i.test(line));
    const commandLine = diagnosticLines.find((line) => /\[postinstall\] commands:/i.test(line));
    assert.ok(omsLine, 'diagnostics should report OMS skills separately');
    assert.ok(delegatedLine, 'diagnostics should report delegated skills separately');
    assert.ok(commandLine, 'diagnostics should classify command outcomes separately');
    assert.match(commandLine, /installed=\d+, unchanged=\d+, preserved=\d+, failed=\d+/);
    assert.notEqual(omsLine, delegatedLine, 'OMS and delegated skill diagnostics must be distinct');
    assert.match(output, /bundled superpowers-zh@1\.5\.0/i, 'diagnostics should identify the bundle source');
    assert.match(
      output,
      /missing[- ]dependencies\s*:\s*(?:none|\[\])/i,
      'diagnostics should explicitly report that no strong delegated dependencies are missing',
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('npm package exposes every supported SDD slash command', () => {
  const expected = ['sdd-spec', 'sdd-plan', 'sdd-task', 'sdd-apply', 'sdd-review', 'sdd-doc'];
  for (const command of expected) {
    const commandPath = join(process.cwd(), 'opencode', '.opencode', 'commands', `${command}.md`);
    assert.ok(
      existsSync(commandPath),
      `.opencode/commands/${command}.md should be packaged`,
    );
    assert.match(
      readFileSync(commandPath, 'utf8'),
      /\$ARGUMENTS/,
      `${command}.md must expose OpenCode invocation arguments to the prompt`,
    );
  }
});

test('vendored brainstorming lifecycle scripts validate paths and process identity', () => {
  const scripts = join(
    process.cwd(),
    'opencode',
    'delegated-skills',
    'brainstorming',
    'scripts',
  );
  const start = readFileSync(join(scripts, 'start-server.sh'), 'utf8');
  const stop = readFileSync(join(scripts, 'stop-server.sh'), 'utf8');

  assert.doesNotMatch(start, /kill\s+"?\$old_pid/);
  assert.match(start, /SERVER_SCRIPT/);
  assert.match(start, /mktemp -d/);
  assert.match(start, /chmod 700/);
  assert.match(start, /randomBytes\(32\)/);
  assert.match(start, /BRAINSTORM_TOKEN/);
  assert.match(start, /--host must be loopback/);
  assert.match(stop, /pwd -P/);
  assert.match(stop, /pid does not belong to this brainstorm server/);
  assert.match(stop, /SESSION_PARENT.*TMP_ROOT/s);
  assert.match(stop, /\^brainstorm-\(/);
  assert.doesNotMatch(stop, /\[\[\s*"\$SESSION_DIR"\s*==\s*\/tmp\/\*/);

  if (process.platform !== 'win32') {
    execFileSync('bash', ['-n', join(scripts, 'start-server.sh')]);
    execFileSync('bash', ['-n', join(scripts, 'stop-server.sh')]);
  }
});

test('brainstorm companion requires one session token for HTTP and WebSocket access', () => {
  const scripts = join(process.cwd(), 'opencode', 'delegated-skills', 'brainstorming', 'scripts');
  const server = readFileSync(join(scripts, 'server.cjs'), 'utf8');
  const helper = readFileSync(join(scripts, 'helper.js'), 'utf8');

  assert.match(server, /timingSafeEqual/);
  assert.match(server, /requestToken\(req\)/);
  assert.match(server, /isAllowedOrigin\(req\)/);
  assert.match(server, /MAX_WS_MESSAGE_BYTES/);
  assert.match(server, /encodeURIComponent\(SESSION_TOKEN\)/);
  assert.doesNotMatch(helper, /window\.location\.search/);
  assert.match(server, /Location: '\/'/);
  assert.match(server, /ALLOWED_HOSTS/);
  assert.match(server, /rate\.count > 30/);
});

test('brainstorm stop helper refuses an unrelated PID without terminating it', (t) => {
  if (process.platform === 'win32') {
    t.skip('bash lifecycle helper is POSIX-only');
    return;
  }

  const root = fixture();
  const scripts = join(
    process.cwd(),
    'opencode',
    'delegated-skills',
    'brainstorming',
    'scripts',
  );
  const sleeper = spawn('sleep', ['30'], { stdio: 'ignore' });
  try {
    const state = join(root, 'state');
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, 'server.pid'), String(sleeper.pid));
    writeFileSync(join(state, 'server.script'), join(scripts, 'server.cjs'));

    let output = '';
    assert.throws(() => {
      execFileSync('bash', [join(scripts, 'stop-server.sh'), root], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }, (error) => {
      output = error.stdout ?? '';
      return true;
    });
    assert.match(output, /pid does not belong to this brainstorm server/);
    assert.doesNotThrow(() => process.kill(sleeper.pid, 0));
  } finally {
    sleeper.kill('SIGTERM');
    rmSync(root, { recursive: true, force: true });
  }
});

test('brainstorm start helper fails fast when a value option is missing its value', (t) => {
  if (process.platform === 'win32') {
    t.skip('bash lifecycle helper is POSIX-only');
    return;
  }

  const start = join(
    process.cwd(),
    'opencode',
    'delegated-skills',
    'brainstorming',
    'scripts',
    'start-server.sh',
  );
  for (const option of ['--project-dir', '--host', '--url-host']) {
    assert.throws(() => {
      execFileSync('bash', [start, option], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 1000,
      });
    }, (error) => {
      assert.equal(error.status, 1, `${option} should fail instead of timing out`);
      assert.match(error.stdout ?? '', new RegExp(`Missing value for ${option}`));
      return true;
    });
  }
});

test('published sdd-plan command resolves namespaced delegates and retains inline fallback', () => {
  const command = readFileSync(
    join(process.cwd(), 'opencode', '.opencode', 'commands', 'sdd-plan.md'),
    'utf8',
  );

  assert.match(command, /superpowers:brainstorming[\s\S]*brainstorming\/SKILL\.md/);
  assert.match(command, /superpowers:writing-plans[\s\S]*writing-plans\/SKILL\.md/);
  assert.match(
    command,
    /name-without-namespace|strip(?:ping)?\s+(?:the\s+)?(?:skill\s+)?namespace|remove(?:s|d|ing)?\s+(?:the\s+)?(?:skill\s+)?namespace/i,
    'command must explain how superpowers:<name> resolves to an unnamespaced directory',
  );
  assert.match(
    command,
    /inline-content-resolution/i,
    'command must retain an explicit fallback when delegated skill content cannot be read',
  );
});

test('all published commands retain the generator skill-resolution contract', () => {
  const commandRoot = join(process.cwd(), 'opencode', '.opencode', 'commands');
  const commands = ['sdd-spec', 'sdd-plan', 'sdd-task', 'sdd-apply', 'sdd-review', 'sdd-doc'];

  for (const name of commands) {
    const command = readFileSync(join(commandRoot, `${name}.md`), 'utf8');
    assert.match(command, new RegExp(`skills/${name}/SKILL\\.md`), `${name} needs project skill lookup`);
    assert.match(
      command,
      new RegExp(`~/.config/opencode/skills/${name}/SKILL\\.md`),
      `${name} needs global OpenCode skill lookup`,
    );
    assert.match(command, /name-without-namespace/, `${name} needs namespace normalization`);
    assert.match(command, /~\/.agents\/skills\/<name-without-namespace>\//, `${name} needs agents fallback`);
    assert.match(command, /~\/.claude\/skills\/<name-without-namespace>\//, `${name} needs Claude fallback`);
    assert.match(command, /inline-content-resolution/, `${name} needs content fallback`);
    assert.match(
      command,
      /does not select who executes|does not select who\s+executes/s,
      `${name} must keep content resolution independent from execution mode`,
    );
    assert.match(command, /\$ARGUMENTS/, `${name} must forward invocation arguments`);
  }
});

test('resource sync mirrors OpenCode commands into the agents package layout', () => {
  const root = fixture();
  try {
    const source = join(root, '.opencode', 'commands');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'sdd-doc.md'), 'doc command');

    syncCommandLayouts(root);

    assert.equal(
      readFileSync(join(root, '.agents', 'command', 'sdd-doc.md'), 'utf8'),
      'doc command',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync excludes declared noise directories', () => {
  const root = fixture();
  try {
    const src = join(root, 'src');
    const dst = join(root, 'dst');
    mkdirSync(join(src, 'skill'), { recursive: true });
    mkdirSync(join(src, 'node_modules', 'bad'), { recursive: true });
    mkdirSync(join(src, '__tests__'), { recursive: true });
    writeFileSync(join(src, 'skill', 'SKILL.md'), 'ok');
    writeFileSync(join(src, 'node_modules', 'bad', 'index.js'), 'bad');
    writeFileSync(join(src, '__tests__', 'x.test.js'), 'bad');

    syncResourceTree(src, dst);

    assert.equal(shouldCopy('node_modules'), false);
    assert.ok(existsSync(join(dst, 'skill', 'SKILL.md')));
    assert.equal(existsSync(join(dst, 'node_modules')), false);
    assert.equal(existsSync(join(dst, '__tests__')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync preserves the existing destination when staging copy fails', () => {
  const root = fixture();
  try {
    const src = join(root, 'src');
    const dst = join(root, 'dst');
    mkdirSync(src, { recursive: true });
    mkdirSync(dst, { recursive: true });
    writeFileSync(join(src, 'new.txt'), 'new');
    writeFileSync(join(dst, 'old.txt'), 'old');

    assert.throws(
      () => syncResourceTree(src, dst, { cpSync: () => { throw new Error('injected copy failure'); } }),
      /injected copy failure/,
    );
    assert.equal(readFileSync(join(dst, 'old.txt'), 'utf8'), 'old');
    assert.equal(existsSync(join(dst, 'new.txt')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync retries a transient Windows rename lock and still replaces the destination', () => {
  const root = fixture();
  try {
    const src = join(root, 'src');
    const dst = join(root, 'dst');
    mkdirSync(src, { recursive: true });
    mkdirSync(dst, { recursive: true });
    writeFileSync(join(src, 'new.txt'), 'new');
    writeFileSync(join(dst, 'old.txt'), 'old');

    const realRename = renameSync;
    let backupAttempts = 0;
    syncResourceTree(src, dst, {
      renameAttempts: 5,
      renameDelayMs: 1,
      renameSync: (from, to) => {
        if (to.includes('.oh-my-sdd-sync.backup-')) {
          backupAttempts += 1;
          if (backupAttempts === 1) {
            const error = new Error('injected EPERM rename lock');
            error.code = 'EPERM';
            throw error;
          }
        }
        return realRename(from, to);
      },
    });

    assert.equal(backupAttempts, 2, 'the destination rename should retry once after EPERM');
    assert.equal(readFileSync(join(dst, 'new.txt'), 'utf8'), 'new');
    assert.equal(existsSync(join(dst, 'old.txt')), false);
    assert.deepEqual(
      readdirSync(dirname(dst)).filter((name) => name.startsWith(`${basename(dst)}.oh-my-sdd-sync.`)),
      [],
      'no staging, backup, or lock residue may survive the retried sync',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync fails loudly when the destination rename stays locked and preserves it', () => {
  const root = fixture();
  try {
    const src = join(root, 'src');
    const dst = join(root, 'dst');
    mkdirSync(src, { recursive: true });
    mkdirSync(dst, { recursive: true });
    writeFileSync(join(src, 'new.txt'), 'new');
    writeFileSync(join(dst, 'old.txt'), 'old');

    let attempts = 0;
    assert.throws(
      () => syncResourceTree(src, dst, {
        renameAttempts: 3,
        renameDelayMs: 1,
        renameSync: (from, to) => {
          if (to.includes('.oh-my-sdd-sync.backup-')) {
            attempts += 1;
            const error = new Error('destination locked');
            error.code = 'EPERM';
            throw error;
          }
          return renameSync(from, to);
        },
      }),
      /destination locked/,
    );
    assert.equal(attempts, 3, 'the destination rename should exhaust its retries');
    assert.equal(readFileSync(join(dst, 'old.txt'), 'utf8'), 'old');
    assert.equal(existsSync(join(dst, 'new.txt')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync waits for an existing destination lock before replacing it', async () => {
  const root = fixture();
  try {
    const src = join(root, 'src');
    const dst = join(root, 'dst');
    const lock = `${dst}.oh-my-sdd-sync.lock`;
    mkdirSync(src, { recursive: true });
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(src, 'new.txt'), 'new');
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({
      ownerPid: process.pid,
      createdAt: Date.now(),
      token: 'test-owner',
    }));

    const moduleUrl = pathToFileURL(join(process.cwd(), 'opencode', 'scripts', 'copy-resources.mjs')).href;
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      `import { syncResourceTree } from ${JSON.stringify(moduleUrl)}; process.stdout.write('ready\\n'); syncResourceTree(${JSON.stringify(src)}, ${JSON.stringify(dst)});`,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let childStdout = '';
    let childStderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { childStdout += chunk; });
    child.stderr.on('data', (chunk) => { childStderr += chunk; });
    await once(child.stdout, 'data');
    assert.equal(child.exitCode, null, 'sync must remain blocked while the lock exists');
    assert.equal(existsSync(dst), false);

    rmSync(lock, { recursive: true, force: true });
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, `child exited with ${code}; stdout: ${childStdout}; stderr: ${childStderr}`);
    assert.equal(readFileSync(join(dst, 'new.txt'), 'utf8'), 'new');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync retries after a transient Windows lock metadata error', () => {
  const root = fixture();
  try {
    const lock = join(root, 'target.oh-my-sdd-sync.lock');
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({
      ownerPid: process.pid,
      createdAt: Date.now(),
      token: 'test-owner',
    }));

    let firstProbe = true;
    let ran = false;
    withSyncLock(lock, () => { ran = true; }, {
      timeoutMs: 100,
      pollMs: 1,
      statSync: (path) => {
        if (path === lock && firstProbe) {
          firstProbe = false;
          rmSync(lock, { recursive: true, force: true });
          const error = new Error('transient Windows lock metadata error');
          error.code = 'EPERM';
          throw error;
        }
        return statSync(path);
      },
    });

    assert.equal(ran, true);
    assert.equal(existsSync(lock), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync reclaims a lock whose owner process is dead', () => {
  const root = fixture();
  try {
    const src = join(root, 'src');
    const dst = join(root, 'dst');
    const lock = `${dst}.oh-my-sdd-sync.lock`;
    mkdirSync(src, { recursive: true });
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(src, 'new.txt'), 'new');
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({
      ownerPid: 2_147_483_647,
      createdAt: Date.now(),
    }));

    syncResourceTree(src, dst, { lockTimeoutMs: 250, lockPollMs: 10 });

    assert.equal(readFileSync(join(dst, 'new.txt'), 'utf8'), 'new');
    assert.equal(existsSync(lock), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync never takes over a live owner before timing out', () => {
  const root = fixture();
  try {
    const lock = join(root, 'target.oh-my-sdd-sync.lock');
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({
      ownerPid: process.pid,
      createdAt: Date.now(),
    }));

    assert.throws(
      () => withSyncLock(lock, () => assert.fail('live lock was stolen'), {
        timeoutMs: 60,
        pollMs: 10,
        staleThresholdMs: 60_000,
      }),
      (error) => {
        assert.match(error.message, new RegExp(lock.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(error.message, /60ms/);
        return true;
      },
    );
    assert.equal(existsSync(join(lock, 'owner.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resource sync reclaims an over-age lock despite a reused live PID', () => {
  const root = fixture();
  try {
    const lock = join(root, 'target.oh-my-sdd-sync.lock');
    mkdirSync(lock, { recursive: true });
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({
      ownerPid: process.pid,
      createdAt: 1,
      token: 'possibly-reused-pid',
    }));

    let ran = false;
    withSyncLock(lock, () => { ran = true; }, {
      timeoutMs: 100,
      pollMs: 10,
      staleThresholdMs: 50,
      now: () => 1_000,
    });

    assert.equal(ran, true);
    assert.equal(existsSync(lock), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

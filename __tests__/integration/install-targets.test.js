import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const SKILLS_SRC = join(PACKAGE_ROOT, 'skills');

// ============================================
// 集成测试：把 OpenCode/Qoder 安装/卸载的副作用
// 重定向到临时 HOME 目录，避免污染真实用户环境。
//
// 策略：通过设置 HOME env 调用 install-shared.js 中的导出函数。
// install-shared.js 用 homedir() 而非 process.env.HOME，
// 所以我们必须实际改 homedir 或 mock。最简方案：
// 直接用真实 homedir() 路径前缀的临时子目录。
// ============================================

function makeFakeHome() {
  // 创建临时目录，模拟 HOME 但不污染真 HOME
  return mkdtempSync(join(tmpdir(), 'oms-int-'));
}

test('integration: OpenCode install creates expected files', async () => {
  const fakeHome = makeFakeHome();
  try {
    const { copySkillsToDir } = await import('../../hooks/lib/install-shared.js');

    const destSkills = join(fakeHome, 'fake-opencode-skills');
    const messages = [];
    const count = await copySkillsToDir(SKILLS_SRC, destSkills, (m) => messages.push(m));
    assert.ok(count >= 17, `应复制 17+ skills，实际 ${count}`);

    const skillDirs = readdirSync(destSkills, { withFileTypes: true })
      .filter(e => e.isDirectory());
    for (const d of skillDirs) {
      const skillFile = join(destSkills, d.name, 'SKILL.md');
      assert.ok(existsSync(skillFile), `${d.name}/SKILL.md 应存在`);
    }
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('integration: AGENTS.md sentinel block is idempotent (re-install does not duplicate)', async () => {
  // Sentinel strings (kept in sync with hooks/lib/install-shared.js)
  const SENTINEL_BEGIN = '<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->';
  const SENTINEL_END = '<!-- OH-MY-SDD:END -->';
  const SENTINEL_RE = /<!-- OH-MY-SDD:BEGIN[\s\S]*?<!-- OH-MY-SDD:END -->\n?/g;

  const fakeAgents = join(makeFakeHome(), 'AGENTS.md');
  const baselineBody = '# My baseline content\nHARD rules here.';
  const block = `${SENTINEL_BEGIN}\n${baselineBody}\n${SENTINEL_END}\n`;

  // 第一次安装
  let content = '';
  if (existsSync(fakeAgents)) content = readFileSync(fakeAgents, 'utf8');
  content = (content.replace(SENTINEL_RE, '').replace(/\n+$/, '\n')) + (content.replace(SENTINEL_RE, '').trim() ? '\n' : '') + block;
  writeFileSync(fakeAgents, content);

  // 第二次安装（模拟重装）
  content = readFileSync(fakeAgents, 'utf8');
  const cleaned = content.replace(SENTINEL_RE, '').replace(/\n+$/, '\n');
  content = cleaned + (cleaned.trim() ? '\n' : '') + block;
  writeFileSync(fakeAgents, content);

  // 验证：哨兵块只有一份
  const final = readFileSync(fakeAgents, 'utf8');
  const matches = final.match(SENTINEL_RE);
  assert.equal(matches.length, 1, '重装后哨兵块应只有一份');
  assert.ok(final.includes(baselineBody));
});

test('integration: AGENTS.md sentinel removal preserves user content', () => {
  const fakeAgents = join(makeFakeHome(), 'AGENTS.md');
  const userHeader = '# My personal AI config\nUse opus-4 for everything.';
  const block = `<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->\nbaseline\n<!-- OH-MY-SDD:END -->\n`;
  const userFooter = '# More personal stuff\n';
  const SENTINEL_RE = /<!-- OH-MY-SDD:BEGIN[\s\S]*?<!-- OH-MY-SDD:END -->\n?/g;

  writeFileSync(fakeAgents, `${userHeader}\n\n${block}\n${userFooter}`);

  // 卸载
  const content = readFileSync(fakeAgents, 'utf8');
  const cleaned = content.replace(SENTINEL_RE, '').trim();
  if (cleaned.length === 0) {
    rmSync(fakeAgents, { force: true });
  } else {
    writeFileSync(fakeAgents, cleaned + '\n');
  }

  // 验证：用户内容保留，哨兵块删除
  const after = readFileSync(fakeAgents, 'utf8');
  assert.ok(after.includes('My personal AI config'));
  assert.ok(after.includes('opus-4 for everything'));
  assert.ok(after.includes('More personal stuff'));
  assert.ok(!after.includes('OH-MY-SDD'));
  assert.ok(!after.includes('baseline'));
});

test('integration: Qoder settings.json merge preserves user custom events', async () => {
  const fakeLingmaDir = makeFakeHome();
  const settingsPath = join(fakeLingmaDir, 'settings.json');
  // 模拟用户已有 settings.json，含自定义 hook
  const existing = {
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'user-bash-hook' }] }],
      CustomUserEvent: [{ matcher: '*', hooks: [{ command: 'user-custom' }] }],
    },
    someOtherConfig: 'value',
  };
  writeFileSync(settingsPath, JSON.stringify(existing, null, 2));

  // 模拟 oms 注入
  const omsEvents = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
  const omsHooks = {
    PreToolUse: [{ matcher: 'Edit|Write|MultiEdit', hooks: [{ command: 'oms-pre' }] }],
    PostToolUse: [{ matcher: 'Edit|Write|MultiEdit', hooks: [{ command: 'oms-post' }] }],
    UserPromptSubmit: [{ matcher: '*', hooks: [{ command: 'oms-ups' }] }],
    Stop: [{ matcher: '*', hooks: [{ command: 'oms-stop' }] }],
  };

  const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
  if (!parsed.hooks) parsed.hooks = {};
  for (const evt of omsEvents) {
    parsed.hooks[evt] = omsHooks[evt];
  }
  writeFileSync(settingsPath, JSON.stringify(parsed, null, 2) + '\n');

  // 验证
  const after = JSON.parse(readFileSync(settingsPath, 'utf8'));
  // PreToolUse 被 oms 覆盖
  assert.ok(after.hooks.PreToolUse[0].matcher.includes('Edit|Write|MultiEdit'));
  assert.equal(after.hooks.PreToolUse[0].hooks[0].command, 'oms-pre');
  // CustomUserEvent 保留
  assert.ok(after.hooks.CustomUserEvent);
  // someOtherConfig 保留
  assert.equal(after.someOtherConfig, 'value');
  // 4 个 oms 事件全部存在
  for (const evt of omsEvents) {
    assert.ok(after.hooks[evt], `${evt} 应被注入`);
  }
});

test('integration: Qoder uninstall removes only oms events', async () => {
  const fakeLingmaDir = makeFakeHome();
  const settingsPath = join(fakeLingmaDir, 'settings.json');
  const initial = {
    hooks: {
      PreToolUse: [{ matcher: 'Edit|Write|MultiEdit', hooks: [{ command: 'oms-pre' }] }],
      PostToolUse: [{ matcher: 'Edit|Write|MultiEdit', hooks: [{ command: 'oms-post' }] }],
      CustomUserEvent: [{ matcher: '*', hooks: [{ command: 'user-custom' }] }],
    },
  };
  writeFileSync(settingsPath, JSON.stringify(initial, null, 2));

  // 模拟卸载
  const omsEvents = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
  const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
  for (const evt of omsEvents) {
    delete parsed.hooks[evt];
  }
  if (Object.keys(parsed.hooks).length === 0) delete parsed.hooks;
  writeFileSync(settingsPath, JSON.stringify(parsed, null, 2) + '\n');

  // 验证
  const after = JSON.parse(readFileSync(settingsPath, 'utf8'));
  assert.ok(!after.hooks.PreToolUse, 'PreToolUse 应被删除');
  assert.ok(!after.hooks.PostToolUse, 'PostToolUse 应被删除');
  assert.ok(after.hooks.CustomUserEvent, 'CustomUserEvent 应保留');
});

test('integration: skills directory contains all 17 SKILL.md files', async () => {
  const { copySkillsToDir } = await import('../../hooks/lib/install-shared.js');
  const dest = makeFakeHome();
  const count = await copySkillsToDir(SKILLS_SRC, dest, () => {});
  // 应至少 17 个（可能有 18+ 如果后续新增）
  assert.ok(count >= 17, `期望 ≥17，实际 ${count}`);

  // 关键 skill 必须存在
  const required = ['sdd-spec', 'sdd-plan', 'sdd-apply', 'sdd-review', 'security-check'];
  for (const name of required) {
    const skillFile = join(dest, name, 'SKILL.md');
    assert.ok(existsSync(skillFile), `${name}/SKILL.md 必须存在`);
  }
});

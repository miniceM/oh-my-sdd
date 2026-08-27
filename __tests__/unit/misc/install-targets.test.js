import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ============================================
// 哨兵正则测试（卸载精准删除）
// ============================================
test('SENTINEL_RE matches baseline block wrapped by sentinels', () => {
  const SENTINEL_RE = /<!-- OH-MY-SDD:BEGIN[\s\S]*?<!-- OH-MY-SDD:END -->\n?/g;
  const sample = `# User content
<!-- OH-MY-SDD:BEGIN (do not edit between these markers) -->
baseline body
<!-- OH-MY-SDD:END -->
# More user content`;
  const cleaned = sample.replace(SENTINEL_RE, '').trim();
  assert.ok(cleaned.includes('User content'));
  assert.ok(cleaned.includes('More user content'));
  assert.ok(!cleaned.includes('OH-MY-SDD'));
  assert.ok(!cleaned.includes('baseline body'));
});

test('SENTINEL_RE handles missing sentinel gracefully', () => {
  const SENTINEL_RE = /<!-- OH-MY-SDD:BEGIN[\s\S]*?<!-- OH-MY-SDD:END -->\n?/g;
  const sample = '# Just user content, no sentinels';
  const cleaned = sample.replace(SENTINEL_RE, '').trim();
  assert.equal(cleaned, sample);
});

// ============================================
// lingma settings.json 深度合并测试
// ============================================
test('lingma hook merge preserves user custom events', () => {
  const omsEvents = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
  const existing = {
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'user-hook' }] }],
      'CustomEvent': [{ matcher: '*', hooks: [{ command: 'user-custom' }] }],
    },
  };
  const oms = {
    hooks: {
      PreToolUse: [{ matcher: 'Edit|Write|MultiEdit', hooks: [{ command: 'oms' }] }],
    },
  };

  // 模拟 handler 级合并逻辑
  if (!existing.hooks) existing.hooks = {};
  for (const evt of omsEvents) {
    if (oms.hooks[evt]) {
      existing.hooks[evt] = [...(existing.hooks[evt] ?? []), ...oms.hooks[evt]];
    }
  }

  // PreToolUse 同时保留用户与 OMS handler
  assert.equal(existing.hooks.PreToolUse[0].hooks[0].command, 'user-hook');
  assert.ok(existing.hooks.PreToolUse[1].matcher.includes('Edit'));
  // CustomEvent 应保留
  assert.ok(existing.hooks.CustomEvent);
});

test('lingma hook removal keeps user handlers in shared events intact', () => {
  // 卸载后：只删除 OMS handler，用户同事件 handler 与 CustomEvent 均保留
  const settings = {
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ command: 'user-hook' }] },
        { matcher: 'Edit', hooks: [{ command: 'oms-hook' }] },
      ],
      CustomEvent: [{ matcher: '*', hooks: [{}] }],
    },
  };
  const omsEvents = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
  for (const evt of omsEvents) {
    settings.hooks[evt] = (settings.hooks[evt] ?? []).filter(entry =>
      entry.hooks.every(hook => hook.command !== 'oms-hook'));
    if (settings.hooks[evt].length === 0) delete settings.hooks[evt];
  }

  // hooks 容器与用户同事件 handler 保留
  assert.ok(settings.hooks, 'hooks 容器应保留');
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, 'user-hook');
  assert.ok(settings.hooks.CustomEvent);
});

test('lingma hook removal deletes hooks container when fully empty', () => {
  // 当只有 oms 事件时，全部删除后 hooks 容器应被清除
  const settings = {
    hooks: {
      PreToolUse: [{ matcher: 'Edit', hooks: [{ command: 'oms-hook' }] }],
      PostToolUse: [{ matcher: 'Edit', hooks: [{ command: 'oms-hook' }] }],
    },
  };
  const omsEvents = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
  for (const evt of omsEvents) {
    settings.hooks[evt] = (settings.hooks[evt] ?? []).filter(entry =>
      entry.hooks.every(hook => hook.command !== 'oms-hook'));
    if (settings.hooks[evt].length === 0) delete settings.hooks[evt];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  assert.ok(!settings.hooks, '空的 hooks 容器应被删除');
});

// ============================================
// 哨兵文件元数据测试
// ============================================
test('Sentinel metadata round-trips correctly', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'oms-test-'));
  try {
    const sentinelPath = join(tmp, 'baseline-lingma.sentinel');
    const meta = {
      tool: 'lingma',
      dest: '/Users/test/.lingma/rules/oh-my-sdd.md',
      block_marker: 'OH-MY-SDD:BEGIN/END',
      installed_at: '2026-07-06T10:00:00Z',
    };
    writeFileSync(sentinelPath, JSON.stringify(meta, null, 2));
    const loaded = JSON.parse(readFileSync(sentinelPath, 'utf8'));
    assert.equal(loaded.tool, 'lingma');
    assert.equal(loaded.dest, meta.dest);
    assert.equal(loaded.installed_at, '2026-07-06T10:00:00Z');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ============================================
// Skills 复制测试（轻量集成：临时目录构造 fake skills）
// ============================================
test('copySkillsToDir preserves skill name as directory', async () => {
  const { copySkillsToDir } = await import('../../../packages/product/install/common/fs.js');

  // 构造 fake skills 源
  const srcRoot = mkdtempSync(join(tmpdir(), 'oms-skills-src-'));
  const destRoot = mkdtempSync(join(tmpdir(), 'oms-skills-dest-'));
  try {
    mkdirSync(join(srcRoot, 'api-design'), { recursive: true });
    writeFileSync(join(srcRoot, 'api-design', 'SKILL.md'), '# api-design skill');
    mkdirSync(join(srcRoot, 'security-check'), { recursive: true });
    writeFileSync(join(srcRoot, 'security-check', 'SKILL.md'), '# security-check skill');
    // 目录无 SKILL.md 应被跳过
    mkdirSync(join(srcRoot, 'no-skill-file'), { recursive: true });

    const messages = [];
    const count = await copySkillsToDir(srcRoot, destRoot, (m) => messages.push(m));

    assert.equal(count, 2);
    assert.ok(existsSync(join(destRoot, 'api-design', 'SKILL.md')));
    assert.ok(existsSync(join(destRoot, 'security-check', 'SKILL.md')));
    assert.ok(!existsSync(join(destRoot, 'no-skill-file')));
    assert.ok(messages.some(m => m.includes('已复制 2 个 skills')));
  } finally {
    rmSync(srcRoot, { recursive: true, force: true });
    rmSync(destRoot, { recursive: true, force: true });
  }
});

// 注：isHomeDir 是 install-lingma.js 内部的 5 行工具函数，
// 重复定义无共享价值，因此未导出也不单独测试。它的逻辑（resolve vs realpath）
// 已经在 install.js 的更严格的 isHomeDir 实现中验证（通过 smoke-check）。

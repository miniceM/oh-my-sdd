import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const worktreeRoot = process.cwd();

test('install + uninstall: oms-install/uninstall --tool opencode round-trip', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-install-'));
  const env = { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome };

  // Step 1: install (use CLI wrapper which parses --tool)
  execFileSync('node', ['bin/oms-install.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env,
    stdio: 'pipe',
  });
  const pluginDir = path.join(tmpHome, '.config', 'opencode', 'plugins', 'oh-my-sdd');
  assert.ok(fs.existsSync(pluginDir), `plugin dir should exist: ${pluginDir}`);
  assert.ok(fs.existsSync(path.join(pluginDir, 'index.js')), 'index.js should exist');
  assert.ok(fs.existsSync(path.join(pluginDir, 'plugin.js')), 'plugin.js should exist');
  const cfgPath = path.join(tmpHome, '.config', 'opencode', 'opencode.json');
  const cfgAfterInstall = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  // 注册的是相对路径（OpenCode 不解析裸字符串，详见 install-opencode.js）
  assert.ok(
    cfgAfterInstall.plugin.includes('./plugins/oh-my-sdd/index.js'),
    `opencode.json 应包含 './plugins/oh-my-sdd/index.js'，实际: ${JSON.stringify(cfgAfterInstall.plugin)}`
  );
  // 历史遗留的裸字符串 'oh-my-sdd' 不应出现（install 会顺手清理）
  assert.ok(
    !cfgAfterInstall.plugin.includes('oh-my-sdd'),
    'opencode.json 不应包含裸字符串 oh-my-sdd（OpenCode 无法解析）'
  );

  // Step 1.5: verify command files + skills were installed
  const commandsDir = path.join(tmpHome, '.config', 'opencode', 'commands');
  // 6 个 SDD 命令（sdd-constitution 故意排除——企业规则禁止项目组本地修改）
  const expectedCommands = ['sdd-spec.md', 'sdd-plan.md', 'sdd-task.md', 'sdd-apply.md', 'sdd-review.md', 'sdd-doc.md'];
  for (const cmdFile of expectedCommands) {
    const cmdPath = path.join(commandsDir, cmdFile);
    assert.ok(fs.existsSync(cmdPath), `command file should exist: ${cmdFile}`);
    const content = fs.readFileSync(cmdPath, 'utf8');
    // command 文件格式：YAML frontmatter + 指示 agent 读 SKILL.md 的 wrapper prompt
    assert.ok(content.startsWith('---'), `${cmdFile} 应以 YAML frontmatter 开头`);
    assert.ok(content.includes('description:'), `${cmdFile} 应包含 description 字段`);
    assert.ok(content.includes('SKILL.md'), `${cmdFile} 应指示 agent 读 SKILL.md`);
    assert.ok(content.includes('$ARGUMENTS'), `${cmdFile} 应支持 $ARGUMENTS 占位符`);
  }
  // skills 复制（主 SDD skills 必须存在）
  const skillsDir = path.join(pluginDir, 'skills');
  assert.ok(fs.existsSync(skillsDir), 'skills dir should exist in plugin dir');
  const expectedSkills = ['sdd-spec', 'sdd-plan', 'sdd-task', 'sdd-apply', 'sdd-review', 'sdd-doc'];
  for (const skill of expectedSkills) {
    const skillMd = path.join(skillsDir, skill, 'SKILL.md');
    assert.ok(fs.existsSync(skillMd), `skill SKILL.md should exist: ${skill}/SKILL.md`);
  }

  // 委托子技能（brainstorming/writing-plans 等）是最佳努力复制：
  // 当 packageRoot/.claude/skills/ 存在时复制（用户同时用 Claude Code 的典型场景），
  // 不存在时跳过（npm 安装/worktree 场景）。测试环境可能没有 .claude/skills/，
  // 所以这里不硬断言，仅验证：如果存在，格式正确。
  const possibleDelegated = ['brainstorming', 'writing-plans', 'executing-plans', 'subagent-driven-development', 'requesting-code-review'];
  for (const skill of possibleDelegated) {
    const skillMd = path.join(skillsDir, skill, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      const content = fs.readFileSync(skillMd, 'utf8');
      assert.ok(content.length > 100, `delegated skill ${skill}/SKILL.md 应有实质内容`);
    }
  }

  // command 文件不应包含旧的 "ignore (skill content is in the file you're reading)"
  // 这行误导过 agent 把 Skill() 委托当成跳过处理（E2E spike 发现的问题）
  for (const cmdFile of expectedCommands) {
    const cmdPath = path.join(commandsDir, cmdFile);
    const content = fs.readFileSync(cmdPath, 'utf8');
    assert.ok(
      !content.includes('ignore (skill content is in the file you\'re reading)'),
      `${cmdFile} 不应包含旧的 "ignore" 工具映射（应指示读文件执行）`
    );
    // 新映射应明确告知 agent：Skill() 委托不能跳过，必须通过 fallback chain 解析
    assert.ok(
      content.includes('fallback chain'),
      `${cmdFile} 应包含 Skill() 委托的三级 fallback chain 说明`
    );
    assert.ok(
      content.includes('inline'),
      `${cmdFile} 应包含 inline fallback（当 skill 文件不存在时）`
    );
    assert.ok(
      content.includes('CRITICAL') || content.includes('NOT'),
      `${cmdFile} 应强烈提示不能跳过委托步骤`
    );
    // Issue #8 修复：command wrapper 必须区分 "inline content resolution" 与
    // "inline task execution"（两个独立层），避免 agent 把 fallback #3 触发
    // 误当成"在当前 agent 内联执行所有 task"——这会与 sdd-apply 的 Orchestrator
    // 适配（task() 委托）冲突，产生自相矛盾的输出（实测发现 agent 同时说
    // "inline 执行" 和 "使用 task() 委托"）。
    assert.ok(
      content.includes('inline-content-resolution') || content.includes('inline content resolution'),
      `${cmdFile} 应使用 "inline-content-resolution" 术语（区分内容加载 vs 任务执行两层）`
    );
    assert.ok(
      content.includes('Orchestrator') || content.includes('orchestrator'),
      `${cmdFile} 应提及 Orchestrator 适配场景（允许 subagent 委托例外）`
    );
  }

  // sdd-constitution 必须不注册为 OpenCode 命令（治理不变量）：
  // 企业级 baseline 由中央工具统一更新下发，禁止项目组本地修改
  const constitutionCmd = path.join(commandsDir, 'sdd-constitution.md');
  assert.ok(!fs.existsSync(constitutionCmd), 'sdd-constitution.md 必须不被创建（企业规则禁止项目组本地修改）');
  // 同样，skill 文件也不复制到 plugin 目录（消除 agent 意外发现该 skill 的可能）
  const constitutionSkill = path.join(skillsDir, 'sdd-constitution', 'SKILL.md');
  assert.ok(!fs.existsSync(constitutionSkill), 'sdd-constitution skill 必须不被复制到 plugin 目录');

  // Step 2: uninstall
  execFileSync('node', ['bin/oms-uninstall.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env,
    stdio: 'pipe',
  });
  assert.ok(!fs.existsSync(pluginDir), 'plugin dir should be removed');
  const cfgAfterUninstall = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const plugins = cfgAfterUninstall.plugin ?? [];
  // 三种历史 entry 都应被清理（含裸字符串 + 旧 plugin.js + 新 index.js）
  assert.ok(!plugins.includes('./plugins/oh-my-sdd/index.js'), 'uninstall 应清掉 ./plugins/oh-my-sdd/index.js');
  assert.ok(!plugins.includes('oh-my-sdd'), 'uninstall 应清掉裸字符串 oh-my-sdd');
  assert.ok(!plugins.includes('./plugins/oh-my-sdd/plugin.js'), 'uninstall 应清掉旧 ./plugins/oh-my-sdd/plugin.js');

  // command 文件应被清理
  for (const cmdFile of expectedCommands) {
    const cmdPath = path.join(commandsDir, cmdFile);
    assert.ok(!fs.existsSync(cmdPath), `command file should be removed: ${cmdFile}`);
  }
});

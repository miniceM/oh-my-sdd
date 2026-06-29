import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = path.resolve(__dirname, '..', '..', 'skills', 'sdd-plan', 'SKILL.md');

async function readSkill() {
  return readFile(SKILL_PATH, 'utf8');
}

test('SKILL.md contains a Constitution Check section', async () => {
  const skill = await readSkill();
  assert.ok(
    skill.includes('Constitution Check'),
    'sdd-plan SKILL.md must define a Constitution Check section (PR2 plan gate)'
  );
});

test('SKILL.md declares design.md must contain Constitution Check as a contract rule', async () => {
  const skill = await readSkill();
  // 强制规则段的契约表达：必须含 + 缺失则 plan 失败
  assert.ok(
    /design\.md.{0,40}必须含.{0,40}Constitution Check/.test(skill),
    'sdd-plan must enforce that design.md contains Constitution Check (contract rule in 强制规则 section)'
  );
  assert.ok(
    skill.includes('plan 失败'),
    'sdd-plan must state that missing Constitution Check causes plan failure'
  );
});

test('Constitution Check step is ordered before design exploration steps', async () => {
  const skill = await readSkill();
  const ccIdx = skill.indexOf('### 步骤 1.5：Constitution Check');
  assert.ok(ccIdx > -1, 'step 1.5 Constitution Check heading must exist');

  // design 探索入口：步骤 3 委托 brainstorming（产 design.md 的关键步骤）
  const designStepIdx = skill.indexOf('### 步骤 3：委托 superpowers:brainstorming');
  assert.ok(designStepIdx > -1, 'step 3 (brainstorming/design) heading must exist');
  assert.ok(
    ccIdx < designStepIdx,
    'Constitution Check gate must come before the design/brainstorming step'
  );

  // 还需早于步骤 2（格式约束）以体现"先合规、再格式"的顺序
  const step2Idx = skill.indexOf('### 步骤 2：格式约束');
  assert.ok(step2Idx > -1, 'step 2 heading must exist');
  assert.ok(ccIdx < step2Idx, 'Constitution Check must precede step 2');
});

test('SKILL.md explicitly references enterprise-baseline.md as the constitution source', async () => {
  const skill = await readSkill();
  assert.ok(
    skill.includes('enterprise-baseline.md'),
    'sdd-plan must explicitly reference enterprise-baseline.md (the constitution source of truth)'
  );
  // 同时校验引用了 loadBaseline helper（来自 PR1 的 hooks/lib/constitution.js）
  assert.ok(
    skill.includes('loadBaseline'),
    'sdd-plan should call loadBaseline() to parse the versioned baseline (PR1 helper)'
  );
});

test('SKILL.md declares a post-design re-check gate', async () => {
  // 设计末尾的二次评估是 PR2 双门结构的关键组成
  const skill = await readSkill();
  assert.ok(
    /再评估|Re-check after design|设计后 gate/i.test(skill),
    'sdd-plan must define a post-design re-check gate (double-gate contract)'
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = path.resolve(__dirname, '..', '..', 'skills', 'sdd-review', 'SKILL.md');
const MIRROR_SKILL_PATH = path.resolve(
  __dirname, '..', '..', 'opencode', 'oms-skills', 'sdd-review', 'SKILL.md'
);

async function readSkill() {
  return readFile(SKILL_PATH, 'utf8');
}

test('SKILL.md exists and contains Constitution Authority segment', async () => {
  const skill = await readSkill();
  assert.ok(skill.length > 0, 'SKILL.md should not be empty');
  // 改动 1.1：Constitution Authority 段存在
  assert.ok(
    /Constitution|baseline/.test(skill),
    'SKILL.md should mention "Constitution" or "baseline"'
  );
});

test('CRITICAL escalation rule ties HARD_RULE to Critical severity', async () => {
  const skill = await readSkill();
  // 改动 1.1：HARD_RULE 必须与 CRITICAL/Critical 共现
  assert.ok(skill.includes('HARD_RULE'), 'SKILL.md should reference HARD_RULE');
  assert.ok(
    /HARD_RULE[\s\S]{0,200}(CRITICAL|Critical)/.test(skill),
    'HARD_RULE should be associated with CRITICAL/Critical severity within a reasonable window'
  );
});

test('SOFT_RULE maps to Important severity', async () => {
  const skill = await readSkill();
  // 改动 1.1：SOFT_RULE 必须与 Important 共现
  assert.ok(skill.includes('SOFT_RULE'), 'SKILL.md should reference SOFT_RULE');
  assert.ok(
    /SOFT_RULE[\s\S]{0,200}Important/.test(skill),
    'SOFT_RULE should be associated with Important severity within a reasonable window'
  );
});

test('OVERRIDE scan step references [OVERRIDE] marker syntax', async () => {
  const skill = await readSkill();
  // 改动 1.2：必须含 [OVERRIDE] 字面标记
  assert.ok(
    skill.includes('[OVERRIDE]'),
    'SKILL.md should document the [OVERRIDE] marker syntax for soft-rule waivers'
  );
});

test('Constitution Authority segment appears before superpowers delegation', async () => {
  const skill = await readSkill();
  // 流程顺序：HARD_RULE 段（步骤 1.5）必须在委托 superpowers:requesting-code-review 之前
  const hardRuleIdx = skill.indexOf('HARD_RULE');
  assert.ok(hardRuleIdx !== -1, 'HARD_RULE must be mentioned in SKILL.md');
  // 找第二个 requesting-code-review（frontmatter description 里有一个，正文委托段有一个）
  const delegateIdxLast = skill.lastIndexOf('requesting-code-review');
  assert.ok(delegateIdxLast > hardRuleIdx,
    `Constitution Authority (HARD_RULE @${hardRuleIdx}) must precede ` +
    `superpowers delegation (requesting-code-review @${delegateIdxLast})`);
});

test('Step 1.5 and Step 2.5 are inserted without renumbering existing steps', async () => {
  const skill = await readSkill();
  // 步骤 1.5 和 2.5 都应存在
  assert.ok(/步骤 1\.5/.test(skill), 'Step 1.5 should be inserted (no renumbering)');
  assert.ok(/步骤 2\.5/.test(skill), 'Step 2.5 should be inserted (no renumbering)');
  // 既有步骤 1、2、3 都保留
  assert.ok(/### 步骤 1：/.test(skill), 'Step 1 should be preserved');
  assert.ok(/### 步骤 2：/.test(skill), 'Step 2 should be preserved');
  assert.ok(/### 步骤 3：/.test(skill), 'Step 3 should be preserved');
});

test('Mandatory rules section documents the OVERRIDE contract', async () => {
  const skill = await readSkill();
  // 改动 1.3：强制规则段必须含 OVERRIDE 扫描契约
  const mandatorySectionIdx = skill.indexOf('## 强制规则');
  assert.ok(mandatorySectionIdx !== -1, '强制规则 section must exist');
  const mandatorySection = skill.slice(mandatorySectionIdx);
  assert.ok(
    /必须扫描/.test(mandatorySection) || /\[OVERRIDE\][\s\S]*Critical/.test(mandatorySection),
    '强制规则 must document the OVERRIDE scan contract (e.g., "必须扫描 [OVERRIDE]")'
  );
});

test('Mandatory rules section requires reading HARD_RULE/SOFT_RULE as triggers', async () => {
  const skill = await readSkill();
  // 改动 1.3：强制规则段必须要求读 baseline HARD_RULE/SOFT_RULE 清单
  const mandatorySectionIdx = skill.indexOf('## 强制规则');
  const mandatorySection = skill.slice(mandatorySectionIdx);
  assert.ok(
    /HARD_RULE\/SOFT_RULE|HARD_RULE/.test(mandatorySection),
    '强制规则 must require reading baseline HARD_RULE/SOFT_RULE list as triggers'
  );
  assert.ok(
    /触发条件/.test(mandatorySection),
    '强制规则 must mention "触发条件" (trigger conditions)'
  );
});

test('OVERRIDE tiering rules are documented (Critical / Important / Minor)', async () => {
  const skill = await readSkill();
  // 改动 1.2：OVERRIDE 扫描必须定义三档降级规则
  const overrideIdx = skill.indexOf('[OVERRIDE]');
  assert.ok(overrideIdx !== -1, '[OVERRIDE] marker must be documented');
  // 从第一个 OVERRIDE 标记往后扫一段窗口，确认三档都出现
  const window = skill.slice(overrideIdx, overrideIdx + 1500);
  assert.ok(window.includes('Critical'), 'OVERRIDE scan must define Critical tier');
  assert.ok(window.includes('Important'), 'OVERRIDE scan must define Important tier');
  assert.ok(window.includes('Minor'), 'OVERRIDE scan must define Minor tier');
});

test('OVERRIDE minimum-reason threshold (20 chars) is documented', async () => {
  const skill = await readSkill();
  // 改动 1.2：必须含 20 字理由门槛
  assert.ok(
    /20\s*字/.test(skill),
    'OVERRIDE scan must document the ≥20-char minimum reason threshold'
  );
});

test('OpenCode mirror is byte-for-byte identical to the canonical review skill', async () => {
  assert.equal(await readFile(MIRROR_SKILL_PATH, 'utf8'), await readSkill());
});

test('Ring 5 archives before creating the atomic PR, then completes DOP', async () => {
  const skill = await readSkill();
  const archiveIdx = skill.indexOf('openspec archive <slug>');
  const prIdx = skill.indexOf('gh pr create');
  const dopIdx = skill.indexOf('dop change done <change-id>');

  assert.ok(archiveIdx !== -1, 'Ring 5 must archive before submitting its PR');
  assert.ok(prIdx > archiveIdx, 'gh pr create must follow openspec archive');
  assert.ok(dopIdx > prIdx, 'DOP completion must follow successful PR creation');
  assert.match(skill, /dop_completion:\s*\{\s*status:\s*['"]pending['"]/);
  assert.match(skill, /prepared_at/);
  assert.match(skill, /prepared_head/);
  assert.match(skill, /archive_done_at/);
});

test('Ring 5 has retry-only DOP recovery and excludes merge-era operations', async () => {
  const skill = await readSkill();
  assert.match(skill, /\/sdd-review --retry-dop <slug>/);
  assert.match(skill, /只从 archive meta 读 change_id/);
  assert.match(skill, /DOP done 失败绝不撤销 PR/);

  for (const forbidden of [
    '--finalize',
    'gh pr view',
    'git checkout main',
    'git pull origin main',
    'git push origin main',
  ]) {
    assert.equal(skill.includes(forbidden), false, `skill must not contain ${forbidden}`);
  }
});

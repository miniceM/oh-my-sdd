import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const canonicalRoot = path.join(root, 'packages', 'product', 'skills');
const mirrorRoots = [
  path.join(root, 'packages', 'opencode-plugin', 'skills'),
  path.join(root, 'packages', 'opencode-plugin', 'oms-skills'),
  path.join(root, 'packages', 'opencode-plugin', '.opencode', 'skills'),
  path.join(root, 'packages', 'opencode-plugin', '.agents', 'skills'),
];

const workflowSkillSteps = {
  'sdd-apply': 7,
  'sdd-doc': 7,
  'sdd-plan': 8,
  'sdd-review': 7,
  'sdd-spec': 9,
  'sdd-task': 5,
};

test('SDD workflow skill headings use continuous integer numbering', async () => {
  for (const [skill, lastStep] of Object.entries(workflowSkillSteps)) {
    const content = await readFile(path.join(canonicalRoot, skill, 'SKILL.md'), 'utf8');
    const headings = [...content.matchAll(/^### 步骤 (\d+)：/gm)].map((match) => Number(match[1]));
    assert.deepEqual(headings, Array.from({ length: lastStep }, (_, index) => index + 1), skill);
    assert.doesNotMatch(content, /^### 步骤 \d+\.\d+：/gm, skill);
  }
});

test('SDD constitution outline uses continuous integer numbering', async () => {
  const content = await readFile(path.join(canonicalRoot, 'sdd-constitution', 'SKILL.md'), 'utf8');
  const outline = content.slice(content.indexOf('## Outline'), content.indexOf('## 验证清单'));
  const steps = [...outline.matchAll(/^(\d+)\. \*\*/gm)].map((match) => Number(match[1]));
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('every OpenCode SDD skill mirror matches its canonical source', async () => {
  for (const skill of [...Object.keys(workflowSkillSteps), 'sdd-constitution']) {
    const canonical = await readFile(path.join(canonicalRoot, skill, 'SKILL.md'), 'utf8');
    for (const mirrorRoot of mirrorRoots) {
      const mirrored = await readFile(path.join(mirrorRoot, skill, 'SKILL.md'), 'utf8');
      assert.equal(mirrored, canonical, `${skill} mirror: ${mirrorRoot}`);
    }
  }
});

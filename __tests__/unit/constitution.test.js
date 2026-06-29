import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  loadBaseline,
  getVersion,
  diffVersions,
  getBodyForInjection,
  REQUIRED_FRONTMATTER_FIELDS,
  ConstitutionError,
} from '../../hooks/lib/constitution.js';

function fixture(name, content) {
  const dir = mkdtempSync(path.join(tmpdir(), 'oms-const-'));
  const filePath = path.join(dir, name);
  writeFileSync(filePath, content, 'utf8');
  return { dir, filePath };
}

const VALID_BASELINE = `---
oms_version: 1.2.3
ratified: 2026-06-01
last_amended: 2026-06-26
---

<!-- BEGIN sync-impact-report
Version change: 1.2.2 → 1.2.3
Bump rationale: PATCH — typo fix in HARD_RULE 5.
END sync-impact-report -->

# 企业 SDD Agent 基线

正文 A。
`;

const NO_FRONTMATTER = `# 企业 SDD Agent 基线

正文。`;

const MISSING_FIELD = `---
oms_version: 1.0.0
ratified: 2026-06-26
---

# 企业 SDD Agent 基线
`;

const BAD_SEMVER = `---
oms_version: 1.0
ratified: 2026-06-26
last_amended: 2026-06-26
---

# 企业 SDD Agent 基线
`;

const NO_SYNC_REPORT = `---
oms_version: 1.0.0
ratified: 2026-06-26
last_amended: 2026-06-26
---

# 企业 SDD Agent 基线

正文。
`;

test('loadBaseline parses valid baseline into frontmatter / body / syncReport', async () => {
  const { filePath, dir } = fixture('baseline.md', VALID_BASELINE);
  try {
    const result = await loadBaseline(filePath);
    assert.equal(result.frontmatter.oms_version, '1.2.3');
    assert.equal(result.frontmatter.ratified, '2026-06-01');
    assert.equal(result.frontmatter.last_amended, '2026-06-26');
    assert.ok(result.syncReport, 'syncReport should be extracted');
    assert.match(result.syncReport, /BEGIN sync-impact-report/);
    assert.ok(!result.body.includes('oms_version'), 'body must not contain frontmatter');
    assert.ok(!result.body.includes('sync-impact-report'), 'body must not contain sync report');
    assert.match(result.body, /^# 企业 SDD Agent 基线/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadBaseline throws ConstitutionError when frontmatter missing', async () => {
  const { filePath, dir } = fixture('baseline.md', NO_FRONTMATTER);
  try {
    await assert.rejects(
      () => loadBaseline(filePath),
      (err) => err instanceof ConstitutionError && err.field === 'frontmatter'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadBaseline throws ConstitutionError when required field missing', async () => {
  const { filePath, dir } = fixture('baseline.md', MISSING_FIELD);
  try {
    await assert.rejects(
      () => loadBaseline(filePath),
      (err) =>
        err instanceof ConstitutionError &&
        err.field === 'last_amended'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadBaseline throws ConstitutionError when oms_version is not SemVer', async () => {
  const { filePath, dir } = fixture('baseline.md', BAD_SEMVER);
  try {
    await assert.rejects(
      () => loadBaseline(filePath),
      (err) =>
        err instanceof ConstitutionError && err.field === 'oms_version'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadBaseline handles baseline without Sync Impact Report (syncReport = null)', async () => {
  const { filePath, dir } = fixture('baseline.md', NO_SYNC_REPORT);
  try {
    const result = await loadBaseline(filePath);
    assert.equal(result.syncReport, null);
    assert.ok(result.body.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadBaseline throws when file does not exist', async () => {
  await assert.rejects(
    () => loadBaseline('/nonexistent/baseline.md'),
    (err) => err instanceof ConstitutionError && err.field === 'file'
  );
});

test('getVersion returns just the SemVer string', async () => {
  const { filePath, dir } = fixture('baseline.md', VALID_BASELINE);
  try {
    const v = await getVersion(filePath);
    assert.equal(v, '1.2.3');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('diffVersions identifies MAJOR bump', () => {
  const r = diffVersions('1.2.3', '2.0.0');
  assert.equal(r.bump, 'major');
  assert.ok(r.changes.length >= 1);
});

test('diffVersions identifies MINOR bump', () => {
  const r = diffVersions('1.2.3', '1.3.0');
  assert.equal(r.bump, 'minor');
});

test('diffVersions identifies PATCH bump', () => {
  const r = diffVersions('1.2.3', '1.2.4');
  assert.equal(r.bump, 'patch');
});

test('diffVersions returns "none" for equal versions', () => {
  const r = diffVersions('1.2.3', '1.2.3');
  assert.equal(r.bump, 'none');
  assert.equal(r.changes.length, 0);
});

test('diffVersions throws on invalid SemVer input', () => {
  assert.throws(
    () => diffVersions('1.0', '1.0.0'),
    (err) => err instanceof ConstitutionError
  );
});

test('getBodyForInjection strips frontmatter + Sync Report, returns trimmed body', () => {
  const body = getBodyForInjection(VALID_BASELINE);
  assert.ok(!body.includes('oms_version'));
  assert.ok(!body.includes('sync-impact-report'));
  assert.ok(!body.includes('---'));
  assert.match(body, /^# 企业 SDD Agent 基线/);
  assert.equal(body, body.trim(), 'result must be trimmed');
});

test('getBodyForInjection on body without frontmatter returns trimmed body', () => {
  const body = getBodyForInjection(NO_FRONTMATTER);
  assert.match(body, /^# 企业 SDD Agent 基线/);
});

test('REQUIRED_FRONTMATTER_FIELDS exports expected schema keys', () => {
  assert.deepEqual(REQUIRED_FRONTMATTER_FIELDS.sort(), [
    'last_amended',
    'oms_version',
    'ratified',
  ]);
});

test('install.js injection contract: body has no frontmatter structure', async () => {
  const realBaselinePath = path.resolve(
    process.cwd(),
    'content',
    'enterprise-baseline.md'
  );
  const result = await loadBaseline(realBaselinePath);
  assert.ok(
    !result.body.match(/^---[\s\S]*?\n---\n/),
    'body must not contain a YAML frontmatter block (---\\n...\\n---\\n)'
  );
  assert.ok(
    !result.body.includes('BEGIN sync-impact-report'),
    'body must not contain Sync Impact Report block'
  );
  assert.ok(
    !result.body.match(/^oms_version:/m),
    'body must not contain raw frontmatter line at column 0'
  );
});

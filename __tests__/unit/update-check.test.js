import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSemVerFull,
  compareVersions,
  shouldCheck,
  buildUpdateNotification,
} from '../../hooks/lib/update-check.js';

// ============================================
// SemVer 解析测试
// ============================================
test('parseSemVerFull parses standard version', () => {
  const r = parseSemVerFull('0.1.0');
  assert.deepEqual(r, { major: 0, minor: 1, patch: 0, prerelease: null, build: null, raw: '0.1.0' });
});

test('parseSemVerFull parses prerelease version', () => {
  const r = parseSemVerFull('0.2.0-alpha.1');
  assert.equal(r?.major, 0);
  assert.equal(r?.minor, 2);
  assert.equal(r?.patch, 0);
  assert.equal(r?.prerelease, 'alpha.1');
});

test('parseSemVerFull parses full prerelease with build', () => {
  const r = parseSemVerFull('1.0.0-beta.2+build.123');
  assert.equal(r?.prerelease, 'beta.2');
  assert.equal(r?.build, 'build.123');
});

test('parseSemVerFull returns null for invalid version', () => {
  assert.equal(parseSemVerFull('invalid'), null);
  assert.equal(parseSemVerFull('0.1'), null);
  assert.equal(parseSemVerFull('0.1.0.'), null);
});

// ============================================
// 版本比较测试
// ============================================
test('compareVersions detects major update', () => {
  const r = compareVersions('0.1.0', '1.0.0', {});
  assert.equal(r.isNewer, true);
  assert.equal(r.bump, 'major');
});

test('compareVersions detects minor update', () => {
  const r = compareVersions('0.1.0', '0.2.0', {});
  assert.equal(r.isNewer, true);
  assert.equal(r.bump, 'minor');
});

test('compareVersions detects patch update', () => {
  const r = compareVersions('0.1.0', '0.1.1', {});
  assert.equal(r.isNewer, true);
  assert.equal(r.bump, 'patch');
});

test('compareVersions handles same version', () => {
  const r = compareVersions('0.1.0', '0.1.0', {});
  assert.equal(r.isNewer, false);
  assert.equal(r.bump, null);
});

test('compareVersions handles older version', () => {
  const r = compareVersions('0.2.0', '0.1.0', {});
  assert.equal(r.isNewer, false);
  assert.equal(r.bump, null);
});

test('compareVersions ignores prerelease by default', () => {
  const r = compareVersions('0.1.0', '0.2.0-alpha.1', {});
  assert.equal(r.isNewer, false);
  assert.equal(r.bump, null);
});

test('compareVersions includes prerelease when configured', () => {
  const r = compareVersions('0.1.0', '0.2.0-alpha.1', { includePrerelease: true });
  assert.equal(r.isNewer, true);
  assert.equal(r.bump, 'minor');  // minor 更新（prerelease 是次要）
});

test('compareVersions handles current on prerelease', () => {
  const r = compareVersions('0.2.0-alpha.1', '0.2.0', { includePrerelease: true });
  assert.equal(r.isNewer, true);
  assert.equal(r.bump, 'prerelease');  // prerelease 到 stable
});

test('compareVersions handles invalid versions', () => {
  const r = compareVersions('invalid', '0.1.0', {});
  assert.equal(r.isNewer, false);
  assert.equal(r.bump, null);
});

// ============================================
// shouldCheck 测试
// ============================================
test('shouldCheck returns true when no cache', () => {
  assert.equal(shouldCheck(null, 1), true);
});

test('shouldCheck returns true when interval elapsed', () => {
  const cache = {
    last_check_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),  // 2 days ago
  };
  assert.equal(shouldCheck(cache, 1), true);
});

test('shouldCheck returns false when interval not elapsed', () => {
  const cache = {
    last_check_at: new Date(Date.now() - 0.5 * 24 * 60 * 60 * 1000).toISOString(),  // 12 hours ago
  };
  assert.equal(shouldCheck(cache, 1), false);
});

test('shouldCheck handles missing last_check_at', () => {
  const cache = {};
  assert.equal(shouldCheck(cache, 1), true);
});

// ============================================
// buildUpdateNotification 测试
// ============================================
test('buildUpdateNotification creates correct messages for minor update', () => {
  const { stderr, additionalContext } = buildUpdateNotification({
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    bump: 'minor',
  });

  assert.ok(stderr.includes('0.2.0'));
  assert.ok(stderr.includes('0.1.0'));
  assert.ok(stderr.includes('oms-update'));
  assert.ok(additionalContext.includes('reload'));
});

test('buildUpdateNotification handles major update with red emoji', () => {
  const { stderr } = buildUpdateNotification({
    currentVersion: '0.1.0',
    latestVersion: '1.0.0',
    bump: 'major',
  });

  assert.ok(stderr.includes('🔴'));
});

test('buildUpdateNotification handles patch update with green emoji', () => {
  const { stderr } = buildUpdateNotification({
    currentVersion: '0.1.0',
    latestVersion: '0.1.1',
    bump: 'patch',
  });

  assert.ok(stderr.includes('🟢'));
});
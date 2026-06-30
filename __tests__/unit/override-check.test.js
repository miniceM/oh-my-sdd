import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOverrides, isOverrideActive, filterOverridden } from '../../hooks/git/lib/override-check.js';

// ============================================
// parseOverrides 测试
// ============================================

test('parseOverrides 解析单行 override', () => {
  const msg = '[OVERRIDE] hardcoded-aws-ak: 测试数据';
  const r = parseOverrides(msg);
  assert.equal(r.get('hardcoded-aws-ak'), '测试数据');
  assert.equal(r.size, 1);
});

test('parseOverrides 解析多规则 override', () => {
  const msg = '[OVERRIDE] rule1: r1\n[OVERRIDE] rule2: r2';
  const r = parseOverrides(msg);
  assert.equal(r.get('rule1'), 'r1');
  assert.equal(r.get('rule2'), 'r2');
  assert.equal(r.size, 2);
});

test('parseOverrides 解析 body 非首行 override', () => {
  const msg = '[PROJ123] feat: add feature\n\n详细说明\n\n[OVERRIDE] hardcoded-sk: 测试 key';
  const r = parseOverrides(msg);
  assert.equal(r.get('hardcoded-sk'), '测试 key');
});

test('parseOverrides 无 override 返回空 Map', () => {
  assert.equal(parseOverrides('feat: add feature').size, 0);
  assert.equal(parseOverrides('').size, 0);
  assert.equal(parseOverrides(null).size, 0);
  assert.equal(parseOverrides(undefined).size, 0);
});

test('parseOverrides 容错：rule_id 只允许字母数字下划线破折号', () => {
  const msg = '[OVERRIDE] commit-msg-format: 紧急绕过';
  const r = parseOverrides(msg);
  assert.equal(r.get('commit-msg-format'), '紧急绕过');
});

test('parseOverrides 去除 reason 前后空格', () => {
  const msg = '[OVERRIDE] rule1:    理由内容   ';
  const r = parseOverrides(msg);
  assert.equal(r.get('rule1'), '理由内容');
});

test('parseOverrides 同一规则多次出现保留最后一个', () => {
  const msg = '[OVERRIDE] rule1: 第一次\n[OVERRIDE] rule1: 第二次';
  const r = parseOverrides(msg);
  assert.equal(r.get('rule1'), '第二次');
  assert.equal(r.size, 1);
});

// ============================================
// isOverrideActive 测试
// ============================================

test('isOverrideActive 正例：ruleId 在 overrides 中', () => {
  const overrides = parseOverrides('[OVERRIDE] rule1: x');
  assert.equal(isOverrideActive(overrides, ['rule1', 'rule2']), true);
});

test('isOverrideActive 负例：ruleId 不在 overrides 中', () => {
  const overrides = parseOverrides('[OVERRIDE] rule3: x');
  assert.equal(isOverrideActive(overrides, ['rule1']), false);
});

test('isOverrideActive 空 overrides 返回 false', () => {
  assert.equal(isOverrideActive(new Map(), ['rule1']), false);
  assert.equal(isOverrideActive(null, ['rule1']), false);
});

test('isOverrideActive 空 ruleIds 返回 false', () => {
  const overrides = parseOverrides('[OVERRIDE] rule1: x');
  assert.equal(isOverrideActive(overrides, []), false);
  assert.equal(isOverrideActive(overrides, null), false);
});

// ============================================
// filterOverridden 测试
// ============================================

test('filterOverridden 过滤被 override 的违规', () => {
  const violations = [
    { rule_id: 'hardcoded-aws-ak', message: 'm1' },
    { rule_id: 'hardcoded-sk', message: 'm2' },
  ];
  const overrides = parseOverrides('[OVERRIDE] hardcoded-aws-ak: 测试');
  const remaining = filterOverridden(violations, overrides);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].rule_id, 'hardcoded-sk');
});

test('filterOverridden 无 override 时返回原列表', () => {
  const violations = [{ rule_id: 'rule1', message: 'm1' }];
  assert.equal(filterOverridden(violations, new Map()).length, 1);
  assert.equal(filterOverridden(violations, null).length, 1);
});

test('filterOverridden 全部被 override 返回空数组', () => {
  const violations = [{ rule_id: 'rule1', message: 'm1' }];
  const overrides = parseOverrides('[OVERRIDE] rule1: x');
  assert.equal(filterOverridden(violations, overrides).length, 0);
});
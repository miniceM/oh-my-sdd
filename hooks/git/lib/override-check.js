// [OVERRIDE] 标记解析 — git hooks 共用的绕过检测纯函数。
//
// commit 消息中的 [OVERRIDE] <rule_id>: <reason> 标记可跳过对应规则。
// 与 SDD 体系（/sdd-review、PreToolUse hook）的 OVERRIDE 契约一致。
//
// 纯函数：输入字符串，输出 Map<ruleId, reason>，无副作用，便于单元测试。

const OVERRIDE_RE = /\[OVERRIDE\]\s+([a-zA-Z0-9_-]+)\s*:\s*(.+)/g;

/**
 * 解析 commit 消息中的所有 [OVERRIDE] 标记。
 * @param {string} messageText - commit 消息全文
 * @returns {Map<string, string>} ruleId -> reason 的映射
 */
export function parseOverrides(messageText) {
  const overrides = new Map();
  if (!messageText || typeof messageText !== 'string') return overrides;

  for (const match of messageText.matchAll(OVERRIDE_RE)) {
    const ruleId = match[1];
    const reason = match[2].trim();
    overrides.set(ruleId, reason);
  }

  return overrides;
}

/**
 * 判断被触发的规则是否有对应的 [OVERRIDE]。
 * @param {Map<string, string>} overrides - parseOverrides 返回的映射
 * @param {string[]} ruleIds - 被触发的规则 ID 数组
 * @returns {boolean} 任一 ruleId 在 overrides 中则 true
 */
export function isOverrideActive(overrides, ruleIds) {
  if (!overrides || overrides.size === 0) return false;
  if (!Array.isArray(ruleIds) || ruleIds.length === 0) return false;
  return ruleIds.some((id) => overrides.has(id));
}

/**
 * 过滤出未被 override 的违规规则。
 * @param {Array<{rule_id: string}>} violations - 违规列表
 * @param {Map<string, string>} overrides - override 映射
 * @returns {Array} 未被 override 的违规
 */
export function filterOverridden(violations, overrides) {
  if (!overrides || overrides.size === 0) return violations;
  return violations.filter((v) => !overrides.has(v.rule_id));
}
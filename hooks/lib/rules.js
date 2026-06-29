// PostToolUse rule set + matcher.
//
// Rules are derived from the HARD_RULE / SOFT_RULE sections of
// content/enterprise-baseline.md. HARD rules cause post-tool-use.js to
// return { permissionDecision: 'deny', ... } (block the write); SOFT rules
// return { additionalContext: '...' } (warn the agent but allow the write).
//
// Each rule has one of two evaluation modes:
//   - pattern (RegExp): matched against file content; for file-name-only
//     rules (e.g. .env), use filePattern and omit pattern.
//   - check(content, filePath): returns RuleMatch[] | null, for rules that
//     need structural inspection (README quickstart, public API docstring).
//
// RuleMatch shape: { rule_id, severity, message, line?, match? }

const BASE_NAME_RE = (re) => re;

/**
 * HARD: AWS Access Key ID — AKIA followed by 16 uppercase alphanumerics.
 * Per AWS spec; matches both inline strings and assignment forms.
 */
const HARDCODED_AWS_AK = {
  rule_id: 'hardcoded-aws-ak',
  severity: 'hard',
  pattern: /AKIA[A-Z0-9]{16}/,
  message: '疑似硬编码 AWS Access Key (AKIA...)',
};

/**
 * HARD: OpenAI-style secret key — sk- followed by ~48 base62 chars.
 * We accept 20..64 chars after the prefix to tolerate newer key shapes
 * (project keys, service-account keys) without false-positive on "sk-"
 * short tokens.
 */
const HARDCODED_SK = {
  rule_id: 'hardcoded-sk',
  severity: 'hard',
  pattern: /\bsk-[a-zA-Z0-9]{20,64}\b/,
  message: '疑似硬编码 OpenAI/兼容服务 Secret Key (sk-...)',
};

/**
 * HARD: `rm -rf /` — bare root delete, or root-glob (/*) with -rf/-fr.
 * Matches `rm -rf /`, `rm -rf /*`, `rm -fr "/"`, `rm  -r -f  /` etc.
 * but NOT `rm -rf /tmp/...` or `rm -rf /home/user`.
 *
 * The trailing `(?=...)` lookahead enforces arg-end: terminator char
 * or end-of-input. Anything else (a non-terminator, non-space char after
 * the single `/`) means the path is something like `/tmp`, which is legit.
 */
const DESTRUCTIVE_RM_RF_ROOT = {
  rule_id: 'destructive-rm-rf-root',
  severity: 'hard',
  pattern: new RegExp(
    '\\brm\\b' +                                                  // rm
    '[^#\\n]*?' +                                                 // gap
    '-(?:[A-Za-z]*r[A-Za-z]*f[A-Za-z]*|[A-Za-z]*f[A-Za-z]*r[A-Za-z]*)' + // -rf / -fr / -rvf
    '(?:\\s+-[A-Za-z]+)*' +                                       // more flags
    '\\s+' +                                                      // separator before path
    '["\'`?]?' +                                                  // optional opening quote
    '\\/(?:\\*)?' +                                               // path: exactly / or /*
    '["\'`?]?' +                                                  // optional closing quote
    '(?=\\s|$|[);&|>])'                                           // arg-end
  ),
  message: '`rm -rf /` 或等价通配形式 — 拒绝落盘',
};

/**
 * HARD: `git push --force` (or `-f`) to main / master.
 * Catches `git push --force origin main`, `git push -f main`, etc.
 */
const DESTRUCTIVE_GIT_FORCE_MAIN = {
  rule_id: 'destructive-git-force-main',
  severity: 'hard',
  pattern: /\bgit\s+push\s+(?:[^#\n]*?\s)?(?:--force(?:-with-lease)?|-f)\b[^#\n]*?\b(?:main|master)\b/,
  message: '`git push --force/-f` 到 main/master — 拒绝落盘',
};

/**
 * HARD: editing a literal `.env` file (not `.env.example`, `.env.sample`,
 * `.env.local`, etc.). File-name-only check, no content scan.
 */
const ENV_FILE_EDIT = {
  rule_id: 'env-file-edit',
  severity: 'hard',
  filePattern: BASE_NAME_RE(/(^|\/)\.env$/),
  message: '直接编辑 `.env` 文件 — 秘钥仓库禁止直接落盘，请改用 .env.example',
};

/**
 * SOFT: README.md without any "Quick Start" / "快速开始" heading.
 * Triggers on README.md (any case) lacking all of: "Quick Start",
 * "快速开始", "quickstart" (case-insensitive).
 */
const README_MISSING_QUICKSTART = {
  rule_id: 'readme-missing-quickstart',
  severity: 'soft',
  filePattern: BASE_NAME_RE(/(^|\/)README\.md$/i),
  check(content) {
    if (/(quick[ _-]?start|快速开始)/i.test(content)) return null;
    return [{
      rule_id: 'readme-missing-quickstart',
      severity: 'soft',
      message: 'README.md 缺少 "Quick Start" / "快速开始" 章节 (SOFT_RULE)',
    }];
  },
};

/**
 * SOFT: public API (export function / export async function / def) without
 * a docstring immediately above (// , /**, """, ''' within ±2 lines).
 *
 * Per baseline rule "公共 API 必须有文档注释" (SOFT_RULE 推荐架构实践).
 */
const PUBLIC_API_MISSING_DOCSTRING = {
  rule_id: 'public-api-missing-docstring',
  severity: 'soft',
  filePattern: BASE_NAME_RE(/\.(ts|js|py)$/),
  check(content) {
    const lines = content.split('\n');
    const matches = [];
    const isExport = (l) => /^\s*export\s+(?:async\s+)?(?:function|const|class)\b/.test(l)
      || /^\s*export\s+default\s+(?:async\s+)?function\b/.test(l);
    const isDef = (l) => /^\s*def\s+\w+/.test(l);
    const isDocLine = (l) => /^\s*(\/\/|\/\*\*?|\*|"""|#\s)/.test(l)
      || /\/\*\*/.test(l);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!isExport(line) && !isDef(line)) continue;
      // Non-public `def _foo` (Python convention) is private — skip.
      if (isDef(line) && /^\s*def\s+_/.test(line)) continue;
      // Look at ±2 lines around for any docstring/comment marker.
      const lo = Math.max(0, i - 2);
      const hi = Math.min(lines.length - 1, i + 2);
      let found = false;
      for (let j = lo; j <= hi; j++) {
        if (j === i) continue;
        if (isDocLine(lines[j])) { found = true; break; }
      }
      if (!found) {
        matches.push({
          rule_id: 'public-api-missing-docstring',
          severity: 'soft',
          line: i + 1,
          match: line.trim().slice(0, 80),
          message: `第 ${i + 1} 行公开 API 缺少文档注释 (SOFT_RULE): ${line.trim().slice(0, 60)}`,
        });
      }
    }
    return matches.length ? matches : null;
  },
};

export const ALL_RULES = [
  HARDCODED_AWS_AK,
  HARDCODED_SK,
  DESTRUCTIVE_RM_RF_ROOT,
  DESTRUCTIVE_GIT_FORCE_MAIN,
  ENV_FILE_EDIT,
  README_MISSING_QUICKSTART,
  PUBLIC_API_MISSING_DOCSTRING,
];

function matchPatternRule(rule, content) {
  if (!rule.pattern) return [];
  const out = [];
  // Use global flag to find all hits; clone the regex so we don't mutate.
  const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
  let m;
  while ((m = re.exec(content)) !== null) {
    // Compute 1-based line number of match.
    let line;
    if (m.index !== undefined) {
      const upto = content.slice(0, m.index);
      line = upto.split('\n').length;
    }
    out.push({
      rule_id: rule.rule_id,
      severity: rule.severity,
      message: rule.message,
      line,
      match: m[0].slice(0, 80),
    });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/**
 * Match all rules against a file's content + path.
 * @param {string} content
 * @param {string} filePath
 * @returns {{ hard: RuleMatch[], soft: RuleMatch[] }}
 */
export function matchRules(content, filePath = '') {
  const hard = [];
  const soft = [];

  for (const rule of ALL_RULES) {
    // File-name gate (filePattern). If a rule has filePattern and the
    // path doesn't match, skip.
    if (rule.filePattern && !rule.filePattern.test(filePath)) continue;

    if (typeof rule.check === 'function') {
      const matches = rule.check(content, filePath);
      if (matches && matches.length) {
        for (const mt of matches) {
          (mt.severity === 'hard' ? hard : soft).push(mt);
        }
      }
      continue;
    }

    if (rule.pattern) {
      const matches = matchPatternRule(rule, content);
      for (const mt of matches) {
        (rule.severity === 'hard' ? hard : soft).push(mt);
      }
      continue;
    }

    // File-name-only rule (e.g. env-file-edit): filePattern matched and there
    // is no further check, so emit a single match.
    if (rule.filePattern) {
      (rule.severity === 'hard' ? hard : soft).push({
        rule_id: rule.rule_id,
        severity: rule.severity,
        message: rule.message,
      });
    }
  }

  return { hard, soft };
}

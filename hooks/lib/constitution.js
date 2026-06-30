import { readFile } from 'node:fs/promises';

// 容忍 UTF-8 BOM（Windows 工具偶尔会添加）和 CRLF/LF 换行符。
// 归一化为 LF 再匹配，避免跨平台差异导致的 false negative。
const FRONTMATTER_RE = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n/;
const SYNC_REPORT_RE =
  /<!-- BEGIN sync-impact-report[\s\S]*?END sync-impact-report -->\n?/;

const REQUIRED_FRONTMATTER_FIELDS = ['oms_version', 'ratified', 'last_amended'];

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export class ConstitutionError extends Error {
  constructor(message, { field } = {}) {
    super(message);
    this.name = 'ConstitutionError';
    this.field = field;
  }
}

function parseFrontmatter(text) {
  const m = text.match(FRONTMATTER_RE);
  if (!m) {
    throw new ConstitutionError(
      'baseline missing YAML frontmatter (expected leading --- block)',
      { field: 'frontmatter' }
    );
  }
  const raw = m[1];
  const frontmatter = {};
  for (const line of raw.split(/\r?\n/)) {
    const mm = line.match(/^([a-z_]+):\s*(.*)$/);
    if (mm) frontmatter[mm[1]] = mm[2].trim();
  }
  for (const key of REQUIRED_FRONTMATTER_FIELDS) {
    if (!(key in frontmatter)) {
      throw new ConstitutionError(
        `baseline frontmatter missing required field: ${key}`,
        { field: key }
      );
    }
  }
  if (!SEMVER_RE.test(frontmatter.oms_version)) {
    throw new ConstitutionError(
      `baseline frontmatter oms_version is not valid SemVer: ${frontmatter.oms_version}`,
      { field: 'oms_version' }
    );
  }
  return frontmatter;
}

function stripFrontmatter(text) {
  return text.replace(FRONTMATTER_RE, '');
}

function stripSyncReport(text) {
  return text.replace(SYNC_REPORT_RE, '');
}

export async function loadBaseline(baselinePath) {
  let raw;
  try {
    raw = await readFile(baselinePath, 'utf8');
  } catch (err) {
    throw new ConstitutionError(`cannot read baseline at ${baselinePath}: ${err.message}`, {
      field: 'file',
    });
  }
  const frontmatter = parseFrontmatter(raw);
  let body = stripFrontmatter(raw);
  const syncReportMatch = body.match(SYNC_REPORT_RE);
  const syncReport = syncReportMatch ? syncReportMatch[0] : null;
  body = stripSyncReport(body).trim();
  return { raw, frontmatter, body, syncReport };
}

export async function getVersion(baselinePath) {
  const { frontmatter } = await loadBaseline(baselinePath);
  return frontmatter.oms_version;
}

function parseSemVer(v) {
  const m = v.match(SEMVER_RE);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

export function diffVersions(oldVer, newVer) {
  const a = parseSemVer(oldVer);
  const b = parseSemVer(newVer);
  if (!a || !b) {
    throw new ConstitutionError(
      `invalid SemVer input(s): ${oldVer} → ${newVer}`,
      { field: 'oms_version' }
    );
  }
  const changes = [];
  if (b.major !== a.major) changes.push(`major: ${a.major} → ${b.major}`);
  if (b.minor !== a.minor) changes.push(`minor: ${a.minor} → ${b.minor}`);
  if (b.patch !== a.patch) changes.push(`patch: ${a.patch} → ${b.patch}`);
  let bump;
  if (b.major !== a.major) bump = 'major';
  else if (b.minor !== a.minor) bump = 'minor';
  else if (b.patch !== a.patch) bump = 'patch';
  else bump = 'none';
  return { bump, changes };
}

export function getBodyForInjection(baselineContent) {
  let body = baselineContent;
  body = stripFrontmatter(body);
  body = stripSyncReport(body);
  return body.trim();
}

export { REQUIRED_FRONTMATTER_FIELDS };

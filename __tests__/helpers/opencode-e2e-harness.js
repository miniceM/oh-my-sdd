import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildE2eEnv({ repoRoot, root }) {
  const home = join(root, 'home');
  const xdgConfigHome = join(root, 'xdg-config');
  const configDir = join(xdgConfigHome, 'opencode');
  const inherited = {};
  for (const name of ['PATH', 'ComSpec', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'WINDIR']) {
    if (process.env[name]) inherited[name] = process.env[name];
  }
  return {
    ...inherited,
    HOME: home,
    USERPROFILE: home,
    npm_config_prefix: join(root, 'prefix'),
    npm_config_cache: join(root, 'npm-cache'),
    XDG_CONFIG_HOME: xdgConfigHome,
    OPENCODE_CONFIG: join(configDir, 'opencode.json'),
    OPENCODE_CONFIG_DIR: configDir,
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_MODELS_FETCH: '1',
    OPENCODE_DISABLE_LSP_DOWNLOAD: '1',
    PATH: `${join(repoRoot, 'scripts')}${delimiter}${process.env.PATH ?? ''}`,
  };
}

export function createE2eSandbox(repoRoot) {
  const root = mkdtempSync(join(tmpdir(), 'oms-opencode-e2e-'));
  const env = buildE2eEnv({ repoRoot, root });
  const sandbox = {
    root,
    home: env.HOME,
    prefix: env.npm_config_prefix,
    cache: env.npm_config_cache,
    packDir: join(root, 'pack'),
    toolchainDir: join(root, 'toolchain'),
    projectDir: join(root, 'project'),
    artifactsDir: join(repoRoot, '.e2e-artifacts', basename(root)),
    env,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
  for (const directory of [
    sandbox.home, sandbox.prefix, sandbox.cache, sandbox.packDir,
    sandbox.toolchainDir, sandbox.projectDir, sandbox.artifactsDir, env.OPENCODE_CONFIG_DIR,
  ]) mkdirSync(directory, { recursive: true });
  return sandbox;
}

export function normalizeManifest(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    if (value.some((entry) => entry?.filename)) return value;
    return null;
  }
  if (value.filename) return [value];
  const collected = [];
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) {
      for (const entry of item) {
        if (entry?.filename) collected.push(entry);
      }
    } else if (item && typeof item === 'object' && item.filename) {
      collected.push(item);
    }
  }
  return collected.length > 0 ? collected : null;
}

export function findJsonEnd(input, start) {
  const openChar = input[start];
  const closeChar = openChar === '[' ? ']' : (openChar === '{' ? '}' : null);
  if (!closeChar) return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === openChar) {
      depth += 1;
    } else if (character === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function parseNpmPackJson(output, stderr = '') {
  const candidates = [];
  for (let start = 0; start < output.length; start += 1) {
    const char = output[start];
    if (char !== '[' && char !== '{') continue;
    const end = findJsonEnd(output, start);
    if (end < 0) continue;
    try {
      const value = JSON.parse(output.slice(start, end + 1));
      const normalized = normalizeManifest(value);
      if (normalized && normalized.length > 0) candidates.push(normalized);
    } catch {
      // A lifecycle log or stdout line may contain '[' or '{'; continue searching.
    }
  }
  const manifest = candidates.at(-1);
  if (manifest?.length > 0) return manifest;
  throw new Error([
    'npm pack did not emit a non-empty JSON manifest',
    `stdout:\n${output}`,
    `stderr:\n${stderr}`,
  ].join('\n'));
}

export function firstNpmPackEntry(manifest, { stdout = '', stderr = '' } = {}) {
  const entry = manifest?.[0];
  if (entry?.filename) return entry;
  throw new Error([
    'npm pack manifest did not contain an entry with filename',
    `stdout:\n${stdout}`,
    `stderr:\n${stderr}`,
  ].join('\n'));
}

export function publishedCommands(packageRoot) {
  const commandsDir = join(packageRoot, '.opencode', 'commands');
  if (!existsSync(commandsDir)) throw new Error(`Published command directory missing: ${commandsDir}`);
  return readdirSync(commandsDir)
    .filter((name) => /^sdd-.*\.md$/.test(name))
    .map((name) => name.slice(0, -'.md'.length))
    .filter((name) => name !== 'sdd-constitution')
    .sort();
}

export function publishedSkills(packageRoot) {
  const skillsDir = join(packageRoot, 'oms-skills');
  if (!existsSync(skillsDir)) throw new Error(`Published OMS skill directory missing: ${skillsDir}`);
  return readdirSync(skillsDir)
    .filter((name) => existsSync(join(skillsDir, name, 'SKILL.md')))
    .sort();
}

export function formatE2eFailure({
  phase,
  platform = process.platform,
  node = process.version,
  opencode,
  artifactsDir,
  output = '',
  timedOut,
}) {
  return [
    `phase=${phase}`,
    `platform=${platform}`,
    `node=${node}`,
    `opencode=${opencode}`,
    `artifacts=${artifactsDir}`,
    ...(timedOut === undefined ? [] : [`timedOut=${timedOut}`]),
    output,
  ].filter(Boolean).join('\n');
}

export function writePluginLoader({ configDir, packageRoot }) {
  const entry = resolve(packageRoot, 'dist', 'index.js');
  if (!existsSync(entry)) throw new Error(`Installed plugin entry missing: ${entry}`);
  const pluginsDir = join(configDir, 'plugins');
  mkdirSync(pluginsDir, { recursive: true });
  // OpenCode discovers `.js` plugins in this directory. Mark the directory
  // as ESM instead of changing the extension, which keeps discovery working
  // on Node 18 as well.
  writeFileSync(join(pluginsDir, 'package.json'), '{"type":"module"}\n');
  const loader = join(pluginsDir, 'oh-my-sdd-e2e.js');
  writeFileSync(loader, `export { OhMySddPlugin } from '${pathToFileURL(entry).href}';\n`);
  return loader;
}

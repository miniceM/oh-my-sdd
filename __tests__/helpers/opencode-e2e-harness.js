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
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
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

export function parseNpmPackJson(output) {
  const match = output.match(/(\[\s*\{[\s\S]*\])\s*$/);
  if (!match) throw new Error(`npm pack did not emit a JSON manifest: ${output}`);
  return JSON.parse(match[1]);
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

export function writePluginLoader({ configDir, packageRoot }) {
  const entry = resolve(packageRoot, 'dist', 'index.js');
  if (!existsSync(entry)) throw new Error(`Installed plugin entry missing: ${entry}`);
  const pluginsDir = join(configDir, 'plugins');
  mkdirSync(pluginsDir, { recursive: true });
  const loader = join(pluginsDir, 'oh-my-sdd-e2e.js');
  writeFileSync(loader, `export { OhMySddPlugin } from '${pathToFileURL(entry).href}';\n`);
  return loader;
}

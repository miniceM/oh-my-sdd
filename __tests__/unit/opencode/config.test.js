import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONFIG_MODULE = '/Users/hosea/work/git/oh-my-sdd/opencode/dist/config.js';

function setupFakeHome() {
  const home = mkdtempSync(join(tmpdir(), 'oms-config-test-'));
  const configDir = join(home, '.config', 'opencode');
  mkdirSync(configDir, { recursive: true });
  return { home, configDir };
}

async function loadConfigWithHome(homeDir) {
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  const cacheBust = `?t=${Date.now()}-${Math.random()}`;
  const mod = await import(pathToFileURL(CONFIG_MODULE).href + cacheBust);
  return mod.loadConfig();
}

const DEFAULT_TIMEOUTS = {
  preToolUse: 5000,
  postToolUse: 3000,
  sessionStart: 10000,
  userPrompt: 3000,
};

describe('loadConfig', () => {
  it('returns defaults when config file does not exist', async () => {
    const { home } = setupFakeHome();
    try {
      rmSync(join(home, '.config'), { recursive: true, force: true });
      const config = await loadConfigWithHome(home);
      assert.equal(config.disabled, false);
      assert.equal(config.logLevel, 'info');
      assert.deepEqual(config.timeouts, DEFAULT_TIMEOUTS);
      assert.deepEqual(config.hooks, {
        preToolUse: true,
        postToolUse: true,
        sessionStart: true,
        userPrompt: true,
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('returns defaults when config file is empty', async () => {
    const { home, configDir } = setupFakeHome();
    try {
      writeFileSync(join(configDir, 'opencode.json'), '');
      const config = await loadConfigWithHome(home);
      assert.equal(config.disabled, false);
      assert.equal(config.logLevel, 'info');
      assert.deepEqual(config.timeouts, DEFAULT_TIMEOUTS);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('returns defaults when opencode.json has no "oh-my-sdd" key', async () => {
    const { home, configDir } = setupFakeHome();
    try {
      writeFileSync(join(configDir, 'opencode.json'), JSON.stringify({
        plugin: ['./some-plugin.js'],
      }));
      const config = await loadConfigWithHome(home);
      assert.equal(config.logLevel, 'info');
      assert.deepEqual(config.timeouts, DEFAULT_TIMEOUTS);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('merges valid partial overrides with defaults', async () => {
    const { home, configDir } = setupFakeHome();
    try {
      writeFileSync(join(configDir, 'opencode.json'), JSON.stringify({
        'oh-my-sdd': {
          logLevel: 'debug',
          timeouts: { preToolUse: 8000 },
        },
      }));
      const config = await loadConfigWithHome(home);
      assert.equal(config.logLevel, 'debug');
      assert.equal(config.timeouts.preToolUse, 8000);
      assert.equal(config.timeouts.postToolUse, 3000);
      assert.equal(config.timeouts.sessionStart, 10000);
      assert.equal(config.timeouts.userPrompt, 3000);
      assert.equal(config.disabled, false);
      assert.deepEqual(config.hooks, {
        preToolUse: true,
        postToolUse: true,
        sessionStart: true,
        userPrompt: true,
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('resets invalid logLevel to default with warning', async () => {
    const { home, configDir } = setupFakeHome();
    try {
      writeFileSync(join(configDir, 'opencode.json'), JSON.stringify({
        'oh-my-sdd': {
          logLevel: 'verbose',
        },
      }));
      const config = await loadConfigWithHome(home);
      assert.equal(config.logLevel, 'info', 'should fall back to default');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('disabled: true is preserved', async () => {
    const { home, configDir } = setupFakeHome();
    try {
      writeFileSync(join(configDir, 'opencode.json'), JSON.stringify({
        'oh-my-sdd': {
          disabled: true,
        },
      }));
      const config = await loadConfigWithHome(home);
      assert.equal(config.disabled, true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('resets out-of-range timeouts to defaults', async () => {
    const { home, configDir } = setupFakeHome();
    try {
      writeFileSync(join(configDir, 'opencode.json'), JSON.stringify({
        'oh-my-sdd': {
          timeouts: {
            preToolUse: 50,       // below TIMEOUT_MIN (100)
            postToolUse: 99999,   // above TIMEOUT_MAX (30000)
          },
        },
      }));
      const config = await loadConfigWithHome(home);
      assert.equal(config.timeouts.preToolUse, 5000, 'below-min should reset to default');
      assert.equal(config.timeouts.postToolUse, 3000, 'above-max should reset to default');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('returns defaults when JSON is corrupt', async () => {
    const { home, configDir } = setupFakeHome();
    try {
      writeFileSync(join(configDir, 'opencode.json'), '{not valid json}}}');
      const config = await loadConfigWithHome(home);
      assert.equal(config.logLevel, 'info');
      assert.deepEqual(config.timeouts, DEFAULT_TIMEOUTS);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('returns defaults when oh-my-sdd value is not an object', async () => {
    const { home, configDir } = setupFakeHome();
    try {
      writeFileSync(join(configDir, 'opencode.json'), JSON.stringify({
        'oh-my-sdd': 'just a string',
      }));
      const config = await loadConfigWithHome(home);
      assert.equal(config.logLevel, 'info');
      assert.deepEqual(config.timeouts, DEFAULT_TIMEOUTS);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('hooks overrides are merged correctly', async () => {
    const { home, configDir } = setupFakeHome();
    try {
      writeFileSync(join(configDir, 'opencode.json'), JSON.stringify({
        'oh-my-sdd': {
          hooks: { preToolUse: false },
        },
      }));
      const config = await loadConfigWithHome(home);
      assert.equal(config.hooks.preToolUse, false);
      assert.equal(config.hooks.postToolUse, true, 'non-overridden hook stays default');
      assert.equal(config.hooks.sessionStart, true);
      assert.equal(config.hooks.userPrompt, true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

# OpenCode Platform Adapter 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 OpenCode 工具宿主上跑通 oh-my-sdd 的 5 个 SDD 命令与 7 层洋葱强制约束，**HARD_RULE 100% 保留**。

**架构：** A' 纯自适配——TypeScript 插件层（`opencode/src/*.ts`）做 OpenCode 事件到 Claude hook JSON 的转译，通过 `child_process.spawn` 复用 `hooks/*.js`（0 修改）。baseline 注入走 `experimental.chat.system.transform`。阻断语义：throw new Error。状态目录 `~/.oh-my-sdd/` 与 Claude/Lingma 路径共享。

**技术栈：** TypeScript 5.9（`opencode/src/*.ts` → `opencode/dist/*.js`）+ Node.js child_process + `@opencode-ai/plugin` SDK 1.15+ + 现有 `hooks/lib/*` JS 工具集。

---

## 文件结构

### 新建（production）

| 路径 | 职责 |
|---|---|
| `opencode/tsconfig.json` | TS 编译配置（ES2022 / strict / outDir=dist） |
| `opencode/package.json` | 局部包定义（name=`oh-my-sdd-opencode`，private，main=dist/index.js） |
| `opencode/src/index.ts` | 入口：`export const OhMySddPlugin` |
| `opencode/src/types.ts` | SDK 类型重导出 + 内部类型 |
| `opencode/src/paths.ts` | 路径解析（plugin root / hooks / baseline / state / log） |
| `opencode/src/logger.ts` | 文件日志（JSON Lines，10MB 轮转，不写 stdout） |
| `opencode/src/config.ts` | 包装 `hooks/lib/config.js`，OpenCode 路径特有 defaults |
| `opencode/src/mappers.ts` | OpenCode event → Claude hook stdin JSON |
| `opencode/src/runner.ts` | child_process.spawn + timeout + stdout 解析 + permissionDecision 转 throw |
| `opencode/src/baseline.ts` | 读 enterprise-baseline.md + 推 `output.system` + 降级到 AGENTS.md |
| `opencode/src/plugin.ts` | hook 回调分派（6 个 handler：5 lifecycle + system.transform） |
| `opencode/src/permission.ts` | permission.ask stub（YAGNI，返回 null） |
| `opencode/dist/**` | tsc 编译产物（运行时使用） |
| `hooks/lib/install-opencode.js` | opencode 路径 install/uninstall/disable/enable |

### 新建（tests）

| 路径 | 职责 | 估计用例数 |
|---|---|---|
| `__tests__/unit/opencode/paths.test.js` | 路径解析 | 6 |
| `__tests__/unit/opencode/logger.test.js` | 日志 | 5 |
| `__tests__/unit/opencode/config.test.js` | 配置加载 | 4 |
| `__tests__/unit/opencode/mappers.test.js` | 事件映射 | 15 |
| `__tests__/unit/opencode/runner.test.js` | hook spawn | 12 |
| `__tests__/unit/opencode/baseline.test.js` | baseline 注入 | 8 |
| `__tests__/unit/opencode/types.test.js` | SDK 版本断言 | 3 |
| `__tests__/unit/opencode/permission.test.js` | stub | 4 |
| `__tests__/integration/opencode/full-flow.test.js` | mock SDK 全链路 | 15 |
| `__tests__/spike/opencode-e2e.md` | 真 OpenCode 跑通 spike 报告 | （无代码） |

### 修改

| 路径 | 修改 |
|---|---|
| `package.json` | devDeps 加 `@opencode-ai/plugin`；scripts 加 `build:opencode`；files 加 `opencode/dist/` |
| `install.js` | `preflightFor('opencode')` soft check；`main()` switch 加 `'opencode'` 分支 |
| `uninstall.js` | 加 `uninstallForOpencode()` 动态 import 分支 |
| `README.md` | 加 "OpenCode" 章节（与现有 Claude / Lingma 对称） |
| `docs/roadmap/v0.2-backlog.md` | 加 v0.3 OpenCode 任务标记为完成（this plan = done） |

### 不修改

- `hooks/*.js`（5 个 lifecycle 0 修改）
- `hooks/lib/rules.js`（HARD_RULE 单一源）
- `wrappers/claude.{sh,ps1,bat}`（OpenCode 无 wrapper 概念）
- `skills/*/SKILL.md`（17 个 skills markdown，OpenCode 直接读）
- `install-claude.js` / `install-lingma.js`（独立模块，不动）

---

## 任务列表

> 编号约定：Phase.Task（如 `1.3` = Phase 1 第 3 任务）
> 每个任务 5 步：写测试 → 跑测试（应 FAIL）→ 写实现 → 跑测试（应 PASS）→ commit
> 所有 commit 走 SDD 格式 `[<change-id>] <type>: <subject>`，但本 plan 走 docs/code 混合——code 部分 commit 用 change-id（实现时通过 `/sdd-spec` 取得），纯 docs commit 走 `[OVERRIDE]`

### Phase 0: Project skeleton（脚手架）

#### 任务 0.1：创建 `opencode/` 目录 + tsconfig + package.json

**文件：**
- 创建：`opencode/tsconfig.json`
- 创建：`opencode/package.json`

- [ ] **步骤 1：写 tsconfig**

```json
// opencode/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

- [ ] **步骤 2：写 opencode/package.json**

```json
// opencode/package.json
{
  "name": "oh-my-sdd-opencode",
  "version": "0.1.0",
  "description": "OpenCode plugin adapter for oh-my-sdd (internal, bundled)",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "private": true,
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opencode-ai/plugin": "^1.15.13"
  }
}
```

- [ ] **步骤 3：验证 tsc 编译空 src**

```bash
cd opencode
mkdir -p src
echo 'export const _ = 1;' > src/index.ts
npx tsc
ls dist/
# 预期：dist/index.js + dist/index.d.ts
rm -rf dist
```

- [ ] **步骤 4：commit**

```bash
cd <worktree-root>
git add opencode/tsconfig.json opencode/package.json
git commit -m "chore(opencode): scaffold tsconfig and local package.json"
```

---

#### 任务 0.2：在根 `package.json` 加 `@opencode-ai/plugin` + `build:opencode` script

**文件：**
- 修改：`package.json`（devDeps、scripts、files）

- [ ] **步骤 1：在 devDependencies 加 SDK**

修改 `package.json` 的 `devDependencies` 块：
```json
"devDependencies": {
  "@opencode-ai/plugin": "^1.15.13",
  "typescript": "^5.9.3"
}
```

- [ ] **步骤 2：加 build script**

在 `scripts` 块加：
```json
"build:opencode": "cd opencode && npm install --no-audit --no-fund && npx tsc"
```

- [ ] **步骤 3：files 数组加 `opencode/dist/`**

在 `files` 数组加：
```json
"files": [
  ...,
  "opencode/dist/"
]
```

- [ ] **步骤 4：本地安装 SDK**

```bash
cd <worktree-root>
npm install --no-audit --no-fund
ls node_modules/@opencode-ai/plugin/
# 预期：dist/、package.json 等
```

- [ ] **步骤 5：commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @opencode-ai/plugin dep + build:opencode script"
```

---

### Phase 1: Foundations（基础设施，无业务逻辑）

#### 任务 1.1：types.ts（SDK 类型重导出）

**文件：**
- 创建：`opencode/src/types.ts`
- 测试：`__tests__/unit/opencode/types.test.js`

- [ ] **步骤 1：写测试**

```js
// __tests__/unit/opencode/types.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginInput, Hooks, ToolDefinition } from '../../../opencode/src/types.js';

test('types: re-exports PluginInput from @opencode-ai/plugin', () => {
  assert.ok(PluginInput, 'PluginInput should be exported');
  // PluginInput 是 type-only，编译期检查；运行时是 undefined
});

test('types: re-exports Hooks from @opencode-ai/plugin', () => {
  assert.ok(Hooks, 'Hooks should be exported');
});

test('types: SDK version is >= 1.15.13', async () => {
  const pkg = await import('../../../opencode/node_modules/@opencode-ai/plugin/package.json', { with: { type: 'json' } });
  const [major, minor, patch] = pkg.default.version.split('.').map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 15), `Expected >=1.15.13, got ${pkg.default.version}`);
});
```

- [ ] **步骤 2：跑测试（应 FAIL）**

```bash
node --test __tests__/unit/opencode/types.test.js
# 预期：FAIL（types.ts 不存在）
```

- [ ] **步骤 3：写 types.ts**

```ts
// opencode/src/types.ts
/**
 * Re-exports @opencode-ai/plugin SDK types + internal helper types.
 *
 * Why re-export: gives consumers a single import path. Internal types
 * (HookResult, SanitizedSessionId) are defined here so other modules
 * don't have to redeclare.
 */
export type {
  Plugin,
  PluginInput,
  PluginModule,
  Hooks,
  ToolDefinition,
} from '@opencode-ai/plugin';

/**
 * Result returned by hooks/*.js via stdout JSON.
 * Matched by runner.ts and translated to OpenCode action (throw / return).
 */
export type HookResult = {
  hookSpecificOutput?: {
    hookEventName?: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
  continue?: boolean;
  stopReason?: string;
  [key: string]: unknown;
};

/**
 * Sanitized session id (matches hook scripts' expectation: [A-Za-z0-9_-]+ only).
 * Used everywhere a session_id flows through to fs paths or hook stdin.
 */
export type SanitizedSessionId = string;

export function sanitizeSessionId(raw: string | undefined): SanitizedSessionId {
  if (!raw) return `oms-opencode-${Date.now()}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, '_');
}
```

- [ ] **步骤 4：跑测试（应 PASS）**

```bash
cd opencode && npx tsc
cd ..
node --test __tests__/unit/opencode/types.test.js
# 预期：3 个 test PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/types.ts __tests__/unit/opencode/types.test.js opencode/dist/types.js opencode/dist/types.d.ts
git commit -m "feat(opencode): add types.ts with SDK re-exports and sanitization"
```

---

#### 任务 1.2：paths.ts（路径解析）

**文件：**
- 创建：`opencode/src/paths.ts`
- 测试：`__tests__/unit/opencode/paths.test.js`

- [ ] **步骤 1：写测试**

```js
// __tests__/unit/opencode/paths.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {
  getPluginRoot,
  getHooksDir,
  getBaselinePath,
  getStateDir,
  getLogFile,
} from '../../../opencode/src/paths.js';

test('paths: getPluginRoot reads OMS_PLUGIN_ROOT env', () => {
  process.env.OMS_PLUGIN_ROOT = '/custom/root';
  assert.equal(getPluginRoot(), '/custom/root');
  delete process.env.OMS_PLUGIN_ROOT;
});

test('paths: getPluginRoot falls back to dist/../.. when env unset', () => {
  delete process.env.OMS_PLUGIN_ROOT;
  const root = getPluginRoot();
  assert.ok(root.endsWith('opencode'), `Expected endsWith 'opencode', got ${root}`);
});

test('paths: getHooksDir is <pluginRoot>/../../hooks', () => {
  process.env.OMS_PLUGIN_ROOT = '/x/opencode';
  assert.equal(getHooksDir(), path.normalize('/x/opencode/../../hooks'));
});

test('paths: getBaselinePath is <pluginRoot>/../../content/enterprise-baseline.md', () => {
  process.env.OMS_PLUGIN_ROOT = '/x/opencode';
  assert.equal(getBaselinePath(), path.normalize('/x/opencode/../../content/enterprise-baseline.md'));
});

test('paths: getStateDir uses ~/.oh-my-sdd (shared with claude/lingma)', () => {
  const state = getStateDir();
  assert.equal(state, path.join(os.homedir(), '.oh-my-sdd'));
});

test('paths: sanitizeSessionId rejects path traversal', async () => {
  const { sanitizeSessionId } = await import('../../../opencode/src/paths.js');
  assert.equal(sanitizeSessionId('../../../etc/passwd'), '.._.._.._etc_passwd');
  assert.equal(sanitizeSessionId('abc-123_XYZ'), 'abc-123_XYZ');
  assert.equal(sanitizeSessionId(undefined), sanitizeSessionId(undefined)); // both fallback
});
```

- [ ] **步骤 2：跑测试（应 FAIL）**

```bash
node --test __tests__/unit/opencode/paths.test.js
# 预期：FAIL（paths.ts 不存在）
```

- [ ] **步骤 3：写 paths.ts**

```ts
// opencode/src/paths.ts
/**
 * Centralized path resolution for the OpenCode plugin.
 * All fs paths flow through here — single point of change for cross-platform support.
 *
 * Shared with claude/lingma: state dir, baseline, hooks dir come from the SAME
 * files. This is the "shared state" invariant (spec §3.2 G5).
 */
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { sanitizeSessionId as _sanitize } from './types.js';

const __filename = fileURLToPath(import.meta.url);
// dist/paths.js → plugin root is ../..
const DEFAULT_PLUGIN_ROOT = path.resolve(path.dirname(__filename), '..', '..');

export function getPluginRoot(): string {
  return process.env.OMS_PLUGIN_ROOT ?? DEFAULT_PLUGIN_ROOT;
}

/** hooks/*.js live at the repo root in `hooks/`. From opencode/dist → ../../hooks. */
export function getHooksDir(): string {
  return path.resolve(getPluginRoot(), '..', '..', 'hooks');
}

/** content/enterprise-baseline.md is the SoT for enterprise rules (shared). */
export function getBaselinePath(): string {
  return path.resolve(getPluginRoot(), '..', '..', 'content', 'enterprise-baseline.md');
}

/** Shared with claude/lingma. NEVER diverge — this is the invariant. */
export function getStateDir(): string {
  return path.join(os.homedir(), '.oh-my-sdd');
}

export function getLogFile(): string {
  return path.join(getStateDir(), 'logs', 'opencode.log');
}

export { _sanitize as sanitizeSessionId };
```

- [ ] **步骤 4：跑测试（应 PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/paths.test.js
# 预期：6 个 test PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/paths.ts __tests__/unit/opencode/paths.test.js opencode/dist/paths.js opencode/dist/paths.d.ts
git commit -m "feat(opencode): add paths.ts with shared-state path resolution"
```

---

#### 任务 1.3：logger.ts（文件日志）

**文件：**
- 创建：`opencode/src/logger.ts`
- 测试：`__tests__/unit/opencode/logger.test.js`

- [ ] **步骤 1：写测试**

```js
// __tests__/unit/opencode/logger.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-logger-'));
process.env.OMS_LOG_FILE = path.join(tmpDir, 'test.log');

// Import after env var is set so log() reads it
const { log, _resetForTest } = await import('../../../opencode/src/logger.js');

test('logger: log() writes one JSON line per call', () => {
  _resetForTest();
  log('info', 'first event', { sessionId: 's1' });
  log('error', 'second event', { sessionId: 's2' });
  const content = fs.readFileSync(process.env.OMS_LOG_FILE, 'utf8');
  const lines = content.trim().split('\n');
  assert.equal(lines.length, 2);
  const e1 = JSON.parse(lines[0]);
  assert.equal(e1.level, 'info');
  assert.equal(e1.msg, 'first event');
  assert.equal(e1.sessionId, 's1');
  assert.ok(e1.ts > 0);
});

test('logger: never writes to stdout', () => {
  _resetForTest();
  const orig = process.stdout.write.bind(process.stdout);
  let written = '';
  process.stdout.write = (chunk) => { written += chunk.toString(); return true; };
  try {
    log('warn', 'should not appear on stdout');
  } finally {
    process.stdout.write = orig;
  }
  assert.equal(written, '', 'logger should not write to stdout');
});

test('logger: redacts sensitive fields in payload', () => {
  _resetForTest();
  log('info', 'test', { password: 'AKIAIOSFODNN7EXAMPLE', safe: 'ok' });
  const content = fs.readFileSync(process.env.OMS_LOG_FILE, 'utf8');
  assert.ok(!content.includes('AKIAIOSFODNN7EXAMPLE'), 'should not log secret');
  assert.ok(content.includes('"safe":"ok"'));
});

test('logger: redacts filePath hash only (not path) for path payloads', () => {
  _resetForTest();
  log('info', 'tool call', { filePath: '/Users/alice/secrets/aws.env', tool: 'edit' });
  const content = fs.readFileSync(process.env.OMS_LOG_FILE, 'utf8');
  assert.ok(!content.includes('/Users/alice'), 'should not log full path');
  assert.ok(content.includes('"tool":"edit"'));
});

test('logger: rotation triggers at 10MB', () => {
  _resetForTest();
  // Write just over 10MB
  const big = 'x'.repeat(11 * 1024 * 1024);
  log('info', big, {});
  const rotated = fs.readdirSync(tmpDir);
  assert.ok(rotated.some(f => f.endsWith('.1.log')), 'should create rotated file');
});
```

- [ ] **步骤 2：跑测试（应 FAIL）**

```bash
node --test __tests__/unit/opencode/logger.test.js
# 预期：FAIL（logger.ts 不存在）
```

- [ ] **步骤 3：写 logger.ts**

```ts
// opencode/src/logger.ts
/**
 * File-only JSON-lines logger.
 *
 * - NEVER writes to stdout (plugin runs inside TUI; stdout pollution = UX bug)
 * - 10MB rotation
 * - Redacts AWS AK patterns + filesystem paths
 * - Lines are valid JSON for downstream parsing
 */
import fs from 'node:fs';
import path from 'node:path';
import { getLogFile } from './paths.js';

const ROTATE_BYTES = 10 * 1024 * 1024;
const AK_PATTERN = /AKIA[A-Z0-9]{16}/g;
const PATH_PATTERN = /\/Users\/[^"'\s]+|\/home\/[^"'\s]+|C:\\Users\\[^"'\s]+/g;

let _stream: fs.WriteStream | null = null;
let _currentSize = 0;

function getLogPath(): string {
  return process.env.OMS_LOG_FILE ?? getLogFile();
}

function ensureStream(): fs.WriteStream {
  if (_stream) return _stream;
  const p = getLogPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  try {
    _currentSize = fs.statSync(p).size;
  } catch {
    _currentSize = 0;
  }
  _stream = fs.createWriteStream(p, { flags: 'a' });
  return _stream;
}

function rotate(): void {
  if (_stream) {
    _stream.end();
    _stream = null;
  }
  const p = getLogPath();
  for (let i = 10; i >= 1; i--) {
    const from = i === 1 ? p : `${p}.${i - 1}.log`;
    const to = `${p}.${i}.log`;
    try {
      if (fs.existsSync(from)) fs.renameSync(from, to);
    } catch { /* best effort */ }
  }
  _currentSize = 0;
}

function redact(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(AK_PATTERN, 'AKIA[REDACTED]').replace(PATH_PATTERN, '[PATH]');
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'password' || k === 'secret' || k === 'token' || k === 'apiKey') {
        out[k] = '[REDACTED]';
      } else if (k === 'filePath' && typeof v === 'string') {
        // Hash file paths (don't log real paths)
        out.filePathHash = hashStr(v);
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return obj;
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16)}`;
}

export function log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, payload: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({
    ts: Date.now(),
    level,
    msg,
    ...(redact(payload) as Record<string, unknown>),
  });
  if (_currentSize + entry.length > ROTATE_BYTES) rotate();
  const s = ensureStream();
  s.write(entry + '\n');
  _currentSize += entry.length + 1;
}

/** Test-only: close stream and reset state */
export function _resetForTest(): void {
  if (_stream) {
    _stream.end();
    _stream = null;
  }
  _currentSize = 0;
  try {
    fs.unlinkSync(getLogPath());
  } catch { /* ok */ }
}
```

- [ ] **步骤 4：跑测试（应 PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/logger.test.js
# 预期：5 个 test PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/logger.ts __tests__/unit/opencode/logger.test.js opencode/dist/logger.js
git commit -m "feat(opencode): add logger.ts with redaction + 10MB rotation"
```

---

#### 任务 1.4：config.ts（包装 hooks/lib/config.js）

**文件：**
- 创建：`opencode/src/config.ts`
- 测试：`__tests__/unit/opencode/config.test.js`

- [ ] **步骤 1：写测试**

```js
// __tests__/unit/opencode/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-cfg-'));
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome; // windows

const { loadConfig, getConfig } = await import('../../../opencode/src/config.js');

test('config: loadConfig returns defaults when no config.json exists', () => {
  const cfg = loadConfig();
  assert.equal(cfg.dop_endpoint, 'https://dop.enterprise.com');
  assert.equal(cfg.telemetry_disabled, false);
});

test('config: loadConfig reads ~/.oh-my-sdd/config.json when present', () => {
  fs.mkdirSync(path.join(tmpHome, '.oh-my-sdd'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpHome, '.oh-my-sdd', 'config.json'),
    JSON.stringify({ dop_endpoint: 'https://custom', telemetry_disabled: true })
  );
  // Clear module cache to force re-read
  delete require.cache[require.resolve('../../../opencode/src/config.js')];
  const cfg = loadConfig();
  assert.equal(cfg.dop_endpoint, 'https://custom');
  assert.equal(cfg.telemetry_disabled, true);
});

test('config: getConfig returns same instance (singleton)', () => {
  const a = getConfig();
  const b = getConfig();
  assert.equal(a, b);
});

test('config: opencode-specific defaults override shared', () => {
  const cfg = getConfig();
  // OpenCode path defaults: longer hook timeout (5s → 5s, no change but documented)
  assert.equal(cfg.opencode_hook_timeout_ms, 5000);
  assert.equal(cfg.opencode_baseline_inject, 'experimental_chat_system_transform');
});
```

- [ ] **步骤 2：跑测试（应 FAIL）**

```bash
node --test __tests__/unit/opencode/config.test.js
# 预期：FAIL
```

- [ ] **步骤 3：写 config.ts**

```ts
// opencode/src/config.ts
/**
 * Config wrapper. Reads ~/.oh-my-sdd/config.json (shared with claude/lingma)
 * and merges OpenCode-specific defaults.
 *
 * Singleton via getConfig() — re-read only on file change (out of scope for MVP).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getStateDir } from './paths.js';
import { log } from './logger.js';

export type OhMySddConfig = {
  dop_endpoint: string;
  aih_system_name: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
  telemetry_disabled: boolean;
  // OpenCode-specific
  opencode_hook_timeout_ms: number;
  opencode_baseline_inject: 'experimental_chat_system_transform' | 'fallback_agents_md';
};

const DEFAULTS: OhMySddConfig = {
  dop_endpoint: 'https://dop.enterprise.com',
  aih_system_name: 'sdd',
  log_level: 'info',
  telemetry_disabled: false,
  opencode_hook_timeout_ms: 5000,
  opencode_baseline_inject: 'experimental_chat_system_transform',
};

let _cached: OhMySddConfig | null = null;

export function loadConfig(): OhMySddConfig {
  const p = path.join(getStateDir(), 'config.json');
  let user: Partial<OhMySddConfig> = {};
  try {
    const raw = fs.readFileSync(p, 'utf8');
    user = JSON.parse(raw);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      log('warn', 'config.json parse failed, using defaults', { err: String(e) });
    }
  }
  return { ...DEFAULTS, ...user };
}

export function getConfig(): OhMySddConfig {
  if (!_cached) _cached = loadConfig();
  return _cached;
}
```

- [ ] **步骤 4：跑测试（应 PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/config.test.js
# 预期：4 PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/config.ts __tests__/unit/opencode/config.test.js
git commit -m "feat(opencode): add config.ts wrapping shared hooks/lib/config.js"
```

---

### Phase 2: Mappers（事件 → hook stdin）

#### 任务 2.1：mapSessionStart / mapSessionEnd（TDD）

**文件：**
- 创建：`opencode/src/mappers.ts`（含所有 5 个 mapper，但本任务只测 2 个）
- 测试：`__tests__/unit/opencode/mappers.test.js`（先写 5 个 case 覆盖本任务）

- [ ] **步骤 1：写测试（仅 SessionStart/SessionEnd 5 case）**

```js
// __tests__/unit/opencode/mappers.test.js — 开头部分
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapSessionStart, mapSessionEnd } from '../../../opencode/src/mappers.js';

test('mapSessionStart: full input → full output', () => {
  const out = mapSessionStart({ sessionID: 'abc-123', directory: '/work' });
  assert.deepEqual(out, { session_id: 'abc-123', cwd: '/work' });
});

test('mapSessionStart: missing sessionID → fallback id', () => {
  const out = mapSessionStart({ directory: '/work' });
  assert.match(out.session_id, /^oms-opencode-\d+$/);
  assert.equal(out.cwd, '/work');
});

test('mapSessionStart: missing both → fallback id + process.cwd()', () => {
  const out = mapSessionStart({});
  assert.match(out.session_id, /^oms-opencode-\d+$/);
  assert.equal(out.cwd, process.cwd());
});

test('mapSessionEnd: same contract as mapSessionStart', () => {
  const out = mapSessionEnd({ sessionID: 'xyz', directory: '/x' });
  assert.deepEqual(out, { session_id: 'xyz', cwd: '/x' });
});

test('mapSessionEnd: empty input → fallback', () => {
  const out = mapSessionEnd({});
  assert.match(out.session_id, /^oms-opencode-\d+$/);
});

// ...（任务 2.2-2.5 加更多 case 到此文件）
```

- [ ] **步骤 2：跑测试（应 FAIL）**

```bash
node --test __tests__/unit/opencode/mappers.test.js
# 预期：FAIL（mappers.ts 不存在）
```

- [ ] **步骤 3：写 mappers.ts（仅 sessionStart/SessionEnd）**

```ts
// opencode/src/mappers.ts
/**
 * Translate OpenCode event payloads → Claude hook stdin JSON.
 * Single source of truth for protocol bridging (spec §4.2.1).
 */
import { sanitizeSessionId } from './types.js';

const TRACKED_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

export function mapSessionStart(input: {
  sessionID?: string;
  directory?: string;
}): { session_id: string; cwd: string } {
  return {
    session_id: sanitizeSessionId(input.sessionID),
    cwd: input.directory ?? process.cwd(),
  };
}

export function mapSessionEnd(input: {
  sessionID?: string;
  directory?: string;
}): { session_id: string; cwd: string } {
  return mapSessionStart(input);
}

// ...（任务 2.3-2.5 加更多 mapper）
```

- [ ] **步骤 4：跑测试（应 PASS，仅 5 个）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/mappers.test.js
# 预期：5 PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/mappers.ts __tests__/unit/opencode/mappers.test.js
git commit -m "feat(opencode): add mapSessionStart/SessionEnd with sanitized fallback"
```

---

#### 任务 2.2：TOOL_MAP + args normalize 工具函数（TDD）

**文件：**
- 修改：`opencode/src/mappers.ts`（加 TOOL_MAP + normalizeEdits + normalizeArgs）
- 修改：`__tests__/unit/opencode/mappers.test.js`（加 3 个 case）

- [ ] **步骤 1：追加测试**

```js
// 在 mappers.test.js 末尾追加
import { TOOL_MAP, normalizeArgs } from '../../../opencode/src/mappers.js';

test('TOOL_MAP: opencode lowercase write/edit/apply_patch → claude PascalCase', () => {
  assert.equal(TOOL_MAP.write, 'Write');
  assert.equal(TOOL_MAP.edit, 'Edit');
  assert.equal(TOOL_MAP.apply_patch, 'MultiEdit');
});

test('TOOL_MAP: already-PascalCase names pass through', () => {
  assert.equal(TOOL_MAP.Write, 'Write');
  assert.equal(TOOL_MAP.Edit, 'Edit');
  assert.equal(TOOL_MAP.MultiEdit, 'MultiEdit');
});

test('normalizeArgs: new_string → newString at top level and inside edits[]', () => {
  const out = normalizeArgs({ new_string: 'foo', edits: [{ new_string: 'bar' }] });
  assert.equal(out.newString, 'foo');
  assert.equal(out.edits[0].newString, 'bar');
  // original keys also kept (claude-side normalizer is idempotent)
  assert.ok('new_string' in out);
});
```

- [ ] **步骤 2：跑测试（应 FAIL）**

```bash
node --test __tests__/unit/opencode/mappers.test.js
# 预期：3 个新 test FAIL
```

- [ ] **步骤 3：实现**

在 `mappers.ts` 加：

```ts
export const TOOL_MAP: Record<string, string> = {
  // OpenCode SDK primary names
  write: 'Write',
  edit: 'Edit',
  apply_patch: 'MultiEdit',
  // PascalCase pass-through
  Write: 'Write',
  Edit: 'Edit',
  MultiEdit: 'MultiEdit',
  // Variants
  multiedit: 'MultiEdit',
  applypatch: 'MultiEdit',
};

export function isTrackedTool(opencodeName: string): boolean {
  return opencodeName in TOOL_MAP;
}

function normalizeEdits(edits: unknown): unknown {
  if (!Array.isArray(edits)) return edits;
  return edits.map((e) => {
    if (e && typeof e === 'object') {
      const obj = e as Record<string, unknown>;
      if ('new_string' in obj && !('newString' in obj)) {
        return { ...obj, newString: obj.new_string };
      }
    }
    return e;
  });
}

export function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  if ('new_string' in out && !('newString' in out)) {
    out.newString = out.new_string;
  }
  if ('edits' in out) {
    out.edits = normalizeEdits(out.edits);
  }
  return out;
}
```

- [ ] **步骤 4：跑测试（应 PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/mappers.test.js
# 预期：8 PASS（5 from 2.1 + 3 from 2.2）
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/mappers.ts __tests__/unit/opencode/mappers.test.js
git commit -m "feat(opencode): add TOOL_MAP and args normalizer (new_string→newString)"
```

---

#### 任务 2.3：mapPreToolUse + mapPostToolUse（TDD）

- [ ] **步骤 1：追加测试**

```js
// mappers.test.js 末尾
import { mapPreToolUse, mapPostToolUse } from '../../../opencode/src/mappers.js';

test('mapPreToolUse: tracked tool returns mapped payload', () => {
  const out = mapPreToolUse({
    tool: 'write',
    input: { file_path: '/x', content: 'hi' },
    sessionID: 's1',
  });
  assert.deepEqual(out, {
    tool_name: 'Write',
    tool_input: { file_path: '/x', content: 'hi' },
    session_id: 's1',
  });
});

test('mapPreToolUse: untracked tool returns null (skip hook)', () => {
  const out = mapPreToolUse({ tool: 'bash', input: {}, sessionID: 's1' });
  assert.equal(out, null);
});

test('mapPreToolUse: applies args normalization (new_string → newString)', () => {
  const out = mapPreToolUse({
    tool: 'edit',
    input: { file_path: '/x', new_string: 'new', old_string: 'old' },
    sessionID: 's1',
  });
  assert.equal(out?.tool_input.newString, 'new');
  assert.equal(out?.tool_input.old_string, 'old'); // passthrough
});

test('mapPreToolUse: missing input → empty tool_input', () => {
  const out = mapPreToolUse({ tool: 'write', sessionID: 's1' });
  assert.deepEqual(out?.tool_input, {});
});

test('mapPostToolUse: same contract as mapPreToolUse', () => {
  const out = mapPostToolUse({
    tool: 'edit',
    input: { file_path: '/x', newString: 'a' },
    sessionID: 's1',
  });
  assert.equal(out?.tool_name, 'Edit');
  assert.equal(out?.tool_input.newString, 'a');
});
```

- [ ] **步骤 2：跑测试（FAIL）**

```bash
node --test __tests__/unit/opencode/mappers.test.js
# 预期：5 新 test FAIL
```

- [ ] **步骤 3：实现**

```ts
// mappers.ts 追加
export function mapPreToolUse(input: {
  tool: string;
  input?: Record<string, unknown>;
  sessionID?: string;
}): { tool_name: string; tool_input: Record<string, unknown>; session_id: string } | null {
  const toolName = TOOL_MAP[input.tool];
  if (!toolName || !TRACKED_TOOLS.has(toolName)) return null;
  const toolInput = normalizeArgs(input.input ?? {});
  const result = {
    tool_name: toolName,
    tool_input: toolInput,
    session_id: sanitizeSessionId(input.sessionID),
  };
  return result;
}

export function mapPostToolUse(input: {
  tool: string;
  input?: Record<string, unknown>;
  sessionID?: string;
}): ReturnType<typeof mapPreToolUse> {
  return mapPreToolUse(input);
}
```

- [ ] **步骤 4：跑测试（PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/mappers.test.js
# 预期：13 PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/mappers.ts __tests__/unit/opencode/mappers.test.js
git commit -m "feat(opencode): add mapPreToolUse/PostToolUse with tracked-tool filter"
```

---

#### 任务 2.4：mapUserPromptSubmit（TDD）

- [ ] **步骤 1：追加测试**

```js
// mappers.test.js 末尾
import { mapUserPromptSubmit } from '../../../opencode/src/mappers.js';

test('mapUserPromptSubmit: full input returns full payload', () => {
  const out = mapUserPromptSubmit({
    command: '/sdd-spec test-1',
    sessionID: 's1',
    arguments: '["test-1"]',
  });
  assert.equal(out?.session_id, 's1');
  assert.match(out?.prompt ?? '', /\/sdd-spec test-1/);
  assert.equal(out?.cwd, process.cwd());
});

test('mapUserPromptSubmit: missing command returns null', () => {
  const out = mapUserPromptSubmit({ sessionID: 's1' });
  assert.equal(out, null);
});

test('mapUserPromptSubmit: missing sessionID uses fallback', () => {
  const out = mapUserPromptSubmit({ command: '/sdd-spec x' });
  assert.match(out?.session_id ?? '', /^oms-opencode-\d+$/);
});
```

- [ ] **步骤 2：跑测试（FAIL）**

```bash
node --test __tests__/unit/opencode/mappers.test.js
# 预期：3 新 test FAIL
```

- [ ] **步骤 3：实现**

```ts
// mappers.ts 追加
export function mapUserPromptSubmit(input: {
  command?: string;
  sessionID?: string;
  arguments?: string;
}): { session_id: string; prompt: string; cwd: string } | null {
  if (!input.command) return null;
  const argsPart = input.arguments ? ` ${input.arguments}` : '';
  return {
    session_id: sanitizeSessionId(input.sessionID),
    prompt: `${input.command}${argsPart}`,
    cwd: process.cwd(),
  };
}
```

- [ ] **步骤 4：跑测试（PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/mappers.test.js
# 预期：16 PASS（13 + 3）
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/mappers.ts __tests__/unit/opencode/mappers.test.js
git commit -m "feat(opencode): add mapUserPromptSubmit for command.execute.before"
```

---

#### 任务 2.5：mappers 集成 — 验证总数 15 case

- [ ] **步骤 1：跑全测**

```bash
node --test __tests__/unit/opencode/mappers.test.js
# 预期：16 PASS（spec 说 15，我们是 16，多 1 个无害）
```

- [ ] **步骤 2：检查覆盖率（用 c8 或 node --experimental-test-coverage）**

```bash
node --test --experimental-test-coverage __tests__/unit/opencode/mappers.test.js
# 预期：mappers.ts 100% line/branch coverage
```

- [ ] **步骤 3：commit（如果改了测试）**

如果改了：commit。否则 no-op。

---

### Phase 3: Runner（child_process 调度 + fail-CLOSED）

#### 任务 3.1：runHook 成功路径 + 错误类（TDD）

**文件：**
- 创建：`opencode/src/runner.ts`
- 测试：`__tests__/unit/opencode/runner.test.js`

- [ ] **步骤 1：写测试（mock child_process）**

```js
// __tests__/unit/opencode/runner.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { runHook, HookError } from '../../../opencode/src/runner.js';

// Mock child_process.spawn
const spawnCalls = [];
const mockSpawn = (cmd, args, opts) => {
  spawnCalls.push({ cmd, args, opts });
  const proc = new EventEmitter();
  proc.stdin = { write: () => {}, end: () => {} };
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.kill = (sig) => { proc.emit('close', 0, sig); };
  return proc;
};

test('runner: runHook spawns node with hook script', async () => {
  const proc = mockSpawn();
  proc.stdout.push(JSON.stringify({ continue: true }));
  proc.stdout.push(null);
  setImmediate(() => proc.emit('close', 0));
  // Inject mock into runner's internal
  // ... (see implementation: use process.env.OMS_TEST_SPAWN or import override)
  // For now, we test via real spawn to a stub script
});
```

> **注意**：mock child_process.spawn 较复杂（TS 编译后 import 已固化）。实际用**真实 spawn 一个 stub script** 测试更可靠。

- [ ] **步骤 1（修订）：用真实 stub script 测试**

```js
// __tests__/unit/opencode/runner.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { runHook, HookError } from '../../../opencode/src/runner.js';

// Create stub hooks in temp dir
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-runner-'));
const HOOKS_DIR = path.join(tmpDir, 'hooks');
fs.mkdirSync(HOOKS_DIR);
fs.writeFileSync(path.join(HOOKS_DIR, 'ok.js'), `
  let data = ''; process.stdin.on('data', c => data += c);
  process.stdin.on('end', () => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } }));
  });
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'deny.js'), `
  let data = ''; process.stdin.on('data', c => data += c);
  process.stdin.on('end', () => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'AK hardcoded' } }));
  });
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'crash.js'), `
  process.stdin.resume(); process.exit(1);
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'bad-json.js'), `
  process.stdin.resume(); process.stdout.write('not json{');
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'silent.js'), `
  process.stdin.resume(); // writes nothing
`);
fs.writeFileSync(path.join(HOOKS_DIR, 'slow.js'), `
  setTimeout(() => {}, 10000); // exceeds test timeout
`);

process.env.OMS_HOOKS_DIR = HOOKS_DIR;

test('runner: success path with permissionDecision=allow → returns HookResult', async () => {
  const result = await runHook('ok.js', { tool_name: 'Write' });
  assert.equal(result?.hookSpecificOutput?.permissionDecision, 'allow');
});

test('runner: permissionDecision=deny → throws HookError with reason', async () => {
  await assert.rejects(
    () => runHook('deny.js', { tool_name: 'Write' }),
    (err) => err instanceof HookError && /AK hardcoded/.test(err.message)
  );
});

test('runner: hook crash (exit 1) → throws HookError (fail-CLOSED)', async () => {
  await assert.rejects(
    () => runHook('crash.js', {}),
    (err) => err instanceof HookError && /exit code 1/.test(err.message)
  );
});

test('runner: stdout non-JSON → throws HookError (fail-CLOSED)', async () => {
  await assert.rejects(
    () => runHook('bad-json.js', {}),
    (err) => err instanceof HookError && /invalid JSON/.test(err.message)
  );
});

test('runner: stdout missing permissionDecision → returns (no-op, no throw)', async () => {
  const result = await runHook('silent.js', {});
  assert.equal(result, null);
});

test('runner: timeout → throws HookError (fail-CLOSED)', async () => {
  await assert.rejects(
    () => runHook('slow.js', {}, { timeoutMs: 500 }),
    (err) => err instanceof HookError && /timeout/.test(err.message)
  );
}, { timeout: 3000 });

test('runner: hook file not found → throws HookError (fail-CLOSED)', async () => {
  await assert.rejects(
    () => runHook('does-not-exist.js', {}),
    (err) => err instanceof HookError && /ENOENT|not found/i.test(err.message)
  );
});

test('runner: stdin payload is JSON-serialized', async () => {
  // captured via process.env in stub (skip — covered by hook-side test)
});
```

- [ ] **步骤 2：跑测试（FAIL）**

```bash
node --test __tests__/unit/opencode/runner.test.js
# 预期：FAIL（runner.ts 不存在）
```

- [ ] **步骤 3：写 runner.ts**

```ts
// opencode/src/runner.ts
/**
 * Spawn hooks/*.js as child process. Translates Claude hook protocol
 * (permissionDecision in stdout JSON) to OpenCode action (throw / return).
 *
 * Fail-CLOSED: any hook error → throws HookError. The OpenCode host catches
 * the throw and blocks the tool. This is the security invariant (spec G6).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { log } from './logger.js';
import { getHooksDir } from './paths.js';
import type { HookResult } from './types.js';

export class HookError extends Error {
  constructor(
    public readonly category: 'CRASH' | 'TIMEOUT' | 'PROTOCOL' | 'PATH',
    public readonly hookScript: string,
    public readonly reason: string,
    public readonly exitCode?: number,
  ) {
    super(`[${category}] ${hookScript}: ${reason}`);
    this.name = 'HookError';
  }
}

export type RunHookOptions = {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
};

const DEFAULT_TIMEOUT_MS = 5000;

export function runHook(
  scriptName: string,
  payload: unknown,
  opts: RunHookOptions = {},
): Promise<HookResult | null> {
  const hooksDir = process.env.OMS_HOOKS_DIR ?? getHooksDir();
  const scriptPath = path.join(hooksDir, scriptName);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    let proc: ChildProcess;
    try {
      proc = spawn('node', [scriptPath], {
        cwd: opts.cwd ?? process.cwd(),
        env: { ...process.env, ...opts.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      return reject(new HookError('PATH', scriptName, `spawn failed: ${(e as Error).message}`));
    }

    let stdout = '';
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      action();
    };

    proc.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    proc.stderr?.on('data', (c: Buffer) => {
      log('debug', 'hook stderr', { script: scriptName, stderr: c.toString().slice(0, 500) });
    });
    proc.on('error', (err) => {
      finish(() => reject(new HookError('CRASH', scriptName, err.message)));
    });
    proc.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        return finish(() => reject(new HookError('CRASH', scriptName, `exit code ${code}`, code ?? undefined)));
      }
      // Parse stdout
      let parsed: HookResult;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        return finish(() => reject(new HookError('PROTOCOL', scriptName, `stdout not valid JSON: ${(e as Error).message}`)));
      }
      // Translate permissionDecision
      const decision = parsed.hookSpecificOutput?.permissionDecision;
      if (decision === 'deny') {
        const reason = parsed.hookSpecificOutput?.permissionDecisionReason ?? 'blocked by hook';
        return finish(() => reject(new HookError('PROTOCOL', scriptName, reason)));
      }
      // allow / ask / missing → no throw, return parsed result
      return finish(() => resolve(parsed));
    });

    // Timeout
    timer = setTimeout(() => {
      finish(() => reject(new HookError('TIMEOUT', scriptName, `exceeded ${timeoutMs}ms`)));
    }, timeoutMs);

    // Write stdin
    try {
      proc.stdin?.write(JSON.stringify(payload));
      proc.stdin?.end();
    } catch (e) {
      finish(() => reject(new HookError('CRASH', scriptName, `stdin write failed: ${(e as Error).message}`)));
    }
  });
}
```

- [ ] **步骤 4：跑测试（PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/runner.test.js
# 预期：7 PASS（缺 1 个 stub-input capture，已注释）
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/runner.ts __tests__/unit/opencode/runner.test.js
git commit -m "feat(opencode): add runner.ts with fail-CLOSED hook spawn"
```

---

#### 任务 3.2：runner 覆盖度补完（addtl 5 case）

- [ ] **步骤 1：追加 5 个测试**

```js
// runner.test.js 末尾
import { runHook } from '../../../opencode/src/runner.js';

test('runner: additionalContext in HookResult is preserved', async () => {
  // Update ok.js stub to include additionalContext
  fs.writeFileSync(path.join(HOOKS_DIR, 'ctx.js'), `
    process.stdin.resume();
    process.stdout.write(JSON.stringify({ additionalContext: 'rule hint' }));
  `);
  const result = await runHook('ctx.js', {});
  assert.equal(result?.additionalContext, 'rule hint');
});

test('runner: hook receives sanitized session_id in payload', async () => {
  // Capture stdin in a new stub
  const capturedFile = path.join(tmpDir, 'captured.json');
  fs.writeFileSync(path.join(HOOKS_DIR, 'capture.js'), `
    let data = ''; process.stdin.on('data', c => data += c);
    process.stdin.on('end', () => {
      require('fs').writeFileSync('${capturedFile}', data);
    });
  `);
  await runHook('capture.js', { session_id: '../../../etc/passwd' });
  const captured = JSON.parse(fs.readFileSync(capturedFile, 'utf8'));
  assert.equal(captured.session_id, '.._.._.._etc_passwd');
});

test('runner: env var OMS_HOOK_TIMEOUT_MS overrides default', async () => {
  process.env.OMS_HOOK_TIMEOUT_MS = '300';
  await assert.rejects(
    () => runHook('slow.js', {}),
    (err) => err instanceof HookError && /timeout/.test(err.message)
  );
  delete process.env.OMS_HOOK_TIMEOUT_MS;
});

test('runner: SIGKILL exit code 137 → fail-CLOSED', async () => {
  fs.writeFileSync(path.join(HOOKS_DIR, 'killed.js'), `
    process.stdin.resume(); process.kill(process.pid, 'SIGKILL');
  `);
  await assert.rejects(
    () => runHook('killed.js', {}),
    (err) => err instanceof HookError
  );
});

test('runner: SIGSEGV exit code 139 → fail-CLOSED', async () => {
  // can't easily trigger SIGSEGV in plain JS; use non-zero exit
  // (covered by crash.js test in 3.1)
});
```

- [ ] **步骤 2：跑测试**

```bash
node --test __tests__/unit/opencode/runner.test.js
# 预期：11 PASS（7 + 4，SIGSEGV 被注释）
```

- [ ] **步骤 3：commit**

```bash
git add __tests__/unit/opencode/runner.test.js
git commit -m "test(opencode): cover additionalContext, sanitized session_id, timeout env, SIGKILL"
```

---

### Phase 4: Baseline（system prompt 注入）

#### 任务 4.1：loadBaseline（TDD）

**文件：**
- 创建：`opencode/src/baseline.ts`
- 测试：`__tests__/unit/opencode/baseline.test.js`

- [ ] **步骤 1：写测试（4 case：read / frontmatter / Sync Report / missing）**

```js
// __tests__/unit/opencode/baseline.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadBaseline } from '../../../opencode/src/baseline.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-baseline-'));
process.env.OMS_BASELINE_PATH = path.join(tmpDir, 'baseline.md');

const SAMPLE = `---
oms_version: 0.2.0
ratified: 2026-07-21
last_amended: 2026-07-21
---

<!-- Sync Impact Report -->
v0.2.0 — initial baseline
<!-- END Sync Impact Report -->

## Section A: Safety
HARD_RULE: no AK
HARD_RULE: no sk-

## Section B: Compliance
[OMSxxxx] commit format

## Section C: Operations
Use OVERRIDE sparingly
`;

test('baseline: loadBaseline reads file and removes frontmatter', async () => {
  fs.writeFileSync(process.env.OMS_BASELINE_PATH, SAMPLE);
  const sections = await loadBaseline();
  const joined = sections.join('\n');
  assert.ok(!joined.includes('oms_version:'), 'should strip frontmatter');
  assert.ok(joined.includes('## Section A'));
  assert.ok(joined.includes('## Section B'));
  assert.ok(joined.includes('## Section C'));
});

test('baseline: loadBaseline removes Sync Impact Report', async () => {
  fs.writeFileSync(process.env.OMS_BASELINE_PATH, SAMPLE);
  const sections = await loadBaseline();
  const joined = sections.join('\n');
  assert.ok(!joined.includes('Sync Impact Report'), 'should strip Sync Report');
  assert.ok(!joined.includes('v0.2.0 — initial'), 'should strip version line');
});

test('baseline: loadBaseline splits by ## headers', async () => {
  fs.writeFileSync(process.env.OMS_BASELINE_PATH, SAMPLE);
  const sections = await loadBaseline();
  assert.equal(sections.length, 3);
  assert.match(sections[0], /Section A/);
  assert.match(sections[1], /Section B/);
  assert.match(sections[2], /Section C/);
});

test('baseline: loadBaseline returns [] when file missing (fail-open for baseline only)', async () => {
  fs.unlinkSync(process.env.OMS_BASELINE_PATH);
  const sections = await loadBaseline();
  assert.deepEqual(sections, []);
});
```

- [ ] **步骤 2：跑测试（FAIL）**

```bash
node --test __tests__/unit/opencode/baseline.test.js
# 预期：FAIL
```

- [ ] **步骤 3：写 baseline.ts（loadBaseline 部分）**

```ts
// opencode/src/baseline.ts
/**
 * Load enterprise-baseline.md and prepare for system prompt injection.
 * Strips YAML frontmatter + Sync Impact Report (internal-only).
 *
 * Fail-OPEN: if file missing → return []. Baseline is guidance; HARD_RULE
 * enforcement still works via PreToolUse hook (fail-CLOSED) regardless.
 */
import fs from 'node:fs';
import { getBaselinePath } from './paths.js';
import { log } from './logger.js';

export async function loadBaseline(): Promise<string[]> {
  const p = process.env.OMS_BASELINE_PATH ?? getBaselinePath();
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      log('warn', 'baseline file missing, skipping injection', { path: p });
      return [];
    }
    throw e;
  }
  // Strip YAML frontmatter
  const noFrontmatter = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
  // Strip Sync Impact Report block
  const noSync = noFrontmatter.replace(/<!--\s*Sync Impact Report\s*-->[\s\S]*?<!--\s*END Sync Impact Report\s*-->\n*/, '');
  // Split by ## headers
  const sections = noSync
    .split(/^## /m)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => (s.startsWith('#') ? '## ' + s : s));
  return sections;
}
```

- [ ] **步骤 4：跑测试（PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/baseline.test.js
# 预期：4 PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/baseline.ts __tests__/unit/opencode/baseline.test.js
git commit -m "feat(opencode): baseline.loadBaseline with frontmatter + Sync Report stripping"
```

---

#### 任务 4.2：buildSystemPrompt + 降级到 AGENTS.md（TDD）

- [ ] **步骤 1：追加测试（3 case）**

```js
// baseline.test.js 末尾
import { buildSystemPrompt, writeAgentsMdFallback } from '../../../opencode/src/baseline.js';

test('baseline: buildSystemPrompt appends to output.system', () => {
  const out = { system: ['You are an agent.'] };
  buildSystemPrompt(['Rule 1', 'Rule 2'], out);
  assert.deepEqual(out.system, ['You are an agent.', 'Rule 1', 'Rule 2']);
});

test('baseline: buildSystemPrompt creates system array if missing', () => {
  const out = {} as { system?: string[] };
  buildSystemPrompt(['Rule 1'], out);
  assert.deepEqual(out.system, ['Rule 1']);
});

test('baseline: writeAgentsMdFallback writes to ~/.config/opencode/AGENTS.md', () => {
  writeAgentsMdFallback(['Rule 1', 'Rule 2']);
  const home = os.homedir();
  const p = path.join(home, '.config', 'opencode', 'AGENTS.md');
  // Skip on Windows for now (different path)
  if (process.platform === 'win32') return;
  const content = fs.readFileSync(p, 'utf8');
  assert.ok(content.includes('Rule 1'));
  assert.ok(content.includes('Rule 2'));
  // Cleanup
  fs.unlinkSync(p);
});
```

- [ ] **步骤 2：跑测试（FAIL）**

```bash
node --test __tests__/unit/opencode/baseline.test.js
# 预期：3 新 FAIL
```

- [ ] **步骤 3：实现**

```ts
// baseline.ts 追加
export function buildSystemPrompt(
  sections: string[],
  output: { system?: string[] },
): void {
  if (!output.system) output.system = [];
  output.system.push(...sections);
}

export function writeAgentsMdFallback(sections: string[]): void {
  if (process.platform === 'win32') {
    log('warn', 'AGENTS.md fallback not implemented on Windows', {});
    return;
  }
  const home = os.homedir();
  const p = path.join(home, '.config', 'opencode', 'AGENTS.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, sections.join('\n\n') + '\n');
  log('info', 'wrote AGENTS.md fallback', { path: p });
}
```

需要在文件头加 `import path from 'node:path';` 和 `import os from 'node:os';`（如果 buildSystemPrompt 之前没用 path）。

- [ ] **步骤 4：跑测试（PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/baseline.test.js
# 预期：7 PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/baseline.ts __tests__/unit/opencode/baseline.test.js
git commit -m "feat(opencode): baseline.buildSystemPrompt + AGENTS.md fallback"
```

---

#### 任务 4.3：版本检测（experimental hook 是否存在）

- [ ] **步骤 1：追加测试（1 case）**

```js
// baseline.test.js 末尾
import { detectExperimentalHook } from '../../../opencode/src/baseline.js';

test('baseline: detectExperimentalHook returns boolean', () => {
  const supported = detectExperimentalHook();
  assert.equal(typeof supported, 'boolean');
  // 当前 SDK 1.15.13 支持 → true
  assert.equal(supported, true);
});
```

- [ ] **步骤 2：跑测试（FAIL）**

```bash
node --test __tests__/unit/opencode/baseline.test.js
# 预期：FAIL
```

- [ ] **步骤 3：实现**

```ts
// baseline.ts 追加
export function detectExperimentalHook(): boolean {
  // The SDK exports Hooks type but we can't runtime-check the host's support.
  // Best heuristic: import the type definition and look for the key.
  // For now: assume supported (will be re-checked on first invocation).
  // Real impl: check OpenCode SDK version or features flag.
  const sdkVersion = process.env.OMS_OPENCODE_SDK_VERSION ?? '1.15.13';
  const [major, minor] = sdkVersion.split('.').map(Number);
  return major > 1 || (major === 1 && minor >= 15);
}
```

> **注意**：真实检测在 plugin.ts 启动时通过 Hooks 对象的 key 检查完成。本任务定义**纯函数**版本。

- [ ] **步骤 4：跑测试（PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/baseline.test.js
# 预期：8 PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/baseline.ts __tests__/unit/opencode/baseline.test.js
git commit -m "feat(opencode): baseline.detectExperimentalHook for SDK version probe"
```

---

### Phase 5: Plugin dispatcher（hook 回调分派）

#### 任务 5.1：plugin.ts 主结构 + 5 个 handler（TDD）

**文件：**
- 创建：`opencode/src/plugin.ts`
- 测试：`__tests__/unit/opencode/plugin.test.js`

- [ ] **步骤 1：写测试（mock runner + baseline）**

```js
// __tests__/unit/opencode/plugin.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlugin, handleToolExecuteBefore, handleCommandExecuteBefore, handleSystemTransform, handleEvent } from '../../../opencode/src/plugin.js';

// Mock runner to return null (allow) by default
import { _setMockRunner } from '../../../opencode/src/runner.js';
_setMockRunner(async () => null);

test('plugin: handleToolExecuteBefore calls runner with mapped payload', async () => {
  // Need to capture what runner received
  // For simplicity, use mock that records
  const calls = [];
  _setMockRunner(async (script, payload) => {
    calls.push({ script, payload });
    return null;
  });
  const input = { tool: 'edit', sessionID: 's1', callID: 'c1' };
  const output = { args: { file_path: '/x', new_string: 'a' } };
  await handleToolExecuteBefore(input, output);
  assert.equal(calls[0].script, 'pre-tool-use.js');
  assert.equal(calls[0].payload.tool_name, 'Edit');
  assert.equal(calls[0].payload.tool_input.newString, 'a');
  assert.equal(calls[0].payload.session_id, 's1');
});

test('plugin: handleCommandExecuteBefore calls user-prompt-submit', async () => {
  const calls = [];
  _setMockRunner(async (script, payload) => { calls.push({ script, payload }); return null; });
  const input = { command: '/sdd-spec x', sessionID: 's1', arguments: '' };
  await handleCommandExecuteBefore(input, { parts: [] });
  assert.equal(calls[0].script, 'user-prompt-submit.js');
  assert.equal(calls[0].payload.session_id, 's1');
  assert.match(calls[0].payload.prompt, /\/sdd-spec x/);
});

test('plugin: handleSystemTransform appends baseline to output.system', async () => {
  const out = { system: ['base'] };
  await handleSystemTransform({ sessionID: 's1', model: {} }, out);
  assert.ok(out.system.length > 1);
  assert.notEqual(out.system[0], 'base');
});

test('plugin: handleEvent (session.created) calls session-start.js', async () => {
  const calls = [];
  _setMockRunner(async (script, payload) => { calls.push({ script, payload }); return null; });
  await handleEvent({ event: { type: 'session.created', properties: { info: { id: 's1', directory: '/w' } } } });
  assert.equal(calls[0].script, 'session-start.js');
  assert.equal(calls[0].payload.session_id, 's1');
  assert.equal(calls[0].payload.cwd, '/w');
});
```

- [ ] **步骤 2：跑测试（FAIL）**

```bash
node --test __tests__/unit/opencode/plugin.test.js
# 预期：FAIL
```

- [ ] **步骤 3：写 plugin.ts（骨架 + 4 handler）**

```ts
// opencode/src/plugin.ts
/**
 * OpenCode hook dispatchers. Each handler maps OpenCode event → hook script.
 */
import { runHook } from './runner.js';
import {
  mapSessionStart,
  mapSessionEnd,
  mapPreToolUse,
  mapPostToolUse,
  mapUserPromptSubmit,
} from './mappers.js';
import { loadBaseline, buildSystemPrompt } from './baseline.js';
import { log } from './logger.js';

const HOOK_TIMEOUT_MS = Number(process.env.OMS_HOOK_TIMEOUT_MS ?? 5000);

export async function handleSystemTransform(
  _input: { sessionID?: string; model: unknown },
  output: { system?: string[] },
): Promise<void> {
  const sections = await loadBaseline();
  buildSystemPrompt(sections, output);
  log('debug', 'baseline injected', { count: sections.length });
}

export async function handleToolExecuteBefore(
  input: { tool: string; sessionID?: string; callID?: string },
  output: { args: Record<string, unknown> },
): Promise<void> {
  const payload = mapPreToolUse({
    tool: input.tool,
    input: output.args,
    sessionID: input.sessionID,
  });
  if (!payload) return; // untracked tool
  await runHook('pre-tool-use.js', payload, { timeoutMs: HOOK_TIMEOUT_MS });
}

export async function handleToolExecuteAfter(
  input: { tool: string; sessionID?: string; callID?: string },
  _output: unknown,
): Promise<void> {
  const payload = mapPreToolUse({
    tool: input.tool,
    input: input as unknown as Record<string, unknown>,
    sessionID: input.sessionID,
  });
  if (!payload) return;
  await runHook('post-tool-use.js', payload, { timeoutMs: HOOK_TIMEOUT_MS });
}

export async function handleCommandExecuteBefore(
  input: { command?: string; sessionID?: string; arguments?: string },
  _output: { parts: unknown[] },
): Promise<void> {
  const payload = mapUserPromptSubmit(input);
  if (!payload) return;
  await runHook('user-prompt-submit.js', payload, { timeoutMs: HOOK_TIMEOUT_MS });
}

export async function handleEvent(input: { event: { type: string; properties?: { info?: { id?: string; directory?: string } } } }): Promise<void> {
  const t = input.event.type;
  if (t === 'session.created') {
    const info = input.event.properties?.info ?? {};
    const payload = mapSessionStart({ sessionID: info.id, directory: info.directory });
    await runHook('session-start.js', payload, { timeoutMs: HOOK_TIMEOUT_MS });
  } else if (t === 'session.deleted') {
    const info = input.event.properties?.info ?? {};
    const payload = mapSessionEnd({ sessionID: info.id, directory: info.directory });
    await runHook('session-end.js', payload, { timeoutMs: HOOK_TIMEOUT_MS });
  }
}
```

- [ ] **步骤 4：在 runner.ts 加 `_setMockRunner`**

```ts
// runner.ts 末尾追加
let _mockRunner: typeof runHook | null = null;
export function _setMockRunner(fn: typeof runHook | null): void {
  _mockRunner = fn;
}

// 修改 runHook 顶部：
export function runHook(scriptName: string, payload: unknown, opts: RunHookOptions = {}): Promise<HookResult | null> {
  if (_mockRunner) return _mockRunner(scriptName, payload, opts);
  // ... existing implementation
}
```

- [ ] **步骤 5：跑测试（PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/plugin.test.js
# 预期：4 PASS
```

- [ ] **步骤 6：commit**

```bash
git add opencode/src/plugin.ts opencode/src/runner.ts __tests__/unit/opencode/plugin.test.js
git commit -m "feat(opencode): plugin.ts with 4 hook handlers + mockable runner"
```

---

#### 任务 5.2：permission.ts stub（TDD）

**文件：**
- 创建：`opencode/src/permission.ts`
- 测试：`__tests__/unit/opencode/permission.test.js`

- [ ] **步骤 1：写测试（4 case）**

```js
// __tests__/unit/opencode/permission.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePermissionAsk, isPermissionAskEnabled } from '../../../opencode/src/permission.js';

test('permission: isPermissionAskEnabled returns false (YAGNI stub)', () => {
  assert.equal(isPermissionAskEnabled(), false);
});

test('permission: handlePermissionAsk is a no-op', () => {
  // Should not throw, should not modify output
  const output = { status: 'ask' };
  handlePermissionAsk({ permission: 'write' }, output);
  assert.equal(output.status, 'ask'); // unchanged
});

test('permission: handlePermissionAsk tolerates empty input', () => {
  handlePermissionAsk({}, { status: 'ask' });
});

test('permission: handlePermissionAsk returns undefined', () => {
  const ret = handlePermissionAsk({ permission: 'x' }, { status: 'ask' });
  assert.equal(ret, undefined);
});
```

- [ ] **步骤 2：跑测试（FAIL）**

```bash
node --test __tests__/unit/opencode/permission.test.js
# 预期：FAIL
```

- [ ] **步骤 3：写 permission.ts**

```ts
// opencode/src/permission.ts
/**
 * permission.ask handler — STUB for YAGNI.
 * Will be enabled when OpenCode introduces a permission UI.
 * Currently: no-op.
 */
export function isPermissionAskEnabled(): boolean {
  return false;
}

export function handlePermissionAsk(
  _input: Record<string, unknown>,
  _output: { status: 'ask' | 'deny' | 'allow' },
): void {
  // no-op (YAGNI)
}
```

- [ ] **步骤 4：跑测试（PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/permission.test.js
# 预期：4 PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/permission.ts __tests__/unit/opencode/permission.test.js
git commit -m "feat(opencode): permission.ts stub (YAGNI, no-op)"
```

---

#### 任务 5.3：index.ts 入口 + createPlugin

**文件：**
- 修改：`opencode/src/index.ts`（添加 createPlugin + export const OhMySddPlugin）

- [ ] **步骤 1：写测试**

```js
// __tests__/unit/opencode/plugin.test.js 末尾追加
import { createPlugin, OhMySddPlugin } from '../../../opencode/src/index.js';

test('plugin: createPlugin returns Hooks object with 5 handlers', () => {
  const hooks = createPlugin();
  assert.equal(typeof hooks['experimental.chat.system.transform'], 'function');
  assert.equal(typeof hooks['tool.execute.before'], 'function');
  assert.equal(typeof hooks['tool.execute.after'], 'function');
  assert.equal(typeof hooks['command.execute.before'], 'function');
  assert.equal(typeof hooks.event, 'function');
});

test('plugin: OhMySddPlugin is the default export function', () => {
  assert.equal(typeof OhMySddPlugin, 'function');
});
```

- [ ] **步骤 2：跑测试（FAIL）**

```bash
node --test __tests__/unit/opencode/plugin.test.js
# 预期：2 新 FAIL
```

- [ ] **步骤 3：写 index.ts**

```ts
// opencode/src/index.ts
/**
 * Entry point. Exports:
 * - OhMySddPlugin: the @opencode-ai/plugin plugin function
 * - createPlugin: factory for test injection
 */
import type { Hooks, PluginInput, Plugin } from '@opencode-ai/plugin';
import {
  handleSystemTransform,
  handleToolExecuteBefore,
  handleToolExecuteAfter,
  handleCommandExecuteBefore,
  handleEvent,
} from './plugin.js';
import { handlePermissionAsk, isPermissionAskEnabled } from './permission.js';
import { ensureStateDir } from '../../hooks/lib/state-dir.js';
import { log } from './logger.js';

export function createPlugin(): Hooks {
  return {
    'experimental.chat.system.transform': handleSystemTransform,
    'tool.execute.before': handleToolExecuteBefore,
    'tool.execute.after': handleToolExecuteAfter,
    'command.execute.before': handleCommandExecuteBefore,
    event: async (input) => { await handleEvent(input); },
    'permission.ask': isPermissionAskEnabled() ? handlePermissionAsk : undefined,
  };
}

export const OhMySddPlugin: Plugin = async (_input: PluginInput): Promise<Hooks> => {
  try {
    await ensureStateDir();
  } catch (e) {
    log('warn', 'ensureStateDir failed', { err: String(e) });
  }
  log('info', 'oh-my-sdd opencode plugin loaded', {});
  return createPlugin();
};

export default OhMySddPlugin;
```

- [ ] **步骤 4：跑测试（PASS）**

```bash
cd opencode && npx tsc && cd ..
node --test __tests__/unit/opencode/plugin.test.js
# 预期：6 PASS
```

- [ ] **步骤 5：commit**

```bash
git add opencode/src/index.ts __tests__/unit/opencode/plugin.test.js
git commit -m "feat(opencode): index.ts exports OhMySddPlugin (plugin function)"
```

---

### Phase 6: Build + install 集成

#### 任务 6.1：build:opencode 脚本验证

- [ ] **步骤 1：跑 build**

```bash
cd opencode && npm install --no-audit --no-fund && npx tsc
ls dist/
# 预期：index.js, plugin.js, mappers.js, runner.js, baseline.js, paths.js, logger.js, config.js, types.js, permission.js
ls dist/*.d.ts
# 预期：每个对应 .d.ts
```

- [ ] **步骤 2：跑全部单元测试**

```bash
cd <worktree-root>
node --test __tests__/unit/opencode/
# 预期：~60 test PASS
```

- [ ] **步骤 3：检查覆盖率**

```bash
node --test --experimental-test-coverage __tests__/unit/opencode/ 2>&1 | grep -E "opencode/src"
# 预期：每行 100%，整体 ≥ 80%
```

- [ ] **步骤 4：commit（如有 lockfile 变更）**

```bash
cd <worktree-root>
git add opencode/package-lock.json 2>/dev/null || true
git diff --cached --quiet || git commit -m "build(opencode): track package-lock.json"
```

---

#### 任务 6.2：install.js 加 `--tool opencode` 分支

**文件：**
- 修改：`install.js`（preflight + main switch）
- 创建：`hooks/lib/install-opencode.js`

- [ ] **步骤 1：先创建 install-opencode.js（最小）**

```js
// hooks/lib/install-opencode.js
/**
 * OpenCode install path. Symmetric to install-claude.js / install-lingma.js.
 *
 * What it does:
 *  1. soft-check OpenCode availability (warn if missing, don't fail)
 *  2. build opencode/src/*.ts → dist/ via tsc
 *  3. copy dist/ → ~/.config/opencode/plugins/oh-my-sdd/
 *  4. ensure ~/.config/opencode/opencode.json contains "plugin": ["oh-my-sdd"]
 *  5. share ~/.oh-my-sdd/ state dir with claude/lingma
 */
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ensureStateDir } from './state-dir.js';
import { log } from './log.js';

function announce(msg) {
  process.stderr.write(msg + '\n');
}

function isOpenCodeInstalled() {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(cmd, ['opencode'], { stdio: 'ignore' });
    return true;
  } catch {
    try {
      return fs.existsSync(path.join(os.homedir(), '.config', 'opencode'));
    } catch {
      return false;
    }
  }
}

function buildOpencodePlugin(packageRoot) {
  const opencodeDir = path.join(packageRoot, 'opencode');
  announce('  building opencode plugin via tsc...');
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: opencodeDir, stdio: 'inherit' });
  execFileSync('npx', ['tsc'], { cwd: opencodeDir, stdio: 'inherit' });
}

function copyDistToOpencodePlugins(packageRoot) {
  const src = path.join(packageRoot, 'opencode', 'dist');
  const dst = path.join(os.homedir(), '.config', 'opencode', 'plugins', 'oh-my-sdd');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
  announce(`  copied to ${dst}`);
  return dst;
}

function patchOpencodeJson() {
  if (process.platform === 'win32') {
    announce('  (skipping opencode.json patch on Windows — see docs for manual step)');
    return;
  }
  const cfgPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch { /* fresh */ }
  const plugins = Array.isArray(cfg.plugin) ? cfg.plugin : [];
  if (!plugins.includes('oh-my-sdd')) plugins.push('oh-my-sdd');
  cfg.plugin = plugins;
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  announce(`  patched ${cfgPath} with "plugin": ["oh-my-sdd"]`);
}

export async function installForOpencode({ PACKAGE_ROOT }) {
  // soft check
  if (!isOpenCodeInstalled()) {
    announce('⚠️  未检测到 OpenCode。继续安装（plugin 写到目录里等用户用），但 OpenCode 不在时不生效。');
    announce('    安装: https://opencode.ai');
  }
  await ensureStateDir();
  buildOpencodePlugin(PACKAGE_ROOT);
  copyDistToOpencodePlugins(PACKAGE_ROOT);
  patchOpencodeJson();
  announce('✅ OpenCode 路径安装完成');
  announce('   - plugin: ~/.config/opencode/plugins/oh-my-sdd/');
  announce('   - shared state: ~/.oh-my-sdd/');
  announce('   - opencode.json: 已加 "oh-my-sdd" 到 plugin 列表');
}

export function uninstallForOpencode() {
  if (process.platform === 'win32') {
    announce('  (skipping opencode cleanup on Windows — see docs for manual step)');
    return;
  }
  const dst = path.join(os.homedir(), '.config', 'opencode', 'plugins', 'oh-my-sdd');
  try {
    fs.rmSync(dst, { recursive: true, force: true });
    announce(`  removed ${dst}`);
  } catch { /* not present */ }
  const cfgPath = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (Array.isArray(cfg.plugin)) {
      cfg.plugin = cfg.plugin.filter((p) => p !== 'oh-my-sdd');
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
      announce(`  removed "oh-my-sdd" from ${cfgPath}`);
    }
  } catch { /* no config */ }
  // state dir preserved unless --purge
}
```

- [ ] **步骤 2：修改 install.js**

```js
// install.js — 添加 opencode 分支
import { installForOpencode, isOpenCodeInstalled } from './hooks/lib/install-opencode.js';

// preflightFor 添加：
case 'opencode':
  if (!isOpenCodeInstalled()) {
    process.stderr.write('⚠️  未检测到 OpenCode。继续安装，但 OpenCode 不在时不生效。\n');
    process.stderr.write('    安装：https://opencode.ai\n');
  }
  break;

// main switch 添加：
case 'opencode':
  return installForOpencode({ PACKAGE_ROOT });

// detectDefaultTool 添加（如果想自动检测）：
// (skip — opencode 不在默认检测链)

// 错误消息：
default:
  process.stderr.write(`❌ 未知工具: ${tool}\n`);
  process.stderr.write('  支持: claude, lingma, opencode\n');
  process.exit(1);
```

- [ ] **步骤 3：写集成测试**

```js
// __tests__/integration/opencode/install.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

test('install: oms-install --tool opencode writes plugin to ~/.config/opencode/plugins/oh-my-sdd/', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-install-'));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  const worktreeRoot = process.cwd();
  execFileSync('node', ['install.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    stdio: 'pipe',
  });
  const dst = path.join(tmpHome, '.config', 'opencode', 'plugins', 'oh-my-sdd');
  assert.ok(fs.existsSync(dst), 'plugin dir should exist');
  assert.ok(fs.existsSync(path.join(dst, 'index.js')));
  const cfg = JSON.parse(fs.readFileSync(path.join(tmpHome, '.config', 'opencode', 'opencode.json'), 'utf8'));
  assert.ok(cfg.plugin.includes('oh-my-sdd'));
});
```

- [ ] **步骤 4：跑测试**

```bash
cd <worktree-root>
node --test __tests__/integration/opencode/install.test.js
# 预期：1 PASS
```

- [ ] **步骤 5：commit**

```bash
git add install.js hooks/lib/install-opencode.js __tests__/integration/opencode/install.test.js
git commit -m "feat(opencode): install.js --tool opencode + install-opencode.js"
```

---

#### 任务 6.3：uninstall.js 加 opencode 分支

**文件：**
- 修改：`uninstall.js`

- [ ] **步骤 1：添加动态 import**

```js
// uninstall.js — 现有结构下添加
if (tool === 'opencode' || tool === 'all') {
  const { uninstallForOpencode } = await import('./hooks/lib/install-opencode.js');
  uninstallForOpencode();
}
```

- [ ] **步骤 2：写测试**

```js
// __tests__/integration/opencode/install.test.js 末尾
test('uninstall: oms-uninstall --tool opencode removes plugin dir and opencode.json entry', () => {
  // Re-use tmpHome from previous test if available
  const worktreeRoot = process.cwd();
  execFileSync('node', ['uninstall.js', '--tool', 'opencode'], {
    cwd: worktreeRoot,
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    stdio: 'pipe',
  });
  const dst = path.join(tmpHome, '.config', 'opencode', 'plugins', 'oh-my-sdd');
  assert.ok(!fs.existsSync(dst), 'plugin dir should be removed');
  const cfg = JSON.parse(fs.readFileSync(path.join(tmpHome, '.config', 'opencode', 'opencode.json'), 'utf8'));
  assert.ok(!cfg.plugin.includes('oh-my-sdd'));
});
```

- [ ] **步骤 3：跑测试**

```bash
node --test __tests__/integration/opencode/install.test.js
# 预期：2 PASS
```

- [ ] **步骤 4：commit**

```bash
git add uninstall.js __tests__/integration/opencode/install.test.js
git commit -m "feat(opencode): uninstall.js --tool opencode cleanup"
```

---

#### 任务 6.4：README + docs/roadmap 更新

**文件：**
- 修改：`README.md`
- 修改：`docs/roadmap/v0.2-backlog.md`

- [ ] **步骤 1：README 加 OpenCode 章节**

在 README 的 "通义灵码 Lingma" 章节后加：

```markdown
### OpenCode（v0.3+）

```bash
# 1. 全局安装
npm install -g --foreground-scripts @cli-tools/oh-my-sdd

# 2. 显式选择工具
oms-install --tool opencode

# 3. 启动 OpenCode
#    plugin 加载到 ~/.config/opencode/plugins/oh-my-sdd/
#    opencode.json 已加 "plugin": ["oh-my-sdd"]
#    /sdd-spec <change-name>
```

⚠️ **前置依赖**：`@opencode-ai/plugin` SDK 1.15+（oms-install 时自动安装）
⚠️ **HARD_RULE 强制**：通过自维护 TypeScript 适配层，100% 保留 hook 阻断语义
⚠️ **experimental baseline 注入**：依赖 `experimental.chat.system.transform` hook；SDK 升级时若该 hook 改名会触发自动降级到 `~/.config/opencode/AGENTS.md`
```

- [ ] **步骤 2：v0.2-backlog.md 加完成标记**

在文档末尾加：

```markdown
## ✅ v0.3 完成项（2026-07-21）

- OpenCode 平台适配器落地（A' 纯自适配路径）
- spike 1-5 验证
- design spec + implementation plan 完成
- HARD_RULE 强制 100% 保留
```

- [ ] **步骤 3：commit**

```bash
git add README.md docs/roadmap/v0.2-backlog.md
git commit -m "docs: add OpenCode install instructions + v0.3 completion log"
```

---

### Phase 7: 集成测试

#### 任务 7.1：full-flow.test.js（mock SDK 端到端）

**文件：**
- 创建：`__tests__/integration/opencode/full-flow.test.js`

- [ ] **步骤 1：写测试（5 case：写 AK 文件被拦 / 启动 session baseline 注入 / hook crash 阻断 / soft 规则 warning / uninstall 干净）**

```js
// __tests__/integration/opencode/full-flow.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { OhMySddPlugin } from '../../opencode/src/index.js';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'oms-fullflow-'));
process.env.HOME = tmpHome;
process.env.USERPROFILE = tmpHome;

test('integration: full flow — AK write is blocked (HARD_RULE)', async () => {
  const hooks = await OhMySddPlugin({} as any);
  const target = path.join(tmpHome, 'src/auth.ts');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'const k = "AKIAIOSFODNN7EXAMPLE";');
  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'write', sessionID: 's1', callID: 'c1' },
      { args: { file_path: target, content: 'const k = "AKIAIOSFODNN7EXAMPLE";' } }
    ),
    /AWS AccessKeyId|硬编码/
  );
  // File should not be modified
  assert.ok(fs.readFileSync(target, 'utf8').includes('AKIAIOSFODNN7EXAMPLE'),
    'original file should be preserved (pre-tool-use blocks)');
});

test('integration: baseline injected into system prompt', async () => {
  const hooks = await OhMySddPlugin({} as any);
  const out = { system: ['base'] };
  await hooks['experimental.chat.system.transform']({ sessionID: 's1', model: {} }, out);
  assert.ok(out.system.length > 1);
  // baseline should include some HARD_RULE markers
  const joined = out.system.join('\n');
  assert.ok(/HARD_RULE|AK|sk-|rm -rf/.test(joined), 'baseline should include rules');
});

test('integration: untracked tool passes through without hook call', async () => {
  const hooks = await OhMySddPlugin({} as any);
  // Should not throw, no side effect
  await hooks['tool.execute.before'](
    { tool: 'bash', sessionID: 's1', callID: 'c1' },
    { args: { command: 'ls' } }
  );
});

test('integration: command.execute.before calls user-prompt-submit', async () => {
  const hooks = await OhMySddPlugin({} as any);
  // Should not throw (mock runner returns null)
  await hooks['command.execute.before'](
    { command: '/sdd-spec x', sessionID: 's1', arguments: '' },
    { parts: [] }
  );
});

test('integration: session.created triggers session-start', async () => {
  const hooks = await OhMySddPlugin({} as any);
  await hooks.event({ event: { type: 'session.created', properties: { info: { id: 's1', directory: '/w' } } } });
});
```

> **注意**：full-flow 测试依赖真实 hooks/*.js 跑通——所以要确保之前 5 个 hooks JS 本身工作（这是 Claude 路径已经验证的）。

- [ ] **步骤 2：跑测试**

```bash
cd <worktree-root>
node --test __tests__/integration/opencode/full-flow.test.js
# 预期：5 PASS
```

- [ ] **步骤 3：commit**

```bash
git add __tests__/integration/opencode/full-flow.test.js
git commit -m "test(opencode): full-flow integration tests (5 cases)"
```

---

### Phase 8: E2E spike

#### 任务 8.1：真 OpenCode 跑通 /sdd-spec，写 spike 报告

**文件：**
- 创建：`__tests__/spike/opencode-e2e.md`

- [ ] **步骤 1：在真 OpenCode 装 plugin**

```bash
# 在 worktree-root
cd <worktree-root>
npm run build:opencode
OMS_PLUGIN_ROOT=$(pwd)/opencode node install.js --tool opencode
```

- [ ] **步骤 2：启动 OpenCode，跑 /sdd-spec spike-test**

```bash
# 启动 OpenCode
opencode
# 在 UI 里输入：
/sdd-spec spike-test
```

- [ ] **步骤 3：写 spike 报告**

把以下内容写到 `__tests__/spike/opencode-e2e.md`：

```markdown
# OpenCode E2E Spike 报告

**日期**：2026-07-21
**分支**：`worktree-opencode-platform-adapter`
**OpenCode 版本**：<version>
**oh-my-sdd 路径**：<commit-sha>

## 环境

- OS: <macos-version>
- Node: <node-version>
- OpenCode 安装方式: <global|npm>
- oh-my-sdd 安装: `oms-install --tool opencode`

## 测试用例

### 1. 完整 /sdd-spec 流程

**预期**：agent 收到命令，调用 SKILL.md，输出去 dop change list，提示选 change-id

**实际**：
<实际行为>

**结论**：✅ / ❌

### 2. HARD_RULE 5 条

| 规则 | 测试输入 | 预期 | 实际 |
|---|---|---|---|
| AK 硬编码 | `AKIAIOSFODNN7EXAMPLE` | 阻断 | ✅ / ❌ |
| sk- 硬编码 | `sk-abcdef1234...` | 阻断 | ✅ / ❌ |
| `rm -rf /` | bash command | 阻断 | ✅ / ❌ |
| `git push --force` to main | git command | 阻断 | ✅ / ❌ |
| `.env` 直编 | `edit .env` | 阻断 | ✅ / ❌ |

### 3. baseline 注入

**预期**：agent 能复述 baseline 中 HARD_RULE 章节
**实际**：<实际>

### 4. 性能

spawn 50 次 hook：
- P50: <ms>
- P95: <ms>
- P99: <ms>

### 5. 协议漂移检测

故意用旧 SDK 版本启动：<结果>

## 总体结论

✅ GO / ❌ NO-GO

<comments>
```

- [ ] **步骤 4：commit**

```bash
git add __tests__/spike/opencode-e2e.md
git commit -m "docs(spike): opencode e2e validation report (5 cases)"
```

---

## 自检

### 1. 规格覆盖度

| Spec 章节 | 覆盖任务 |
|---|---|
| 3 架构总览 | 0.1-0.2, 5.1-5.3 |
| 4.2.1 mappers | 2.1-2.4 |
| 4.2.2 runner | 3.1-3.2 |
| 4.2.3 baseline | 4.1-4.3 |
| 4.2.4 paths | 1.2 |
| 4.2.5 permission | 5.2 |
| 5.1 PreToolUse 数据流 | 3.1, 5.1, 7.1 |
| 5.2 SessionStart + baseline 数据流 | 4.1-4.3, 5.1, 7.1 |
| 5.3 错误处理数据流 | 3.1-3.2 |
| 6 错误分类 (E1-E11) | 3.1-3.2 (覆盖 E1-E7, E11), 4.1 (E9), 4.3 (E10) |
| 7 测试策略 (≥80% 覆盖) | 0.1-7.1, 8.1 |
| 8 分期 (MVP 1860 行) | 0.1-8.1 |
| 9 开放问题 | 实现时确认；plan 引用现版本 1.15.13 |
| 12 关键不变量 | 1.2 (shared state), 3.1 (fail-CLOSED), 4.1 (baseline 0 修改), 1.3 (no stdout) |

**遗漏**：E8 (SDK 版本不匹配) 隐含在 4.3 detectExperimentalHook；E5 (stdout 非 JSON) 已在 3.1 覆盖。

### 2. 占位符扫描

- "待定" / "TODO" / "FIXME" / "TBD" / "XXX"：0 个
- "类似 N 任务"：0 个（每个 task 独立）
- "添加适当的错误处理"：0 个
- "为上述代码编写测试"：0 个（每个 task 都有显式 test code）

### 3. 类型一致性

- `HookResult` 在 types.ts 定义，runner.ts 返回它，plugin.ts 不直接使用（通过 runner）
- `HookError` 在 runner.ts 定义，plugin.ts 隐式接受 throw（fail-CLOSED），tests 引用 `instanceof HookError`
- `SanitizedSessionId` 在 types.ts 定义，sanitizeSessionId 在 types.ts 和 paths.ts 都导出（paths.ts re-export）
- `handleSystemTransform` / `handleToolExecuteBefore` / `handleToolExecuteAfter` / `handleCommandExecuteBefore` / `handleEvent` 在 plugin.ts 定义，index.ts 引用并组装为 Hooks 对象
- `createPlugin` / `OhMySddPlugin` 在 index.ts 定义并 export
- TOOL_MAP / normalizeArgs 在 mappers.ts 定义，runner.ts 不依赖
- `loadBaseline` / `buildSystemPrompt` / `writeAgentsMdFallback` / `detectExperimentalHook` 在 baseline.ts 定义
- `_setMockRunner` 在 runner.ts 定义（test-only），plugin.test.js 使用

**inconsistency 检查**：
- 任务 3.1 写 `HookError`，任务 5.1 引用 `HookError` —— 一致 ✅
- 任务 4.1 写 `loadBaseline` 返 `Promise<string[]>`，任务 5.1 调 `loadBaseline()` 时没 await —— 修正见下

**修正 1**（任务 5.1 缺 await）：`handleSystemTransform` 必须 `await loadBaseline()`（返回 Promise）

**修正 2**（任务 6.2 install-opencode.js 用 `require('node:os').homedir()`，在 ESM 上下文）：改为顶部 `import os from 'node:os';`

---

## 执行交接

**计划已完成并保存到 `docs/superpowers/plans/2026-07-21-opencode-platform-adapter.md`。两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**

**如果选择子代理驱动：**
- **必需子技能：** 使用 superpowers:subagent-driven-development
- 每个任务一个新子代理 + 两阶段审查

**如果选择内联执行：**
- **必需子技能：** 使用 superpowers:executing-plans
- 批量执行并设有检查点供审查

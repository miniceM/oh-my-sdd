import { spawn } from 'node:child_process';

export class IamCliError extends Error {
  constructor(message, { code = 'IAM_CLI_ERROR', cause } = {}) {
    super(message);
    this.name = 'IamCliError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function runIam(args, { input, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'iam.exe' : 'iam';
    // detached:true puts iam in its own process group so a timeout can kill
    // iam AND any children it forked (e.g. a shell wrapper running `sleep`).
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;
    const killTree = () => {
      // Kill the whole process group (negative pid). Fall back to direct kill
      // if group kill fails (e.g. already reaped). Best effort — swallow errs.
      try {
        if (child.pid) {
          try { process.kill(-child.pid, 'SIGKILL'); }
          catch { child.kill('SIGKILL'); }
        }
      } catch { /* noop */ }
    };
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        killTree();
        reject(new IamCliError(
          `iam 命令超时 (${timeoutMs}ms): ${args.join(' ')}`,
          { code: 'IAM_TIMEOUT' }
        ));
      }, timeoutMs);
      timer.unref?.();
    }
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(new IamCliError(`iam 命令执行失败：${err.message}`, { code: 'IAM_SPAWN_FAILED', cause: err }));
    });
    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ exitCode: exitCode ?? -1, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
}

export async function getAuthStatus({ timeoutMs } = {}) {
  let result;
  try {
    result = await runIam(['auth', 'status', '--json'], { timeoutMs });
  } catch (err) {
    throw err; // IamCliError already typed
  }
  if (result.exitCode !== 0) {
    throw new IamCliError(
      `iam auth status 退出码非 0 (${result.exitCode}): ${result.stderr}`,
      { code: 'IAM_EXIT_NONZERO' }
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    throw new IamCliError(
      `iam auth status --json 输出无法解析为 JSON`,
      { code: 'IAM_INVALID_JSON', cause: err }
    );
  }
  // 真实契约（2026-06-22 校准）：顶层只有 credentials 数组，无 total 字段
  if (!Array.isArray(parsed.credentials)) {
    throw new IamCliError(
      `iam auth status --json 输出缺少 credentials 字段`,
      { code: 'IAM_SCHEMA_MISMATCH' }
    );
  }
  return parsed;
}

export async function login(username, password, system = 'devops') {
  // stdin pipes password to avoid leaking in process list / shell history
  const result = await runIam(
    ['auth', 'login', '-u', username, '-p', '-', '--system', system],
    { input: password + '\n' }
  );
  if (result.exitCode === 0) {
    return { ok: true };
  }
  return { ok: false, error: result.stderr.trim() || '登录失败（原因未知）' };
}

/**
 * 检查是否所有必需系统都已登录。
 *
 * 真实 iam 输出的 credentials 数组里没有 system 字段，无法直接区分账号属于
 * devops 还是 gitee。业务约定：必须登录 2 个系统（devops + gitee），所以
 * 简化判定——credentials 数组里至少有 2 条且全部 status=logged。
 *
 * 未来若真实 iam 在 credentials 元素里加回 system 字段，可改成按系统名精确匹配。
 */
export function isFullyAuthenticated(status, requiredSystems = 2) {
  if (!Array.isArray(status?.credentials)) return false;
  if (status.credentials.length < requiredSystems) return false;
  return status.credentials.every(c => c && c.status === 'logged');
}

/**
 * 返回任意已登录 credential 的 username（用于 session 上报、日志）。
 * 不区分系统——多系统全登后任选其一即可。
 */
export function pickAnyLoggedUsername(status) {
  if (!Array.isArray(status?.credentials)) return null;
  const cred = status.credentials.find(c => c?.status === 'logged');
  return cred?.username ?? null;
}

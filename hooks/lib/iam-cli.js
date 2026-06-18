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
    result = await runIam(['auth', 'status', '-json'], { timeoutMs });
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
      `iam auth status -json 输出无法解析为 JSON`,
      { code: 'IAM_INVALID_JSON', cause: err }
    );
  }
  if (typeof parsed.total !== 'number' || !Array.isArray(parsed.credentials)) {
    throw new IamCliError(
      `iam auth status -json 输出缺少 total 或 credentials 字段`,
      { code: 'IAM_SCHEMA_MISMATCH' }
    );
  }
  return parsed;
}

export async function login(username, password) {
  // stdin pipes password to avoid leaking in process list / shell history
  const result = await runIam(
    ['login', '-u', username, '-p', '-'],
    { input: password + '\n' }
  );
  if (result.exitCode === 0) {
    return { ok: true };
  }
  return { ok: false, error: result.stderr.trim() || '登录失败（原因未知）' };
}

export function findUsernameForSystem(status, systemName) {
  if (!status?.credentials?.length) return null;
  const match = status.credentials.find(c => c.system === systemName);
  if (match?.username) return match.username;
  return status.credentials[0]?.username ?? null;
}

export function pickCredentialForSystem(status, systemName) {
  if (!status?.credentials?.length) return null;
  return status.credentials.find(c => c.system === systemName)
      ?? status.credentials[0]
      ?? null;
}

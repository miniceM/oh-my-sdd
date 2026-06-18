import { spawn } from 'node:child_process';

export class IamCliError extends Error {
  constructor(message, { code = 'IAM_CLI_ERROR', cause } = {}) {
    super(message);
    this.name = 'IamCliError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function runIam(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'iam.exe' : 'iam';
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => reject(
      new IamCliError(`iam 命令执行失败：${err.message}`, { code: 'IAM_SPAWN_FAILED', cause: err })
    ));
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? -1, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
}

export async function getAuthStatus() {
  let result;
  try {
    result = await runIam(['auth', 'status', '-json']);
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

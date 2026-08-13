#!/usr/bin/env node

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , tool = '', ...args] = process.argv;

function env(name, fallback) {
  return process.env[name] ?? fallback;
}

function iamCredentials() {
  if (env('OMS_MOCK_LOGGED_OUT', '0') === '1') return [];
  const devops = {
    username: env('OMS_MOCK_USER_DEVOPS', env('OMS_MOCK_USER', 'deepus')),
    status: 'logged',
    is_api_key_true: true,
  };
  if (env('OMS_MOCK_HALF_LOGIN', '0') === '1') return [devops];
  return [devops, {
    username: env('OMS_MOCK_USER_GITEE', env('OMS_MOCK_USER', 'gituser')),
    status: 'logged',
    is_api_key_true: false,
  }];
}

function writeError(message) {
  console.error(message);
  process.exitCode = 1;
}

function runIam(argv) {
  const [command = '', subcommand = '', ...rest] = argv;
  if (command === '--version' || command === '-v') {
    console.log('iam mock v0.2.0-dev');
    return;
  }
  if (command === 'whoami') {
    const count = iamCredentials().length;
    if (count === 0) return writeError('Not logged in');
    console.log(`Logged in systems: ${count}`);
    return;
  }
  if (command !== 'auth') return runIamHelp(command);
  if (subcommand === 'status') {
    const credentials = iamCredentials();
    if (rest[0] === '-json') console.error('⚠️  iam: -json 已废弃，请用 --json（双横线）');
    if (rest[0] === '--json' || rest[0] === '-json') {
      console.log(JSON.stringify({ credentials }));
      return;
    }
    console.log('Authentication:');
    if (credentials.length === 0) {
      console.log('  (no credentials)\n\nTotal: 0 credential(s)');
      return;
    }
    credentials.forEach((credential, index) => {
      console.log(`  ${credential.username}: ${String(index + 1).padStart(6, '0')} (logged)`);
    });
    console.log(`\nTotal: ${credentials.length} credential(s)`);
    return;
  }
  if (subcommand === 'login') return runIamLogin(rest);
  if (subcommand === 'logout') {
    console.log('Logout successful (mock)');
    return;
  }
  writeError(`iam: unknown auth subcommand '${subcommand}'\navailable: status, login, logout`);
}

function runIamLogin(argv) {
  let username = '';
  let password = '';
  let system = '';
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '-u' || argument === '--username') username = argv[++index] ?? '';
    else if (argument === '-p' || argument === '--password') password = argv[++index] ?? '';
    else if (argument === '--system') system = argv[++index] ?? '';
  }
  if (password === '-') password = readFileSync(0, 'utf8').trim();
  if (!username || !password) return writeError('iam: missing username or password');
  if (!system) return writeError('iam: --system is required (devops|gitee)');
  if (!['devops', 'gitee'].includes(system)) {
    return writeError(`iam: unknown system '${system}' (expected: devops|gitee)`);
  }
  if (env('OMS_MOCK_FAIL_LOGIN', '0') === '1') return writeError('Invalid username or password');
  console.log(`Login successful (${system}, mock)`);
}

function runIamHelp(command) {
  if (command && command !== '-h' && command !== '--help') return writeError(`iam mock: unknown command '${command}'`);
  console.log(`iam mock v0.2.0-dev — 对齐企业真实契约

支持命令：
  iam --version
  iam auth status [--json]
  iam auth login -u <user> -p <pass|-> --system <devops|gitee>
  iam auth logout
  iam whoami`);
}

function dopLog(message) {
  const logPath = env('OMS_MOCK_DOP_LOG', `${env('HOME', env('USERPROFILE', '.'))}/.oh-my-sdd/logs/mock-dop.log`);
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Logging must not hide mock command behavior.
  }
}

function changeList(user) {
  return { user, total: 2, changes: [
    { id: 'ARD123456', title: '用户测试demo', status: 'open', type: 'feature' },
    { id: 'ARD222222', title: '信用卡积分兑换功能', status: 'open', type: 'feature' },
  ] };
}

function changeView(id, user) {
  const common = { id, status: 'open', type: 'feature', owner: user };
  if (id === 'ARD123456') return {
    ...common,
    title: '用户测试demo',
    description: '用户测试 demo - 用于验证 oh-my-sdd 端到端流程',
    acceptance_criteria: ['可以走完 SDD 5 环流程', 'openspec/specs/ 被 archive merge 更新', 'gh issue + PR 自动关联'],
    created_at: '2026-06-20T00:00:00Z',
    sub_systems: [{ code: 'ARD.ard-sdk', name: '智能研发平台.AI原生框架套件' }],
    user_stories: [{ id: 'c7fe4770a27841a48dd26d20c49da8b', code: 'US-95376', title: '用户测试 demo 故事', type: '主动故事', state: '正常', stage: '已上线', team: '统一开发平台', assignee: user, business_owner: user, release_info: { release_num: 'R20260620001', release_name: '用户测试 demo 排期', release_date: '2026-06-25T00:00:00Z', release_stage: '投产实施' } }],
  };
  if (id === 'ARD222222') return {
    ...common,
    title: '信用卡积分兑换功能',
    description: '用户可以使用信用卡积分兑换商品/服务',
    acceptance_criteria: ['用户在 app 看到积分余额', '可选择商品兑换', '兑换成功后扣减积分'],
    created_at: '2026-06-20T00:00:00Z',
    sub_systems: [{ code: 'CARD.points-mall', name: '信用卡中心.积分商城子系统' }],
    user_stories: [
      { id: 'a1b2c3d4e5f6789012345abcdef67890', code: 'US-10001', title: '积分余额查询', type: '主动故事', state: '正常', stage: '已上线', team: '信用卡中心', assignee: user, business_owner: user, release_info: null },
      { id: 'b2c3d4e5f6789012345abcdef67890a', code: 'US-10002', title: '积分兑换商品', type: '主动故事', state: '正常', stage: '已上线', team: '信用卡中心', assignee: user, business_owner: user, release_info: { release_num: 'R20260620002', release_name: '积分商城首期上线', release_date: '2026-07-10T00:00:00Z', release_stage: '投产实施' } },
    ],
  };
  return null;
}

async function runDop(argv) {
  const remaining = [];
  let endpoint = 'http://10.182.35.66';
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--endpoint') endpoint = argv[++index] ?? endpoint;
    else if (argument.startsWith('--endpoint=')) endpoint = argument.slice('--endpoint='.length);
    else if (argument === '-j' || argument === '--json') json = true;
    else remaining.push(argument);
  }
  const command = remaining[0] ?? '';
  const subcommand = remaining[1] ?? '';
  const user = env('OMS_MOCK_DOP_USER', 'alice');
  if (command !== 'change') return dopHelp(command);
  await dopLog(`change ${subcommand} (endpoint=${endpoint} json=${json ? 1 : 0})`);
  if (env('OMS_MOCK_DOP_FAIL_GET', '0') === '1' && ['list', 'view'].includes(subcommand)) return writeError('❌ dop change request failed (forced)');
  if (subcommand === 'list') return console.log(JSON.stringify(changeList(user), null, 2));
  if (subcommand === 'view') {
    const value = changeView(remaining[2] ?? '', user);
    if (!value) return writeError(`❌ Change not found: ${remaining[2] ?? ''}`);
    return console.log(JSON.stringify(value, null, 2));
  }
  if (subcommand === 'create') {
    if (env('OMS_MOCK_DOP_FAIL_UPDATE', '0') === '1') return writeError('❌ dop change create failed (forced)');
    return console.log(JSON.stringify({ id: `ARD${Math.floor(100000 + Math.random() * 899999)}`, status: 'open', type: 'feature', owner: user, created_at: new Date().toISOString() }, null, 2));
  }
  if (subcommand === 'update') return writeError('❌ dop change update 不存在。\n真实 dop CLI 只有 create / list / view 三个子命令。');
  return dopHelp(subcommand);
}

function dopHelp(command) {
  if (command && !['-h', '--help'].includes(command)) return writeError(`Error: unknown command "dop change ${command}"`);
  console.log('dop mock CLI v0.2.0-dev — 对齐企业真实契约\n\nUsage:\n  dop change [create|list|view]\n\nGlobal Flags:\n  --endpoint string\n  -j, --json');
}

if (tool === 'iam') runIam(args);
else if (tool === 'dop') await runDop(args);
else writeError(`unknown mock CLI: ${tool}`);

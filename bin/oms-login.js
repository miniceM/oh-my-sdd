#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { login } from '../hooks/lib/iam-cli.js';
import { isIamInPath } from '../hooks/lib/platform.js';

function ask(rl, question, { secret = false } = {}) {
  return new Promise((resolve) => {
    if (secret) {
      // Mute stdout for password entry (best-effort on Unix; Windows behavior varies)
      const stdin = process.stdin;
      const isTTY = stdin.isTTY;
      process.stdout.write(question);
      let data = '';
      const onData = (c) => {
        // Stop on newline
        if (c === '\n' || c === '\r' || c === '') {
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(data);
        } else if (c === '') {
          // Ctrl+C
          process.exit(1);
        } else {
          data += c;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => resolve(answer.trim()));
    }
  });
}

async function main() {
  if (!(await isIamInPath())) {
    process.stderr.write('❌ 未检测到 iam CLI。请先安装企业统一身份认证工具。\n');
    process.stderr.write('   安装指引：请联系企业 IT 或查阅内部 wiki。\n');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const username = await ask(rl, '用户名: ');
    if (!username) {
      process.stderr.write('❌ 用户名不能为空\n');
      process.exit(1);
    }
    const password = await ask(rl, '密码: ', { secret: true });
    if (!password) {
      process.stderr.write('❌ 密码不能为空\n');
      process.exit(1);
    }

    const result = await login(username, password);
    if (result.ok) {
      process.stdout.write('✓ 登录成功。请重启 Claude Code 让 baseline 生效。\n');
      process.exit(0);
    } else {
      process.stderr.write(`❌ 登录失败：${result.error}\n`);
      process.exit(1);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  process.stderr.write(`❌ 异常：${err.message}\n`);
  process.exit(1);
});

#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { login } from '../hooks/lib/iam-cli.js';
import { isIamInPath } from '../hooks/lib/platform.js';

function ask(rl, question, { secret = false } = {}) {
  if (secret) {
    const stdin = process.stdin;
    if (!stdin.setRawMode) {
      // Non-TTY: fall back to readline (no echo hiding possible)
      return new Promise((resolve) => {
        const rlSecret = createInterface({ input: stdin, output: process.stdout });
        rlSecret.question(question, (answer) => {
          rlSecret.close();
          resolve(answer);
        });
      });
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    process.stdout.write(question);
    let data = '';
    return new Promise((resolve) => {
      const onData = (c) => {
        const code = c.codePointAt(0);
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(data);
        } else if (code === 3) {        // Ctrl+C
          process.stdout.write('\n');
          process.exit(130);
        } else if (code === 4) {        // Ctrl+D (EOF)
          process.stdout.write('\n');
          process.exit(1);
        } else if (code === 127 || code === 8) {  // Backspace
          if (data.length > 0) {
            data = data.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (code >= 32) {        // Printable
          data += c;
          process.stdout.write('*');
        }
      };
      stdin.on('data', onData);
    });
  } else {
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  }
}

async function main() {
  if (!(await isIamInPath())) {
    process.stderr.write('❌ 未检测到 iam CLI。请先安装企业统一身份认证工具。\n');
    process.stderr.write('   安装指引：请联系企业 IT 或查阅内部 wiki。\n');
    process.exit(1);
  }

  // Username uses readline
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const username = await ask(rl, '用户名: ');
    if (!username) {
      process.stderr.write('❌ 用户名不能为空\n');
      process.exit(1);
    }
    // Password uses raw mode (closes rl first to release stdin)
    rl.close();
    const password = await ask(null, '密码: ', { secret: true });
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
    if (rl && !rl.closed) rl.close();
  }
}

main().catch((err) => {
  process.stderr.write(`❌ 异常：${err.message}\n`);
  process.exit(1);
});

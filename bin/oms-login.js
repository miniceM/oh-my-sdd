#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { login } from '../hooks/lib/iam-cli.js';
import { isIamInPath } from '../hooks/lib/platform.js';
import { printWelcome } from './oms-welcome.js';

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

    // Q4 决策：oms-login 自动登录 devops + gitee 两个系统，不让用户选
    // Q3 决策：两个都必须登录，否则下次 session-start 会 NEED_LOGIN
    const systems = [
      { name: 'devops', critical: true  },
      { name: 'gitee',  critical: false },
    ];
    const failures = [];
    for (const sys of systems) {
      const result = await login(username, password, sys.name);
      if (result.ok) {
        process.stdout.write(`✓ ${sys.name} 系统登录成功\n`);
      } else if (sys.critical) {
        process.stderr.write(`❌ ${sys.name} 登录失败：${result.error}\n`);
        process.exit(1);
      } else {
        process.stderr.write(`⚠️  ${sys.name} 登录失败：${result.error}（devops 已登，可继续；gitee 失败会在下次启动时提示重登）\n`);
        failures.push(sys.name);
      }
    }

    if (failures.length === 0) {
      process.stdout.write('\n✓ 全部系统登录成功。\n\n');
    } else {
      process.stdout.write(`\n⚠️  以下系统待重登：${failures.join(', ')}\n\n`);
    }
    // 显示欢迎页（含版本、特性、Quick start、CTA）
    printWelcome({ username });
    process.exit(0);
  } finally {
    if (rl && !rl.closed) rl.close();
  }
}

main().catch((err) => {
  process.stderr.write(`❌ 异常：${err.message}\n`);
  process.exit(1);
});

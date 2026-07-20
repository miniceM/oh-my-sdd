import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
// 两种合法安装布局（向下兼容）：
//   A. 旧布局：.../plugins/oh-my-sdd/plugin.js + .../plugins/oh-my-sdd/hooks/
//   B. 新布局：.../plugins/oh-my-sdd/dist/plugin.js + .../plugins/oh-my-sdd/hooks/
// 探针：先看 hooks/ 是不是和 plugin.js 同级；不是就回退到上级目录
const SIBLING_HOOKS = join(__dirname, 'hooks', 'pre-tool-use.js');
const HOOKS_DIR = existsSync(SIBLING_HOOKS)
    ? join(__dirname, 'hooks')
    : join(__dirname, '..', 'hooks');
// PLUGIN_ROOT 是 hooks/ 的父目录，供 CLAUDE_PLUGIN_ROOT 注入（hooks 内部用它定位资源）
const PLUGIN_ROOT = join(HOOKS_DIR, '..');
export { HOOKS_DIR, PLUGIN_ROOT };

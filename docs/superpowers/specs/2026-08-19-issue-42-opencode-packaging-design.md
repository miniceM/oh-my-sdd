# Issue 42: OpenCode 打包与 CI 契约设计

## 背景

OpenCode 当前把资源同步和 TypeScript 编译都挂在 `prepack` 上。源码 checkout 在 `opencode/node_modules` 已预热时可以通过，但干净环境直接执行 `npm pack` 会因缺少 `devDependencies` 而在 `tsc` 阶段失败。历史修复已经统一了 `npm pack --json` 的噪声解析、stderr 诊断和 Windows mock 行为，本变更只补齐构建门禁与真实发布包验证。

## 目标

让 CI 在发布或真机验证前，完整覆盖以下契约：

1. OpenCode TypeScript 源码能在明确安装依赖后构建。
2. 构建后的包能在生命周期脚本开启、输出不静默的条件下打包。
3. 只有 tarball 被安装到隔离 HOME、prefix 和 cache 中，安装结果能被真实 OpenCode E2E 验证。
4. Windows CI 不依赖 Git Bash/WSL，并保留失败 stdout、stderr、Node/npm 版本和阶段信息。

## 方案

### 生命周期边界

- `prepack` 只执行 `sync:resources`，资源同步不依赖 TypeScript/devDependencies，避免 `npm pack` 在干净包目录中隐式构建。
- `prepublishOnly` 保留 `sync:resources && build`，发布前仍强制生成最新 `dist`。
- CI 在测试和 OpenCode E2E 打包前显式执行 `npm run --prefix opencode build`，构建失败直接阻断流水线。

这样“源码构建失败”和“发布 tarball 安装失败”分别在对应门禁暴露，而不是由 `npm pack` 的生命周期副作用混在一起。

### CI 分层

普通 CI 的 Node 18/20/22 × Linux/macOS/Windows 矩阵执行：

```text
npm ci --ignore-scripts
npm ci --prefix opencode --ignore-scripts
npm run --prefix opencode build
npm test
npm run lint:baseline
```

OpenCode E2E 在三平台 Node 22 上执行：

```text
npm ci --ignore-scripts
npm ci --prefix opencode --ignore-scripts
npm run --prefix opencode build
npm run sync:resources --prefix opencode
pack with lifecycle scripts enabled and without --silent
install only the generated tarball into an isolated prefix
run the real CLI and uninstall flow
```

测试代码不再在 E2E 过程中偷偷执行 `npm ci`；依赖安装和构建由 workflow 显式负责。

### 回归验证

- `opencode/package.json` contract test 锁定 `prepack`、`prepublishOnly` 和 build script 的职责。
- CI contract test 锁定普通 CI 与 OpenCode E2E 都执行显式构建。
- 打包安装测试继续使用共享 manifest parser，并传递 stdout/stderr；主路径不使用 `--silent` 或 `--ignore-scripts`。
- 增加一个 clean package contract，验证生成的 tarball 不依赖 `opencode/node_modules`、源码目录或根项目 HOME。

## 非目标

- 不改变 OpenCode runtime hook、资源 ownership、命令解析或卸载语义。
- 不把根项目改造成 npm workspace。
- 不将 devDependencies 复制到发布 tarball。
- 不删除已在主线合并的 Issue 31 Windows/npm pack 修复。

## 验收标准

- [ ] `opencode` 显式 build 在 Node 18/20/22 上通过，失败时 CI 直接停止。
- [ ] `npm pack` 不因缺少 `opencode/node_modules` 而触发隐式 TypeScript 编译失败。
- [ ] 普通 pack、并发 pack、tarball install 和真实 OpenCode E2E 均通过。
- [ ] Windows 主路径不依赖 Bash，并保留完整失败诊断。
- [ ] `npm test`、coverage、baseline lint 和 `git diff --check` 通过。

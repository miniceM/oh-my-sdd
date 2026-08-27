# 中原银行前端 SDK项目 开发指南

面向基于 `@zyfp-dcjs/cli-service` 构建的通用 SDK / 组件库项目。

## 项目定位

- 产物类型：NPM SDK、工具库或 Vue 组件库。
- 构建入口：`src/main.ts`。
- 构建配置：`sirius.config.js`，使用 `defineConfig`。
- 输出格式：优先同时产出 `umd` 与 `es`，兼容浏览器直引和模块化引用。

## 创建工程

```bash
# 创建SDK工程
sirius create <projectName> --preset <ViteLibrary|Vue3+ViteLibrary|Vue2+ViteLibrary>

# 本地开发/预览
cd <projectName>
npm run serve

# 构建
npm run build
```

## 常用命令

```bash
yarn
npm run serve
npm run build
npm run lint
npm publish
```

## 推荐目录

```text
src/
  main.ts        # SDK 入口，导出 install/version/API
  *.vue          # Vue 组件项目可放组件实现
types/           # 类型声明
sirius.config.js # cli-service 配置
package.json     # 包信息、入口、发布配置
```

## package.json 约定

- `scripts` 使用 `sirius-service`：`serve`、`build`、`lint`。
- `main` 指向 UMD 产物，如 `dist/<name>.umd.js`。
- `exports` 同时声明 `require` 与 `import` 入口。
- `files` 至少包含 `dist`、`src`、`types`。
- 包名使用团队私有前缀，推荐连字符命名，如 `@zyfp-dcjs/example-sdk`。
- 发布内网包时配置 `publishConfig.registry`。

## sirius.config.js 约定

```js
const { defineConfig } = require('@zyfp-dcjs/cli-service');

module.exports = defineConfig({
  lib: {
    format: ['umd', 'es'],
    libName: 'exampleSdk',
    entry: 'src/main.ts',
  },
  configureVite: {
    build: {
      rollupOptions: {
        external: [],
      },
    },
  },
});
```

- `libName` 使用驼峰，作为 UMD 全局变量名。
- `entry` 固定指向 SDK 统一出口。
- 不应打入业务宿主已提供的大依赖；放入 `external`。
- 如依赖 Vue、宿主桥、公共运行时，优先 external 化。

## 入口开发规范

```ts
import { version } from '../package.json';

const install = (app: any) => {
  // Vue 组件库在这里注册组件；纯 SDK 可省略 install。
};

export default { install, version };
export { version };
```

- 对外 API 必须从 `src/main.ts` 统一导出。
- 保持默认导出可用，命名导出清晰稳定。
- 新增能力同步补充类型声明。
- 避免在模块顶层执行有副作用的业务逻辑。

## TypeScript 与代码风格

- 开启严格类型，避免无意义 `any`。
- 公共 API 参数、返回值必须显式声明类型。
- 代码提交前执行 `npm run lint` 与 `npm run build`。
- 保持实现小而稳定，不引入与 SDK 无关的业务代码。

## 依赖原则

- 运行时必需依赖放 `dependencies`。
- 构建、Lint、类型、测试工具放 `devDependencies`。
- 宿主环境注入或消费者已安装的依赖，配置为 `peerDependencies` 或 `external`。
- 不在 SDK 内硬编码环境地址、账号、密钥。

## 发布检查

1. 确认版本号已更新。
2. 执行 `npm run lint`。
3. 执行 `npm run build`。
4. 检查 `dist`、`types`、`exports` 是否匹配。
5. `npm login` 后执行 `npm publish`。

## AI 协作要求

- 修改前先确认入口、构建配置和发布字段。
- 只做与 SDK 能力相关的最小变更。
- 涉及公共 API 变更时，说明兼容性影响。
- 不确定宿主注入依赖时，优先询问，不擅自打包进产物。

---
name: fe-sdk
description: 本 skill 在用户说"发 SDK"/"写组件库"/"配 UMD/ES 输出"/"改 sirius.config.js lib"/"npm publish 内网包"或开发基于 @zyfp-dcjs/cli-service 的 NPM SDK/工具库/Vue 组件库时使用。
---

# 前端 SDK / 组件库 Skill

面向中原银行前端开发者，基于 `@zyfp-dcjs/cli-service` 构建的通用 SDK、工具库或 Vue 组件库项目。

## 项目识别

触发本 skill 的项目特征（满足任一即可）：

- `sirius.config.js` 含 `lib: { format: ['umd', 'es'], libName, entry }`
- `package.json` 的 `main` 指向 `dist/<name>.umd.js`
- `package.json` 的 `exports` 同时声明 `require` 和 `import`
- 构建命令 `npm run build`（基于 `sirius-service`）
- 创建命令 `sirius create <name> --preset ViteLibrary|Vue3+ViteLibrary|Vue2+ViteLibrary`

## 核心规则（无需 Read resources 也必须遵守）

- **统一从 `src/main.ts` 导出**——禁止从子路径深导入（破坏 tree-shaking）
- **输出 umd + es 双格式**——兼容浏览器直引和模块化
- **`libName` 用驼峰**——作为 UMD 全局变量名（如 `exampleSdk`）
- **宿主已提供的大依赖必须 external**——Vue、宿主桥、公共运行时不打入产物
- **`dependencies` vs `devDependencies` vs `peerDependencies` 严格分**：
  - `dependencies`: 运行时必需
  - `devDependencies`: 构建/Lint/类型/测试工具
  - `peerDependencies`: 宿主环境注入或消费者已安装
- **公共 API 必须显式类型**——参数、返回值禁用 `any`
- **不在模块顶层执行有副作用的业务逻辑**——副作用放函数内
- **禁止硬编码环境地址、账号、密钥**——从配置或宿主注入
- **`npm publish` 前必跑**：`npm run lint` + `npm run build` + 检查 `dist/types/exports`

## 加载决策

| 任务 | Read 这个 resource |
|------|------------------|
| 完整开发约定（项目结构、package.json 字段、sirius.config.js、入口开发、TS 风格、发布检查） | `resources/dev-guide.md` |

## 何时不应使用

- 业务项目（小程序 → `fe-miniapp`；后管 → `fe-oca`）
- 动态化素材（→ `fe-material`）
- 应用级 npm 包（带完整业务逻辑）——本项目类型是"工具库/组件库"，不是业务应用

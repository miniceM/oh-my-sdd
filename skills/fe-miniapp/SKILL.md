---
name: fe-miniapp
description: 本 skill 在用户说"做小程序"/"写 Sirius"/"改 sirius-bridge"/"互联互通"/"条件编译 SIRIUS-APP"或在 `sirius.config.js` + `@zyfp-dcjs/siriusBridge` 项目中开发时使用。涵盖 Sirius 混合应用小程序 + 互联互通双端开发。
---

# 前端小程序 Skill（Sirius）

面向中原银行前端开发者，在 H5 小程序（Sirius 框架）项目中使用。

## 项目识别

触发本 skill 的项目特征（满足任一即可）：

- `package.json` 含 `@zyfp-dcjs/sirius-ui` 或 `@zyfp-dcjs/siriusBridge`
- 含 `sirius.config.js` + `env/.u8` / `env/.production`
- 代码中出现 `#ifdef SIRIUS-APP` / `#ifdef SIRIUS-WEB` 条件编译
- 使用 `npm run bale`（小程序构建）或 `npm run build --mode=web.*`（互联互通）

## 核心规则（无需 Read resources 也必须遵守）

- **环境变量必须以 `SIRIUS_APP_` 开头**才会注入客户端（`SIRIUS_APP_BASE_URL=...`，使用 `window.SIRIUS_APP_BASE_URL`）
- **小程序包体积 ≤ 5MB**——压缩图片、按需引入组件、代码分割
- **`onUnload` 必须清理资源**——定时器、事件监听、订阅
- **原生能力调用前必须 `canUse(api)`**——避免在不支持的环境崩溃
- **条件编译用 `#ifdef SIRIUS-APP` / `SIRIUS-WEB`**——禁止运行时 `if` 判断多端
- **组件按需引入**：`import { SiriusButton } from '@zyfp-dcjs/sirius-ui'`——禁止全量引入
- **异步 API 必须 try-catch 或 .catch**——提供用户友好提示，不让回调静默失败

## 加载决策

| 任务 | Read 这个 resource |
|------|------------------|
| 完整开发流程（创建项目、UI 组件、原生 API、构建配置、条件编译） | `resources/dev-guide.md` |

## 何时不应使用

- 后管项目（Vue + Element Plus/Element）→ `fe-oca` skill
- NPM SDK / 组件库开发 → `fe-sdk` skill
- 动态化素材（Render.vue + editor.ts）→ `fe-material` skill
- 非 Sirius 框架的 H5（通用 Web）→ 通用前端规范

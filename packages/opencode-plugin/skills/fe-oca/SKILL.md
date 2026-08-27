---
name: fe-oca
description: 本 skill 在用户说"做后管"/"写 OCA"/"改 Element 组件"/"加动态路由"/"配权限 funcId"或在 OCA 框架（@zyfp/oca3-app / @zyfp/element / Walle CLI）项目中开发时使用。覆盖 Vue 2 (OCA2) 和 Vue 3 (OCA3) 双栈。
---

# 前端 OCA 后管 Skill

面向中原银行前端开发者，在 OCA（Organization Menu Control Point Authorization）框架项目中使用。

## 项目识别

触发本 skill 的项目特征（满足任一即可）：

- `package.json` 含 `@zyfp/oca3-app` / `@zyfp/oca3-store` / `@zyfp/oca3-router`（Vue 3）
- 含 `@zyfp/element` / `@zyfp/walle` / `@zyfp/feedback`（Vue 2）
- 构建命令是 `wl dev` / `wl prod sit/u8/u6`（Walle CLI）或 `yarn serve`（Sirius CLI）
- 路由含 `meta.funcId` + 权限守卫 `permission.js`
- 多场景路由：`/team/*` / `/projects/*` / `/cockpit/*` / `/channel/*`

## Vue 2 vs Vue 3 关键差异（先识别再写代码）

| 维度 | Vue 3 (OCA3) | Vue 2 (OCA2) |
|------|-------------|--------------|
| 构建 | Vite (sirius-service) | Walle CLI (Webpack) |
| 语言 | TypeScript | JavaScript |
| UI 库 | Element Plus | `@zyfp/element`（定制版 Element UI） |
| 状态 | Pinia（`@zyfp/oca3-store`，自动注册） | Vuex 3.6（命名空间模块） |
| 路由 | Vue Router 4 + 自动导入 | Vue Router 3.6 + 动态路由 + `constantRoutes` |
| API | `npx sirius gen` 自动生成 | 手写 `src/api/<module>.js` |
| 登录 | 标准化 | SSO/STD/LRC/LRCB 多模式 |

**识别错误会导致用错 API**（比如 Vue 2 项目用 `defineStore` 会报错）。

## 核心规则（无需 Read resources 也必须遵守）

- **提交格式**：`[变更号]类型: 描述`（如 `[ZFE319059]feat: 添加用户认证功能`）
- **禁止打印隐私信息**——phone、card、身份证、token 不入日志
- **禁止前端硬编码密码、AK/SK**——从后端换取或走 KMS
- **async/await 必须 try-catch**——禁止裸 await
- **入参必须合法性校验**——schema 校验（zod/joi）或手写 guard
- **防重复提交**——关键写接口加 debounce 或 token 机制
- **静态资源走 CDN**——不打包大文件
- **页面缓存基于 `name`**——每个 `.vue` 必须有唯一 `name` 属性（Vue 2 最大 10 页）
- **权限分两层**：路由级 `meta.funcId` + 操作级 `ctrls`（来自 `store.state.permission`）

## 加载决策

| 任务 | Read 这个 resource |
|------|------------------|
| 完整开发指南（Vue2/3 项目结构、开发命令、代理配置、代码规范、常见任务、故障排除） | `resources/dev-guide.md` |

## 何时不应使用

- 小程序（Sirius）→ `fe-miniapp` skill
- NPM SDK / 组件库 → `fe-sdk` skill
- 动态化素材 → `fe-material` skill
- 通用 Vue 最佳实践（非 OCA 框架）→ 用 Vue 官方文档

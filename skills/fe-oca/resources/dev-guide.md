# 中原银行 OCA 项目开发极简指南

本指南覆盖 OCA (Organization Menu Control Point Authorization) 框架的 Vue 2/Vue 3 项目开发核心知识。

---

## 技能体系

### 核心技能

| 技能 | 用途 | 触发场景 |
|------|------|---------|
| `zfe-oca-dev` | OCA 工程开发 | 项目创建、组件库使用、小程序开发 |
| `zfe-code-change-check` | 代码质量检查 | 提交前/PR 前自动检查 |
| `zfe-code-change-commit` | 代码提交 | 自动提交和推送代码 |
| `sirius-cli` | 项目创建 | 创建 OCA/Sirius 项目 |
| `sirius-builder` | 构建配置 | 环境管理、构建优化 |
| `vue-best-practices` | Vue 3 最佳实践 | Composition API、TypeScript |
| `vue-options-api-best-practices` | Vue 2 最佳实践 | Options API 风格 |

---

## 技术栈对比

### Vue 3 (OCA3)
```
框架: Vue 3.4
语言: TypeScript
构建: Vite (sirius-service)
UI: Element Plus
状态: Pinia
路由: Vue Router 4
特性: 自动导入、微前端、API治理集成
```

### Vue 2 (OCA2)
```
框架: Vue 2.7
语言: JavaScript
构建: Walle CLI (Webpack) + Vite 兼容
UI: @zyfp/element (定制版 Element UI)
状态: Vuex 3.6
路由: Vue Router 3.6
特性: 多场景架构、动态路由、页面缓存
```

**关键差异**：Vue 3 用 Pinia + 自动导入；Vue 2 用 Vuex + 动态路由 + 多场景（team/projects/cockpit/channel）

---

## 项目结构

### Vue 3
```
src/
├── api/          # 自动生成的 API
├── assets/       # 静态资源
├── components/   # 全局组件
├── layouts/      # 布局模板 (Header + Slider)
├── router/       # 路由配置
├── store/modules/# Pinia stores
├── utils/        # 工具函数
├── views/        # 页面组件
└── setting.ts    # 全局配置
```

### Vue 2
```
src/
├── api/                    # API 接口（按模块）
├── components/             # 公共组件
├── router/modules/         # 路由模块（自动加载）
├── store/modules/          # Vuex 模块
│   ├── user.js            # 用户信息
│   ├── permission.js      # 权限控制（核心）
│   └── tagsView.js        # 标签页缓存
├── views/                  # 页面组件
├── permission.js           # 路由守卫
├── settings/               # 应用配置
└── mock/                   # Mock 数据
```

---

## 开发环境配置

### 前置条件
- Node.js LTS
- Yarn 或 npm
- Git 环境

### 安装依赖
```bash
yarn install
# 或
npm install
```

### 开发命令

**Vue 3:**
```bash
yarn serve              # 开发服务器 (http://localhost:8080)
yarn build              # 生产构建
yarn lint               # 代码检查
yarn lint:fix           # 自动修复
npx sirius gen          # 重新生成 API
```

**Vue 2:**
```bash
wl dev                  # 开发服务器
wl prod sit/u8/u6       # 环境构建
yarn lint               # 代码检查
yarn prettier           # 代码格式化
```

### 代理配置

**Vue 3** (`sirius.config.js`):
```javascript
proxy: {
  '/test': { target: 'http://40.20.54.170:18600/', changeOrigin: true }
}
```

**Vue 2** (`walle.config.js`):
```javascript
proxy: {
  '/test': { target: '后端API服务', changeOrigin: true },
  '/test/mock': { target: 'Mock服务', changeOrigin: true }
}
```

### 环境变量

**Vue 3**: `env/.development.ini` → `process.env.SIRIUS_APP_*`  
**Vue 2**: `LOGIC_SYS`、`BASE_URL`、`NODE_ENV`、`WALLE_BUILD_ENV`

---

## 代码规范

### 提交信息规范
```
[变更号]类型: 描述

类型: feat, fix, refactor, docs, style, test, chore, perf
示例: [ZFE319059]feat: 添加用户认证功能
```

### 强制检查项

> **红线规则**（禁止打印隐私、禁止硬编码密码/AK/SK、async/await try-catch、入参校验、防重复提交）详见 SKILL.md "核心规则"段——这里是完整 PR review 检查清单。

- ✅ ESLint 配置（`eslint-config-zyfp-base`）
- ✅ SonarQube 质量门禁
- ✅ 日志控制（测试环境有，生产环境无）
- ✅ 静态资源 CDN 加载
- ❌ 禁止本地存储用户隐私数据

### 命名规范

**Vue 3:**
- 组件：PascalCase（`HeroPanel.vue`）
- Store 模块：kebab-case
- Store ID：`ZFE_<MODULE>_STORE`
- API 函数：camelCase

**Vue 2:**
- 组件：PascalCase
- Vuex 模块：kebab-case 或 camelCase
- Store ID：`ZFE_<MODULE>_STORE`

---

## 核心概念

### Vue 3
- **自动导入**：Vue API 和 Element Plus 组件全局自动注册
- **布局系统**：固定结构（Header + Slider），通过 `@zyfp/oca3-app` 动态加载
- **Pinia**：Stores 在 `src/store/modules/`，自动注册，`import { useXXXStore } from '@zyfp/oca3-store'`
- **API 层**：`src/api/api.ts` 自动生成，运行 `npx sirius gen` 更新

### Vue 2
- **多场景**：`/team/*`、`/projects/*`、`/cockpit/*`、`/channel/*` 独立场景
- **动态路由**：`constantRoutes`（静态）+ 动态路由（权限获取）
- **权限控制**：`meta.funcId`（路由级）+ `ctrls`（操作级），`permission.js` 路由守卫
- **Vuex 模块**：`user`、`permission`、`tagsView`、`app` 及业务模块
- **登录模式**：SSO（默认）、STD、LRC/LRCB，`src/utils/auth.js` 管理
- **页面缓存**：`keep-alive` 基于 name，`cache-data.js` 配置，最大 10 页

---

## 常见开发任务

### 添加新页面

**Vue 3:**
1. 创建 `src/views/<name>/<name>.vue`
2. 使用默认布局或自定义 `src/layouts/`
3. 动态菜单自动加载或手动添加路由
4. `setting.ts` 配置缓存

**Vue 2:**
1. 创建 `src/views/<name>/<name>.vue`
2. 在 `src/router/modules/` 或 `constantRoutes` 添加路由
3. 设置 `meta.funcId` 用于权限
4. `src/utils/cache-data.js` 的 `cacheName` 数组添加页面 name

### 添加新 API

**Vue 3:** 修改后端接口后运行 `npx sirius gen`（需配置 `apiGen.config.js` 项目编号）

**Vue 2:** 在 `src/api/` 对应模块添加函数，使用统一 `request` 封装

### 添加新 Store

**Vue 3 (Pinia):** `src/store/modules/` 创建文件，`defineStore` 定义，自动注册

**Vue 2 (Vuex):** `src/store/modules/` 创建模块，`index.js` 自动加载，使用命名空间

---

## 故障排除速查

### Vue 3
- **Lint 错误**: `yarn lint:fix`（部分规则在 `.eslintrc.js` 禁用）
- **类型错误**: 检查 `tsconfig.json` 路径配置，`@` 指向 `src/`
- **菜单未更新**: 检查 `@zyfp/oca3-router` 和权限 store
- **API 变更**: `npx sirius gen` 重新生成
- **端口占用**: 修改 `sirius.config.js` 或环境变量

### Vue 2
- **双构建配置**: `walle.config.js` 和 `sirius.config.js` 需同步修改
- **路由重复**: 切换场景时调用 `delAllRoutes` 清理
- **SSO 登录**: 流程复杂，修改需谨慎测试
- **页面缓存**: 确保每个页面有唯一 `name` 属性
- **Mock 数据**: `mock/mock-server.js`，通过 `settings.mock` 控制

### 调试技巧

**Vue 2 状态检查:**
```javascript
store.state.permission.currentType      // 当前场景
store.state.permission.currentMenu     // 当前菜单
store.state.permission.ctrls           // 所有控制点
store.state.user                        // 用户信息
auth.getToken() / auth.getTeamID()     // 认证信息
```

---

## 文档资源

### 内部文档
- 完整文档库: http://mdp.zybank.com.cn/
- OCA 文档: http://wiki.tech.zyb/zyfp-docs/oca/
- Sirius 文档: http://10.102.47.152/sirius-h5/guide/
- Walle 构建: http://10.102.20.111/walle/

### 关键依赖包
**Vue 3:** `@zyfp/oca3-app`、`@zyfp/oca3-store`、`@zyfp/oca3-router`  
**Vue 2:** `@zyfp/element`、`@zyfp/feedback`、`@zyfp/walle`

### 技术支持
- 杨朋飞-001833
- OCA 文档: http://wiki.tech.zyb/zyfp-docs/oca/

---


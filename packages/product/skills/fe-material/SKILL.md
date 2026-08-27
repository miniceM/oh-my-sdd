---
name: fe-material
description: 本 skill 在用户说"做素材"/"改 Render.vue"/"写 editor.ts"/"配 styleJsonConf"/"做动态化"或在 projects/<name>/src/Render.vue + editor.ts 结构的项目中开发时使用。覆盖 H5 聚合页素材和原生频道页素材。
---

# 前端动态化素材 Skill

面向中原银行前端开发者，基于 `@zyfp-dcjs/cli-service` 的素材模板项目。

## 项目识别

触发本 skill 的项目特征（满足任一即可）：

- 目录结构含 `projects/<projectName>/src/Render.vue` + `editor.ts`
- 创建命令 `sirius create <name> --preset Vue3+H5Material|Vue3+NativeMaterial`
- `package.json` 含 `@zyfp-dcjs/form-setter` 或 `cli-plugin-native`
- 工作内容是修改 `Render.vue` 渲染区 + `editor.ts` 侧边栏配置

## 素材类型识别（先判断再写代码）

| 类型 | 识别特征 | 容器约束 |
|------|---------|---------|
| **H5 聚合页** | `package.json` 无 `cli-plugin-native` | 标准 HTML/CSS |
| **原生频道页** | `package.json` 含 `cli-plugin-native` | 小写标签 + flex 布局 + 无 CSS 动画 |

**类型识别错误会导致原生频道页素材在客户端崩溃**（如用了 `display: block` 或 CSS 动画）。

## 核心规则（无需 Read resources 也必须遵守）

### Render.vue

- **必须用 `<script setup lang="ts">`**
- **`defineProps` 接收 3 类数据**：`styleJson`（静态样式）、`bizData`（业务数据）、`dataSrcParams`（请求参数）
- **图片资源必须 `import` 后使用**——禁止在 CSS 中写相对路径
- **Mock 数据结构与服务端响应一致**——避免联调时类型错配

### editor.ts

- **`styleJsonConf` 的 key 不加 `styleJson.` 前缀**——`title` 自动映射到 `styleJson.title`
- **优先用 `@zyfp-dcjs/form-setter` 的配置化表单**——`CustomEditor.vue` 仅在复杂交互时才写
- **setter 类型**：`input-setter` / `select-setter` / `switch-setter` 等

### 接口请求

- **从 `@zyfp-dcjs/form-setter` 导入 `request`**——不用 axios/fetch
- **URL 只写路径**——默认由平台拼接前缀
- **检查 `res.code === 0` 后再用 `res.data`**——非 0 抛错或降级

### 原生频道页额外约束（H5 聚合页不需要）

- 容器只用小写标签：`div` / `span` / `p` / `img` / `button`
- `div` 内不放文字——用 `span` / `p`
- 所有容器显式 `display: flex`——禁止 `display: block`
- 横向布局显式写 `flex-direction: row`（默认可能是 `column`）
- `img` 必须设宽高
- 禁用 CSS 动画——动画用 `<animation>` 组件
- `border` 拆成 `border-width` / `border-style` / `border-color`（禁复合属性）

## 加载决策

| 任务 | Read 这个 resource |
|------|------------------|
| 完整开发约定（工程结构、开发流程、Render.vue/editor.ts/CustomEditor.vue 规范、接口请求、原生限制、验证清单） | `resources/dev-guide.md` |

## 何时不应使用

- 业务项目（小程序 → `fe-miniapp`；后管 → `fe-oca`）
- NPM SDK / 组件库 → `fe-sdk` skill
- 普通 Vue 3 H5（非素材模板）→ 通用 Vue 规范

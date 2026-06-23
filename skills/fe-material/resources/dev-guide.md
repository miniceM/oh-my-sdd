# 中原银行前端 动态化素材项目 开发指南

基于 `@zyfp-dcjs/cli-service` 的素材模板开发约定。目标：快速理解需求、修改素材、验证可运行，避免引入不兼容写法。

## 工程结构

```text
root/
├── env/
├── projects/<projectName>/
│   ├── env/
│   ├── src/
│   │   ├── Render.vue        # 素材渲染组件
│   │   ├── editor.ts         # 侧边栏配置入口
│   │   ├── CustomEditor.vue  # 自定义编辑器，可选
│   │   ├── mock.json         # 本地 mock 数据
│   │   └── utils.ts          # 工具方法，可选
│   └── dist/
└── scripts/
```

## 常用命令

```bash
# 创建素材
sirius create <projectName> --preset <Vue3+H5Material|Vue3+NativeMaterial>

# 本地开发/预览
cd projects/<projectName>
npm run serve

# 构建
npm run build
```

## 开发流程

1. 确认目标项目：优先在 `projects/<projectName>` 下操作。
2. 判断素材类型：`package.json` 包含 `cli-plugin-native` 为原生频道页，否则为 H5 聚合页。
3. 阅读 `src/mock.json`，明确三类数据：
   - `styleJson`：静态样式/配置，可由侧边栏编辑。
   - `bizData`：接口返回业务数据，只用于渲染。
   - `dataSrcParams`：接口请求参数，可由侧边栏编辑。
4. 先整理需求：渲染区效果、编辑项、编辑项到 `styleJson/dataSrcParams` 的映射。
5. 修改 `Render.vue`、`editor.ts`，必要时增加 `CustomEditor.vue`。
6. 运行 `npm run serve`，按控制台实际 URL 验证页面。

## Render.vue 约定

- 使用 Vue3 `<script setup lang="ts">`。
- 通过 `defineProps` 接收 `styleJson`、`bizData`、`dataSrcParams`。
- Mock 数据结构应与服务端响应保持一致。
- 图片资源必须 `import` 后使用，不要在 CSS 中直接写相对路径。

```ts
const props = defineProps<{
  styleJson: Record<string, any>;
  bizData: Record<string, any>;
  dataSrcParams: Record<string, any>;
}>();
```

## editor.ts 约定

- 导出 `component` 和 `styleJsonConf`。
- 优先使用 `@zyfp-dcjs/form-setter` 的配置化表单。
- `styleJsonConf` 的 key 不要加 `styleJson.` 前缀：`title` 表示更新 `styleJson.title`。

```ts
import CustomEditor from './CustomEditor.vue';
import type { ISetterConfig } from '@zyfp-dcjs/form-setter';

const component = CustomEditor;
const styleJsonConf: ISetterConfig = {
  title: {
    label: '标题',
    setter: 'input-setter',
    options: { placeholder: '请输入标题' },
  },
};

export { component, styleJsonConf };
```

## CustomEditor.vue 约定

- 仅当 `styleJsonConf` 无法满足复杂交互/接口联动/特殊排序时使用。
- 使用 `emit('updateRenderData', { [keyPath]: value })` 更新数据。
- `styleJson` 用 `styleJson.xxx`，请求参数用 `dataSrcParams.xxx`。

```ts
const emit = defineEmits(['updateRenderData']);
const changeData = (keyPath: string, value: any) => {
  emit('updateRenderData', { [keyPath]: value });
};
```

## 接口请求

- 在编辑器中从 `@zyfp-dcjs/form-setter` 导入 `request`。
- URL 只写路径，默认由平台拼接前缀。
- 检查 `res.code === 0` 后再使用 `res.data`。

```ts
import { request } from '@zyfp-dcjs/form-setter';

request({ url: '/provider/xxx/list', method: 'post', data: {} })
  .then((res) => (res.code === 0 ? res.data : undefined));
```

## 原生频道页限制

- 容器使用小写标签：`div`、`span`、`p`、`img`、`button`。
- `div` 内不要直接放文字，使用 `span/p`。
- 所有容器显式 `display: flex`，不要使用 `display: block`。
- 默认 `flex-direction` 可能为 `column`，需要横向时显式写 `row`。
- `img` 必须设置宽高。
- 不使用 CSS 动画；动画使用 `<animation>` 组件。
- `border` 不写复合属性，拆成 `border-width/style/color`。

## 验证清单

- `npm run serve` 启动成功，无编译错误。
- 页面可打开，无控制台错误。
- 渲染效果与设计/需求一致。
- 编辑器修改后预览实时更新。
- `styleJsonConf` 路径没有重复嵌套 `styleJson.styleJson`。
- 原生频道页以截图和视觉效果为主验证，不强依赖点击测试。

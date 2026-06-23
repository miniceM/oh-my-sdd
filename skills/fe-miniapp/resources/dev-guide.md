# Sirius 小程序项目 开发指南

## 技能体系

| 技能 | 用途 | 核心功能 |
|------|------|---------|
| `sirius-cli` | 项目创建 | `sirius create`、环境管理、工程基座 |
| `sirius-ui` | UI 组件库 | 表单、按钮、弹窗、上传等 30+ 组件 |
| `sirius-bridge` | 原生能力 | 208+ API（网络、设备、支付、定位等） |
| `sirius-builder` | 构建配置 | 多环境、条件编译、性能优化 |

---

## 开发工作流

```
1. 环境准备
   └── 安装 Node.js 18+、Sirius CLI、配置内网 npm 源

2. 项目创建 (sirius-cli)
   └── sirius create <项目名> → 选 Module 类型 → 配置 appid

3. 开发 (sirius-ui + sirius-bridge)
   ├── UI 组件：按需引入 Sirius 组件
   ├── 原生 API：调用 siriusBridge 能力
   └── 条件编译：#ifdef 区分小程序/互联互通

4. 构建 (sirius-builder)
   ├── 配置 env/.u8 等环境变量
   ├── 配置 sirius.config.js
   └── npm run bale -- --mode=u8（小程序）/ npm run build -- --mode=web.u8（互联互通）

5. 部署
   └── 小程序和互联互通均通过流水线自动化部署,流水线开发人员自助对接(http://mdp.zybank.com.cn/sirius-h5/cli-service/deployment.html)
```

---

## 项目创建

### 前置条件
- Node.js 18+
- `npm install -g @zyfp-dcjs/cli`
- `npm config set registry http://npm.zyb/`

### 创建命令
```bash
sirius create myapp
# Windows Git Bash: winpty sirius.cmd create myapp
```

### 关键选择
- **项目类型**: Module（混合应用 H5）
- **技术栈**: Vue 3 + TypeScript（推荐）
- **appid**: 从后管申请（SIT/U8: http://40.20.68.22/acd-web/）

### 项目结构
```
src/pages/     # 页面
src/components/# 组件
env/           # 环境变量（.u8、.production 等）
sirius.config.js # 构建配置
```

---

## 开发核心

### UI 组件 (sirius-ui)

**安装**
```bash
npm install @zyfp-dcjs/sirius-ui@latest -S
```

**按需引入**
```vue
<script setup>
import { SiriusButton, SiriusField, SiriusUploader } from '@zyfp-dcjs/sirius-ui'
</script>

<template>
  <sirius-button type="primary">提交</sirius-button>
  <sirius-field v-model="name" label="姓名" />
  <sirius-uploader v-model="files" />
</template>
```

**最常用组件**
- `SiriusButton` - 按钮
- `SiriusField` - 输入框
- `SiriusPicker` - 选择器
- `SiriusUploader` - 上传
- `SiriusToast` - 提示
- `SiriusAlertView` - 弹窗
- `SiriusLoading` - 加载

### 原生能力 (sirius-bridge)

**安装**
```bash
npm install @zyfp-dcjs/siriusBridge -S
```

**核心 API**

| 功能 | API | 说明 |
|------|-----|------|
| 环境检测 | `getEnvironmentSync()` | 返回 'U8'、'PRODUCTION' 等 |
| 能力检测 | `canUse(api)` | 检测 API 是否可用 |
| HTTP 请求 | `request(params)` | 普通请求 |
| 加密请求 | `safeRequest(params)` | 敏感数据加密 |
| 轻提示 | `showToast(params)` | 消息提示 |
| 加载框 | `showLoading()` / `hideLoading()` | 显示/隐藏加载 |
| 确认弹窗 | `showAlertView(params)` | 返回 Promise |
| 数据存储 | `setStorage()` / `getStorageSync()` | 异步/同步 |
| 页面跳转 | `navigateTo(params)` | 跳转页面 |
| 生命周期 | `onLoad(cb)` / `onUnload(cb)` | 页面钩子 |

**使用示例**
```javascript
import { 
  getEnvironmentSync, 
  canUse, 
  request, 
  showToast,
  onLoad,
  onUnload
} from '@zyfp-dcjs/siriusBridge'

// 环境判断
const env = getEnvironmentSync()
if (env === 'PRODUCTION') { /* 生产逻辑 */ }

// 调用前检测
if (canUse('takePhoto')) {
  takePhoto({
    success: (res) => console.log(res),
    fail: (err) => console.error(err)
  })
}

// 生命周期管理
let timer = null
onLoad(() => {
  timer = setInterval(update, 5000)
})
onUnload(() => {
  clearInterval(timer)
})
```

---

## 构建配置

### 环境模式

| 模式 | 说明 | 构建命令 |
|------|------|---------|
| `development` | 开发环境 | `npm run serve` |
| `u8` | U8 测试环境 | `npm run bale -- --mode=u8` |
| `production` | 生产环境 | `npm run bale -- --mode=production` |
| `web.u8` | 互联互通 U8 | `npm run build -- --mode=web.u8` |

### 环境变量

**创建文件**: `env/.u8`、`env/.production` 等

**格式**: 必须以 `SIRIUS_APP_` 开头才会注入客户端
```env
SIRIUS_APP_BASE_URL=https://api.example.com
SIRIUS_APP_LOG_LEVEL=debug
```

**使用**: `window.SIRIUS_APP_BASE_URL`

### 条件编译

```javascript
// #ifdef SIRIUS-APP
// 小程序特有代码（调用原生能力）
import { scanCode } from '@zyfp-dcjs/siriusBridge'
// #endif

// #ifdef SIRIUS-WEB
// 互联互通特有代码（使用 axios）
import axios from 'axios'
// #endif
```

**支持标识**: `SIRIUS-APP`、`SIRIUS-WEB`、`VUE3`、`DEBUG`

### 构建命令
```bash
sirius create <name>     # 创建项目
npm run serve           # 开发调试
npm run bale -- --mode=u8   # 小程序构建
npm run build -- --mode=web.u8  # 互联互通构建
sirius upgrade          # 升级依赖
```

---

## 关键要点

1. **资源清理**: 在 `onUnload` 中清理定时器、事件监听
2. **条件编译**: 使用 `#ifdef SIRIUS-APP` / `SIRIUS-WEB` 区分多端
3. **包体积**: 小程序 zip < 5MB，需压缩图片、代码分割
4. **环境变量**: 必须以 `SIRIUS_APP_` 开头才能注入客户端
5. **按需引入**: 只引入使用的组件，减少包体积
6. **错误处理**: 所有异步 API 使用 try-catch或.catch，提供用户友好提示

---

## 快速参考

### 核心 API
```javascript
getEnvironmentSync()    // 获取环境
canUse('apiName')       // 检测能力
request({url, method})  // HTTP 请求
safeRequest({...})      // 加密请求
showToast({message})    // 提示
showLoading()/hideLoading() // 加载
showAlertView({title, message, showCancel}) // 弹窗
setStorage({key, data}) // 存储
getStorageSync({key})   // 同步读取
navigateTo({url})       // 跳转
onLoad(cb) / onUnload(cb) // 生命周期
```

## 文档资源

- **技能文档**: `skills/sirius-*` 目录
- **在线文档**: http://mdp.zybank.com.cn/sirius-h5/
- **后管系统**: http://40.20.68.22/acd-web/ (SIT)
- **技术支持**: 杨朋飞-001833

---


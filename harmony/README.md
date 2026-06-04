# Paseo HarmonyOS WebView Shell

鸿蒙 WebView 混合壳项目，提供本地资源缓存 + 在线服务回退方案。

## 项目结构

```
harmony/
├── README.md
├── AppScope/                    # 应用全局配置
│   ├── app.json5
│   └── resources/
├── build-profile.json5
├── entry/                       # 入口模块
│   ├── oh-package.json5
│   ├── build-profile.json5
│   └── src/main/
│       ├── module.json5
│       ├── ets/
│       │   ├── entryability/
│       │   │   └── EntryAbility.ets
│       │   └── pages/
│       │       └── Index.ets
│       └── resources/
│           ├── base/
│           │   ├── element/
│           │   ├── media/
│           │   └── profile/
│           └── rawfile/          # Web 资源存放位置
│               └── index.html
├── copy-web-assets.sh          # Web 资源复制脚本
└── oh-package.json5
```

## 快速开始

### 方法一：使用自动化脚本（推荐）

```bash
# 从 Paseo 项目根目录执行
cd /path/to/xiaoben-agent-code
./harmony/copy-web-assets.sh
```

脚本会自动：
1. 构建 Web 版本（如果需要）
2. 清空并复制资源到正确位置

### 方法二：手动操作

```bash
# 1. 构建 Web 版本
cd /path/to/xiaoben-agent-code
npm run build:web

# 2. 复制资源
cp -r packages/app/dist/* harmony/entry/src/main/resources/rawfile/
```

### 3. 在 DevEco Studio 中打开

打开 `harmony/` 目录，连接设备或模拟器运行即可。

## 混合方案说明

### 加载策略

1. **优先本地**：先尝试加载应用内的 Web 资源（`$rawfile/index.html`）
2. **在线回退**：本地资源不可用时，自动回退到在线服务（`https://paseo.app`）
3. **状态提示**：提供加载中、失败重试等用户体验优化

### 配置

默认在线服务地址：`https://paseo.app`

如需修改，请编辑：`entry/src/main/ets/pages/Index.ets`

```typescript
// 修改这两个常量
const ONLINE_URL = 'https://your-server.com';
const LOCAL_INDEX = 'resources/rawfile/index.html';
```

### 权限声明

- `ohos.permission.INTERNET` - 网络访问
- `ohos.permission.MICROPHONE` - 麦克风（语音输入）
- `ohos.permission.READ_MEDIA` - 媒体读取（文件上传）

## Web 功能完整性

Paseo Web 版本已支持：
- ✅ 核心聊天功能（WebSocket）
- ✅ 语音识别（Web Audio API + MediaStream）
- ✅ 语音播放（AudioContext）
- ✅ 文件上传（File API）
- ✅ 响应式布局

## 后续优化方向

- [ ] 添加版本检测和静默更新
- [ ] 添加文件下载支持
- [ ] 优化 WebView 缓存策略
- [ ] 添加深色模式适配
- [ ] 添加推送通知支持

## 参考资料

- [HarmonyOS Web 组件文档](https://developer.huawei.com/consumer/cn/doc/harmonyos-references-V5/ts-basic-components-web-V5)
- [ArkTS 开发指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/arkts-get-started-V5)

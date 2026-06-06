# Paseo 升级维护指南

本文档确保升级源码后，以下三个核心功能正常运行：

1. **Relay 服务** (relay.17ai.pro)
2. **语音识别** (本地 sherpa-onnx)
3. **桌面应用打包** (macOS/Windows)

---

## 一、Relay 服务升级

### 1.1 Relay 服务架构

```
用户 App → relay.17ai.pro → 本地 Daemon (Mac/Windows)
```

### 1.2 升级步骤

**每次升级源码后，需要执行：**

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装依赖
npm install

# 3. 构建 relay 模块
npm run build:relay

# 4. 部署到 relay.17ai.pro
# 方式一：手动部署
scp packages/relay/dist/* root@relay.17ai.pro:/path/to/relay/

# 方式二：使用部署脚本（如果有）
npm run deploy:relay
```

### 1.3 Relay 配置文件

**位置：** `packages/relay/relay-config.json`

```json
{
  "port": 443,
  "tls": {
    "cert": "/etc/ssl/relay.17ai.pro.crt",
    "key": "/etc/ssl/relay.17ai.pro.key"
  },
  "auth": {
    "enabled": true
  }
}
```

### 1.4 验证 Relay 正常运行

```bash
# 检查 relay 服务状态
ssh root@relay.17ai.pro "systemctl status paseo-relay"

# 检查日志
ssh root@relay.17ai.pro "tail -100 /var/log/paseo-relay.log"

# 测试连接
curl -v https://relay.17ai.pro/health
```

### 1.5 常见问题

| 问题       | 解决方案                      |
| ---------- | ----------------------------- |
| 连接超时   | 检查 TLS 证书是否过期         |
| 认证失败   | 检查 auth token 配置          |
| 版本不兼容 | 确保 relay 和 daemon 版本匹配 |

---

## 二、语音识别升级

### 2.1 当前配置

**环境变量（daemon 启动时）：**

```bash
PASEO_DICTATION_ENABLED=true
PASEO_DICTATION_STT_PROVIDER=local
PASEO_DICTATION_LOCAL_STT_MODEL=funasr-nano-int8
PASEO_LOCAL_MODELS_DIR=/Users/liuguanghua/.paseo/models/local-speech
PASEO_DICTATION_LANGUAGE=zh
```

### 2.2 模型文件位置

```
~/.paseo/models/local-speech/
├── funasr-nano-int8/
│   ├── model.onnx
│   └── tokens.txt
└── paraformer-zh-int8/
    ├── model.int8.onnx
    └── tokens.txt
```

### 2.3 升级语音模型

**如果需要更换模型：**

```bash
# 1. 下载新模型
cd ~/.paseo/models/local-speech
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-new-model.tar.bz2
tar xjf sherpa-onnx-new-model.tar.bz2

# 2. 更新环境变量
# 编辑 ~/Library/LaunchAgents/sh.paseo.daemon.plist
# 修改 PASEO_DICTATION_LOCAL_STT_MODEL 为新模型名称

# 3. 重启 daemon
launchctl unload ~/Library/LaunchAgents/sh.paseo.daemon.plist
launchctl load ~/Library/LaunchAgents/sh.paseo.daemon.plist
```

### 2.4 验证语音识别

```bash
# 检查 daemon 日志
cat ~/.paseo/daemon.log | grep -i "stt\|speech\|dictation"

# 测试语音识别 API
curl -X POST http://localhost:6767/api/dictation/start
```

### 2.5 sherpa-onnx 版本兼容性

**当前版本：** `sherpa-onnx-node@1.12.28`

**如果升级 sherpa-onnx-node：**

```bash
# 检查当前版本
npm list sherpa-onnx-node

# 升级到最新版本
npm update sherpa-onnx-node

# 重新构建 server 模块
npm run build:server
```

**注意：** 新版本 sherpa-onnx-node 可能需要重新下载兼容的模型文件。

---

## 三、桌面应用打包

### 3.1 打包命令

**macOS：**

```bash
npm run build:desktop
# 输出：packages/desktop/release/mac-arm64/Paseo.app
```

**Windows：**

```bash
cd packages/desktop
npx electron-builder --config electron-builder-win.yml --win --x64
# 输出：packages/desktop/release-win/Paseo-Setup-0.1.86-x64.exe
```

### 3.2 打包前检查清单

```bash
# 1. 确保所有模块已构建
npm run build:client   # protocol + client
npm run build:server   # server + cli

# 2. 确保 Web 资源已构建
cd packages/app && npm run build:web

# 3. 检查版本号
cat packages/desktop/package.json | grep version
```

### 3.3 macOS 签名问题

**如果遇到 "请与开发者联系" 错误：**

```bash
# 移除隔离属性
xattr -cr packages/desktop/release/mac-arm64/Paseo.app

# 重新签名（ad-hoc）
codesign --force --sign - --deep packages/desktop/release/mac-arm64/Paseo.app
```

### 3.4 Windows 打包注意事项

- 在 macOS 上可以打包 Windows 版本（使用 Wine 或交叉编译）
- 生成的 exe 文件在 Windows 上直接运行即可
- 不需要签名（未签名的应用 Windows 会提示风险，用户可选择继续运行）

---

## 四、完整升级流程

### 4.1 标准升级流程

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装/更新依赖
npm install

# 3. 构建所有模块
npm run build:client
npm run build:server
npm run build:relay

# 4. 部署 relay（如果 relay 有更新）
npm run deploy:relay  # 或手动部署

# 5. 重启本地 daemon
launchctl unload ~/Library/LaunchAgents/sh.paseo.daemon.plist
launchctl load ~/Library/LaunchAgents/sh.paseo.daemon.plist

# 6. 验证功能
# - 打开桌面应用测试
# - 测试语音识别
# - 测试 relay 连接
```

### 4.2 快速验证脚本

创建验证脚本 `scripts/verify-upgrade.sh`：

```bash
#!/bin/bash
echo "=== Paseo 升级验证 ==="

# 检查 daemon 状态
echo "1. Daemon 状态:"
launchctl list | grep paseo

# 检查 relay 连接
echo "2. Relay 连接:"
curl -s https://relay.17ai.pro/health || echo "Relay 连接失败"

# 检查语音模型
echo "3. 语音模型:"
ls ~/.paseo/models/local-speech/

# 检查桌面应用
echo "4. 桌面应用:"
ls packages/desktop/release/mac-arm64/Paseo.app 2>/dev/null || echo "需要重新打包"

echo "=== 验证完成 ==="
```

---

## 五、版本兼容性矩阵

| 组件             | 当前版本 | 兼容要求                     |
| ---------------- | -------- | ---------------------------- |
| Node.js          | 18.x+    | 必须                         |
| sherpa-onnx-node | 1.12.28  | 与模型匹配                   |
| Electron         | 34.x     | 与 macOS/Windows 兼容        |
| Relay Protocol   | v1       | client/daemon/relay 三方一致 |

---

## 六、故障排查

### 6.1 Relay 连接失败

```bash
# 检查 relay 服务
ssh root@relay.17ai.pro "systemctl status paseo-relay"

# 检查端口
ssh root@relay.17ai.pro "netstat -tlnp | grep 443"

# 检查证书
ssh root@relay.17ai.pro "openssl x509 -in /etc/ssl/relay.17ai.pro.crt -noout -dates"
```

### 6.2 语音识别不工作

```bash
# 检查模型文件
ls ~/.paseo/models/local-speech/funasr-nano-int8/

# 检查 daemon 日志
cat ~/.paseo/daemon.log | grep -i "stt\|error"

# 检查环境变量
launchctl print-env | grep PASEO
```

### 6.3 打包失败

```bash
# 清理并重新构建
rm -rf packages/desktop/dist
rm -rf packages/desktop/release
npm run build:desktop
```

---

## 七、自动化建议

### 7.1 CI/CD 配置

建议在 GitHub Actions 中添加：

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags:
      - "v*"

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run build:client
      - run: npm run build:server
      - run: npm run build:desktop
      - run: npx electron-builder --config electron-builder-win.yml --win --x64
      - uses: actions/upload-artifact@v3
        with:
          name: paseo-desktop
          path: |
            packages/desktop/release/
            packages/desktop/release-win/
```

### 7.2 Relay 自动部署

创建 `scripts/deploy-relay.sh`：

```bash
#!/bin/bash
RELAY_SERVER="root@relay.17ai.pro"
RELAY_PATH="/opt/paseo-relay"

echo "部署 Relay 到 $RELAY_SERVER..."
npm run build:relay
scp packages/relay/dist/* $RELAY_SERVER:$RELAY_PATH/
ssh $RELAY_SERVER "systemctl restart paseo-relay"
echo "部署完成"
```

---

**文档版本：** 1.0
**最后更新：** 2026-06-04

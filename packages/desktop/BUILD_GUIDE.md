# Paseo Desktop 打包指南 (macOS)

## 环境信息

| 项目                  | 值                    |
| --------------------- | --------------------- |
| macOS 版本            | 26.5.1 (Build 25F80)  |
| 架构                  | arm64 (Apple Silicon) |
| Electron 版本         | 42.3.3                |
| electron-builder 版本 | 26.8.1                |
| Node.js 版本          | 24.16.0               |
| 项目版本              | 0.1.91-beta.2         |

## 打包步骤

### 1. 安装依赖

```bash
cd packages/desktop
npm install
```

### 2. 安装 Electron 原生依赖

```bash
npx electron-builder install-app-deps
```

### 3. 打包 App（仅目录，不生成 DMG）

```bash
npx electron-builder --config electron-builder.yml --mac dir --publish never
```

**参数说明**：

- `--mac dir`：只生成 .app 目录，不打包 DMG
- `--publish never`：不发布到 GitHub（避免 GH_TOKEN 报错）

### 4. 重新签名（关键步骤）

没有苹果开发者账号时，electron-builder 的 ad-hoc 签名会导致 macOS 26 启动崩溃：

```
Library not loaded: @rpath/Electron Framework.framework/Electron Framework
Reason: mapping process and mapped file (non-platform) have different Team IDs
```

**必须手动统一重新签名**：

```bash
APP_PATH="packages/desktop/release/mac-arm64/Paseo.app"

# 清除扩展属性
xattr -cr "$APP_PATH"

# 签名所有动态库
find "$APP_PATH/Contents/Frameworks" -type f -name "*.dylib" -exec codesign --force --sign - {} \;

# 签名所有框架
find "$APP_PATH/Contents/Frameworks" -type d -name "*.framework" -exec codesign --force --sign - {} \;

# 签名所有 Helper
find "$APP_PATH/Contents/Frameworks" -type f -name "* Helper*" -exec codesign --force --sign - {} \;

# 最后签名整个 App
codesign --force --deep --sign - "$APP_PATH"

# 验证签名
codesign --verify --deep --strict "$APP_PATH"
```

### 5. 安装到 Applications

```bash
rm -rf /Applications/Paseo.app
cp -R packages/desktop/release/mac-arm64/Paseo.app /Applications/
```

## 打包 DMG（可选）

```bash
npx electron-builder --config electron-builder.yml --mac dmg --publish never
```

DMG 文件位置：`packages/desktop/release/Paseo-0.1.91-beta.2-arm64.dmg`

注意：DMG 安装后也需要重新签名。

## 常见问题

### 1. "请与开发者联系"崩溃

**原因**：ad-hoc 签名 Team ID 不一致，macOS 26 对签名验证更严格

**解决**：按第 4 步重新签名

### 2. "Lock file is already being held"

**原因**：之前的打包进程未完全退出

**解决**：

```bash
pkill -f electron-builder
rm -rf packages/desktop/release
```

### 3. "Cannot compute electron version"

**原因**：package.json 中 electron 版本号带 `^` 前缀

**解决**：

```bash
npm install electron@42.3.3 --save-exact
```

### 4. "read ETIMEDOUT" 下载超时

**原因**：下载 dmg-builder 或 Electron 二进制文件超时

**解决**：使用 `--mac dir` 只生成 App 目录，跳过 DMG

### 5. "GitHub Personal Access Token is not set"

**原因**：CI 环境检测触发了自动发布

**解决**：添加 `--publish never` 参数

## Electron 版本选择

| Electron 版本 | macOS 26 兼容性 | 说明                     |
| ------------- | --------------- | ------------------------ |
| 41.2.0        | 不兼容          | 原项目版本，签名验证失败 |
| 42.3.3        | 兼容            | 需要重新签名后可用       |

升级命令：

```bash
npm install electron@42.3.3 --save-exact
```

## 文件位置

| 文件     | 路径                                                   |
| -------- | ------------------------------------------------------ |
| App 目录 | packages/desktop/release/mac-arm64/Paseo.app           |
| DMG 文件 | packages/desktop/release/Paseo-0.1.91-beta.2-arm64.dmg |
| 打包配置 | packages/desktop/electron-builder.yml                  |
| 崩溃日志 | ~/Library/Logs/DiagnosticReports/Paseo-\*.ips          |

## 快速打包脚本

可创建 `packages/desktop/build-and-sign.sh`：

```bash
#!/bin/bash
set -e

# 打包
npx electron-builder --config electron-builder.yml --mac dir --publish never

# 重新签名
APP_PATH="release/mac-arm64/Paseo.app"
xattr -cr "$APP_PATH"
find "$APP_PATH/Contents/Frameworks" -type f -name "*.dylib" -exec codesign --force --sign - {} \;
find "$APP_PATH/Contents/Frameworks" -type d -name "*.framework" -exec codesign --force --sign - {} \;
find "$APP_PATH/Contents/Frameworks" -type f -name "* Helper*" -exec codesign --force --sign - {} \;
codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

echo "=== 打包签名完成 ==="
echo "App 位置: $APP_PATH"
```

---

_文档创建时间：2026-06-07_
_适用平台：macOS 26 (Apple Silicon)_

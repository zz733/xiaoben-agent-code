# 桌面端开发环境排查指南

## 问题现象

在 TRAE SOLO CN IDE 中运行 `npm run dev` 启动 Paseo 桌面端时，Electron 只显示 Dock 图标，窗口不显示。

## 根本原因

TRAE SOLO CN IDE 在环境中设置了以下两个环境变量：

| 环境变量 | 值 | 影响 |
|---------|-----|------|
| `ELECTRON_FORCE_IS_PACKAGED` | `true` | 强制 Electron 认为 app 是打包状态，`app.isPackaged` 返回 `true` |
| `CI` | `true` | Metro 以 CI 模式运行，禁用热重载 |

### `ELECTRON_FORCE_IS_PACKAGED` 的影响

Electron 源码中 `App::IsPackaged()` 的判断逻辑（`shell/browser/api/electron_api_app.cc`）：

```cpp
bool App::IsPackaged() {
  auto env = base::Environment::Create();
  if (env->HasVar("ELECTRON_FORCE_IS_PACKAGED"))
    return true;  // 直接返回 true，不检查其他条件
  // ... 后续检查 exe 文件名
}
```

当 `app.isPackaged` 为 `true` 时，Paseo 的 `main.ts` 走了生产模式分支：

```typescript
// 开发模式（isPackaged = false）
await mainWindow.loadURL(DEV_SERVER_URL);  // http://localhost:8081

// 生产模式（isPackaged = true）
await mainWindow.loadURL(`${APP_SCHEME}://app/`);  // paseo://app/
```

生产模式需要 `paseo://` 协议处理器从 `app-dist` 目录提供文件，但开发环境下该目录不存在，导致 `ERR_FILE_NOT_FOUND` 错误。

### `CI=true` 的影响

Metro Bundler 检测到 `CI=true` 时会输出：
```
Metro is running in CI mode, reloads are disabled. Remove CI=true to enable watch mode.
```

## 修复方案

修改 `packages/desktop/scripts/dev.sh`，在启动 Metro 和 Electron 前清除这两个环境变量：

```bash
# Metro 命令
"cd '$APP_DIR' && CI=false PASEO_WEB_PLATFORM=electron npx expo start --port $EXPO_PORT" \

# Electron 命令（使用 env -u 彻底删除变量）
"$ROOT_DIR/node_modules/.bin/wait-on tcp:$EXPO_PORT && env -u ELECTRON_FORCE_IS_PACKAGED CI=false EXPO_DEV_URL=http://localhost:$EXPO_PORT electron '$DESKTOP_DIR'"
```

### 为什么用 `env -u` 而不是 `unset`

- `unset` 只在当前 shell 生效，`concurrently` 启动的子进程可能仍继承父进程的环境变量
- `ELECTRON_FORCE_IS_PACKAGED=`（设空值）也不行，因为 Electron 的 `env->HasVar()` 检查的是变量是否存在，空值也算存在
- `env -u VAR` 会在执行命令前从环境中彻底删除该变量

## 验证方法

```bash
# 检查 isPackaged 值
cd packages/desktop
unset ELECTRON_FORCE_IS_PACKAGED
./node_modules/.bin/electron -e "
const {app} = require('electron');
app.on('ready', () => {
  console.log('isPackaged:', app.isPackaged);
  app.quit();
});
"
# 应该输出: isPackaged: false
```

## 相关代码位置

| 文件 | 说明 |
|------|------|
| `packages/desktop/scripts/dev.sh` | 开发启动脚本（已修复） |
| `packages/desktop/src/main.ts:497-504` | `app.isPackaged` 判断分支 |
| `packages/desktop/src/main.ts:325-331` | `getAppDistDir()` 路径解析 |
| `packages/desktop/src/main.ts:632-656` | `paseo://` 协议处理器 |

## Electron `isPackaged` 判断逻辑

Electron 41.2.0 中 `App::IsPackaged()` 的完整判断逻辑：

```cpp
bool App::IsPackaged() {
  // 1. 检查环境变量（最高优先级）
  auto env = base::Environment::Create();
  if (env->HasVar("ELECTRON_FORCE_IS_PACKAGED"))
    return true;

  // 2. 检查可执行文件名
  base::FilePath exe_path;
  base::PathService::Get(base::FILE_EXE, &exe_path);
  base::FilePath::StringType base_name = base::ToLowerASCII(exe_path.BaseName().value());

#if BUILDFLAG(IS_MAC)
  // macOS: 检查是否为 electron helper 进程
  if (IsRendererProcess())
    return base_name != "electron helper (renderer)";
  if (IsUtilityProcess())
    return base_name != "electron helper" && base_name != "electron helper (plugin)";
  return base_name != "electron";  // 主进程
#elif BUILDFLAG(IS_WIN)
  return base_name != "electron.exe";
#else
  return base_name != "electron";
#endif
}
```

**关键点**：开发模式下通过 `electron` 命令启动时，可执行文件名是 `Electron`（转小写后为 `electron`），所以 `isPackaged` 应该返回 `false`。但 `ELECTRON_FORCE_IS_PACKAGED` 环境变量会覆盖这个判断。

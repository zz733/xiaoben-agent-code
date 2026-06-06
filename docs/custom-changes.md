# 自定义改动清单

本文档记录了相对于官方仓库 `getpaseo/paseo` 的所有自定义改动。
同步上游更新后，需要确保这些改动被保留或重新应用。

---

## 一、核心改动文件

### 1. Relay 相关

| 文件                               | 改动说明              | 优先级 |
| ---------------------------------- | --------------------- | ------ |
| `packages/relay/src/relay.ts`      | 自建 relay 服务器配置 | 🔴 高  |
| `packages/relay/relay-config.json` | relay 配置文件        | 🔴 高  |
| `packages/relay/deploy-full.sh`    | relay 部署脚本        | 🟡 中  |

### 2. 语音识别相关

| 文件                                                                                    | 改动说明                | 优先级 |
| --------------------------------------------------------------------------------------- | ----------------------- | ------ |
| `packages/server/src/server/speech/providers/local/sherpa/model-catalog.ts`             | 中文语音模型配置        | 🔴 高  |
| `packages/server/src/server/speech/providers/local/sherpa/sherpa-offline-recognizer.ts` | paraformer 模型类型支持 | 🔴 高  |
| `packages/server/src/server/speech/providers/local/worker-process.ts`                   | 模型类型判断逻辑        | 🔴 高  |

### 3. 打包配置

| 文件                                        | 改动说明         | 优先级 |
| ------------------------------------------- | ---------------- | ------ |
| `packages/desktop/electron-builder.yml`     | macOS 打包配置   | 🟡 中  |
| `packages/desktop/electron-builder-win.yml` | Windows 打包配置 | 🟡 中  |

### 4. 鸿蒙 WebView 壳

| 目录/文件                    | 改动说明         | 优先级 |
| ---------------------------- | ---------------- | ------ |
| `harmony/`                   | 整个鸿蒙项目目录 | 🟢 低  |
| `harmony/README.md`          | 使用文档         | 🟢 低  |
| `harmony/copy-web-assets.sh` | 资源复制脚本     | 🟢 低  |

### 5. 文档和脚本

| 文件                         | 改动说明       | 优先级 |
| ---------------------------- | -------------- | ------ |
| `docs/upgrade-guide.md`      | 升级维护指南   | 🟢 低  |
| `scripts/deploy-relay.sh`    | relay 部署脚本 | 🟡 中  |
| `scripts/verify-upgrade.sh`  | 验证脚本       | 🟢 低  |
| `scripts/build-all.sh`       | 完整打包脚本   | 🟢 低  |
| `scripts/sync-upstream.sh`   | 同步上游脚本   | 🟢 低  |
| `scripts/restore-changes.sh` | 恢复改动脚本   | 🟢 低  |

---

## 二、环境配置

### 1. Daemon 配置

**位置：** `~/Library/LaunchAgents/sh.paseo.daemon.plist`

**关键环境变量：**

```xml
<key>PASEO_DICTATION_ENABLED</key>
<string>true</string>
<key>PASEO_DICTATION_STT_PROVIDER</key>
<string>local</string>
<key>PASEO_DICTATION_LOCAL_STT_MODEL</key>
<string>funasr-nano-int8</string>
<key>PASEO_LOCAL_MODELS_DIR</key>
<string>/Users/liuguanghua/.paseo/models/local-speech</string>
<key>PASEO_DICTATION_LANGUAGE</key>
<string>zh</string>
```

### 2. 模型文件

**位置：** `~/.paseo/models/local-speech/`

**已安装模型：**

- `funasr-nano-int8/` - 中文语音识别模型
- `paraformer-zh-int8/` - Paraformer 中文模型

---

## 三、同步策略

### 方案 A：Git Merge（推荐）

```bash
# 1. 添加上游仓库
git remote add upstream https://github.com/getpaseo/paseo.git

# 2. 获取上游更新
git fetch upstream

# 3. 合并（保留你的改动）
git merge upstream/main

# 4. 解决冲突（如果有）
# Git 会标记冲突文件，手动选择保留你的改动还是上游的改动

# 5. 推送
git push origin main
```

### 方案 B：Patch 方式

```bash
# 1. 先备份你的改动为 patch
git diff upstream/main > my-changes.patch

# 2. 重置到上游版本
git reset --hard upstream/main

# 3. 应用你的改动
git apply my-changes.patch

# 4. 解决冲突并推送
git push origin main --force
```

---

## 四、冲突处理优先级

当同步上游时遇到冲突，按以下优先级处理：

| 类型                | 处理方式                                 |
| ------------------- | ---------------------------------------- |
| 🔴 **高优先级改动** | **保留你的版本**（语音识别、relay）      |
| 🟡 **中优先级改动** | **手动合并**（打包配置，结合上游新特性） |
| 🟢 **低优先级改动** | **可以重新生成**（文档、脚本）           |
| ⚪ **未改动的文件** | **使用上游版本**                         |

---

## 五、快速恢复命令

### 查看你的改动

```bash
# 查看相对于上游的所有改动
git diff upstream/main --stat

# 查看具体文件的改动
git diff upstream/main -- packages/server/src/server/speech/providers/local/sherpa/model-catalog.ts
```

### 恢复单个文件

```bash
# 如果某个文件被上游覆盖了，从你的历史版本恢复
git checkout HEAD~1 -- path/to/file

# 或者从特定 commit 恢复
git checkout <commit-hash> -- path/to/file
```

### 恢复所有语音识别改动

```bash
# 从最近的 commit 恢复语音识别相关文件
git checkout fe32bede -- \
  packages/server/src/server/speech/providers/local/sherpa/model-catalog.ts \
  packages/server/src/server/speech/providers/local/sherpa/sherpa-offline-recognizer.ts \
  packages/server/src/server/speech/providers/local/worker-process.ts
```

---

## 六、同步前检查清单

同步上游前，确保：

- [ ] 当前改动已提交并推送
- [ ] 创建备份分支：`git branch backup-before-sync`
- [ ] 记录当前 commit hash：`git log -1 --oneline`
- [ ] 确认 upstream 已添加：`git remote -v`

---

**文档版本：** 1.0
**最后更新：** 2026-06-04

# Rawfile 目录说明

这个目录用于存放从 Paseo 项目打包好的 Web 资源。

## 复制资源步骤

1. 在 Paseo 项目根目录构建 Web 版本：
   ```bash
   cd /path/to/xiaoben-agent-code
   npm run build:web
   ```

2. 将 `packages/app/dist/` 下的所有内容复制到这个目录：
   ```bash
   cp -r packages/app/dist/* harmony/entry/src/main/resources/rawfile/
   ```

## 文件结构

```
rawfile/
├── index.html              # 入口 HTML
├── favicon.ico
├── apple-touch-icon.png
├── pwa-icon-192.png
├── pwa-icon-512.png
├── manifest.json
├── robots.txt
├── _expo/
│   └── static/
│       ├── css/
│       └── js/
├── assets/
└── ...
```

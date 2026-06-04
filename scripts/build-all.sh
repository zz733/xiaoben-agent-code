#!/bin/bash
# Paseo 完整打包脚本
# 用法: ./scripts/build-all.sh [--deploy-relay]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_RELAY=false

# 解析参数
if [ "$1" == "--deploy-relay" ]; then
  DEPLOY_RELAY=true
fi

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Paseo 完整构建脚本 ===${NC}"
echo ""

cd "$PROJECT_ROOT"

# 1. 安装依赖
echo -e "${YELLOW}[1/7] 安装依赖...${NC}"
npm install
echo ""

# 2. 构建 client
echo -e "${YELLOW}[2/7] 构建 client (protocol + client)...${NC}"
npm run build:client
echo ""

# 3. 构建 server
echo -e "${YELLOW}[3/7] 构建 server (server + cli)...${NC}"
npm run build:server
echo ""

# 4. 构建 relay
echo -e "${YELLOW}[4/7] 构建 relay...${NC}"
npm run build:relay
echo ""

# 5. 构建 web
echo -e "${YELLOW}[5/7] 构建 web 资源...${NC}"
cd packages/app
npm run build:web
cd "$PROJECT_ROOT"
echo ""

# 6. 打包 macOS
echo -e "${YELLOW}[6/7] 打包 macOS 应用...${NC}"
cd packages/desktop
npm run build:main
npx electron-builder --config electron-builder.yml --mac --arm64

# 移除隔离属性
xattr -cr release/mac-arm64/Paseo.app
codesign --force --sign - --deep release/mac-arm64/Paseo.app
cd "$PROJECT_ROOT"
echo ""

# 7. 打包 Windows
echo -e "${YELLOW}[7/7] 打包 Windows 应用...${NC}"
cd packages/desktop
npx electron-builder --config electron-builder-win.yml --win --x64
cd "$PROJECT_ROOT"
echo ""

# 8. 部署 relay（可选）
if [ "$DEPLOY_RELAY" == true ]; then
  echo -e "${YELLOW}[8/8] 部署 Relay 到服务器...${NC}"
  "$PROJECT_ROOT/scripts/deploy-relay.sh"
fi

echo ""
echo -e "${GREEN}=== 构建完成 ===${NC}"
echo ""
echo "产物位置:"
echo "  macOS: packages/desktop/release/mac-arm64/Paseo.app"
echo "  Windows: packages/desktop/release-win/Paseo-Setup-*-x64.exe"
echo ""
echo "验证命令: ./scripts/verify-upgrade.sh"
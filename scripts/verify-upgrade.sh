#!/bin/bash
# Paseo 升级验证脚本
# 用法: ./scripts/verify-upgrade.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Paseo 升级验证 ===${NC}"
echo ""

# 1. 检查 daemon 状态
echo -e "${YELLOW}[1/6] Daemon 状态:${NC}"
if launchctl list | grep -q paseo; then
  echo -e "${GREEN}✓ Daemon 正在运行${NC}"
  launchctl list | grep paseo
else
  echo -e "${RED}✗ Daemon 未运行${NC}"
fi
echo ""

# 2. 检查 relay 连接
echo -e "${YELLOW}[2/6] Relay 连接:${NC}"
if curl -s --connect-timeout 5 https://relay.17ai.pro/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Relay 连接正常${NC}"
else
  echo -e "${RED}✗ Relay 连接失败${NC}"
fi
echo ""

# 3. 检查语音模型
echo -e "${YELLOW}[3/6] 语音模型:${NC}"
MODELS_DIR="$HOME/.paseo/models/local-speech"
if [ -d "$MODELS_DIR" ]; then
  echo -e "${GREEN}✓ 模型目录存在${NC}"
  echo "已安装模型:"
  ls -1 "$MODELS_DIR"
else
  echo -e "${RED}✗ 模型目录不存在${NC}"
fi
echo ""

# 4. 检查桌面应用
echo -e "${YELLOW}[4/6] 桌面应用:${NC}"
MAC_APP="$PROJECT_ROOT/packages/desktop/release/mac-arm64/Paseo.app"
WIN_EXE="$PROJECT_ROOT/packages/desktop/release-win/Paseo-Setup-0.1.86-x64.exe"

if [ -d "$MAC_APP" ]; then
  echo -e "${GREEN}✓ macOS 应用已打包${NC}"
  echo "  $MAC_APP"
else
  echo -e "${YELLOW}○ macOS 应用未打包${NC}"
fi

if [ -f "$WIN_EXE" ]; then
  echo -e "${GREEN}✓ Windows 安装包已打包${NC}"
  echo "  $WIN_EXE"
else
  echo -e "${YELLOW}○ Windows 安装包未打包${NC}"
fi
echo ""

# 5. 检查构建产物
echo -e "${YELLOW}[5/6] 构建产物:${NC}"
CLIENT_DIST="$PROJECT_ROOT/packages/client/dist"
SERVER_DIST="$PROJECT_ROOT/packages/server/dist"
RELAY_DIST="$PROJECT_ROOT/packages/relay/dist"

[ -d "$CLIENT_DIST" ] && echo -e "${GREEN}✓ client${NC}" || echo -e "${RED}✗ client${NC}"
[ -d "$SERVER_DIST" ] && echo -e "${GREEN}✓ server${NC}" || echo -e "${RED}✗ server${NC}"
[ -d "$RELAY_DIST" ] && echo -e "${GREEN}✓ relay${NC}" || echo -e "${RED}✗ relay${NC}"
echo ""

# 6. 检查版本号
echo -e "${YELLOW}[6/6] 版本信息:${NC}"
DESKTOP_VERSION=$(cat "$PROJECT_ROOT/packages/desktop/package.json" | grep '"version"' | head -1 | cut -d'"' -f4)
echo "桌面应用版本: $DESKTOP_VERSION"

DAEMON_LOG="$HOME/.paseo/daemon.log"
if [ -f "$DAEMON_LOG" ]; then
  LATEST_VERSION=$(grep -o "version.*" "$DAEMON_LOG" | tail -1 || echo "未知")
  echo "Daemon 日志最新: $LATEST_VERSION"
fi
echo ""

echo -e "${GREEN}=== 验证完成 ===${NC}"
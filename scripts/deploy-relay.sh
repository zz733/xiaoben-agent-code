#!/bin/bash
# Relay 自动部署脚本
# 用法: ./scripts/deploy-relay.sh [服务器地址]

set -e

# 配置
RELAY_SERVER="${1:-root@relay.17ai.pro}"
RELAY_PATH="/opt/paseo-relay"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Paseo Relay 部署脚本 ===${NC}"
echo -e "目标服务器: ${RELAY_SERVER}"
echo -e "部署路径: ${RELAY_PATH}"
echo ""

# 1. 构建 relay
echo -e "${YELLOW}[1/5] 构建 Relay 模块...${NC}"
cd "$PROJECT_ROOT"
npm run build:relay

if [ $? -ne 0 ]; then
  echo -e "${RED}构建失败！${NC}"
  exit 1
fi

# 2. 检查构建产物
echo -e "${YELLOW}[2/5] 检查构建产物...${NC}"
RELAY_DIST="$PROJECT_ROOT/packages/relay/dist"
if [ ! -d "$RELAY_DIST" ]; then
  echo -e "${RED}构建产物不存在: $RELAY_DIST${NC}"
  exit 1
fi

echo -e "构建产物:"
ls -la "$RELAY_DIST"

# 3. 创建远程目录
echo -e "${YELLOW}[3/5] 创建远程目录...${NC}"
ssh "$RELAY_SERVER" "mkdir -p $RELAY_PATH"

# 4. 上传文件
echo -e "${YELLOW}[4/5] 上传文件到服务器...${NC}"
scp -r "$RELAY_DIST"/* "$RELAY_SERVER:$RELAY_PATH/"

# 5. 重启服务
echo -e "${YELLOW}[5/5] 重启 Relay 服务...${NC}"
ssh "$RELAY_SERVER" "systemctl restart paseo-relay || echo '服务未配置 systemctl，请手动重启'"

# 6. 验证
echo -e "${YELLOW}[6/6] 验证部署...${NC}"
sleep 2
ssh "$RELAY_SERVER" "systemctl status paseo-relay --no-pager || true"

echo ""
echo -e "${GREEN}✅ Relay 部署完成！${NC}"
echo -e "验证命令: curl -v https://relay.17ai.pro/health"
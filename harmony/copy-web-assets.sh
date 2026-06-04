#!/bin/bash
# 复制 Paseo Web 资源到鸿蒙项目

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Paseo Web 资源复制脚本 ===${NC}"

# 检查 Web 资源是否存在
WEB_DIST="$PROJECT_ROOT/packages/app/dist"
RAWFILE_DIR="$SCRIPT_DIR/entry/src/main/resources/rawfile"

if [ ! -d "$WEB_DIST" ]; then
  echo -e "${YELLOW}Web 资源不存在，正在构建...${NC}"
  cd "$PROJECT_ROOT" && npm run build:web
  if [ $? -ne 0 ]; then
    echo -e "${RED}构建失败！${NC}"
    exit 1
  fi
fi

# 清空 rawfile 目录
echo -e "${YELLOW}清空 rawfile 目录...${NC}"
rm -rf "$RAWFILE_DIR"
mkdir -p "$RAWFILE_DIR"

# 复制资源
echo -e "${YELLOW}复制资源...${NC}"
cp -r "$WEB_DIST"/* "$RAWFILE_DIR"/

# 创建说明文件
cat > "$RAWFILE_DIR/README.md" << 'EOF'
# Rawfile 目录 - Web 资源

此目录包含 Paseo 应用的 Web 版本资源，由 copy-web-assets.sh 自动生成。
EOF

echo -e "${GREEN}✅ 资源复制完成！${NC}"
echo -e "   目标目录: $RAWFILE_DIR"
echo -e ""
echo -e "接下来可以在 DevEco Studio 中打开项目并运行。"

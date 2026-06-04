#!/bin/bash
# 恢复自定义改动脚本
# 用法: ./scripts/restore-changes.sh [备份分支名]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_BRANCH="${1:-backup-before-sync}"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Paseo 改动恢复脚本 ===${NC}"
echo ""

cd "$PROJECT_ROOT"

# 检查备份分支是否存在
echo -e "${YELLOW}[1/4] 检查备份分支...${NC}"
if ! git branch | grep -q "$BACKUP_BRANCH"; then
  # 尝试找最新的备份分支
  LATEST_BACKUP=$(git branch | grep backup | sort -r | head -1 | tr -d ' ')
  if [ -n "$LATEST_BACKUP" ]; then
    echo -e "${YELLOW}未找到 $BACKUP_BRANCH，使用最新备份: $LATEST_BACKUP${NC}"
    BACKUP_BRANCH="$LATEST_BACKUP"
  else
    echo -e "${RED}没有找到任何备份分支！${NC}"
    echo "可用分支:"
    git branch
    exit 1
  fi
fi
echo -e "${GREEN}✓ 使用备份分支: $BACKUP_BRANCH${NC}"
echo ""

# 定义需要恢复的关键文件
KEY_FILES=(
  "packages/server/src/server/speech/providers/local/sherpa/model-catalog.ts"
  "packages/server/src/server/speech/providers/local/sherpa/sherpa-offline-recognizer.ts"
  "packages/server/src/server/speech/providers/local/worker-process.ts"
  "packages/relay/src/relay.ts"
)

# 可选恢复的文件
OPTIONAL_FILES=(
  "packages/desktop/electron-builder.yml"
  "packages/desktop/electron-builder-win.yml"
  "harmony/"
  "docs/upgrade-guide.md"
  "docs/custom-changes.md"
  "scripts/"
)

# 2. 恢复关键文件
echo -e "${YELLOW}[2/4] 恢复关键文件（语音识别、relay）...${NC}"
for file in "${KEY_FILES[@]}"; do
  if git show "$BACKUP_BRANCH:$file" > /dev/null 2>&1; then
    echo -e "${GREEN}恢复: $file${NC}"
    git checkout "$BACKUP_BRANCH" -- "$file"
  else
    echo -e "${YELLOW}跳过: $file (备份中不存在)${NC}"
  fi
done
echo ""

# 3. 恢复可选文件
echo -e "${YELLOW}[3/4] 恢复可选文件（打包配置、文档、脚本）...${NC}"
echo -e "${YELLOW}是否恢复可选文件？(y/n)${NC}"
read -r RESTORE_OPTIONAL

if [ "$RESTORE_OPTIONAL" == "y" ]; then
  for item in "${OPTIONAL_FILES[@]}"; do
    if [ -d "$PROJECT_ROOT/$item" ]; then
      echo -e "${GREEN}恢复目录: $item${NC}"
      git checkout "$BACKUP_BRANCH" -- "$item"
    elif [ -f "$PROJECT_ROOT/$item" ]; then
      echo -e "${GREEN}恢复文件: $item${NC}"
      git checkout "$BACKUP_BRANCH" -- "$item"
    fi
  done
else
  echo -e "${YELLOW}跳过可选文件恢复${NC}"
fi
echo ""

# 4. 提交恢复
echo -e "${YELLOW}[4/4] 提交恢复的改动...${NC}"
git status --short
echo ""
echo -e "${YELLOW}是否提交这些恢复？(y/n)${NC}"
read -r COMMIT_CHANGES

if [ "$COMMIT_CHANGES" == "y" ]; then
  git add -A
  git commit -m "restore: 恢复自定义改动（语音识别、relay、打包配置）"
  echo -e "${GREEN}✓ 已提交${NC}"
  
  echo -e "${YELLOW}是否推送到 origin？(y/n)${NC}"
  read -r PUSH_CHANGES
  if [ "$PUSH_CHANGES" == "y" ]; then
    git push origin main
    echo -e "${GREEN}✓ 已推送${NC}"
  fi
else
  echo -e "${YELLOW}改动未提交，可以手动检查后提交${NC}"
fi
echo ""

echo -e "${GREEN}=== 恢复完成 ===${NC}"
echo ""
echo "验证命令: ./scripts/verify-upgrade.sh"
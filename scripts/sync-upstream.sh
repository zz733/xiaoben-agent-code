#!/bin/bash
# 同步上游仓库脚本
# 用法: ./scripts/sync-upstream.sh [--force]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE_MODE=false

# 解析参数
if [ "$1" == "--force" ]; then
  FORCE_MODE=true
fi

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Paseo 上游同步脚本 ===${NC}"
echo ""

cd "$PROJECT_ROOT"

# 1. 检查 upstream
echo -e "${YELLOW}[1/8] 检查 upstream 配置...${NC}"
if ! git remote | grep -q upstream; then
  echo -e "${YELLOW}添加 upstream 仓库...${NC}"
  git remote add upstream https://github.com/getpaseo/paseo.git
fi
echo -e "${GREEN}✓ upstream 已配置${NC}"
git remote -v | grep upstream
echo ""

# 2. 创建备份分支
echo -e "${YELLOW}[2/8] 创建备份分支...${NC}"
BACKUP_BRANCH="backup-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_BRANCH"
echo -e "${GREEN}✓ 备份分支已创建: $BACKUP_BRANCH${NC}"
echo ""

# 3. 记录当前状态
echo -e "${YELLOW}[3/8] 记录当前状态...${NC}"
CURRENT_COMMIT=$(git log -1 --oneline)
echo "当前 commit: $CURRENT_COMMIT"
echo ""

# 4. 保存改动为 patch
echo -e "${YELLOW}[4/8] 保存当前改动为 patch...${NC}"
git fetch upstream
git diff upstream/main > "$PROJECT_ROOT/my-changes.patch" 2>/dev/null || true
if [ -s "$PROJECT_ROOT/my-changes.patch" ]; then
  echo -e "${GREEN}✓ 改动已保存到 my-changes.patch${NC}"
  echo "改动统计:"
  git diff upstream/main --stat | tail -5
else
  echo -e "${YELLOW}○ 没有相对于 upstream 的改动${NC}"
fi
echo ""

# 5. 获取上游更新
echo -e "${YELLOW}[5/8] 获取上游最新更新...${NC}"
git fetch upstream
UPSTREAM_COMMIT=$(git log upstream/main -1 --oneline)
echo -e "${GREEN}✓ 上游最新: $UPSTREAM_COMMIT${NC}"
echo ""

# 6. 合并上游
echo -e "${YELLOW}[6/8] 合并上游更新...${NC}"
if [ "$FORCE_MODE" == true ]; then
  echo -e "${RED}强制模式：重置到 upstream/main${NC}"
  git reset --hard upstream/main
  echo -e "${YELLOW}应用保存的改动...${NC}"
  if [ -s "$PROJECT_ROOT/my-changes.patch" ]; then
    git apply "$PROJECT_ROOT/my-changes.patch" || {
      echo -e "${RED}应用 patch 失败，需要手动解决冲突${NC}"
      echo "请检查冲突文件并手动修复"
      exit 1
    }
  fi
else
  echo -e "${YELLOW}合并模式：保留本地改动${NC}"
  git merge upstream/main --no-edit || {
    echo -e "${RED}合并冲突！${NC}"
    echo ""
    echo "冲突文件列表:"
    git diff --name-only --diff-filter=U
    echo ""
    echo -e "${YELLOW}请手动解决冲突后继续：${NC}"
    echo "1. 编辑冲突文件，选择保留哪个版本"
    echo "2. git add <解决后的文件>"
    echo "3. git commit"
    echo ""
    echo -e "${BLUE}提示：对于语音识别和 relay 文件，保留你的版本${NC}"
    echo -e "${BLUE}提示：对于其他文件，可以接受上游版本${NC}"
    exit 1
  }
fi
echo -e "${GREEN}✓ 合并完成${NC}"
echo ""

# 7. 验证关键改动
echo -e "${YELLOW}[7/8] 验证关键改动是否保留...${NC}"

KEY_FILES=(
  "packages/server/src/server/speech/providers/local/sherpa/model-catalog.ts"
  "packages/server/src/server/speech/providers/local/sherpa/sherpa-offline-recognizer.ts"
  "packages/server/src/server/speech/providers/local/worker-process.ts"
)

for file in "${KEY_FILES[@]}"; do
  if [ -f "$PROJECT_ROOT/$file" ]; then
    if grep -q "paraformer" "$PROJECT_ROOT/$file" 2>/dev/null; then
      echo -e "${GREEN}✓ $file - 语音识别改动已保留${NC}"
    else
      echo -e "${RED}✗ $file - 语音识别改动丢失！${NC}"
      echo -e "${YELLOW}从备份恢复...${NC}"
      git checkout "$BACKUP_BRANCH" -- "$PROJECT_ROOT/$file"
      echo -e "${GREEN}✓ 已恢复${NC}"
    fi
  fi
done
echo ""

# 8. 推送
echo -e "${YELLOW}[8/8] 推送到 origin...${NC}"
if [ "$FORCE_MODE" == true ]; then
  git push origin main --force
else
  git push origin main
fi
echo -e "${GREEN}✓ 推送完成${NC}"
echo ""

echo -e "${GREEN}=== 同步完成 ===${NC}"
echo ""
echo "备份分支: $BACKUP_BRANCH"
echo "如需恢复，运行: git checkout $BACKUP_BRANCH"
echo ""
echo "验证命令: ./scripts/verify-upgrade.sh"
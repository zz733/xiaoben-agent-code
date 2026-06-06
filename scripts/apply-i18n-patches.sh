#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# apply-i18n-patches.sh
#
# 上游代码合并后，i18n 对上游文件的修改会丢失。运行此脚本自动重新应用。
# 幂等设计：已应用过的地方不会重复插入。
#
# 用法：
#   bash scripts/apply-i18n-patches.sh          # 应用所有补丁
#   bash scripts/apply-i18n-patches.sh --check   # 仅检查，不修改
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CHECK_MODE=false

if [[ "${1:-}" == "--check" ]]; then
  CHECK_MODE=true
  echo "=== Check mode: will not modify files ==="
fi

apply_patch() {
  local file="$1"
  local description="$2"

  if $CHECK_MODE; then
    echo "[CHECK] $description"
    echo "        File: $file"
  else
    echo "[PATCH] $description"
    echo "        File: $file"
  fi
}

# ============================================================================
# Patch 1: packages/desktop/src/main.ts
# ============================================================================
patch_desktop_main() {
  local file="$ROOT_DIR/packages/desktop/src/main.ts"

  if [[ ! -f "$file" ]]; then
    echo "[SKIP] $file not found"
    return
  fi

  apply_patch "$file" "Desktop main.ts: i18n import + setupI18n/patchApplicationMenu/patchDialogHandlers"

  # 1a. 添加 i18n import（在 setupApplicationMenu import 之后）
  if grep -q 'setupI18n.*patchApplicationMenu.*patchDialogHandlers.*from.*./i18n/index' "$file"; then
    echo "        ✅ i18n import already present"
  else
    if $CHECK_MODE; then
      echo "        ❌ i18n import MISSING — needs: import { setupI18n, patchApplicationMenu, patchDialogHandlers } from \"./i18n/index.js\";"
    else
      sed -i '' '/import.*setupApplicationMenu.*from.*\.\/features\/menu\.js/a\
import { setupI18n, patchApplicationMenu, patchDialogHandlers } from "./i18n/index.js";
' "$file"
      echo "        ✅ Added i18n import"
    fi
  fi

  # 1b. 替换 setupApplicationMenu 为 setupI18n + patchApplicationMenu
  if grep -q 'setupI18n();' "$file" && grep -q 'patchApplicationMenu({' "$file"; then
    echo "        ✅ setupI18n/patchApplicationMenu already present"
  else
    if $CHECK_MODE; then
      echo "        ❌ setupI18n/patchApplicationMenu MISSING"
    else
      # 先加 setupI18n() 调用
      sed -i '' 's/^[[:space:]]*setupApplicationMenu({/  setupI18n();\n  patchApplicationMenu({/' "$file"
      # 删除残留的 setupApplicationMenu（如果变成了双重调用）
      # 这里需要更精细的处理：检查 setupApplicationMenu 是否在 patchApplicationMenu 之外还存在
      echo "        ✅ Replaced setupApplicationMenu with setupI18n + patchApplicationMenu"
    fi
  fi

  # 1c. 替换 registerDialogHandlers 为 patchDialogHandlers
  if grep -q 'patchDialogHandlers();' "$file"; then
    echo "        ✅ patchDialogHandlers already present"
  else
    if $CHECK_MODE; then
      echo "        ❌ patchDialogHandlers MISSING — needs to replace registerDialogHandlers()"
    else
      sed -i '' 's/registerDialogHandlers();/patchDialogHandlers();/' "$file"
      echo "        ✅ Replaced registerDialogHandlers with patchDialogHandlers"
    fi
  fi
}

# ============================================================================
# Patch 2: packages/app/src/app/_layout.tsx
# ============================================================================
patch_app_layout() {
  local file="$ROOT_DIR/packages/app/src/app/_layout.tsx"

  if [[ ! -f "$file" ]]; then
    echo "[SKIP] $file not found"
    return
  fi

  apply_patch "$file" "App _layout.tsx: I18nProvider import + wrapper"

  # 2a. 添加 I18nProvider import
  if grep -q 'import.*I18nProvider.*from.*@/i18n' "$file"; then
    echo "        ✅ I18nProvider import already present"
  else
    if $CHECK_MODE; then
      echo "        ❌ I18nProvider import MISSING — needs: import { I18nProvider } from \"@/i18n\";"
    else
      sed -i '' '/import.*ToastProvider.*from.*@\/contexts\/toast-context/a\
import { I18nProvider } from "@/i18n";
' "$file"
      echo "        ✅ Added I18nProvider import"
    fi
  fi

  # 2b. 用 I18nProvider 包裹 PortalProvider
  if grep -q '<I18nProvider>' "$file"; then
    echo "        ✅ I18nProvider wrapper already present"
  else
    if $CHECK_MODE; then
      echo "        ❌ I18nProvider wrapper MISSING — needs to wrap PortalProvider"
    else
      # 在 PortalProvider 前插入 I18nProvider
      sed -i '' 's|<PortalProvider>|<I18nProvider>\n            <PortalProvider>|' "$file"
      # 在 /PortalProvider 后插入 /I18nProvider
      sed -i '' 's|</PortalProvider>|</PortalProvider>\n          </I18nProvider>|' "$file"
      echo "        ✅ Wrapped PortalProvider with I18nProvider"
    fi
  fi
}

# ============================================================================
# Patch 3: packages/app/src/screens/settings-screen.tsx
# ============================================================================
patch_settings_screen() {
  local file="$ROOT_DIR/packages/app/src/screens/settings-screen.tsx"

  if [[ ! -f "$file" ]]; then
    echo "[SKIP] $file not found"
    return
  fi

  apply_patch "$file" "Settings screen: LanguageSection + Globe icon + sidebar entry + case branch"

  # 3a. 添加 Globe 到 lucide-react-native import
  if grep -q 'Globe,' "$file"; then
    echo "        ✅ Globe import already present"
  else
    if $CHECK_MODE; then
      echo "        ❌ Globe import MISSING — needs Globe in lucide imports"
    else
      sed -i '' 's/FolderGit2,/FolderGit2,\n  Globe,/' "$file"
      echo "        ✅ Added Globe to lucide imports"
    fi
  fi

  # 3b. 添加 LanguageSection import
  if grep -q 'import.*LanguageSection.*from.*@/screens/settings/language-section' "$file"; then
    echo "        ✅ LanguageSection import already present"
  else
    if $CHECK_MODE; then
      echo "        ❌ LanguageSection import MISSING"
    else
      sed -i '' '/import.*KeyboardShortcutsSection.*from.*@\/screens\/settings\/keyboard-shortcuts-section/a\
import { LanguageSection } from "@/screens/settings/language-section";
' "$file"
      echo "        ✅ Added LanguageSection import"
    fi
  fi

  # 3c. 添加 Language sidebar 项（在 appearance 之后）
  if grep -q 'id: "language".*label: "Language".*icon: Globe' "$file"; then
    echo "        ✅ Language sidebar entry already present"
  else
    if $CHECK_MODE; then
      echo "        ❌ Language sidebar entry MISSING"
    else
      sed -i '' '/{ id: "appearance", label: "Appearance", icon: Palette },/a\
  { id: "language", label: "Language", icon: Globe },
' "$file"
      echo "        ✅ Added Language sidebar entry"
    fi
  fi

  # 3d. 添加 language case 分支（在 appearance case 之后）
  if grep -q 'case "language":' "$file"; then
    echo "        ✅ Language case branch already present"
  else
    if $CHECK_MODE; then
      echo "        ❌ Language case branch MISSING"
    else
      sed -i '' '/case "appearance":/{N;s/\(case "appearance":\n.*return <AppearanceSection \/>;\)/\1\n        case "language":\n          return <LanguageSection \/>;/;}' "$file"
      echo "        ✅ Added Language case branch"
    fi
  fi
}

# ============================================================================
# Main
# ============================================================================
echo ""
echo "==========================================="
echo " Paseo i18n Patch Application"
echo "==========================================="
echo ""

patch_desktop_main
echo ""
patch_app_layout
echo ""
patch_settings_screen

echo ""
if $CHECK_MODE; then
  echo "==========================================="
  echo " Check complete. Run without --check to apply."
  echo "==========================================="
else
  echo "==========================================="
  echo " All patches applied!"
  echo ""
  echo " Next steps:"
  echo "   1. Run: npm run typecheck"
  echo "   2. Run: npm run lint"
  echo "   3. Test the app: npm run dev"
  echo "==========================================="
fi

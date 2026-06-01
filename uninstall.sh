#!/bin/bash
set -e

# ─────────────────────────────────────────────
#  slopdiff uninstaller
#  curl -fsSL https://cdn.sameidusmani.com/slopdiff/uninstall.sh | sh
# ─────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

INSTALL_DIR="$HOME/.slopdiff"

echo ""
echo -e "${BOLD}  ◉ slopdiff uninstaller${RESET}"
echo ""

# ── Remove install directory ──────────────────

if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo -e "${DIM}  ✓ Removed $INSTALL_DIR${RESET}"
else
  echo -e "${DIM}  ✓ $INSTALL_DIR not found, skipping${RESET}"
fi

# ── Remove PATH entries from shell profiles ───

PROFILES=(
  "$HOME/.zshrc"
  "$HOME/.bashrc"
  "$HOME/.bash_profile"
  "$HOME/.config/fish/config.fish"
)

for PROFILE in "${PROFILES[@]}"; do
  if [ -f "$PROFILE" ] && grep -q ".slopdiff/bin" "$PROFILE" 2>/dev/null; then
    if [[ "$PROFILE" == *fish* ]]; then
      sed -i.bak '/# slopdiff/d; /slopdiff\/bin/d' "$PROFILE" && rm -f "$PROFILE.bak"
    else
      sed -i.bak '/# slopdiff/d; /slopdiff\/bin/d' "$PROFILE" && rm -f "$PROFILE.bak"
    fi
    echo -e "${DIM}  ✓ Removed PATH entry from $PROFILE${RESET}"
  fi
done

# ── Done ─────────────────────────────────────

echo ""
echo -e "${GREEN}  ✓ slopdiff uninstalled${RESET}"
echo ""

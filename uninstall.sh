#!/bin/bash
set -e

GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

INSTALL_DIR="$HOME/.slopdiff"

echo ""
echo -e "${BOLD}  ◉ slopdiff uninstaller${RESET}"
echo ""

if [ -d "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR"
  echo -e "${DIM}  ✓ Removed $INSTALL_DIR${RESET}"
else
  echo -e "${DIM}  ✓ $INSTALL_DIR not found, skipping${RESET}"
fi

PROFILES=(
  "$HOME/.zshrc"
  "$HOME/.bashrc"
  "$HOME/.bash_profile"
  "$HOME/.config/fish/config.fish"
)

for PROFILE in "${PROFILES[@]}"; do
  if [ -f "$PROFILE" ] && grep -q ".slopdiff/bin" "$PROFILE" 2>/dev/null; then
    sed -i.bak '/# slopdiff/d; /slopdiff\/bin/d' "$PROFILE" && rm -f "$PROFILE.bak"
    echo -e "${DIM}  ✓ Removed PATH entry from $PROFILE${RESET}"
  fi
done

echo ""
echo -e "${GREEN}  ✓ slopdiff uninstalled${RESET}"
echo ""

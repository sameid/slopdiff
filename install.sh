#!/bin/bash
set -e

# ─────────────────────────────────────────────
#  slopdiff installer v0.1.1
#  curl -fsSL https://cdn.sameidusmani.com/slopdiff/install.sh | sh
# ─────────────────────────────────────────────

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

INSTALL_DIR="$HOME/.slopdiff"
BIN_DIR="$INSTALL_DIR/bin"
BASE_URL="https://cdn.sameidusmani.com/slopdiff/bin/v0.1.1"

echo ""
echo -e "${BOLD}${CYAN}  ◉ slopdiff installer v0.1.1${RESET}"
echo ""

# ── Detect platform ───────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  BINARY="slopdiff-macos-arm64" ;;
      x86_64) BINARY="slopdiff-macos-x64"   ;;
      *) echo -e "${RED}  ✗ Unsupported macOS architecture: $ARCH${RESET}"; exit 1 ;;
    esac ;;
  Linux)
    case "$ARCH" in
      x86_64)  BINARY="slopdiff-linux-x64"   ;;
      aarch64) BINARY="slopdiff-linux-arm64" ;;
      *) echo -e "${RED}  ✗ Unsupported Linux architecture: $ARCH${RESET}"; exit 1 ;;
    esac ;;
  *)
    echo -e "${RED}  ✗ Unsupported OS: $OS${RESET}"
    exit 1 ;;
esac

echo -e "${DIM}  Platform: $OS/$ARCH${RESET}"

# ── Download ──────────────────────────────────

mkdir -p "$BIN_DIR"

echo -e "${DIM}  Downloading $BINARY...${RESET}"

if command -v curl &>/dev/null; then
  curl -fsSL "$BASE_URL/$BINARY" -o "$BIN_DIR/slopdiff"
elif command -v wget &>/dev/null; then
  wget -qO "$BIN_DIR/slopdiff" "$BASE_URL/$BINARY"
else
  echo -e "${RED}  ✗ Neither curl nor wget found.${RESET}"
  exit 1
fi

chmod +x "$BIN_DIR/slopdiff"
echo -e "${DIM}  ✓ Downloaded${RESET}"

# ── Add to PATH ───────────────────────────────

SHELL_NAME=$(basename "$SHELL")
PROFILE_FILE="$HOME/.zshrc"
case "$SHELL_NAME" in
  bash) PROFILE_FILE="$HOME/.bashrc" ;;
  fish) PROFILE_FILE="$HOME/.config/fish/config.fish" ;;
esac

if ! grep -q ".slopdiff/bin" "$PROFILE_FILE" 2>/dev/null; then
  echo "" >> "$PROFILE_FILE"
  echo "# slopdiff" >> "$PROFILE_FILE"
  if [ "$SHELL_NAME" = "fish" ]; then
    echo 'set -gx PATH $HOME/.slopdiff/bin $PATH' >> "$PROFILE_FILE"
  else
    echo 'export PATH="$HOME/.slopdiff/bin:$PATH"' >> "$PROFILE_FILE"
  fi
  echo -e "${DIM}  ✓ Added to PATH in $PROFILE_FILE${RESET}"
fi

# ── Done ─────────────────────────────────────

echo ""
echo -e "${GREEN}  ✓ slopdiff v0.1.1 installed!${RESET}"
echo ""
echo -e "${BOLD}  Quick start:${RESET}"
echo ""
echo -e "  ${DIM}# restart your shell or run:${RESET}"
echo -e "  ${DIM}source $PROFILE_FILE${RESET}"
echo ""
echo -e "  ${CYAN}cd your-repo && slopdiff${RESET}"
echo ""

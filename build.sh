#!/bin/bash
set -e

# Extract version from main.go
VERSION=$(grep 'const VERSION' main.go | head -1 | sed 's/.*"\(.*\)"/\1/')
OUT_DIR="dist/bin/v${VERSION}"
CDN="https://cdn.sameidusmani.com/slopdiff"
LDFLAGS="-s -w"

echo ""
echo "  Building slopdiff v${VERSION}"
echo ""

mkdir -p "$OUT_DIR"

# ── Cross-compile ─────────────────────────────

targets=(
  "darwin arm64 slopdiff-macos-arm64"
  "darwin amd64 slopdiff-macos-x64"
  "linux amd64 slopdiff-linux-x64"
  "linux arm64 slopdiff-linux-arm64"
)

for entry in "${targets[@]}"; do
  read -r os arch name <<< "$entry"
  echo "  → Compiling ${name}..."
  GOOS=$os GOARCH=$arch go build -ldflags="$LDFLAGS" -o "${OUT_DIR}/${name}" .
  echo "  ✓ ${OUT_DIR}/${name}"
done

# ── Generate install.sh ───────────────────────

cat > install.sh << INSTALLEOF
#!/bin/bash
set -e

# ─────────────────────────────────────────────
#  slopdiff installer v${VERSION}
#  curl -fsSL ${CDN}/install.sh | sh
# ─────────────────────────────────────────────

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

INSTALL_DIR="\$HOME/.slopdiff"
BIN_DIR="\$INSTALL_DIR/bin"
BASE_URL="${CDN}/bin/v${VERSION}"

echo ""
echo -e "\${BOLD}\${CYAN}  ◉ slopdiff installer v${VERSION}\${RESET}"
echo ""

OS="\$(uname -s)"
ARCH="\$(uname -m)"

case "\$OS" in
  Darwin)
    case "\$ARCH" in
      arm64)  BINARY="slopdiff-macos-arm64" ;;
      x86_64) BINARY="slopdiff-macos-x64"   ;;
      *) echo -e "\${RED}  ✗ Unsupported macOS architecture: \$ARCH\${RESET}"; exit 1 ;;
    esac ;;
  Linux)
    case "\$ARCH" in
      x86_64)  BINARY="slopdiff-linux-x64"   ;;
      aarch64) BINARY="slopdiff-linux-arm64" ;;
      *) echo -e "\${RED}  ✗ Unsupported Linux architecture: \$ARCH\${RESET}"; exit 1 ;;
    esac ;;
  *)
    echo -e "\${RED}  ✗ Unsupported OS: \$OS\${RESET}"
    exit 1 ;;
esac

echo -e "\${DIM}  Platform: \$OS/\$ARCH\${RESET}"

mkdir -p "\$BIN_DIR"
echo -e "\${DIM}  Downloading \$BINARY...\${RESET}"

if command -v curl &>/dev/null; then
  curl -fsSL "\$BASE_URL/\$BINARY" -o "\$BIN_DIR/slopdiff"
elif command -v wget &>/dev/null; then
  wget -qO "\$BIN_DIR/slopdiff" "\$BASE_URL/\$BINARY"
else
  echo -e "\${RED}  ✗ Neither curl nor wget found.\${RESET}"
  exit 1
fi

chmod +x "\$BIN_DIR/slopdiff"
echo -e "\${DIM}  ✓ Downloaded\${RESET}"

SHELL_NAME=\$(basename "\$SHELL")
PROFILE_FILE="\$HOME/.zshrc"
case "\$SHELL_NAME" in
  bash) PROFILE_FILE="\$HOME/.bashrc" ;;
  fish) PROFILE_FILE="\$HOME/.config/fish/config.fish" ;;
esac

if ! grep -q ".slopdiff/bin" "\$PROFILE_FILE" 2>/dev/null; then
  echo "" >> "\$PROFILE_FILE"
  echo "# slopdiff" >> "\$PROFILE_FILE"
  if [ "\$SHELL_NAME" = "fish" ]; then
    echo 'set -gx PATH \$HOME/.slopdiff/bin \$PATH' >> "\$PROFILE_FILE"
  else
    echo 'export PATH="\$HOME/.slopdiff/bin:\$PATH"' >> "\$PROFILE_FILE"
  fi
  echo -e "\${DIM}  ✓ Added to PATH in \$PROFILE_FILE\${RESET}"
fi

echo ""
echo -e "\${GREEN}  ✓ slopdiff v${VERSION} installed!\${RESET}"
echo ""
echo -e "\${BOLD}  Quick start:\${RESET}"
echo ""
echo -e "  \${DIM}# restart your shell or run:\${RESET}"
echo -e "  \${DIM}source \$PROFILE_FILE\${RESET}"
echo ""
echo -e "  \${CYAN}cd your-repo && slopdiff\${RESET}"
echo ""
INSTALLEOF

chmod +x install.sh
echo "  ✓ Generated install.sh (v${VERSION})"

# ── Generate uninstall.sh ─────────────────────

cat > uninstall.sh << 'UNINSTALLEOF'
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
UNINSTALLEOF

chmod +x uninstall.sh
echo "  ✓ Generated uninstall.sh"

echo ""
echo "  Done! Binaries in ${OUT_DIR}/"
echo ""

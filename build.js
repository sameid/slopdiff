#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";

// --- Read version from package.json ---

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const version = pkg.version;

console.log(`\n  Building slopdiff v${version}\n`);

// --- Inject version into index.js ---

let src = readFileSync("index.js", "utf-8");
src = src.replace(/const VERSION = ".*?"/, `const VERSION = "${version}"`);
writeFileSync("index.js", src);
console.log(`  ✓ Injected version ${version} into index.js`);

// --- Generate install.sh ---

const installScript = `#!/bin/bash
set -e

# ─────────────────────────────────────────────
#  slopdiff installer v${version}
#  curl -fsSL https://sameidusmani.com/slopdiff/install.sh | sh
# ─────────────────────────────────────────────

CYAN='\\033[0;36m'
GREEN='\\033[0;32m'
RED='\\033[0;31m'
DIM='\\033[2m'
BOLD='\\033[1m'
RESET='\\033[0m'

INSTALL_DIR="$HOME/.slopdiff"
BIN_DIR="$INSTALL_DIR/bin"
BASE_URL="https://sameidusmani.com/slopdiff/v${version}"

echo ""
echo -e "\${BOLD}\${CYAN}  ◉ slopdiff installer v${version}\${RESET}"
echo ""

# ── Detect platform ───────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  BINARY="slopdiff-macos-arm64" ;;
      x86_64) BINARY="slopdiff-macos-x64"   ;;
      *) echo -e "\${RED}  ✗ Unsupported macOS architecture: $ARCH\${RESET}"; exit 1 ;;
    esac ;;
  Linux)
    case "$ARCH" in
      x86_64)  BINARY="slopdiff-linux-x64"   ;;
      aarch64) BINARY="slopdiff-linux-arm64" ;;
      *) echo -e "\${RED}  ✗ Unsupported Linux architecture: $ARCH\${RESET}"; exit 1 ;;
    esac ;;
  *)
    echo -e "\${RED}  ✗ Unsupported OS: $OS\${RESET}"
    exit 1 ;;
esac

echo -e "\${DIM}  Platform: $OS/$ARCH\${RESET}"

# ── Download ──────────────────────────────────

mkdir -p "$BIN_DIR"

echo -e "\${DIM}  Downloading $BINARY...\${RESET}"

if command -v curl &>/dev/null; then
  curl -fsSL "$BASE_URL/$BINARY" -o "$BIN_DIR/slopdiff"
elif command -v wget &>/dev/null; then
  wget -qO "$BIN_DIR/slopdiff" "$BASE_URL/$BINARY"
else
  echo -e "\${RED}  ✗ Neither curl nor wget found.\${RESET}"
  exit 1
fi

chmod +x "$BIN_DIR/slopdiff"
echo -e "\${DIM}  ✓ Downloaded\${RESET}"

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
  echo -e "\${DIM}  ✓ Added to PATH in $PROFILE_FILE\${RESET}"
fi

# ── Done ─────────────────────────────────────

echo ""
echo -e "\${GREEN}  ✓ slopdiff v${version} installed!\${RESET}"
echo ""
echo -e "\${BOLD}  Quick start:\${RESET}"
echo ""
echo -e "  \${DIM}# restart your shell or run:\${RESET}"
echo -e "  \${DIM}source $PROFILE_FILE\${RESET}"
echo ""
echo -e "  \${CYAN}cd your-repo && slopdiff\${RESET}"
echo ""
`;

writeFileSync("install.sh", installScript, { mode: 0o755 });
console.log(`  ✓ Generated install.sh (v${version})`);

// --- Compile binaries ---

const outDir = `dist/v${version}`;
mkdirSync(outDir, { recursive: true });

const targets = [
	{ target: "bun-darwin-arm64", name: "slopdiff-macos-arm64" },
	{ target: "bun-darwin-x64", name: "slopdiff-macos-x64" },
	{ target: "bun-linux-x64", name: "slopdiff-linux-x64" },
	{ target: "bun-linux-arm64", name: "slopdiff-linux-arm64" },
];

for (const { target, name } of targets) {
	const outFile = `${outDir}/${name}`;
	const cmd = `bun build --compile --target=${target} --external term.js --external pty.js index.js --outfile ${outFile}`;
	console.log(`  → Compiling ${name}...`);
	try {
		execSync(cmd, { stdio: "pipe" });
		console.log(`  ✓ ${outFile}`);
	} catch (e) {
		console.error(`  ✗ Failed to compile ${name}: ${e.message}`);
	}
}

console.log(`\n  Done! Binaries in ${outDir}/\n`);

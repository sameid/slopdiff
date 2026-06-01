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
#  curl -fsSL https://cdn.sameidusmani.com/slopdiff/install.sh | sh
# ─────────────────────────────────────────────

CYAN='\\033[0;36m'
GREEN='\\033[0;32m'
RED='\\033[0;31m'
DIM='\\033[2m'
BOLD='\\033[1m'
RESET='\\033[0m'

INSTALL_DIR="$HOME/.slopdiff"
BIN_DIR="$INSTALL_DIR/bin"
BASE_URL="https://cdn.sameidusmani.com/slopdiff/bin/v${version}"

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

// --- Patch blessed/lib/widget.js dynamic require ---
// esbuild cannot statically analyze `require('./widgets/' + file)`.
// We replace it with explicit static requires so esbuild bundles them all.

const widgetPath = "node_modules/blessed/lib/widget.js";
const widgetSrc = readFileSync(widgetPath, "utf-8");
const staticRequires = `
widget['Node']          = widget['node']          = require('./widgets/node');
widget['Screen']        = widget['screen']        = require('./widgets/screen');
widget['Element']       = widget['element']       = require('./widgets/element');
widget['Box']           = widget['box']           = require('./widgets/box');
widget['Text']          = widget['text']          = require('./widgets/text');
widget['Line']          = widget['line']          = require('./widgets/line');
widget['ScrollableBox'] = widget['scrollablebox'] = require('./widgets/scrollablebox');
widget['ScrollableText']= widget['scrollabletext']= require('./widgets/scrollabletext');
widget['BigText']       = widget['bigtext']       = require('./widgets/bigtext');
widget['List']          = widget['list']          = require('./widgets/list');
widget['Form']          = widget['form']          = require('./widgets/form');
widget['Input']         = widget['input']         = require('./widgets/input');
widget['Textarea']      = widget['textarea']      = require('./widgets/textarea');
widget['Textbox']       = widget['textbox']       = require('./widgets/textbox');
widget['Button']        = widget['button']        = require('./widgets/button');
widget['ProgressBar']   = widget['progressbar']   = require('./widgets/progressbar');
widget['FileManager']   = widget['filemanager']   = require('./widgets/filemanager');
widget['Checkbox']      = widget['checkbox']      = require('./widgets/checkbox');
widget['RadioSet']      = widget['radioset']      = require('./widgets/radioset');
widget['RadioButton']   = widget['radiobutton']   = require('./widgets/radiobutton');
widget['Prompt']        = widget['prompt']        = require('./widgets/prompt');
widget['Question']      = widget['question']      = require('./widgets/question');
widget['Message']       = widget['message']       = require('./widgets/message');
widget['Loading']       = widget['loading']       = require('./widgets/loading');
widget['Listbar']       = widget['listbar']       = require('./widgets/listbar');
widget['Log']           = widget['log']           = require('./widgets/log');
widget['Table']         = widget['table']         = require('./widgets/table');
widget['ListTable']     = widget['listtable']     = require('./widgets/listtable');
widget['Terminal']      = widget['terminal']      = require('./widgets/terminal');
widget['Image']         = widget['image']         = require('./widgets/image');
widget['ANSIImage']     = widget['ansiimage']     = require('./widgets/ansiimage');
widget['OverlayImage']  = widget['overlayimage']  = require('./widgets/overlayimage');
widget['Video']         = widget['video']         = require('./widgets/video');
widget['Layout']        = widget['layout']        = require('./widgets/layout');
`;

const patchedWidget = widgetSrc.replace(
	/widget\.classes\.forEach\(function\(name\)[\s\S]*?\}\);/,
	staticRequires
);
writeFileSync(widgetPath, patchedWidget);
console.log(`  ✓ Patched blessed/lib/widget.js (static requires)`);

// --- Bundle with esbuild (resolves blessed's dynamic requires) ---

const bundleFile = `dist/bundle.cjs`;
mkdirSync("dist", { recursive: true });

const esbuildCmd = [
	"./node_modules/.bin/esbuild index.js",
	"--bundle",
	"--platform=node",
	"--format=cjs",
	"--external:term.js",
	"--external:pty.js",
	"--external:fsevents",
	`--outfile=${bundleFile}`,
	"--log-level=warning",
].join(" ");

console.log(`  → Bundling with esbuild...`);
try {
	execSync(esbuildCmd, { stdio: "pipe" });
	console.log(`  ✓ Bundled to ${bundleFile}`);
} catch (e) {
	console.error(`  ✗ esbuild failed: ${e.stderr?.toString() || e.message}`);
	process.exit(1);
}

// --- Compile binaries ---

const outDir = `dist/bin/v${version}`;
mkdirSync(outDir, { recursive: true });

const targets = [
	{ target: "bun-darwin-arm64", name: "slopdiff-macos-arm64" },
	{ target: "bun-darwin-x64", name: "slopdiff-macos-x64" },
	{ target: "bun-linux-x64", name: "slopdiff-linux-x64" },
	{ target: "bun-linux-arm64", name: "slopdiff-linux-arm64" },
];

for (const { target, name } of targets) {
	const outFile = `${outDir}/${name}`;
	const cmd = `bun build --compile --target=${target} --external term.js --external pty.js ${bundleFile} --outfile ${outFile}`;
	console.log(`  → Compiling ${name}...`);
	try {
		execSync(cmd, { stdio: "pipe" });
		console.log(`  ✓ ${outFile}`);
	} catch (e) {
		console.error(`  ✗ Failed to compile ${name}: ${e.stderr?.toString() || e.message}`);
	}
}

console.log(`\n  Done! Binaries in ${outDir}/\n`);

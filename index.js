#!/usr/bin/env bun

import {
	createCliRenderer,
	BoxRenderable,
	TextRenderable,
	TextAttributes,
	ScrollBoxRenderable,
	DiffRenderable,
	SelectRenderable,
	SelectRenderableEvents,
	InputRenderable,
	InputRenderableEvents,
	SyntaxStyle,
	RGBA,
	addDefaultParsers,
	getTreeSitterClient,
} from "@opentui/core";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "node_modules/@opentui/core/assets");

// Register bundled Tree-sitter parsers for syntax highlighting
addDefaultParsers([
	{
		filetype: "javascript",
		aliases: ["jsx"],
		wasm: `${ASSETS_DIR}/javascript/tree-sitter-javascript.wasm`,
		queries: { highlights: [`${ASSETS_DIR}/javascript/highlights.scm`] },
	},
	{
		filetype: "typescript",
		aliases: ["tsx"],
		wasm: `${ASSETS_DIR}/typescript/tree-sitter-typescript.wasm`,
		queries: { highlights: [`${ASSETS_DIR}/typescript/highlights.scm`] },
	},
	{
		filetype: "zig",
		wasm: `${ASSETS_DIR}/zig/tree-sitter-zig.wasm`,
		queries: { highlights: [`${ASSETS_DIR}/zig/highlights.scm`] },
	},
	{
		filetype: "markdown",
		wasm: `${ASSETS_DIR}/markdown/tree-sitter-markdown.wasm`,
		queries: { highlights: [`${ASSETS_DIR}/markdown/highlights.scm`] },
	},
]);

const VERSION = "0.1.2";

// --- CLI flags ---
const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
	console.log(`slopdiff v${VERSION}`);
	process.exit(0);
}

// --- Config ---

const cmdIdx = args.indexOf("--cmd");
const INITIAL_CMD = cmdIdx !== -1 && args[cmdIdx + 1] ? args[cmdIdx + 1] : null;
const themeIdx = args.indexOf("--theme");
const INITIAL_THEME =
	themeIdx !== -1 && args[themeIdx + 1] ? args[themeIdx + 1] : "tokyo-night";

async function runUpdate() {
	const CDN = "https://cdn.sameidusmani.com/slopdiff";

	const os = process.platform;
	const arch = process.arch;
	let binary;
	if (os === "darwin" && arch === "arm64") binary = "slopdiff-macos-arm64";
	else if (os === "darwin" && arch === "x64") binary = "slopdiff-macos-x64";
	else if (os === "linux" && arch === "x64") binary = "slopdiff-linux-x64";
	else if (os === "linux" && arch === "arm64") binary = "slopdiff-linux-arm64";
	else {
		console.error(`  \u2717 Unsupported platform: ${os}/${arch}`);
		process.exit(1);
	}

	let latestVersion;
	try {
		const res = await fetch(`${CDN}/install.sh`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const text = await res.text();
		const match = text.match(/BASE_URL="[^"]+\/v([^/"]+)"/);
		if (!match) throw new Error("Could not parse version from install.sh");
		latestVersion = match[1];
	} catch (e) {
		console.error(`  \u2717 Could not fetch latest version: ${e.message}`);
		process.exit(1);
	}

	if (latestVersion === VERSION) {
		console.log(`  \u2713 Already up to date (v${VERSION})`);
		return;
	}

	console.log(`  \u2192 Updating slopdiff v${VERSION} \u2192 v${latestVersion}...`);

	const selfPath = process.execPath;
	const url = `${CDN}/bin/v${latestVersion}/${binary}`;
	let data;
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		data = Buffer.from(await res.arrayBuffer());
	} catch (e) {
		console.error(`  \u2717 Download failed: ${e.message}`);
		process.exit(1);
	}

	const tmpPath = selfPath + ".tmp";
	try {
		fs.writeFileSync(tmpPath, data, { mode: 0o755 });
		fs.renameSync(tmpPath, selfPath);
	} catch {
		try {
			fs.copyFileSync(tmpPath, selfPath);
			fs.chmodSync(selfPath, 0o755);
			fs.unlinkSync(tmpPath);
		} catch (e2) {
			console.error(`  \u2717 Failed to replace binary: ${e2.message}`);
			process.exit(1);
		}
	}

	console.log(`  \u2713 slopdiff updated to v${latestVersion}`);
}

const SELECTABLE_THEMES = [
	{ label: "Tokyo Night", uiKey: "tokyo-night" },
	{ label: "Atom One Dark", uiKey: "one-dark" },
	{ label: "OpenCode", uiKey: "opencode" },
];

let currentThemeIdx = Math.max(
	0,
	SELECTABLE_THEMES.findIndex((t) => t.uiKey === INITIAL_THEME),
);

const UI_THEMES = {
	"tokyo-night": {
		headerBg: "#1a1b26",
		headerFg: "#a9b1d6",
		stickyHeaderBg: "#3b4261",
		stickyHeaderFg: "#c0caf5",
		statusBarBg: "#24283b",
		statusBarFg: "#a9b1d6",
		scrollbarFg: "#3b4261",
		fileNameFg: "#7aa2f7",
		fileNameActiveFg: "#c0caf5",
		stagedBadgeFg: "#9ece6a",
		viewedBadgeFg: "#565f89",
		langBadgeFg: "#565f89",
		addedBg: "#244032",
		removedBg: "#452328",
		hunkHeaderFg: "#bb9af7",
		bg: "#1a1b26",
		fg: "#a9b1d6",
	},
	"one-dark": {
		headerBg: "#21252b",
		headerFg: "#abb2bf",
		stickyHeaderBg: "#3e4451",
		stickyHeaderFg: "#e5c07b",
		statusBarBg: "#21252b",
		statusBarFg: "#abb2bf",
		scrollbarFg: "#3e4451",
		fileNameFg: "#61afef",
		fileNameActiveFg: "#e5c07b",
		stagedBadgeFg: "#98c379",
		viewedBadgeFg: "#5c6370",
		langBadgeFg: "#5c6370",
		addedBg: "#1e3a29",
		removedBg: "#3b1f1f",
		hunkHeaderFg: "#c678dd",
		bg: "#282c34",
		fg: "#abb2bf",
	},
	opencode: {
		headerBg: "#141414",
		headerFg: "#eeeeee",
		stickyHeaderBg: "#282828",
		stickyHeaderFg: "#fab283",
		statusBarBg: "#1e1e1e",
		statusBarFg: "#808080",
		scrollbarFg: "#3c3c3c",
		fileNameFg: "#fab283",
		fileNameActiveFg: "#ffc09f",
		stagedBadgeFg: "#7fd88f",
		viewedBadgeFg: "#606060",
		langBadgeFg: "#606060",
		addedBg: "#20303b",
		removedBg: "#37222c",
		hunkHeaderFg: "#9d7cd8",
		bg: "#0a0a0a",
		fg: "#eeeeee",
	},
};

let ui = UI_THEMES[SELECTABLE_THEMES[currentThemeIdx].uiKey];

// --- Syntax highlighting styles per theme ---

const SYNTAX_THEMES = {
	"tokyo-night": {
		default: { fg: "#a9b1d6" },
		keyword: { fg: "#bb9af7", bold: true },
		"keyword.return": { fg: "#bb9af7", bold: true },
		"keyword.function": { fg: "#bb9af7", bold: true },
		"keyword.operator": { fg: "#89ddff" },
		string: { fg: "#9ece6a" },
		"string.special": { fg: "#9ece6a" },
		number: { fg: "#ff9e64" },
		comment: { fg: "#565f89", italic: true },
		function: { fg: "#7aa2f7" },
		"function.call": { fg: "#7aa2f7" },
		"function.method": { fg: "#7aa2f7" },
		"function.builtin": { fg: "#7aa2f7" },
		variable: { fg: "#c0caf5" },
		"variable.builtin": { fg: "#e0af68" },
		"variable.parameter": { fg: "#e0af68" },
		type: { fg: "#2ac3de" },
		"type.builtin": { fg: "#2ac3de" },
		constant: { fg: "#ff9e64" },
		"constant.builtin": { fg: "#ff9e64" },
		operator: { fg: "#89ddff" },
		punctuation: { fg: "#a9b1d6" },
		"punctuation.bracket": { fg: "#a9b1d6" },
		"punctuation.delimiter": { fg: "#89ddff" },
		property: { fg: "#73daca" },
		tag: { fg: "#f7768e" },
		attribute: { fg: "#bb9af7" },
	},
	"one-dark": {
		default: { fg: "#abb2bf" },
		keyword: { fg: "#c678dd", bold: true },
		"keyword.return": { fg: "#c678dd", bold: true },
		"keyword.function": { fg: "#c678dd", bold: true },
		"keyword.operator": { fg: "#c678dd" },
		string: { fg: "#98c379" },
		"string.special": { fg: "#98c379" },
		number: { fg: "#d19a66" },
		comment: { fg: "#5c6370", italic: true },
		function: { fg: "#61afef" },
		"function.call": { fg: "#61afef" },
		"function.method": { fg: "#61afef" },
		"function.builtin": { fg: "#61afef" },
		variable: { fg: "#e06c75" },
		"variable.builtin": { fg: "#e5c07b" },
		"variable.parameter": { fg: "#e06c75" },
		type: { fg: "#e5c07b" },
		"type.builtin": { fg: "#e5c07b" },
		constant: { fg: "#d19a66" },
		"constant.builtin": { fg: "#d19a66" },
		operator: { fg: "#56b6c2" },
		punctuation: { fg: "#abb2bf" },
		"punctuation.bracket": { fg: "#abb2bf" },
		"punctuation.delimiter": { fg: "#abb2bf" },
		property: { fg: "#e06c75" },
		tag: { fg: "#e06c75" },
		attribute: { fg: "#d19a66" },
	},
	opencode: {
		default: { fg: "#eeeeee" },
		keyword: { fg: "#ff6188", bold: true },
		"keyword.return": { fg: "#ff6188", bold: true },
		"keyword.function": { fg: "#ff6188", bold: true },
		"keyword.operator": { fg: "#ff6188" },
		string: { fg: "#ffd866" },
		"string.special": { fg: "#ffd866" },
		number: { fg: "#ab9df2" },
		comment: { fg: "#606060", italic: true },
		function: { fg: "#a9dc76" },
		"function.call": { fg: "#a9dc76" },
		"function.method": { fg: "#a9dc76" },
		"function.builtin": { fg: "#a9dc76" },
		variable: { fg: "#eeeeee" },
		"variable.builtin": { fg: "#fab283" },
		"variable.parameter": { fg: "#fab283" },
		type: { fg: "#78dce8" },
		"type.builtin": { fg: "#78dce8" },
		constant: { fg: "#ab9df2" },
		"constant.builtin": { fg: "#ab9df2" },
		operator: { fg: "#ff6188" },
		punctuation: { fg: "#cccccc" },
		"punctuation.bracket": { fg: "#cccccc" },
		"punctuation.delimiter": { fg: "#cccccc" },
		property: { fg: "#78dce8" },
		tag: { fg: "#ff6188" },
		attribute: { fg: "#a9dc76" },
	},
};

function buildSyntaxStyle(themeKey) {
	return SyntaxStyle.fromStyles(SYNTAX_THEMES[themeKey]);
}

let currentSyntaxStyle = buildSyntaxStyle(SELECTABLE_THEMES[currentThemeIdx].uiKey);

// --- Language detection ---

const EXT_TO_LANG = {
	".js": "javascript",
	".mjs": "javascript",
	".cjs": "javascript",
	".jsx": "jsx",
	".ts": "typescript",
	".tsx": "tsx",
	".py": "python",
	".rb": "ruby",
	".go": "go",
	".rs": "rust",
	".java": "java",
	".kt": "kotlin",
	".swift": "swift",
	".c": "c",
	".h": "c",
	".cpp": "cpp",
	".cc": "cpp",
	".cxx": "cpp",
	".hpp": "cpp",
	".cs": "csharp",
	".css": "css",
	".scss": "scss",
	".less": "less",
	".html": "html",
	".htm": "html",
	".xml": "xml",
	".svg": "xml",
	".json": "json",
	".jsonc": "jsonc",
	".yaml": "yaml",
	".yml": "yaml",
	".md": "markdown",
	".mdx": "mdx",
	".sh": "bash",
	".bash": "bash",
	".zsh": "zsh",
	".fish": "fish",
	".sql": "sql",
	".php": "php",
	".lua": "lua",
	".vim": "viml",
	".toml": "toml",
	".ini": "ini",
	".dockerfile": "dockerfile",
	".r": "r",
	".scala": "scala",
	".ex": "elixir",
	".exs": "elixir",
	".erl": "erlang",
	".hs": "haskell",
	".ml": "ocaml",
	".dart": "dart",
	".vue": "vue",
	".svelte": "svelte",
	".graphql": "graphql",
	".gql": "graphql",
	".tf": "terraform",
	".hcl": "hcl",
	".zig": "zig",
	".nim": "nim",
	".v": "v",
	".prisma": "prisma",
	".proto": "protobuf",
	".ps1": "powershell",
	".psm1": "powershell",
	".clj": "clojure",
	".cljs": "clojure",
	".elm": "elm",
	".gleam": "gleam",
};

function detectLanguage(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	const base = path.basename(filePath).toLowerCase();
	if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
	if (base === "makefile") return "makefile";
	if (base === "cmakelists.txt" || ext === ".cmake") return "cmake";
	return EXT_TO_LANG[ext] || null;
}

// --- Git helpers ---

function getGitDiff() {
	try {
		return execSync("git diff master", { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
	} catch {
		try {
			return execSync("git diff main", { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
		} catch {
			return "";
		}
	}
}

function getWorkingDiff() {
	try {
		return execSync("git diff", { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
	} catch {
		return "";
	}
}

function runDiffCmd(cmd) {
	try {
		return execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
	} catch {
		return "";
	}
}

function stageFile(filePath) {
	try {
		const diff = execSync(`git diff -- "${filePath}"`, { encoding: "utf-8" });
		if (!diff.trim()) return false;
		execSync(`git add "${filePath}"`, { encoding: "utf-8" });
		return true;
	} catch {
		return false;
	}
}

// --- .slopdiff session file ---

const SLOPDIFF_PATH = path.join(process.cwd(), ".slopdiff");

function loadSession() {
	try {
		return JSON.parse(fs.readFileSync(SLOPDIFF_PATH, "utf-8"));
	} catch {
		return {};
	}
}

function saveSession(files) {
	const collapsed = files.filter((f) => f.collapsed).map((f) => f.path);
	try {
		fs.writeFileSync(SLOPDIFF_PATH, JSON.stringify({ collapsed }, null, 2));
	} catch {
		// silently ignore
	}
}

function applySession(files) {
	const session = loadSession();
	const collapsedSet = new Set(session.collapsed || []);
	for (const file of files) {
		if (collapsedSet.has(file.path)) file.collapsed = true;
	}
}

// --- Diff parser ---

function parseDiff(rawDiff) {
	if (!rawDiff.trim()) return [];

	const files = [];
	const fileChunks = rawDiff.split(/^diff --git /m).filter(Boolean);

	for (const chunk of fileChunks) {
		const lines = chunk.split("\n");
		const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
		if (!headerMatch) continue;

		const filePath = headerMatch[2];
		const hunks = [];
		let currentHunk = null;

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i];
			if (line.startsWith("@@")) {
				if (currentHunk) hunks.push(currentHunk);
				currentHunk = { header: line, lines: [] };
			} else if (currentHunk) {
				currentHunk.lines.push(line);
			}
		}
		if (currentHunk) hunks.push(currentHunk);

		files.push({
			path: filePath,
			language: detectLanguage(filePath),
			hunks,
			collapsed: false,
			viewed: false,
			staged: false,
		});
	}

	return files;
}

// Reconstruct a unified diff string for a single file from parsed hunks
function buildFileDiff(file) {
	let diff = `diff --git a/${file.path} b/${file.path}\n`;
	diff += `--- a/${file.path}\n+++ b/${file.path}\n`;
	for (const hunk of file.hunks) {
		diff += hunk.header + "\n";
		diff += hunk.lines.join("\n") + "\n";
	}
	return diff;
}

// --- TUI ---

async function main() {
	const rawDiff = INITIAL_CMD ? runDiffCmd(INITIAL_CMD) : getGitDiff();
	const files = parseDiff(rawDiff);
	applySession(files);

	if (files.length === 0) {
		console.log("No diff found. Nothing to show.");
		process.exit(0);
	}

	// Initialize Tree-sitter for syntax highlighting
	const tsClient = getTreeSitterClient();
	await tsClient.initialize();

	const renderer = await createCliRenderer({ exitOnCtrlC: true });

	let cursorFileIdx = 0;
	let filterUnstaged = false;
	let customDiffCmd = INITIAL_CMD ?? null;

	// --- Layout ---
	// Root: column layout, full screen
	const root = renderer.root;

	// Header bar
	const headerBox = new BoxRenderable(renderer, {
		id: "header-box",
		width: "100%",
		height: 1,
		backgroundColor: ui.headerBg,
		justifyContent: "center",
		alignItems: "center",
	});
	const header = new TextRenderable(renderer, {
		id: "header",
		height: 1,
		content: "slopdiff  j/k: navigate | enter/c: collapse | C/E: all | s: stage | f: filter | e: command | t: theme | r: refresh | q: quit",
		fg: ui.headerFg,
	});
	headerBox.add(header);

	// Sticky header (current file indicator)
	const stickyHeaderBox = new BoxRenderable(renderer, {
		id: "sticky-header-box",
		width: "100%",
		height: 3,
		backgroundColor: ui.stickyHeaderBg,
		borderStyle: "single",
		borderColor: ui.stickyHeaderFg,
		marginTop: 0,
		marginBottom: 0,
		paddingLeft: 1,
	});
	const stickyHeader = new TextRenderable(renderer, {
		id: "sticky-header",
		width: "100%",
		content: "",
		fg: ui.stickyHeaderFg,
	});
	stickyHeaderBox.add(stickyHeader);

	// Main diff scroll area
	const scrollBox = new ScrollBoxRenderable(renderer, {
		id: "diff-scroll",
		width: "100%",
		flexGrow: 1,
		viewportCulling: true,
		viewportOptions: { backgroundColor: ui.bg },
		contentOptions: { backgroundColor: ui.bg },
		scrollbarOptions: {
			trackOptions: { foregroundColor: ui.scrollbarFg },
		},
	});

	// Status bar (1 row at bottom)
	const statusBarBox = new BoxRenderable(renderer, {
		id: "status-bar-box",
		width: "100%",
		height: 1,
		backgroundColor: ui.statusBarBg,
	});
	const statusBar = new TextRenderable(renderer, {
		id: "status-bar",
		width: "100%",
		height: 1,
		content: "",
		fg: ui.statusBarFg,
	});
	statusBarBox.add(statusBar);

	root.add(headerBox);
	root.add(stickyHeaderBox);
	root.add(scrollBox);
	root.add(statusBarBox);

	// --- Theme selector overlay ---
	const themeOverlay = new BoxRenderable(renderer, {
		id: "theme-overlay",
		position: "absolute",
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
	});
	const themeSelect = new SelectRenderable(renderer, {
		id: "theme-select",
		width: 36,
		height: SELECTABLE_THEMES.length + 2,
		options: SELECTABLE_THEMES.map((t) => ({
			name: t.label,
			description: "",
		})),
		backgroundColor: "#1e1e1e",
		selectedBackgroundColor: "#fab283",
		selectedTextColor: "#0a0a0a",
		textColor: "#eeeeee",
		showDescription: false,
	});
	themeOverlay.add(themeSelect);
	themeOverlay.visible = false;

	// --- Command input overlay ---
	const cmdOverlay = new BoxRenderable(renderer, {
		id: "cmd-overlay",
		position: "absolute",
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
	});
	const cmdInput = new InputRenderable(renderer, {
		id: "cmd-input",
		width: "60%",
		height: 1,
		placeholder: "git diff master",
		backgroundColor: ui.statusBarBg,
		fg: ui.fg,
	});
	cmdOverlay.add(cmdInput);
	cmdOverlay.visible = false;

	root.add(themeOverlay);
	root.add(cmdOverlay);

	// --- Diff renderables ---
	// We store references to file header texts and diff renderables
	let fileHeaders = [];
	let diffRenderables = [];

	function rebuildDiffContent() {
		// Clear scroll box children
		for (const child of scrollBox.getChildren()) {
			scrollBox.remove(child.id);
		}
		fileHeaders = [];
		diffRenderables = [];

		for (let fi = 0; fi < files.length; fi++) {
			const file = files[fi];
			const isCursor = fi === cursorFileIdx;
			const collapseIcon = file.collapsed ? "\u25b6" : "\u25bc";
			const stagedTag = file.staged ? " [STAGED]" : "";
			const viewedTag = file.viewed ? " [viewed]" : "";
			const langTag = file.language ? ` (${file.language})` : "";

			const headerText = new TextRenderable(renderer, {
				id: `file-header-${fi}`,
				width: "100%",
				height: 1,
				content: `${collapseIcon} ${file.path}${langTag}${stagedTag}${viewedTag}`,
				fg: isCursor ? ui.fileNameActiveFg : ui.fileNameFg,
				bg: ui.bg,
				attributes: isCursor ? TextAttributes.BOLD : 0,
			});
			fileHeaders.push(headerText);
			scrollBox.add(headerText);

			if (!file.collapsed && file.hunks.length > 0) {
				const diffStr = buildFileDiff(file);
				const diffWidget = new DiffRenderable(renderer, {
					id: `diff-${fi}`,
					width: "100%",
					diff: diffStr,
					view: "unified",
					filetype: file.language || undefined,
					syntaxStyle: currentSyntaxStyle,
					treeSitterClient: tsClient,
					showLineNumbers: true,
					addedBg: ui.addedBg,
					removedBg: ui.removedBg,
					contextBg: ui.bg,
					lineNumberFg: ui.langBadgeFg,
					fg: ui.fg,
				});
				diffRenderables.push(diffWidget);
				scrollBox.add(diffWidget);
			} else {
				diffRenderables.push(null);
			}
		}
	}

	function getVisibleFileIdx() {
		const scrollTop = scrollBox.scrollTop;
		let cumulative = 0;
		for (let i = 0; i < fileHeaders.length; i++) {
			const headerHeight = fileHeaders[i]?.height ?? 1;
			const diffHeight = diffRenderables[i]?.height ?? 0;
			const sectionHeight = headerHeight + diffHeight;
			if (scrollTop < cumulative + sectionHeight) return i;
			cumulative += sectionHeight;
		}
		return fileHeaders.length - 1;
	}

	function renderScroll() {
		if (files.length === 0) return;
		cursorFileIdx = getVisibleFileIdx();
		updateStickyHeader();
		updateStatusBar();
	}

	function updateStickyHeader() {
		const file = files[cursorFileIdx];
		if (!file) {
			stickyHeader.content = " [No files]";
			return;
		}
		const collapseIcon = file.collapsed ? "\u25b6" : "\u25bc";
		const langPart = file.language ? ` (${file.language})` : "";
		const stagedPart = file.staged ? " [STAGED]" : "";
		stickyHeader.content = ` ${collapseIcon} ${file.path}${langPart}${stagedPart}  ${cursorFileIdx + 1}/${files.length}`;
	}

	function updateStatusBar() {
		const staged = files.filter((f) => f.staged).length;
		const themeName = SELECTABLE_THEMES[currentThemeIdx].label;
		if (files.length === 0) {
			statusBar.content = ` No files | theme: ${themeName}${filterUnstaged ? "  [working tree]" : ""}  v${VERSION}`;
		} else {
			statusBar.content = ` File ${cursorFileIdx + 1}/${files.length} | ${staged} staged | ${files[cursorFileIdx].path} | theme: ${themeName}${filterUnstaged ? "  [working tree]" : ""}  v${VERSION}`;
		}
	}

	function render() {
		rebuildDiffContent();
		updateStickyHeader();
		updateStatusBar();
	}

	function scrollToFile(idx) {
		const headerNode = fileHeaders[idx];
		if (headerNode) {
			scrollBox.scrollChildIntoView(headerNode.id);
		}
	}

	function applyTheme(idx) {
		currentThemeIdx = idx;
		ui = UI_THEMES[SELECTABLE_THEMES[idx].uiKey];
		currentSyntaxStyle = buildSyntaxStyle(SELECTABLE_THEMES[idx].uiKey);
		headerBox.backgroundColor = ui.headerBg;
		header.fg = ui.headerFg;
		stickyHeaderBox.backgroundColor = ui.stickyHeaderBg;
		stickyHeaderBox.borderColor = ui.stickyHeaderFg;
		stickyHeader.fg = ui.stickyHeaderFg;
		statusBarBox.backgroundColor = ui.statusBarBg;
		statusBar.fg = ui.statusBarFg;
		scrollBox.viewportOptions = { backgroundColor: ui.bg };
		scrollBox.contentOptions = { backgroundColor: ui.bg };
		render();
	}

	// --- State: which overlay is active ---
	let activeOverlay = null; // "theme" | "cmd" | null

	// --- Smooth scroll (neoscroll-style, Shift+Up/Down) ---

	let scrollAnimation = null;

	function easeInOutSine(t) {
		return -(Math.cos(Math.PI * t) - 1) / 2;
	}

	function smoothScroll(totalLines, duration) {
		if (scrollAnimation) {
			clearInterval(scrollAnimation.timer);
			scrollAnimation = null;
		}
		const startTime = Date.now();
		let scrolled = 0;
		scrollAnimation = {
			timer: setInterval(() => {
				const elapsed = Date.now() - startTime;
				const progress = Math.min(elapsed / duration, 1);
				const targetScrolled = Math.round(easeInOutSine(progress) * totalLines);
				const delta = targetScrolled - scrolled;
				if (delta !== 0) {
					scrollBox.scrollBy(delta);
					scrolled = targetScrolled;
					renderScroll();
				}
				if (progress >= 1) {
					clearInterval(scrollAnimation.timer);
					scrollAnimation = null;
				}
			}, 16),
		};
	}

	// --- Keyboard input ---
	renderer.keyInput.on("keypress", (key) => {
		// If theme selector is visible
		if (activeOverlay === "theme") {
			if (key.name === "escape" || key.name === "q") {
				themeOverlay.visible = false;
				activeOverlay = null;
				return;
			}
			// Let SelectRenderable handle j/k/enter internally
			return;
		}

		// If command input is visible
		if (activeOverlay === "cmd") {
			if (key.name === "escape") {
				cmdOverlay.visible = false;
				activeOverlay = null;
				return;
			}
			// Let InputRenderable handle typing internally
			return;
		}

		// Main keybindings
		switch (key.name) {
			case "q":
				renderer.destroy();
				process.exit(0);
				break;

			case "j":
				files[cursorFileIdx].viewed = true;
				cursorFileIdx = (cursorFileIdx + 1) % files.length;
				render();
				scrollToFile(cursorFileIdx);
				break;

			case "k":
				cursorFileIdx = (cursorFileIdx - 1 + files.length) % files.length;
				render();
				scrollToFile(cursorFileIdx);
				break;

			case "C":
			case "c":
				if (key.shift) {
					// Shift+C: collapse all
					for (const file of files) file.collapsed = true;
					saveSession(files);
					render();
					scrollToFile(cursorFileIdx);
				} else {
					// c: toggle collapse current
					if (files.length > 0) {
						files[cursorFileIdx].collapsed = !files[cursorFileIdx].collapsed;
						if (files[cursorFileIdx].collapsed) {
							files[cursorFileIdx].viewed = true;
						}
						saveSession(files);
						render();
						scrollToFile(cursorFileIdx);
					}
				}
				break;

			case "return":
				if (files.length > 0) {
					files[cursorFileIdx].collapsed = !files[cursorFileIdx].collapsed;
					if (files[cursorFileIdx].collapsed) {
						files[cursorFileIdx].viewed = true;
					}
					saveSession(files);
					render();
					scrollToFile(cursorFileIdx);
				}
				break;

			case "E":
			case "e":
				if (key.shift) {
					// Shift+E: expand all
					for (const file of files) file.collapsed = false;
					saveSession(files);
					render();
					scrollToFile(cursorFileIdx);
				} else {
					// e: custom diff command input
					cmdOverlay.visible = true;
					cmdInput.value = customDiffCmd || "git diff master";
					cmdInput.focus();
					activeOverlay = "cmd";
				}
				break;

			case "s":
				if (files.length > 0) {
					const file = files[cursorFileIdx];
					if (!file.staged) {
						const ok = stageFile(file.path);
						if (ok) {
							file.staged = true;
							render();
						}
					}
				}
				break;

			case "f":
				filterUnstaged = !filterUnstaged;
				{
					const rawDiff = filterUnstaged ? getWorkingDiff() : getGitDiff();
					const refreshed = parseDiff(rawDiff);
					applySession(refreshed);
					files.length = 0;
					files.push(...refreshed);
					cursorFileIdx = 0;
					render();
				}
				break;

			case "r":
				{
					const rawDiff = customDiffCmd
						? runDiffCmd(customDiffCmd)
						: filterUnstaged
							? getWorkingDiff()
							: getGitDiff();
					const refreshed = parseDiff(rawDiff);
					applySession(refreshed);
					files.length = 0;
					files.push(...refreshed);
					cursorFileIdx = Math.min(cursorFileIdx, Math.max(0, files.length - 1));
					render();
				}
				break;

			case "t":
				themeOverlay.visible = true;
				themeSelect.focus();
				activeOverlay = "theme";
				break;

			case "down":
				if (key.shift) {
					smoothScroll(Math.floor(scrollBox.height / 2), 150);
				} else {
					scrollBox.scrollBy(1);
					renderScroll();
				}
				break;

			case "up":
				if (key.shift) {
					smoothScroll(-Math.floor(scrollBox.height / 2), 150);
				} else {
					scrollBox.scrollBy(-1);
					renderScroll();
				}
				break;

			case "pagedown":
			case "space":
				scrollBox.scrollBy(1, "viewport");
				renderScroll();
				break;

			case "pageup":
				scrollBox.scrollBy(-1, "viewport");
				renderScroll();
				break;

			default:
				// Ctrl+D / Ctrl+U for half-page
				if (key.ctrl && key.name === "d") {
					scrollBox.scrollBy(10);
					renderScroll();
				} else if (key.ctrl && key.name === "u") {
					scrollBox.scrollBy(-10);
					renderScroll();
				}
				break;
		}
	});

	// Theme select events
	themeSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index) => {
		themeOverlay.visible = false;
		activeOverlay = null;
		applyTheme(index);
	});

	// Command input submit (enter)
	cmdInput.on(InputRenderableEvents.ENTER, () => {
		const value = cmdInput.value;
		cmdOverlay.visible = false;
		activeOverlay = null;
		const cmd = value.trim();
		if (!cmd) return;
		customDiffCmd = cmd;
		filterUnstaged = false;
		const rawDiff = runDiffCmd(cmd);
		const refreshed = parseDiff(rawDiff);
		applySession(refreshed);
		files.length = 0;
		files.push(...refreshed);
		cursorFileIdx = 0;
		render();
	});

	// Initial render
	render();
	scrollBox.focus();
}

function startTUI() {
	main();
}

// --- Dispatch ---

if (args[0] === "update") {
	runUpdate()
		.then(() => process.exit(0))
		.catch((e) => {
			console.error(`  \u2717 ${e.message}`);
			process.exit(1);
		});
} else {
	startTUI();
}

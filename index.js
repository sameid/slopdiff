#!/usr/bin/env node

// Force color support
process.env.FORCE_COLOR = "1";

import blessed from "blessed";
import { execSync } from "child_process";
import { createHighlighter, bundledLanguages } from "shiki";
import path from "path";
import fs from "fs";

// --- Theme config ---
const args = process.argv.slice(2);
const themeIdx = args.indexOf("--theme");
const INITIAL_THEME = themeIdx !== -1 && args[themeIdx + 1] ? args[themeIdx + 1] : "tokyo-night";

// Selectable themes: ui key + shiki theme for code highlighting
const SELECTABLE_THEMES = [
	{ label: "Tokyo Night",  uiKey: "tokyo-night", shikiTheme: "tokyo-night" },
	{ label: "Atom One Dark", uiKey: "one-dark",   shikiTheme: "one-dark-pro" },
	{ label: "OpenCode",      uiKey: "opencode",   shikiTheme: "monokai" },
];

// Active theme state (mutated on switch)
let currentThemeIdx = Math.max(0, SELECTABLE_THEMES.findIndex((t) => t.uiKey === INITIAL_THEME));
let THEME_NAME = SELECTABLE_THEMES[currentThemeIdx].shikiTheme; // used by shiki

// UI colors per theme
const UI_THEMES = {
	"tokyo-night": {
		headerBg: "#1a1b26",
		headerFg: "#a9b1d6",
		statusBarBg: "#24283b",
		statusBarFg: "#a9b1d6",
		scrollbarBg: "#3b4261",
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
		statusBarBg: "#21252b",
		statusBarFg: "#abb2bf",
		scrollbarBg: "#3e4451",
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
	"opencode": {
		headerBg: "#141414",
		headerFg: "#eeeeee",
		statusBarBg: "#1e1e1e",
		statusBarFg: "#808080",
		scrollbarBg: "#3c3c3c",
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
	const lang = EXT_TO_LANG[ext];
	// Verify shiki supports it
	if (lang && bundledLanguages[lang]) return lang;
	return null;
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

function stageFile(filePath) {
	try {
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
		// silently ignore write errors
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

// --- Shiki highlighting ---

// Font style bitmask from shiki
const FontStyle = { Italic: 1, Bold: 2, Underline: 4 };

// Convert hex color "#RRGGBB" to ANSI truecolor foreground escape
function hexToAnsi(hex) {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `\x1b[38;2;${r};${g};${b}m`;
}

// Convert hex color "#RRGGBB" to ANSI truecolor background escape
function hexToAnsiBg(hex) {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `\x1b[48;2;${r};${g};${b}m`;
}

const ANSI_RESET = "\x1b[0m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_UNDERLINE = "\x1b[4m";

function tokensToAnsi(tokens, bgEscape) {
	// Outputs raw ANSI escape sequences — no blessed tags, so braces are safe
	// bgEscape: optional raw ANSI background escape to maintain across the line
	const bg = bgEscape || "";
	let result = "";
	for (const token of tokens) {
		const text = token.content;
		if (!token.color && !token.fontStyle) {
			result += bg + text;
			continue;
		}

		let open = bg;
		if (token.fontStyle & FontStyle.Bold) open += ANSI_BOLD;
		if (token.fontStyle & FontStyle.Underline) open += ANSI_UNDERLINE;
		if (token.color) open += hexToAnsi(token.color);

		result += open + text + ANSI_RESET;
	}
	return result;
}

// Highlight an entire hunk's code (for proper context), return token data per line
function highlightHunk(highlighter, hunk, language) {
	if (!language) {
		// No highlighting — return null tokens so buildContent uses raw text
		return hunk.lines.map((l) => ({
			prefix: l[0] || " ",
			tokens: null,
			raw: l.slice(1),
		}));
	}

	// Build the full code block from hunk lines (strip +/-/space prefix)
	// We highlight all lines together so the parser has proper context
	const codeLines = hunk.lines.map((l) => l.slice(1));
	const code = codeLines.join("\n");

	let tokenLines;
	try {
		const result = highlighter.codeToTokens(code, { lang: language, theme: THEME_NAME });
		tokenLines = result.tokens;
	} catch {
		// Fallback: no highlighting
		return hunk.lines.map((l) => ({
			prefix: l[0] || " ",
			tokens: null,
			raw: l.slice(1),
		}));
	}

	// Map token lines back to diff lines with their prefix
	const output = [];
	for (let i = 0; i < hunk.lines.length; i++) {
		const prefix = hunk.lines[i][0] || " ";
		const tokens = tokenLines[i] || [];
		output.push({
			prefix,
			tokens,
			raw: hunk.lines[i].slice(1),
		});
	}

	return output;
}

// --- TUI ---

// lineToFile is rebuilt on every render: lineToFile[lineIdx] = fileIdx
let lineToFile = [];

function buildContent(files, cursorFileIdx, highlighter, filterUnstaged) {
	const lines = [];
	lineToFile = [];

	for (let fi = 0; fi < files.length; fi++) {
		const file = files[fi];
		if (filterUnstaged && file.staged) continue;
		const isCursor = fi === cursorFileIdx;
		const boldOn = isCursor ? "\x1b[1m\x1b[4m" : "";
		const boldOff = isCursor ? ANSI_RESET : "";
		const collapseIcon = file.collapsed ? "\u25b6" : "\u25bc";
		const stagedTag = file.staged ? ` ${hexToAnsi(ui.stagedBadgeFg)}[STAGED]${ANSI_RESET}` : "";
		const viewedTag = file.viewed ? ` ${hexToAnsi(ui.viewedBadgeFg)}[viewed]${ANSI_RESET}` : "";
		const langTag = file.language ? ` ${hexToAnsi(ui.langBadgeFg)}(${file.language})${ANSI_RESET}` : "";

		const nameFg = isCursor ? ui.fileNameActiveFg : ui.fileNameFg;
		lines.push(`${boldOn}${hexToAnsi(nameFg)}${collapseIcon} ${file.path}${ANSI_RESET}${boldOff}${langTag}${stagedTag}${viewedTag}`);
		lineToFile.push(fi);

		if (!file.collapsed) {
			for (const hunk of file.hunks) {
				lines.push(`  ${hexToAnsi(ui.hunkHeaderFg)}${hunk.header}${ANSI_RESET}`);
				lineToFile.push(fi);

				const highlighted = highlightHunk(highlighter, hunk, file.language);
				for (const { prefix: p, tokens, raw } of highlighted) {
					if (p === "+") {
						const ct = tokens ? tokensToAnsi(tokens) : raw;
						lines.push(`  \x1b[42;30m+\x1b[0m ${ct}`);
					} else if (p === "-") {
						const ct = tokens ? tokensToAnsi(tokens) : raw;
						lines.push(`  \x1b[41;30m-\x1b[0m ${ct}`);
					} else {
						const ct = tokens ? tokensToAnsi(tokens) : raw;
						lines.push(`  ${ct}`);
					}
					lineToFile.push(fi);
				}
			}
			lines.push(""); // spacer
			lineToFile.push(fi);
		}
	}

	return lines.join("\n");
}

function getFileLineOffset(files, fileIdx) {
	let offset = 0;
	for (let i = 0; i < fileIdx; i++) {
		offset += 1;
		if (!files[i].collapsed) {
			for (const hunk of files[i].hunks) {
				offset += 1 + hunk.lines.length;
			}
			offset += 1;
		}
	}
	return offset;
}

// --- Main ---

async function main() {
	const rawDiff = getGitDiff();
	const files = parseDiff(rawDiff);
	applySession(files);

	if (files.length === 0) {
		console.log("No diff found against master (or main). Nothing to show.");
		process.exit(0);
	}

	// Collect unique languages from the diff
	const langs = [...new Set(files.map((f) => f.language).filter(Boolean))];

	// Initialize shiki highlighter with all selectable shiki themes
	const highlighter = await createHighlighter({
		themes: SELECTABLE_THEMES.map((t) => t.shikiTheme),
		langs: langs.length > 0 ? langs : ["text"],
	});

	let cursorFileIdx = 0;
	let filterUnstaged = false;

	const screen = blessed.screen({
		smartCSR: true,
		title: "slopdiff",
		fullUnicode: true,
	});

	const header = blessed.box({
		top: 0,
		left: 0,
		width: "100%",
		height: 3,
		content: `{center}{bold}slopdiff{/bold} {${ui.fg}-fg}j/k: navigate | enter/c: collapse | s: stage | f: filter | t: theme | r: refresh | q: quit{/${ui.fg}-fg}{/center}`,
		tags: true,
		style: { fg: ui.headerFg, bg: ui.headerBg },
	});

	const stickyHeader = blessed.box({
		top: 3,
		left: 0,
		width: "100%",
		height: 1,
		tags: false,
		style: { fg: ui.headerFg, bg: ui.headerBg },
	});

	const diffBox = blessed.box({
		top: 4,
		left: 0,
		width: "100%",
		height: "100%-5",
		scrollable: true,
		alwaysScroll: true,
		scrollbar: {
			style: { bg: ui.scrollbarBg },
		},
		keys: true,
		vi: true,
		mouse: true,
		tags: false,
		style: { fg: ui.fg, bg: ui.bg },
		padding: { left: 1 },
	});

	const statusBar = blessed.box({
		bottom: 0,
		left: 0,
		width: "100%",
		height: 1,
		tags: true,
		style: { fg: ui.statusBarFg, bg: ui.statusBarBg },
	});

	screen.append(header);
	screen.append(stickyHeader);
	screen.append(diffBox);
	screen.append(statusBar);

	// --- Theme selector overlay ---

	const themeList = blessed.list({
		top: "center",
		left: "center",
		width: 36,
		height: SELECTABLE_THEMES.length + 4,
		border: { type: "line" },
		label: " Select Theme ",
		tags: true,
		keys: true,
		vi: true,
		hidden: true,
		style: {
			border: { fg: "#fab283" },
			label: { fg: "#fab283" },
			fg: "#eeeeee",
			bg: "#1e1e1e",
			selected: { fg: "#0a0a0a", bg: "#fab283" },
		},
		items: SELECTABLE_THEMES.map((t) => `  ${t.label}`),
	});
	screen.append(themeList);

	function applyTheme(idx) {
		currentThemeIdx = idx;
		THEME_NAME = SELECTABLE_THEMES[idx].shikiTheme;
		ui = UI_THEMES[SELECTABLE_THEMES[idx].uiKey];
		// Update widget styles to new theme colors
		header.style.fg = ui.headerFg;
		header.style.bg = ui.headerBg;
		stickyHeader.style.fg = ui.headerFg;
		stickyHeader.style.bg = ui.headerBg;
		diffBox.style.fg = ui.fg;
		diffBox.style.bg = ui.bg;
		statusBar.style.fg = ui.statusBarFg;
		statusBar.style.bg = ui.statusBarBg;
	}

	screen.key(["t"], () => {
		themeList.select(currentThemeIdx);
		themeList.show();
		themeList.focus();
		screen.render();
	});

	themeList.key(["escape", "q"], () => {
		themeList.hide();
		diffBox.focus();
		screen.render();
	});

	themeList.on("select", (_, idx) => {
		applyTheme(idx);
		themeList.hide();
		diffBox.focus();
		render();
	});

	function updateStickyHeader() {
		const visibleFileIdx = getVisibleFileIdx();
		const file = files[visibleFileIdx];
		const collapseIcon = file.collapsed ? "\u25b6" : "\u25bc";
		const langPart = file.language ? ` ${hexToAnsi(ui.langBadgeFg)}(${file.language})${ANSI_RESET}` : "";
		const stagedPart = file.staged ? ` ${hexToAnsi(ui.stagedBadgeFg)}[STAGED]${ANSI_RESET}` : "";
		const isCursor = visibleFileIdx === cursorFileIdx;
		const nameFg = isCursor ? ui.fileNameActiveFg : ui.fileNameFg;
		const boldOn = isCursor ? "\x1b[1m" : "";
		stickyHeader.setContent(
			` ${boldOn}${hexToAnsi(nameFg)}${collapseIcon} ${file.path}${ANSI_RESET}${langPart}${stagedPart}  ${hexToAnsi(ui.viewedBadgeFg)}${visibleFileIdx + 1}/${files.length}${ANSI_RESET}`,
		);
	}

	function getVisibleFileIdx() {
		const scrollPos = diffBox.childBase;
		return lineToFile[scrollPos] ?? lineToFile[lineToFile.length - 1] ?? 0;
	}

	function render() {
		diffBox.setContent(buildContent(files, cursorFileIdx, highlighter, filterUnstaged));
		const staged = files.filter((f) => f.staged).length;
		const themeName = SELECTABLE_THEMES[currentThemeIdx].label;
		const visibleIdx = getVisibleFileIdx();
		statusBar.setContent(` File ${visibleIdx + 1}/${files.length} | ${staged} staged | ${files[visibleIdx].path} | theme: ${themeName}${filterUnstaged ? "  [unstaged only]" : ""}`);
		updateStickyHeader();
		screen.render();
	}

	function scrollToFile(idx) {
		const offset = getFileLineOffset(files, idx);
		diffBox.setScrollPerc(0);
		diffBox.scroll(offset);
	}

	// Key bindings
	screen.key(["q", "C-c"], () => process.exit(0));

	screen.key(["r"], () => {
		const rawDiff = getGitDiff();
		const refreshed = parseDiff(rawDiff);
		applySession(refreshed);
		files.length = 0;
		files.push(...refreshed);
		cursorFileIdx = Math.min(cursorFileIdx, Math.max(0, files.length - 1));
		render();
	});

	screen.key(["f"], () => {
		filterUnstaged = !filterUnstaged;
		cursorFileIdx = 0;
		render();
	});

	screen.key(["j"], () => {
		if (cursorFileIdx < files.length - 1) {
			files[cursorFileIdx].viewed = true;
			cursorFileIdx++;
			render();
			scrollToFile(cursorFileIdx);
		}
	});

	screen.key(["k"], () => {
		if (cursorFileIdx > 0) {
			cursorFileIdx--;
			render();
			scrollToFile(cursorFileIdx);
		}
	});

	function renderScroll() {
		const staged = files.filter((f) => f.staged).length;
		const themeName = SELECTABLE_THEMES[currentThemeIdx].label;
		const visibleIdx = getVisibleFileIdx();
		statusBar.setContent(` File ${visibleIdx + 1}/${files.length} | ${staged} staged | ${files[visibleIdx].path} | theme: ${themeName}${filterUnstaged ? "  [unstaged only]" : ""}`);
		updateStickyHeader();
		screen.render();
	}

	screen.key(["down"], () => { diffBox.scroll(1);  renderScroll(); });
	screen.key(["up"],   () => { diffBox.scroll(-1); renderScroll(); });

	screen.key(["enter", "c"], () => {
		const idx = getVisibleFileIdx();
		files[idx].collapsed = !files[idx].collapsed;
		if (files[idx].collapsed) {
			files[idx].viewed = true;
		}
		saveSession(files);
		render();
		scrollToFile(idx);
	});

	screen.key(["s"], () => {
		const file = files[getVisibleFileIdx()];
		if (!file.staged) {
			const ok = stageFile(file.path);
			if (ok) {
				file.staged = true;
				render();
			}
		}
	});

	screen.key(["C-d"], () => { diffBox.scroll(Math.floor(diffBox.height / 2));   renderScroll(); });
	screen.key(["C-u"], () => { diffBox.scroll(-Math.floor(diffBox.height / 2));  renderScroll(); });
	screen.key(["pagedown", "space"], () => { diffBox.scroll(diffBox.height - 2); renderScroll(); });
	screen.key(["pageup"], () => { diffBox.scroll(-(diffBox.height - 2));         renderScroll(); });

	// --- Neoscroll-style smooth animated scrolling (Shift+Up / Shift+Down) ---

	let scrollAnimation = null;

	// Easing function: sine ease-in-out
	function easeInOutSine(t) {
		return -(Math.cos(Math.PI * t) - 1) / 2;
	}

	function smoothScroll(totalLines, duration) {
		// Cancel any existing animation
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
				const easedProgress = easeInOutSine(progress);
				const targetScrolled = Math.round(easedProgress * totalLines);
				const delta = targetScrolled - scrolled;

				if (delta !== 0) {
					diffBox.scroll(delta);
					scrolled = targetScrolled;
					renderScroll();
				}

				if (progress >= 1) {
					clearInterval(scrollAnimation.timer);
					scrollAnimation = null;
				}
			}, 16), // ~60fps
		};
	}

	// Shift+Down: smooth scroll down half page
	screen.key(["S-down"], () => {
		smoothScroll(Math.floor(diffBox.height / 2), 300);
	});

	// Shift+Up: smooth scroll up half page
	screen.key(["S-up"], () => {
		smoothScroll(-Math.floor(diffBox.height / 2), 300);
	});

	render();
	diffBox.focus();
}

main();

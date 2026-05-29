#!/usr/bin/env node

// Force color support
process.env.FORCE_COLOR = "1";

import blessed from "blessed";
import { execSync } from "child_process";
import { createHighlighter, bundledLanguages } from "shiki";
import path from "path";

// --- Theme config ---
// Shiki has these built-in: tokyo-night, github-dark, github-light, dracula, nord, etc.
const args = process.argv.slice(2);
const themeIdx = args.indexOf("--theme");
const THEME_NAME = themeIdx !== -1 && args[themeIdx + 1] ? args[themeIdx + 1] : "tokyo-night";

// UI colors per theme (can be extended)
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
		addedFg: "#9ece6a",
		addedBg: "#244032",
		removedFg: "#f7768e",
		removedBg: "#452328",
		hunkHeaderFg: "#bb9af7",
		bg: "#1a1b26",
		fg: "#a9b1d6",
	},
};

// Fallback UI colors if theme not in map
const DEFAULT_UI = {
	headerBg: "#000000",
	headerFg: "#ffffff",
	statusBarBg: "#ffffff",
	statusBarFg: "#000000",
	scrollbarBg: "#444444",
	fileNameFg: "#ffff00",
	fileNameActiveFg: "#ffffff",
	stagedBadgeFg: "#00ff00",
	viewedBadgeFg: "#888888",
	langBadgeFg: "#888888",
	addedFg: "#00ff00",
	addedBg: "#244032",
	removedFg: "#ff0000",
	removedBg: "#452328",
	hunkHeaderFg: "#00ffff",
	bg: "#000000",
	fg: "#ffffff",
};

const ui = UI_THEMES[THEME_NAME] || DEFAULT_UI;

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
		return execSync("git diff master..", { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
	} catch {
		try {
			return execSync("git diff main..", { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
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

function buildContent(files, cursorFileIdx, highlighter) {
	const lines = [];

	for (let fi = 0; fi < files.length; fi++) {
		const file = files[fi];
		const isCursor = fi === cursorFileIdx;
		const boldOn = isCursor ? "\x1b[1m\x1b[4m" : "";
		const boldOff = isCursor ? ANSI_RESET : "";
		const collapseIcon = file.collapsed ? "\u25b6" : "\u25bc";
		const stagedTag = file.staged ? ` ${hexToAnsi(ui.stagedBadgeFg)}[STAGED]${ANSI_RESET}` : "";
		const viewedTag = file.viewed ? ` ${hexToAnsi(ui.viewedBadgeFg)}[viewed]${ANSI_RESET}` : "";
		const langTag = file.language ? ` ${hexToAnsi(ui.langBadgeFg)}(${file.language})${ANSI_RESET}` : "";

		const nameFg = isCursor ? ui.fileNameActiveFg : ui.fileNameFg;
		lines.push(`${boldOn}${hexToAnsi(nameFg)}${collapseIcon} ${file.path}${ANSI_RESET}${boldOff}${langTag}${stagedTag}${viewedTag}`);

		if (!file.collapsed) {
			for (const hunk of file.hunks) {
				lines.push(`  ${hexToAnsi(ui.hunkHeaderFg)}${hunk.header}${ANSI_RESET}`);

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
				}
			}
			lines.push(""); // spacer
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

	if (files.length === 0) {
		console.log("No diff found against master (or main). Nothing to show.");
		process.exit(0);
	}

	// Collect unique languages from the diff
	const langs = [...new Set(files.map((f) => f.language).filter(Boolean))];

	// Initialize shiki highlighter with only the needed languages
	const highlighter = await createHighlighter({
		themes: [THEME_NAME],
		langs: langs.length > 0 ? langs : ["text"],
	});

	let cursorFileIdx = 0;

	const screen = blessed.screen({
		smartCSR: true,
		title: "diffai",
		fullUnicode: true,
	});

	const header = blessed.box({
		top: 0,
		left: 0,
		width: "100%",
		height: 3,
		content: `{center}{bold}diffai{/bold} {${ui.fg}-fg}j/k: navigate | enter/c: collapse | s: stage | q: quit{/${ui.fg}-fg}{/center}`,
		tags: true,
		style: { fg: ui.headerFg, bg: ui.headerBg },
	});

	const diffBox = blessed.box({
		top: 3,
		left: 0,
		width: "100%",
		height: "100%-4",
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
	screen.append(diffBox);
	screen.append(statusBar);

	function render() {
		diffBox.setContent(buildContent(files, cursorFileIdx, highlighter));
		const staged = files.filter((f) => f.staged).length;
		statusBar.setContent(` File ${cursorFileIdx + 1}/${files.length} | ${staged} staged | ${files[cursorFileIdx].path} | theme: ${THEME_NAME}`);
		screen.render();
	}

	function scrollToFile(idx) {
		const offset = getFileLineOffset(files, idx);
		diffBox.setScrollPerc(0);
		diffBox.scroll(offset);
	}

	// Key bindings
	screen.key(["q", "C-c"], () => process.exit(0));

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

	screen.key(["down"], () => {
		diffBox.scroll(1);
		screen.render();
	});

	screen.key(["up"], () => {
		diffBox.scroll(-1);
		screen.render();
	});

	screen.key(["enter", "c"], () => {
		files[cursorFileIdx].collapsed = !files[cursorFileIdx].collapsed;
		if (files[cursorFileIdx].collapsed) {
			files[cursorFileIdx].viewed = true;
		}
		render();
		scrollToFile(cursorFileIdx);
	});

	screen.key(["s"], () => {
		const file = files[cursorFileIdx];
		if (!file.staged) {
			const ok = stageFile(file.path);
			if (ok) {
				file.staged = true;
				render();
			}
		}
	});

	screen.key(["C-d"], () => {
		diffBox.scroll(Math.floor(diffBox.height / 2));
		screen.render();
	});

	screen.key(["C-u"], () => {
		diffBox.scroll(-Math.floor(diffBox.height / 2));
		screen.render();
	});

	screen.key(["pagedown", "space"], () => {
		diffBox.scroll(diffBox.height - 2);
		screen.render();
	});

	screen.key(["pageup"], () => {
		diffBox.scroll(-(diffBox.height - 2));
		screen.render();
	});

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
					screen.render();
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

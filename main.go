package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"unicode/utf8"

	"github.com/alecthomas/chroma/v2"
	"github.com/alecthomas/chroma/v2/lexers"
	"github.com/alecthomas/chroma/v2/styles"
	tea "github.com/charmbracelet/bubbletea"
)

const VERSION = "0.2.0"

// ─── Themes ──────────────────────────────────────────────────────────────────

type UITheme struct {
	Key             string
	Label           string
	ChromaStyle     string
	HeaderBg        string
	HeaderFg        string
	StickyHeaderBg  string
	StickyHeaderFg  string
	StatusBarBg     string
	StatusBarFg     string
	FileNameFg      string
	FileNameActiveFg string
	StagedBadgeFg   string
	ViewedBadgeFg   string
	LangBadgeFg     string
	AddedBg         string
	RemovedBg       string
	HunkHeaderFg    string
	Bg              string
	Fg              string
}

var themes = []UITheme{
	{
		Key: "tokyo-night", Label: "Tokyo Night", ChromaStyle: "dracula",
		HeaderBg: "#1a1b26", HeaderFg: "#a9b1d6",
		StickyHeaderBg: "#3b4261", StickyHeaderFg: "#c0caf5",
		StatusBarBg: "#24283b", StatusBarFg: "#a9b1d6",
		FileNameFg: "#7aa2f7", FileNameActiveFg: "#c0caf5",
		StagedBadgeFg: "#9ece6a", ViewedBadgeFg: "#565f89", LangBadgeFg: "#565f89",
		AddedBg: "#244032", RemovedBg: "#452328",
		HunkHeaderFg: "#bb9af7",
		Bg: "#1a1b26", Fg: "#a9b1d6",
	},
	{
		Key: "one-dark", Label: "Atom One Dark", ChromaStyle: "onedark",
		HeaderBg: "#21252b", HeaderFg: "#abb2bf",
		StickyHeaderBg: "#3e4451", StickyHeaderFg: "#e5c07b",
		StatusBarBg: "#21252b", StatusBarFg: "#abb2bf",
		FileNameFg: "#61afef", FileNameActiveFg: "#e5c07b",
		StagedBadgeFg: "#98c379", ViewedBadgeFg: "#5c6370", LangBadgeFg: "#5c6370",
		AddedBg: "#1e3a29", RemovedBg: "#3b1f1f",
		HunkHeaderFg: "#c678dd",
		Bg: "#282c34", Fg: "#abb2bf",
	},
	{
		Key: "opencode", Label: "OpenCode", ChromaStyle: "monokai",
		HeaderBg: "#141414", HeaderFg: "#eeeeee",
		StickyHeaderBg: "#282828", StickyHeaderFg: "#fab283",
		StatusBarBg: "#1e1e1e", StatusBarFg: "#808080",
		FileNameFg: "#fab283", FileNameActiveFg: "#ffc09f",
		StagedBadgeFg: "#7fd88f", ViewedBadgeFg: "#606060", LangBadgeFg: "#606060",
		AddedBg: "#20303b", RemovedBg: "#37222c",
		HunkHeaderFg: "#9d7cd8",
		Bg: "#0a0a0a", Fg: "#eeeeee",
	},
}

// ─── Language Detection ──────────────────────────────────────────────────────

var extToLang = map[string]string{
	".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
	".jsx": "jsx", ".ts": "typescript", ".tsx": "tsx",
	".py": "python", ".rb": "ruby", ".go": "go", ".rs": "rust",
	".java": "java", ".kt": "kotlin", ".swift": "swift",
	".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp",
	".cs": "csharp", ".css": "css", ".scss": "scss", ".less": "less",
	".html": "html", ".htm": "html", ".xml": "xml", ".svg": "xml",
	".json": "json", ".yaml": "yaml", ".yml": "yaml",
	".md": "markdown", ".sh": "bash", ".bash": "bash", ".zsh": "bash",
	".fish": "fish", ".sql": "sql", ".php": "php", ".lua": "lua",
	".toml": "toml", ".ini": "ini", ".dockerfile": "docker",
	".r": "r", ".scala": "scala", ".ex": "elixir", ".exs": "elixir",
	".erl": "erlang", ".hs": "haskell", ".ml": "ocaml", ".dart": "dart",
	".vue": "vue", ".svelte": "svelte", ".graphql": "graphql", ".gql": "graphql",
	".tf": "terraform", ".hcl": "hcl", ".zig": "zig",
	".proto": "protobuf", ".ps1": "powershell", ".psm1": "powershell",
	".clj": "clojure", ".cljs": "clojure", ".elm": "elm",
}

func detectLanguage(filePath string) string {
	base := strings.ToLower(filepath.Base(filePath))
	ext := strings.ToLower(filepath.Ext(filePath))
	if base == "dockerfile" || strings.HasPrefix(base, "dockerfile.") {
		return "docker"
	}
	if base == "makefile" {
		return "makefile"
	}
	if base == "cmakelists.txt" || ext == ".cmake" {
		return "cmake"
	}
	if lang, ok := extToLang[ext]; ok {
		return lang
	}
	return ""
}

// ─── Diff Parsing ────────────────────────────────────────────────────────────

type DiffLine struct {
	Prefix  byte // '+', '-', ' '
	Content string
}

type Hunk struct {
	Header string
	Lines  []DiffLine
}

type DiffFile struct {
	Path      string
	Language  string
	Hunks     []Hunk
	Collapsed bool
	Viewed    bool
	Staged    bool
}

func parseDiff(rawDiff string) []DiffFile {
	rawDiff = strings.TrimSpace(rawDiff)
	if rawDiff == "" {
		return nil
	}

	var files []DiffFile
	re := regexp.MustCompile(`(?m)^diff --git `)
	indices := re.FindAllStringIndex(rawDiff, -1)

	var chunks []string
	for i, idx := range indices {
		start := idx[0]
		var end int
		if i+1 < len(indices) {
			end = indices[i+1][0]
		} else {
			end = len(rawDiff)
		}
		chunks = append(chunks, rawDiff[start:end])
	}

	headerRe := regexp.MustCompile(`^diff --git a/(.+?) b/(.+)`)
	hunkRe := regexp.MustCompile(`^@@`)

	for _, chunk := range chunks {
		lines := strings.Split(chunk, "\n")
		m := headerRe.FindStringSubmatch(lines[0])
		if m == nil {
			continue
		}
		filePath := m[2]

		var hunks []Hunk
		var currentHunk *Hunk

		for _, line := range lines[1:] {
			if hunkRe.MatchString(line) {
				if currentHunk != nil {
					hunks = append(hunks, *currentHunk)
				}
				currentHunk = &Hunk{Header: line}
			} else if currentHunk != nil {
				prefix := byte(' ')
				content := line
				if len(line) > 0 {
					prefix = line[0]
					content = line[1:]
				}
				if prefix != '+' && prefix != '-' {
					prefix = ' '
					content = line
				}
				currentHunk.Lines = append(currentHunk.Lines, DiffLine{Prefix: prefix, Content: content})
			}
		}
		if currentHunk != nil {
			hunks = append(hunks, *currentHunk)
		}

		files = append(files, DiffFile{
			Path:     filePath,
			Language: detectLanguage(filePath),
			Hunks:    hunks,
		})
	}

	return files
}

// ─── Git Helpers ─────────────────────────────────────────────────────────────

func runCmd(name string, args ...string) string {
	cmd := exec.Command(name, args...)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return string(out)
}

func getGitDiff() string {
	diff := runCmd("git", "diff", "master")
	if diff == "" {
		diff = runCmd("git", "diff", "main")
	}
	return diff
}

func getWorkingDiff() string {
	return runCmd("git", "diff")
}

func runDiffCmd(cmd string) string {
	parts := strings.Fields(cmd)
	if len(parts) == 0 {
		return ""
	}
	return runCmd(parts[0], parts[1:]...)
}

func stageFile(filePath string) bool {
	diff := runCmd("git", "diff", "--", filePath)
	if strings.TrimSpace(diff) == "" {
		return false
	}
	cmd := exec.Command("git", "add", filePath)
	return cmd.Run() == nil
}

// ─── Session Persistence ─────────────────────────────────────────────────────

type Session struct {
	Collapsed []string `json:"collapsed"`
}

func sessionPath() string {
	cwd, _ := os.Getwd()
	return filepath.Join(cwd, ".slopdiff")
}

func loadSession() Session {
	data, err := os.ReadFile(sessionPath())
	if err != nil {
		return Session{}
	}
	var s Session
	json.Unmarshal(data, &s)
	return s
}

func saveSession(files []DiffFile) {
	var collapsed []string
	for _, f := range files {
		if f.Collapsed {
			collapsed = append(collapsed, f.Path)
		}
	}
	data, _ := json.MarshalIndent(Session{Collapsed: collapsed}, "", "  ")
	os.WriteFile(sessionPath(), data, 0644)
}

func applySession(files []DiffFile) {
	session := loadSession()
	set := make(map[string]bool)
	for _, p := range session.Collapsed {
		set[p] = true
	}
	for i := range files {
		if set[files[i].Path] {
			files[i].Collapsed = true
		}
	}
}

// ─── Syntax Highlighting ─────────────────────────────────────────────────────

func highlightLine(content, language, chromaStyleName string) string {
	if language == "" {
		return content
	}
	lexer := lexers.Get(language)
	if lexer == nil {
		return content
	}
	lexer = chroma.Coalesce(lexer)

	style := styles.Get(chromaStyleName)
	if style == nil {
		style = styles.Fallback
	}

	iterator, err := lexer.Tokenise(nil, content)
	if err != nil {
		return content
	}

	var sb strings.Builder
	for token := iterator(); token != chroma.EOF; token = iterator() {
		entry := style.Get(token.Type)
		text := token.Value

		hasStyle := false
		if entry.Colour.IsSet() {
			r, g, b := entry.Colour.Red(), entry.Colour.Green(), entry.Colour.Blue()
			sb.WriteString(fmt.Sprintf("\x1b[38;2;%d;%d;%dm", r, g, b))
			hasStyle = true
		}
		if entry.Bold == chroma.Yes {
			sb.WriteString("\x1b[1m")
			hasStyle = true
		}
		if entry.Italic == chroma.Yes {
			sb.WriteString("\x1b[3m")
			hasStyle = true
		}
		sb.WriteString(text)
		if hasStyle {
			// Reset fg + bold/italic only, preserve background
			sb.WriteString("\x1b[22;23;39m")
		}
	}
	return sb.String()
}

// ─── TUI Model ───────────────────────────────────────────────────────────────

type mode int

const (
	modeNormal mode = iota
	modeThemeSelect
	modeCmdInput
)

type model struct {
	files          []DiffFile
	cursorFileIdx  int
	scrollOffset   int
	width          int
	height         int
	themeIdx       int
	filterUnstaged bool
	customDiffCmd  string
	mode           mode
	cmdInputValue  string
	cmdCursorPos   int
	// built content
	lines      []string
	lineToFile []int
}

func initialModel(cmd string, themeKey string) model {
	themeIdx := 0
	for i, t := range themes {
		if t.Key == themeKey {
			themeIdx = i
			break
		}
	}

	var rawDiff string
	if cmd != "" {
		rawDiff = runDiffCmd(cmd)
	} else {
		rawDiff = getGitDiff()
	}

	files := parseDiff(rawDiff)
	applySession(files)

	m := model{
		files:         files,
		themeIdx:      themeIdx,
		customDiffCmd: cmd,
	}

	return m
}

func (m model) theme() UITheme {
	return themes[m.themeIdx]
}

// ─── Bubble Tea Interface ────────────────────────────────────────────────────

func (m model) Init() tea.Cmd {
	return nil
}

type windowSizeMsg struct {
	width, height int
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.buildContent()
		return m, nil

	case tea.KeyMsg:
		switch m.mode {
		case modeThemeSelect:
			return m.updateThemeSelect(msg)
		case modeCmdInput:
			return m.updateCmdInput(msg)
		default:
			return m.updateNormal(msg)
		}
	}
	return m, nil
}

func (m model) updateNormal(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "q", "ctrl+c":
		return m, tea.Quit

	case "j":
		if m.cursorFileIdx < len(m.files)-1 {
			m.files[m.cursorFileIdx].Viewed = true
			m.cursorFileIdx++
			m.scrollToFile(m.cursorFileIdx)
			m.buildContent()
		}

	case "k":
		if m.cursorFileIdx > 0 {
			m.cursorFileIdx--
			m.scrollToFile(m.cursorFileIdx)
			m.buildContent()
		}

	case "down":
		m.scrollOffset++
		m.clampScroll()
		m.syncCursorToScroll()

	case "up":
		m.scrollOffset--
		m.clampScroll()
		m.syncCursorToScroll()

	case "ctrl+d":
		m.scrollOffset += m.viewportHeight() / 2
		m.clampScroll()
		m.syncCursorToScroll()

	case "ctrl+u":
		m.scrollOffset -= m.viewportHeight() / 2
		m.clampScroll()
		m.syncCursorToScroll()

	case "pgdown", " ":
		m.scrollOffset += m.viewportHeight() - 2
		m.clampScroll()
		m.syncCursorToScroll()

	case "pgup":
		m.scrollOffset -= m.viewportHeight() - 2
		m.clampScroll()
		m.syncCursorToScroll()

	case "enter", "c":
		if len(m.files) > 0 {
			m.files[m.cursorFileIdx].Collapsed = !m.files[m.cursorFileIdx].Collapsed
			if m.files[m.cursorFileIdx].Collapsed {
				m.files[m.cursorFileIdx].Viewed = true
			}
			saveSession(m.files)
			m.buildContent()
			m.scrollToFile(m.cursorFileIdx)
		}

	case "C":
		for i := range m.files {
			m.files[i].Collapsed = true
		}
		saveSession(m.files)
		m.buildContent()
		m.scrollToFile(m.cursorFileIdx)

	case "E":
		for i := range m.files {
			m.files[i].Collapsed = false
		}
		saveSession(m.files)
		m.buildContent()
		m.scrollToFile(m.cursorFileIdx)

	case "s":
		if len(m.files) > 0 {
			file := &m.files[m.cursorFileIdx]
			if !file.Staged && stageFile(file.Path) {
				file.Staged = true
				m.buildContent()
			}
		}

	case "f":
		m.filterUnstaged = !m.filterUnstaged
		var rawDiff string
		if m.filterUnstaged {
			rawDiff = getWorkingDiff()
		} else {
			rawDiff = getGitDiff()
		}
		m.files = parseDiff(rawDiff)
		applySession(m.files)
		m.cursorFileIdx = 0
		m.scrollOffset = 0
		m.buildContent()

	case "r":
		var rawDiff string
		if m.customDiffCmd != "" {
			rawDiff = runDiffCmd(m.customDiffCmd)
		} else if m.filterUnstaged {
			rawDiff = getWorkingDiff()
		} else {
			rawDiff = getGitDiff()
		}
		m.files = parseDiff(rawDiff)
		applySession(m.files)
		if m.cursorFileIdx >= len(m.files) {
			m.cursorFileIdx = max(0, len(m.files)-1)
		}
		m.buildContent()

	case "t":
		m.mode = modeThemeSelect

	case "e":
		m.mode = modeCmdInput
		if m.customDiffCmd != "" {
			m.cmdInputValue = m.customDiffCmd
		} else {
			m.cmdInputValue = "git diff master"
		}
		m.cmdCursorPos = len(m.cmdInputValue)
	}

	return m, nil
}

func (m model) updateThemeSelect(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "escape", "q":
		m.mode = modeNormal
	case "j", "down":
		m.themeIdx = (m.themeIdx + 1) % len(themes)
	case "k", "up":
		m.themeIdx = (m.themeIdx - 1 + len(themes)) % len(themes)
	case "enter":
		m.mode = modeNormal
		m.buildContent()
	}
	return m, nil
}

func (m model) updateCmdInput(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "escape":
		m.mode = modeNormal
	case "enter":
		cmd := strings.TrimSpace(m.cmdInputValue)
		if cmd != "" {
			m.customDiffCmd = cmd
			m.filterUnstaged = false
			rawDiff := runDiffCmd(cmd)
			m.files = parseDiff(rawDiff)
			applySession(m.files)
			m.cursorFileIdx = 0
			m.scrollOffset = 0
			m.buildContent()
		}
		m.mode = modeNormal
	case "backspace":
		if m.cmdCursorPos > 0 {
			m.cmdInputValue = m.cmdInputValue[:m.cmdCursorPos-1] + m.cmdInputValue[m.cmdCursorPos:]
			m.cmdCursorPos--
		}
	case "left":
		if m.cmdCursorPos > 0 {
			m.cmdCursorPos--
		}
	case "right":
		if m.cmdCursorPos < len(m.cmdInputValue) {
			m.cmdCursorPos++
		}
	case "ctrl+a":
		m.cmdCursorPos = 0
	case "ctrl+e":
		m.cmdCursorPos = len(m.cmdInputValue)
	case "ctrl+u":
		m.cmdInputValue = m.cmdInputValue[m.cmdCursorPos:]
		m.cmdCursorPos = 0
	default:
		if len(msg.String()) == 1 && msg.String()[0] >= 32 {
			m.cmdInputValue = m.cmdInputValue[:m.cmdCursorPos] + msg.String() + m.cmdInputValue[m.cmdCursorPos:]
			m.cmdCursorPos++
		}
	}
	return m, nil
}

// ─── Content Building ────────────────────────────────────────────────────────

func (m *model) buildContent() {
	t := m.theme()
	m.lines = nil
	m.lineToFile = nil

	for fi, file := range m.files {
		isCursor := fi == m.cursorFileIdx
		icon := "▶"
		if !file.Collapsed {
			icon = "▼"
		}

		nameFg := t.FileNameFg
		if isCursor {
			nameFg = t.FileNameActiveFg
		}

		line := fgColor(nameFg, icon+" "+file.Path)
		if isCursor {
			line = "\x1b[1m\x1b[4m" + line + "\x1b[22;24m"
		}
		if file.Language != "" {
			line += " " + fgColor(t.LangBadgeFg, "("+file.Language+")")
		}
		if file.Staged {
			line += " " + fgColor(t.StagedBadgeFg, "[STAGED]")
		}
		if file.Viewed {
			line += " " + fgColor(t.ViewedBadgeFg, "[viewed]")
		}

		m.lines = append(m.lines, line)
		m.lineToFile = append(m.lineToFile, fi)

		if !file.Collapsed {
			for _, hunk := range file.Hunks {
				m.lines = append(m.lines, "  "+fgColor(t.HunkHeaderFg, hunk.Header))
				m.lineToFile = append(m.lineToFile, fi)

				for _, dl := range hunk.Lines {
					highlighted := highlightLine(dl.Content, file.Language, t.ChromaStyle)
					var prefix string
					switch dl.Prefix {
					case '+':
						prefix = "  \x1b[42;30m+\x1b[49;39m "
					case '-':
						prefix = "  \x1b[41;30m-\x1b[49;39m "
					default:
						prefix = "    "
					}
					m.lines = append(m.lines, prefix+highlighted)
					m.lineToFile = append(m.lineToFile, fi)
				}
			}
			// spacer
			m.lines = append(m.lines, "")
			m.lineToFile = append(m.lineToFile, fi)
		}
	}
}

func (m *model) viewportHeight() int {
	// header(1) + sticky(1) + status(1) = 3 lines of chrome
	return m.height - 3
}

func (m *model) scrollToFile(idx int) {
	offset := 0
	for i := 0; i < idx && i < len(m.files); i++ {
		offset++
		if !m.files[i].Collapsed {
			for _, hunk := range m.files[i].Hunks {
				offset += 1 + len(hunk.Lines)
			}
			offset++ // spacer
		}
	}
	m.scrollOffset = offset
	m.clampScroll()
}

func (m *model) clampScroll() {
	maxScroll := len(m.lines) - m.viewportHeight()
	if maxScroll < 0 {
		maxScroll = 0
	}
	if m.scrollOffset > maxScroll {
		m.scrollOffset = maxScroll
	}
	if m.scrollOffset < 0 {
		m.scrollOffset = 0
	}
}

func (m *model) syncCursorToScroll() {
	if len(m.lineToFile) == 0 {
		return
	}
	idx := m.scrollOffset
	if idx >= len(m.lineToFile) {
		idx = len(m.lineToFile) - 1
	}
	m.cursorFileIdx = m.lineToFile[idx]
}

// ─── View ────────────────────────────────────────────────────────────────────

func (m model) View() string {
	if m.width == 0 || m.height == 0 {
		return ""
	}

	t := m.theme()

	// Layout: header (1 line) + sticky (1 line) + viewport (height-3) + status (1 line)
	vpHeight := m.height - 3
	if vpHeight < 1 {
		vpHeight = 1
	}

	bgEsc := bgColor(t.Bg)
	fgEsc := fgColorEsc(t.Fg)

	var output []string

	// ── Header (1 line) ──
	headerContent := "slopdiff  j/k: navigate | enter/c: collapse | C/E: all | s: stage | f: filter | e: cmd | t: theme | r: refresh | q: quit"
	output = append(output, m.renderFullWidthLine(headerContent, t.HeaderBg, t.HeaderFg))

	// ── Sticky header (1 line) ──
	var stickyText string
	if len(m.files) == 0 {
		stickyText = " [No files]"
	} else {
		file := m.files[m.cursorFileIdx]
		icon := "▶"
		if !file.Collapsed {
			icon = "▼"
		}
		stickyText = fmt.Sprintf(" %s %s", icon, file.Path)
		if file.Language != "" {
			stickyText += " (" + file.Language + ")"
		}
		if file.Staged {
			stickyText += " [STAGED]"
		}
		stickyText += fmt.Sprintf("  %d/%d", m.cursorFileIdx+1, len(m.files))
	}
	output = append(output, m.renderFullWidthLine(stickyText, t.StickyHeaderBg, t.StickyHeaderFg))

	// ── Diff viewport (vpHeight lines) ──
	start := m.scrollOffset
	end := start + vpHeight
	if end > len(m.lines) {
		end = len(m.lines)
	}
	var visibleLines []string
	if start < len(m.lines) {
		visibleLines = m.lines[start:end]
	}
	for _, line := range visibleLines {
		content := " " + line
		visW := visibleWidth(content)
		padN := m.width - visW
		if padN < 0 {
			padN = 0
		}
		output = append(output, bgEsc+fgEsc+content+bgEsc+strings.Repeat(" ", padN)+"\x1b[0m")
	}
	// Fill remaining viewport with empty bg lines
	for i := len(visibleLines); i < vpHeight; i++ {
		output = append(output, bgEsc+strings.Repeat(" ", m.width)+"\x1b[0m")
	}

	// ── Status bar (1 line) ──
	var statusText string
	if len(m.files) == 0 {
		statusText = fmt.Sprintf(" No files | theme: %s", t.Label)
	} else {
		staged := 0
		for _, f := range m.files {
			if f.Staged {
				staged++
			}
		}
		statusText = fmt.Sprintf(" File %d/%d | %d staged | %s | theme: %s",
			m.cursorFileIdx+1, len(m.files), staged, m.files[m.cursorFileIdx].Path, t.Label)
	}
	if m.filterUnstaged {
		statusText += "  [working tree]"
	}
	versionRight := fmt.Sprintf("v%s ", VERSION)
	pad := m.width - visibleWidth(statusText) - len(versionRight)
	if pad < 0 {
		pad = 0
	}
	statusText += strings.Repeat(" ", pad) + versionRight
	output = append(output, m.renderFullWidthLine(statusText, t.StatusBarBg, t.StatusBarFg))

	result := strings.Join(output, "\n")

	// Overlays (rendered as absolute positioned via ANSI cursor movement)
	if m.mode == modeThemeSelect {
		result = m.overlayOnResult(result, m.renderThemeOverlayLines())
	}
	if m.mode == modeCmdInput {
		result = m.overlayOnResult(result, m.renderCmdOverlayLines())
	}

	return result
}

// renderFullWidthLine renders a line with bg/fg filling to full terminal width
func (m model) renderFullWidthLine(text, bgHex, fgHex string) string {
	bg := bgColor(bgHex)
	fg := fgColorEsc(fgHex)
	visW := visibleWidth(text)
	padN := m.width - visW
	if padN < 0 {
		padN = 0
	}
	return bg + fg + text + strings.Repeat(" ", padN) + "\x1b[0m"
}

// overlayOnResult places overlay lines centered on the output
func (m model) overlayOnResult(result string, overlayLines []string) string {
	lines := strings.Split(result, "\n")
	startRow := m.height/2 - len(overlayLines)/2
	startCol := m.width/2 - visibleWidth(overlayLines[0])/2
	if startCol < 0 {
		startCol = 0
	}
	for i, ol := range overlayLines {
		row := startRow + i
		if row >= 0 && row < len(lines) {
			// Replace the section of the line with the overlay content
			bg := bgColor("#1e1e1e")
			fg := fgColorEsc("#eeeeee")
			lines[row] = lines[row][:0] + strings.Repeat(" ", startCol) + bg + fg + ol + "\x1b[0m"
			// Pad to width
			visW := visibleWidth(lines[row])
			if visW < m.width {
				lines[row] += bgColor(m.theme().Bg) + strings.Repeat(" ", m.width-visW) + "\x1b[0m"
			}
		}
	}
	return strings.Join(lines, "\n")
}

func (m model) renderThemeOverlayLines() []string {
	var lines []string
	lines = append(lines, "┌─ Select Theme ──────────────────┐")
	for i, t := range themes {
		prefix := "  "
		if i == m.themeIdx {
			prefix = "▸ "
		}
		lines = append(lines, fmt.Sprintf("│ %s%-30s │", prefix, t.Label))
	}
	lines = append(lines, "└──────────────────────────────────┘")
	return lines
}

func (m model) renderCmdOverlayLines() []string {
	boxWidth := m.width * 60 / 100
	if boxWidth < 40 {
		boxWidth = 40
	}
	innerWidth := boxWidth - 4

	display := m.cmdInputValue
	if m.cmdCursorPos <= len(display) {
		display = display[:m.cmdCursorPos] + "█" + display[m.cmdCursorPos:]
	}
	if len(display) > innerWidth {
		display = display[len(display)-innerWidth:]
	}

	top := "┌─ Diff command " + strings.Repeat("─", boxWidth-17) + "┐"
	mid := "│ " + display + strings.Repeat(" ", max(0, innerWidth-visibleWidth(display))) + " │"
	bot := "└" + strings.Repeat("─", boxWidth-2) + "┘"

	return []string{top, mid, bot}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func fgColor(hex, text string) string {
	if len(hex) != 7 {
		return text
	}
	r := hexVal(hex[1:3])
	g := hexVal(hex[3:5])
	b := hexVal(hex[5:7])
	return fmt.Sprintf("\x1b[38;2;%d;%d;%dm%s\x1b[39m", r, g, b, text)
}

func fgColorEsc(hex string) string {
	if len(hex) != 7 {
		return ""
	}
	r := hexVal(hex[1:3])
	g := hexVal(hex[3:5])
	b := hexVal(hex[5:7])
	return fmt.Sprintf("\x1b[38;2;%d;%d;%dm", r, g, b)
}

func bgColor(hex string) string {
	if len(hex) != 7 {
		return ""
	}
	r := hexVal(hex[1:3])
	g := hexVal(hex[3:5])
	b := hexVal(hex[5:7])
	return fmt.Sprintf("\x1b[48;2;%d;%d;%dm", r, g, b)
}

// ansiRe matches all ANSI escape sequences (CSI, OSC, etc.)
var ansiRe = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x1b\\|\x1b\][^\x07]*\x07`)

func visibleWidth(s string) int {
	clean := ansiRe.ReplaceAllString(s, "")
	return utf8.RuneCountInString(clean)
}

func hexVal(s string) int {
	v := 0
	for _, c := range s {
		v *= 16
		if c >= '0' && c <= '9' {
			v += int(c - '0')
		} else if c >= 'a' && c <= 'f' {
			v += int(c-'a') + 10
		} else if c >= 'A' && c <= 'F' {
			v += int(c-'A') + 10
		}
	}
	return v
}

// ─── Update Command ──────────────────────────────────────────────────────────

func runUpdate() {
	cdnBase := "https://cdn.sameidusmani.com/slopdiff"

	// Detect platform
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	var binary string
	switch {
	case goos == "darwin" && goarch == "arm64":
		binary = "slopdiff-macos-arm64"
	case goos == "darwin" && goarch == "amd64":
		binary = "slopdiff-macos-x64"
	case goos == "linux" && goarch == "amd64":
		binary = "slopdiff-linux-x64"
	case goos == "linux" && goarch == "arm64":
		binary = "slopdiff-linux-arm64"
	default:
		fmt.Fprintf(os.Stderr, "  ✗ Unsupported platform: %s/%s\n", goos, goarch)
		os.Exit(1)
	}

	// Fetch install.sh and parse version
	resp, err := http.Get(cdnBase + "/install.sh")
	if err != nil {
		fmt.Fprintf(os.Stderr, "  ✗ Could not fetch latest version: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		fmt.Fprintf(os.Stderr, "  ✗ Could not fetch latest version: HTTP %d\n", resp.StatusCode)
		os.Exit(1)
	}
	body, _ := io.ReadAll(resp.Body)
	versionRe := regexp.MustCompile(`BASE_URL="[^"]+/v([^/"]+)"`)
	matches := versionRe.FindSubmatch(body)
	if matches == nil {
		fmt.Fprintf(os.Stderr, "  ✗ Could not parse version from install.sh\n")
		os.Exit(1)
	}
	latestVersion := string(matches[1])

	if latestVersion == VERSION {
		fmt.Printf("  ✓ Already up to date (v%s)\n", VERSION)
		return
	}

	fmt.Printf("  → Updating slopdiff v%s → v%s...\n", VERSION, latestVersion)

	// Download new binary
	url := fmt.Sprintf("%s/bin/v%s/%s", cdnBase, latestVersion, binary)
	dlResp, err := http.Get(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "  ✗ Download failed: %v\n", err)
		os.Exit(1)
	}
	defer dlResp.Body.Close()
	if dlResp.StatusCode != 200 {
		fmt.Fprintf(os.Stderr, "  ✗ Download failed: HTTP %d\n", dlResp.StatusCode)
		os.Exit(1)
	}
	data, _ := io.ReadAll(dlResp.Body)

	// Replace self
	selfPath, _ := os.Executable()
	tmpPath := selfPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "  ✗ Failed to write update: %v\n", err)
		os.Exit(1)
	}
	if err := os.Rename(tmpPath, selfPath); err != nil {
		// Fallback: copy
		if err2 := copyFile(tmpPath, selfPath); err2 != nil {
			fmt.Fprintf(os.Stderr, "  ✗ Failed to replace binary: %v\n", err2)
			os.Exit(1)
		}
		os.Remove(tmpPath)
	}

	fmt.Printf("  ✓ slopdiff updated to v%s\n", latestVersion)
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0755)
}

// ─── Main ────────────────────────────────────────────────────────────────────

func main() {
	args := os.Args[1:]

	// Handle --version
	for _, a := range args {
		if a == "--version" || a == "-v" {
			fmt.Printf("slopdiff v%s\n", VERSION)
			return
		}
	}

	// Handle update command
	if len(args) > 0 && args[0] == "update" {
		runUpdate()
		return
	}

	// Parse --cmd and --theme
	var cmdFlag, themeFlag string
	for i, a := range args {
		if a == "--cmd" && i+1 < len(args) {
			cmdFlag = args[i+1]
		}
		if a == "--theme" && i+1 < len(args) {
			themeFlag = args[i+1]
		}
	}
	if themeFlag == "" {
		themeFlag = "tokyo-night"
	}

	m := initialModel(cmdFlag, themeFlag)

	if len(m.files) == 0 {
		fmt.Println("No diff found. Nothing to show.")
		return
	}

	m.buildContent()

	p := tea.NewProgram(m, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

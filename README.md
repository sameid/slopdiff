# slopdiff

![slopdiff demo](https://cdn.sameidusmani.com/slopdiff/assets/demo-lowres.gif)

A fast, keyboard-driven terminal diff viewer with syntax highlighting, file staging, and session persistence.

```bash
curl -fsSL https://cdn.sameidusmani.com/slopdiff/install.sh | sh
```

---

## Features

- **Syntax highlighted diffs** — powered by [Tree-sitter](https://tree-sitter.github.io/) via [OpenTUI](https://github.com/opentui/opentui) with full truecolor support
- **File navigation** — jump between changed files with `j`/`k`
- **Collapse / expand** — hide file diffs you've already reviewed, persisted across sessions via `.slopdiff`
- **Staging** — stage individual files with `s` directly from the viewer
- **Sticky header** — always shows the current file at the top of the viewport
- **Working tree filter** — toggle between branch diff and unstaged changes only
- **Custom diff command** — run any command that produces unified diff output
- **Theme selector** — Tokyo Night, Atom One Dark, and OpenCode built in
- **Smooth scrolling** — sine-eased scroll animation on Shift+↑/↓

---

## Install

### One-liner

```bash
curl -fsSL https://cdn.sameidusmani.com/slopdiff/install.sh | sh
```

Installs to `~/.slopdiff/bin/slopdiff` and adds it to your PATH.

### Uninstall

```bash
curl -fsSL https://cdn.sameidusmani.com/slopdiff/uninstall.sh | sh
```

Removes `~/.slopdiff/` and cleans up the PATH entry from your shell profile.

### Manual

Download the binary for your platform from `https://cdn.sameidusmani.com/slopdiff/bin/v{version}/` and put it somewhere on your PATH:

| Platform              | Binary                 |
| --------------------- | ---------------------- |
| macOS (Apple Silicon) | `slopdiff-macos-arm64` |
| macOS (Intel)         | `slopdiff-macos-x64`   |
| Linux x64             | `slopdiff-linux-x64`   |
| Linux arm64           | `slopdiff-linux-arm64` |

### From source

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/sameidusmani/slopdiff
cd slopdiff
bun install
bun start
```

---

## Usage

```bash
# Diff current branch against master/main (default)
slopdiff

# Diff against a specific ref
slopdiff --cmd "git diff HEAD~3"

# Show only staged changes
slopdiff --cmd "git diff --staged"

# Compare two branches
slopdiff --cmd "git diff feature..main"

# Use a specific theme
slopdiff --theme one-dark

# Print version
slopdiff --version
```

---

## Keybindings

| Key                       | Action                         |
| ------------------------- | ------------------------------ |
| `j` / `k`                 | Next / previous file           |
| `↑` / `↓`                 | Scroll one line                |
| `Shift+↑` / `Shift+↓`     | Smooth scroll half page        |
| `Ctrl+D` / `Ctrl+U`       | Scroll half page               |
| `Space` / `PgDn` / `PgUp` | Scroll full page               |
| `enter` / `c`             | Collapse / expand current file |
| `C`                       | Collapse all files             |
| `E`                       | Expand all files               |
| `s`                       | Stage current file (`git add`) |
| `f`                       | Toggle working tree filter     |
| `e`                       | Enter a custom diff command    |
| `t`                       | Open theme selector            |
| `r`                       | Refresh diff                   |
| `q` / `Ctrl+C`            | Quit                           |

---

## Themes

Switch themes at runtime with `t` or set a default with `--theme`:

| Key           | Theme                 |
| ------------- | --------------------- |
| `tokyo-night` | Tokyo Night (default) |
| `one-dark`    | Atom One Dark         |
| `opencode`    | OpenCode              |

---

## Session persistence

Collapsed file state is saved to `.slopdiff` in the current directory and restored automatically on next run. Add it to your `.gitignore` (the install script handles this if you used the one-liner).

---

## Building

Requires [Bun](https://bun.sh).

```bash
# Bump version in package.json, then:
bun run build
```

This will:

1. Inject the version into `index.js`
2. Generate `install.sh` and `uninstall.sh` with the versioned download URL
3. Compile a binary for the current platform into `dist/bin/v{version}/`

> **Note:** slopdiff uses a native addon ([OpenTUI](https://github.com/opentui/opentui)) that cannot be cross-compiled. Each platform binary must be built on its native host. Run `bun run build` on macOS arm64, macOS x64, Linux x64, and Linux arm64 separately to produce all binaries.

Upload the contents of `dist/bin/v{version}/` and the updated `install.sh` / `uninstall.sh` to your server.

---

## License

MIT

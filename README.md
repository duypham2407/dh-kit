# dh

A local-first AI coding assistant for your terminal. It indexes your codebase and lets you ask questions, explain symbols, and run AI-powered workflows — all from the command line.

## Requirements

- **macOS** or **Linux**
- **Node.js v22+**
- **Rust 1.94+** (only if building from source)

## Install

### One-liner (macOS / Linux)

```sh
curl -fsSL https://raw.githubusercontent.com/duypham2407/dh-kit/main/scripts/install-github-release.sh | sh
```

### From a release directory

```sh
scripts/install-from-release.sh dist/releases
```

### Manual

```sh
cp dh-darwin-arm64 ~/.local/bin/dh
chmod +x ~/.local/bin/dh
```

Make sure `~/.local/bin` is in your `PATH`.

## Setup

```sh
cd ~/Code/your-project
dh index          # Build the local index (first time only)
```

Optionally set an API key for real embeddings:

```sh
export OPENAI_API_KEY="sk-..."
```

## Usage

```sh
dh                          # Interactive session
dh ask "how does auth work?"
dh explain "createServer"
dh quick "fix the login bug"
dh doctor                   # Health check
dh index                    # Re-index after changes
```

## Build from source

```sh
npm install
make release-all VERSION=v0.2.0
scripts/install-from-release.sh dist/releases
```

## Uninstall

```sh
scripts/uninstall.sh
```

## License

MIT

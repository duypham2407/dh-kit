# dh

A local-first AI coding assistant for your terminal. It indexes your codebase and
lets you ask questions, explain symbols, and run AI-powered workflows from the
command line.

## Requirements

- macOS or Linux
- Node.js v22+
- Rust 1.94+ only if building from source

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

Manual install must copy both the Rust binary and the TypeScript worker bundle:

```sh
mkdir -p ~/.local/bin/ts-worker
cp dh-darwin-arm64 ~/.local/bin/dh
chmod +x ~/.local/bin/dh
cp ts-worker/worker.mjs ~/.local/bin/ts-worker/worker.mjs
cp ts-worker/manifest.json ~/.local/bin/ts-worker/manifest.json
```

Make sure `~/.local/bin` is in your `PATH`.

## Rust-Host Knowledge Boundary

Supported first-wave knowledge commands (`dh ask`, `dh explain`, `dh trace`) are
Rust-hosted on the lifecycle path: Rust starts and supervises the TypeScript
worker bundle and owns startup, readiness, health, timeout, recovery, shutdown,
cleanup, and final exit classification for that local process tree.

Important boundaries:

- TypeScript is the worker for workflow/output behavior on this path, not the
  lifecycle host.
- Bounded broad-understanding `dh ask` requests with a finite static subject can
  use Rust-authored `query.buildEvidence` packet truth. Legacy retrieval packets
  are non-canonical for that Rust-hosted flow and remain compatibility only.
- Build evidence is not universal repository reasoning. Narrow ask/explain
  requests continue to use search, definition, or relationship methods when
  those are the truthful surface.
- Remaining TypeScript-hosted workflow, maintainer, or bridge paths are
  legacy/compatibility-only until separately migrated.
- `dh trace` can still return an `unsupported` command result even though its
  process lifecycle is Rust-hosted.
- Linux and macOS are the supported target platforms. This does not add Windows
  platform support, daemon mode, remote/local socket control plane behavior,
  worker-pool behavior, shell or worktree orchestration redesign, or full
  workflow-lane parity.

## First-Time Setup

Open a terminal in the project you want `dh` to inspect:

```sh
cd ~/Code/your-project
dh --help
dh status
dh index
dh ask "how does X work?"     # Grounded question over the indexed repo
dh explain "functionName"    # Recommended: lookup specific symbols
```

Running bare `dh` prints first-run onboarding and next steps. It does not start
an interactive session.

`dh status` reports local workspace/index/database/index state. It is không phải install readiness, provider config readiness, or embedding-key readiness check.

Optionally set an API key for provider-backed embeddings:

```sh
export OPENAI_API_KEY="sk-..."
```

## Most Important Commands

```sh
dh                             # First-run onboarding and next steps
dh --help                      # Full command list for the installed binary
dh status                      # Workspace/index/database state
dh index                       # Build or refresh the local index
dh explain "functionName"      # Lookup symbols (recommended)
dh ask "how does auth work?"   # Bounded support, may return unsupported
dh trace "request flow"        # May return unsupported in current version
dh quick "add logging"         # Quick-lane workflow (requires API key)
```

## Understanding Knowledge Commands

`dh` provides two main commands for exploring your codebase: `ask` and `explain`.

### When to use `dh explain`

**Use `dh explain` for symbol lookups** (functions, classes, variables):

```sh
dh explain "functionName"
dh explain "ClassName"
```

`dh explain` works reliably for finding definitions and is the **recommended** command for looking up specific code symbols.

### When to use `dh ask`

`dh ask` has **bounded support** in the current release:

- ✅ **Supported**: Search-aware file discovery, definition locations, one-hop relationships
- ⚠️ **Limited**: Broad "how does X work" questions often return "unsupported"
- ✅ **Supported**: Bounded broad-understanding with finite static subjects via `query.buildEvidence`

**If `dh ask` returns "unsupported"**, try:
1. Using `dh explain` for specific symbol lookups instead
2. Running `dh index` to refresh the index
3. Reformulating as a more specific question about a concrete symbol or file

This is a known limitation of the bounded Rust-hosted architecture (see "Rust-Host Knowledge Boundary" above). As the system evolves, more question types will be supported.

## Version

```sh
dh --version
```

## Full User Walkthrough

1. Install the release binary and worker bundle with the installer or the manual
   copy steps above.
2. Confirm the binary is visible:

```sh
dh --help
dh status
```

3. Move into a target repository and build the local index:

```sh
cd ~/Code/your-project
dh index
```

4. Look up specific code symbols:

```sh
dh explain "createServer"
dh explain "UserModel"
```

`dh explain` is the recommended command for finding definitions and understanding specific functions, classes, or variables.

5. Try knowledge queries (bounded support):

```sh
dh ask "where is UserModel defined?"
```

Note: Many `dh ask` queries may return "unsupported" in the current release. Use `dh explain` for reliable symbol lookups.

`dh trace` is Rust-hosted on the process lifecycle path, but the current bounded
command result can still be `unsupported`.

## Common Problems

### Running `dh` prints help-like onboarding

That is expected. Bare `dh` is first-run onboarding plus next steps; use
`dh ask`, `dh explain`, `dh trace`, or workflow commands for actual work.

### `dh status` does not validate provider keys

Embedding key không thuộc boundary của `dh status`. `dh status` is scoped to
local workspace/index/database state. If provider-backed semantic retrieval is
needed, configure the key and then validate behavior through an actual
knowledge command such as `dh ask "how does auth work?"`.

### `dh ask` cannot answer enough

Run `dh index` after large code changes, then retry the question. Bounded
broad-understanding questions can use `query.buildEvidence` when the subject is
finite and static; broad open-ended requests may still return limited evidence.

## Upgrade

From a release directory:

```sh
scripts/upgrade-from-release.sh dist/releases
```

From GitHub Releases:

```sh
scripts/upgrade-github-release.sh
```

## Build From Source

```sh
npm install
make release-all VERSION=0.3.1-rc.7
scripts/install-from-release.sh dist/releases
```

## Uninstall

```sh
scripts/uninstall.sh
```

## More Documentation

- `docs/user-guide.md`
- `docs/troubleshooting.md`
- `docs/operations/release-and-install.md`

## License

MIT

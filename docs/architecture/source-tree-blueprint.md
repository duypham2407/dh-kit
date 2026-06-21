# DH Source Tree Blueprint

Last reviewed against code: 2026-06-21

## Mục tiêu

Tài liệu này mô tả source tree **thực tế** của `dh`: monorepo gồm một Rust engine workspace và
các package TypeScript, build ra hai artifact (native binary + worker bundle).

> Lưu ý lịch sử: bản trước mô tả một blueprint Go-fork (`packages/opencode-core/` với `*.go`, build
> pipeline `build-go.sh`, embed TS vào Go binary). Hướng đó đã bị bỏ — không còn file `.go` nào
> trong repo. Bản Go-era được giữ ở `docs/archive/architecture/source-tree-blueprint.md` nếu cần
> tham chiếu (xem cũng `docs/archive/architecture/implementation-roadmap.md`).

## Top-Level Layout

```text
dh/
  apps/            <- entrypoint runnable (cli, tui)
  packages/        <- logic TS theo module boundaries
  rust-engine/     <- Rust workspace (7 crate): code intelligence + runtime host
  docs/            <- kiến trúc, ADR, runbook
  ref/             <- skills tham chiếu
  scripts/         <- build, install, release, diagnostics
  .github/         <- CI workflows
  Makefile         <- build orchestrator
```

Không có thư mục `data/` cố định trong repo — runtime data (SQLite `dh-index.db`, caches) sống
trong workspace của người dùng lúc chạy, không phải trong source tree.

## Rust engine — `rust-engine/`

Workspace Cargo, 7 crate. Đồ thị phụ thuộc là DAG không cycle (leaf → root).

```text
rust-engine/
  Cargo.toml          <- workspace manifest
  Cargo.lock
  crates/
    dh-types/         <- leaf: File/Symbol/Span/Chunk/EdgeKind/EvidencePacket/AnswerState
    dh-storage/       <- SQLite (rusqlite + sqlite-vec + FTS5), repositories, schema
    dh-parser/        <- tree-sitter extraction (TS/TSX/JS/JSX đầy đủ; Python/Go/Rust adapter)
    dh-graph/         <- projection graph_edges, hydration theo freshness
    dh-query/         <- QueryEngine trait; build_evidence (bounded explain-only)
    dh-indexer/       <- pipeline: scan -> hash(blake3) -> parse/persist -> link -> hydrate -> embed
    dh-engine/        <- binary: CLI + worker supervisor + bridge RPC router + lifecycle authority
```

Các module chính của `dh-engine` (`crates/dh-engine/src/`):

```text
main.rs              <- CLI entry + dispatch (resolve worker bundle, platform check)
host_commands.rs     <- run_hosted_knowledge_command: mở DB, dựng supervisor + router
worker_supervisor.rs <- spawn/giám sát node worker.mjs
host_lifecycle.rs    <- lifecycle_contract(): khai báo Rust giữ quyền lifecycle
worker_protocol.rs   <- JSON-RPC/stdio framing (protocolVersion=1, msgpack/json)
bridge.rs            <- BridgeRpcRouter: route reverse-RPC query.* vào QueryEngine
runtime_launch.rs    <- resolve worker bundle path (current_exe()-relative + cwd + workspace)
session_manager.rs   <- session lifecycle
hooks.rs             <- HookDispatcher
```

## App Layer — `apps/`

```text
apps/
  cli/
    src/
      main.ts
      runtime-client.ts        <- runLane/runDirect, mặc định Rust-hosted envelope
      version.ts
      commands/                <- một file/lệnh: ask, explain, trace, quick, delivery, migrate,
                                  index, doctor, config, models, providers, agent, mcp, lsp,
                                  plugin, serve, tui, session, stats, context, run, ...
        root.ts                <- router lệnh
      presenters/              <- text / json / stream presenter
      interactive/
        selectors/             <- agent/provider/model/variant selector
  tui/                         <- REPL readline trên dh serve (HTTP)
```

`apps/cli` là router mỏng; binary thật được người dùng gọi là Rust `dh-engine`. CLI TS đóng vai
trò orchestrate lane và format output.

## Package Layer — `packages/`

Lưu ý: đây là các package **logic**, không phải npm workspace unit thật. Các `package.json` con
phần lớn rỗng/tối thiểu; mọi dependency khai báo ở `package.json` gốc; import chéo dùng path tương
đối (`../../../<pkg>/src/...`) + tsconfig alias. Không có gì enforce ranh giới package ở mức tooling.

```text
packages/
  opencode-app/      <- package lớn nhất: worker entry + lane workflows + team/tools/agent
    src/
      worker/        <- worker-main.ts (bundle entry), worker-command-router.ts
      workflows/     <- quick.ts, delivery.ts, migration.ts
      lane/          <- resolve/enforce lane
      planner/       <- plan query, choose tools/skills/mcps/model
      executor/      <- enforce-mcp-routing, enforce-tool-usage, enforce-skill-activation,
                        answer-gating, hook-enforcer (LIVE — trên lane path, xem README dir)
      team/          <- coordinator/analyst/architect/implementer/reviewer/tester
      agent/ tools/ registry/ config/ bridge/ browser/ auth/ lsp/ mcp/ plugin/
  opencode-sdk/      <- SDK/bridge nội bộ dh-original (KHÔNG vendored; xem FORK_ORIGIN.md)
  providers/
    src/ provider/ chat/ resolution/ config/ auth/ effect/   <- Vercel AI SDK wrappers + routing
  runtime/
    src/ session/ workflow/ hooks/ extensions/ diagnostics/ jobs/ context/ reliability/
         performance/ workspace/
  retrieval/
    src/ semantic/ query/    <- RAG TS (legacy cho luồng Rust-hosted)
  storage/
    src/ sqlite/ fs/         <- RAG/state TS (vector store JSON-TEXT — legacy so với Rust sqlite-vec)
  intelligence/              <- parse bằng web-tree-sitter WASM (song song Rust dh-parser)
  shared/
    src/ types/              <- gồm runtime-authority.ts (đóng dấu authority lên kết quả)
  sdk/                       <- fetch client cho dh serve
  server/                    <- localhost HTTP server (dh serve)
```

> Tên `opencode-*` là di tích branding ban đầu, không phản ánh việc vendored upstream.

## Build pipeline (thực tế)

Hai artifact, build độc lập rồi đóng gói chung:

```text
make worker-bundle      -> scripts/build-worker-bundle.sh
                           esbuild bundle packages -> dist/ts-worker/worker.mjs
                           + manifest.json (requiredNodeMajor=22, target node22, protocolVersion=1)

make rust-build-release -> cargo build --release -p dh-engine
                           -> dist/rust-engine/releases/dh-<os>-<arch>

make package-release    -> scripts/package-release.sh
                           gom binary + ts-worker/ vào dist/releases/
                           + SHA256SUMS + manifest.json (+ per-platform tarball dh-<os>-<arch>.tar.gz)
```

CI (`.github/workflows/release-and-smoke.yml`) chạy matrix 4 platform (linux/macos × amd64/arm64),
package, verify, GPG sign, smoke linux+macos, publish GitHub Release, cập nhật Homebrew tap.

Layout cài đặt (mọi installer): `dh` binary + thư mục `ts-worker/` (`worker.mjs` + `manifest.json`)
**là sibling của binary** — Rust host resolve `worker.mjs` theo `current_exe()` (xem
`runtime_launch.rs`).

```text
~/.local/bin/dh
~/.local/bin/ts-worker/worker.mjs
~/.local/bin/ts-worker/manifest.json
```

## Runtime data layout (lúc chạy, trong workspace người dùng)

```text
<workspace>/
  .dh/ hoặc dh-index.db      <- SQLite index (sqlite-vec + FTS5)
```

## Tài liệu liên quan

- `docs/architecture/system-overview.md`: kiến trúc tổng thể Rust-host / TS-worker
- `docs/architecture/indexing-model.md`: schema index
- `docs/architecture/retrieval-strategy.md`: retrieval
- `docs/adr/2026-05-10-personal-coding-assistant-direction.md`: định hướng sản phẩm
- `docs/archive/architecture/`: blueprint Go-era đã archive

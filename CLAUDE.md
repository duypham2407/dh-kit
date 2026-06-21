# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`dh` is a local-first AI coding assistant for the terminal. It indexes a codebase
(tree-sitter AST + SQLite/FTS5 + vector search) and answers questions, looks up
symbols, and runs multi-agent coding workflows. The design goal is **grounded
understanding without hallucination**: AST/graph facts and bounded evidence packets
are the source of truth, not free-form model guessing.

The runtime is a **Rust host ↔ TypeScript worker** split. Rust (`dh-engine` binary)
owns process lifecycle and the grounded query/evidence engine; TypeScript
(`worker.mjs`) owns workflow/agent/LLM logic. They speak JSON-RPC over stdio.

## Commands

```sh
# TypeScript
npm run check                 # tsc --noEmit (typecheck — the lint gate)
npm test                      # vitest run (all tests)
npx vitest run packages/opencode-app/src/workflows/run-lane-command.test.ts   # single file
npx vitest run -t "name"      # single test by name
npm run test:watch

# Rust (workspace lives in rust-engine/)
cargo test --workspace --manifest-path rust-engine/Cargo.toml   # or: make rust-test
cargo build --release -p dh-engine --manifest-path rust-engine/Cargo.toml

# Build / release
make worker-bundle            # esbuild TS worker → dist/ts-worker/worker.mjs (+ manifest.json)
make build                    # check + test + rust-test + worker-bundle + rust binary
make release-all VERSION=x    # full release into dist/releases (per-platform tarballs)
```

There is no separate lint/format step wired into CI beyond `tsc --noEmit` and
`cargo` (rustfmt + clippy components are pinned in `rust-toolchain.toml`). Run
`npm run check` before considering TS work done.

## Architecture

### Two-process runtime, Rust owns lifecycle

`dh-engine` (Rust) starts and supervises the TS worker. The authority split is a
hard contract — `rust-engine/crates/dh-engine/src/host_lifecycle.rs::lifecycle_contract()`
and `packages/shared/src/types/runtime-authority.ts`:

- **Rust owns**: startup eligibility, readiness deadline, health/timeout
  classification, replay-safe recovery, shutdown/cleanup, final process-tree exit code.
- **TypeScript owns**: workflow logic, agent orchestration, prompt/context assembly,
  LLM provider calls, session memory, command output body.
- TS *must not* own top-level supervision, timeout/recovery authority, or the final
  exit code. The worker tags responses `runtimeAuthority: "typescript_worker"`; the
  host tags `"rust"`.

The worker entry is `packages/opencode-app/src/worker/worker-main.ts` (bundled to
`dist/ts-worker/worker.mjs`). On `dh.initialize` it validates `protocolVersion` and
requires `lifecycleAuthority === "rust"`, then builds a `WorkerCommandRouter`
(`worker/worker-command-router.ts`) that dispatches `runCommand` (ask/explain/trace),
`runLane` (quick/delivery/migration), and `runDirect`.

### The bridge (JSON-RPC over stdio)

Content-Length framed JSON-RPC, JSON by default, msgpack negotiable. Two surfaces,
same framing:

- **Supervisor channel** (host→worker): `worker_supervisor.rs` spawns node, does the
  `dh.initialize`/`dh.initialized`/`dh.ready` handshake, heartbeats via `runtime.ping`,
  and classifies timeout/recovery/shutdown. `WORKER_PROTOCOL_VERSION = "1"`.
- **Bridge query channel**: `bridge.rs::BridgeRpcRouter` answers bounded `query.*`
  methods (`search`, `definition`, `relationship`, `buildEvidence`, `callHierarchy`,
  `entryPoints`). The worker can re-enter the host mid-request for these via the
  host-handler closure (`host_commands.rs::route_worker_to_host_message`); the TS side
  of this is `worker/host-bridge-client.ts` (never spawns Rust — reuses the open peer).

The bridge **contract** (protocol version, hook-decision/audit writers, key
case-normalization) lives in `packages/opencode-sdk/` — `BRIDGE_PROTOCOL_VERSION`,
`buildBridgeEnvelopeContext`, `writeHookDecision`. The standalone stdio transport that
*spawns* Rust for CLI flows is `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`.

### Grounded knowledge: build_evidence

The anti-hallucination core is `dh-query` (`rust-engine/crates/dh-query/src/lib.rs::build_evidence`).
It is **bounded and explain-only**: it only serves the `explain` intent, refuses the
frozen unsupported classes (runtime_trace, impact_analysis, call_hierarchy, multi_hop,
unbounded_scope), caps files/symbols/snippets, and returns an `EvidencePacket` with an
`answer_state` of grounded/partial/insufficient/unsupported. Rust owns the packet
(`canonicalPacketOwner = "rust"`, `typescriptPacketSynthesis = false`) — TS never
synthesizes evidence. `dh ask`/`explain`/`trace` may legitimately return `unsupported`;
that is the boundary working as designed, not a bug. README's "Rust-Host Knowledge
Boundary" section is the user-facing statement of this.

### Rust crate DAG (`rust-engine/crates/`)

```
dh-types ──┬─→ dh-storage ──┬─→ dh-graph ─→ dh-query ─┐
           │                │                          ├─→ dh-engine (binary)
           └─→ dh-parser ───┴──────→ dh-indexer ───────┘
```

- **dh-types** — domain types/IDs/enums, serde-only, zero internal deps.
- **dh-storage** — SQLite (auto-loads sqlite-vec), schema, FTS5 (`chunk_fts`,
  contentless external-content), repository traits. WAL, foreign_keys on.
- **dh-parser** — tree-sitter extraction (TS/TSX/JS/JSX/Python/Go/Rust adapters),
  blake3 structure/API fingerprints. Types-only (does **not** depend on dh-storage).
- **dh-graph** — graph projection + bounded BFS over stored facts, freshness.
- **dh-query** — bounded query engine + `build_evidence` (downstream of dh-graph).
- **dh-indexer** — scan/hash(blake3)/parse/link/embed orchestration.
- **dh-engine** — the binary: clap CLI, worker supervision, bridge server, hosted commands.

### TypeScript packages (`packages/`)

Flat monorepo, single root `package.json` (not pnpm workspaces). The biggest is
**opencode-app** (worker brain: worker/router/bridge, lane + direct workflows, the
agent team, planner, executor/hook-enforcement, MCP/LSP/plugin). Others:
**providers** (Vercel AI SDK wiring + Effect-based provider service), **runtime**
(sessions, workflow engine, reliability, jobs, diagnostics, full-workflow multi-agent),
**retrieval** (semantic chunking/embedding/ANN + query planning), **storage**
(`sqlite/db.ts` + ~25 repos), **intelligence** (tree-sitter init + AST symbol
extraction), **opencode-sdk** (bridge contract — see naming note below), **shared**
(cross-cutting types + agent registry + Effect mocks), **sdk** (HTTP client for
`dh serve`), **server** (`dh serve` HTTP server). Apps: **apps/cli** (the `dh` CLI,
dispatch in `apps/cli/src/commands/root.ts`) and **apps/tui** (readline client of
`dh serve`).

### The agent team

Two coexisting team systems implement the "software-team-as-agents" model:

- **Lane team** (`packages/opencode-app/src/team/`) — coordinator → analyst → architect
  → per-work-item loop (implementer → reviewer → tester). Each role is a `run<Role>()`
  with a system prompt **and** a deterministic `fallback<Role>()` for offline/no-provider
  runs. Drives the `delivery` and `migration` lanes (`workflows/delivery.ts`,
  `workflows/migration.ts`). Role config (lanes, permission tier, default model) is in
  `packages/shared/src/constants/roles.ts` (`DEFAULT_AGENT_REGISTRY`).
- **Full workflow team** (`packages/runtime/src/workflow/full-workflow-runtime.ts`) —
  the `dh run --multi` bounded multi-agent orchestration: master_orchestrator,
  product_lead, solution_lead, fullstack_agent, code_reviewer, qa_agent, context_scout,
  summarizer, with approval gates and child sessions via `runSubagentTask`.

Policy enforcement (tool usage, skill activation, MCP routing, answer gating) runs in
`packages/opencode-app/src/executor/` and emits hook decisions through the opencode-sdk
writers into the SQLite audit log. This is the surface the original design assigned to
"Go hooks" — the Go core is gone; enforcement is now TS + the Rust `HookDispatcher`.

### Providers

Model access goes through `ChatProvider` (`packages/providers/src/chat/create-chat-provider.ts`),
which adapts the Vercel AI SDK (`generateText`/`streamText` from `ai`). Provider SDKs
(`@ai-sdk/*`, OpenRouter) are loaded lazily via dynamic `import()` in
`provider/provider.ts` (`BUNDLED_PROVIDERS`). **Effect** is used only as an island around
the provider service (`provider/provider.ts`, `effect/bridge.ts` adapts Effect↔async) —
the rest of the codebase is plain async/await.

## Conventions & gotchas

- **Cross-package imports use relative paths, not aliases.** Consumers import
  `../../../opencode-sdk/src/index.js`, not `@dh/opencode-sdk`. A specifier/alias grep
  finds *zero* importers and is misleading — `opencode-sdk` and `executor/` have many
  live consumers despite looking unused. Verify with relative-path grep before assuming
  anything is dead. (`tsconfig.json` `paths` aliases exist but map mostly to mocks.)
- **`opencode-*` names are vestigial branding, not vendored upstream.** History: forked
  OpenCode (Go core) → migrated to Rust (Go removed in `ee2c1e2`) → pivoted to a personal
  coding assistant (ADRs 2026-05-10). These packages are dh-original code; see each
  package's `FORK_ORIGIN.md` / README provenance note.
- **Two execution authorities for the same lanes/direct commands.** In-process TS paths
  (`run-lane-command.ts`, `run-direct-command.ts`, tagged `typescript_compatibility`) used
  by the CLI runtime-client, vs Rust-hosted spawns (`run-rust-hosted-*-command.ts`, tagged
  `rust`). The first-wave Rust-hosted path is the canonical one; don't conflate them.
- **Worker bundle resolution is `current_exe()`-relative.** The host looks for
  `<bindir>/ts-worker/worker.mjs` (`runtime_launch.rs::default_worker_bundle_candidates`).
  Any install/release packaging MUST ship `ts-worker/` as a sibling of the `dh` binary or
  the worker won't launch. The manifest's `requiredNodeMajor` (22) is enforced at startup.
- **Docs:** current architecture lives in `docs/architecture/system-overview.md` and
  `docs/README.md`; `docs/archive/` holds superseded Go-era docs (each bannered). Don't
  treat archived docs as authoritative.
- **No git push/tag without being asked.** Release packaging is local; tagging is a
  separate, explicit step.

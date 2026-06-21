# DH Documentation Index

Start here. `dh` is a local-first AI coding assistant: a Rust `dh-engine` host (code intelligence +
process lifecycle) supervising a TypeScript `worker.mjs` (workflow/agent/LLM logic). See the root
`README.md` for the user-facing command surface.

## Current architecture

- [architecture/system-overview.md](architecture/system-overview.md) — Rust-host / TS-worker split,
  crate + package map, control flow for `ask`/`explain`/`trace` and the lanes
- [architecture/source-tree-blueprint.md](architecture/source-tree-blueprint.md) — the real source tree + build pipeline
- [architecture/indexing-model.md](architecture/indexing-model.md) — index schema (file/symbol/chunk/edges)
- [architecture/retrieval-strategy.md](architecture/retrieval-strategy.md) — intent, tool selection, context building
- [architecture/workflow-orchestration.md](architecture/workflow-orchestration.md) — lane model, handoff, orchestration contract
- [architecture/runtime-state-schema.md](architecture/runtime-state-schema.md) — session/workflow/work-item/envelope/audit state
- [architecture/agent-contracts.md](architecture/agent-contracts.md) — role input/output contracts
- [architecture/model-routing-and-agent-config.md](architecture/model-routing-and-agent-config.md) — provider/model registry + routing
- [architecture/skills-and-mcp-integration.md](architecture/skills-and-mcp-integration.md) — skill/MCP activation + routing
- [architecture/indexing-model.md](architecture/indexing-model.md), [architecture/ai-code-understanding-structural-techniques.md](architecture/ai-code-understanding-structural-techniques.md),
  [architecture/dh-code-understanding-principles-reference.md](architecture/dh-code-understanding-principles-reference.md) — code-understanding technique references

## Decisions (ADRs)

- [adr/2026-05-10-personal-coding-assistant-direction.md](adr/2026-05-10-personal-coding-assistant-direction.md) — **current product direction**
- [adr/2026-05-10-web-desktop-parity-decision.md](adr/2026-05-10-web-desktop-parity-decision.md) — no web/desktop for now
- [adr/2026-04-13-operator-safe-worktree-wrapper-no-go-dh.md](adr/2026-04-13-operator-safe-worktree-wrapper-no-go-dh.md)
- [adr/2026-04-05-fork-provenance-strategy.md](adr/2026-04-05-fork-provenance-strategy.md),
  [adr/2026-04-05-phase15-release-packaging-contract.md](adr/2026-04-05-phase15-release-packaging-contract.md)

## User & operations

- root [README.md](../README.md) — install, commands, Rust-host knowledge boundary
- [user-guide.md](user-guide.md), [troubleshooting.md](troubleshooting.md)
- [operations/release-and-install.md](operations/release-and-install.md)
- [privacy-and-local-data.md](privacy-and-local-data.md), [changelog-policy.md](changelog-policy.md)

## History

- [DEPRECATION-go-core.md](DEPRECATION-go-core.md) — tombstone: where the Go core went
- [archive/](archive/) — superseded Go-era / OpenCode-upstream docs (provenance only; see
  [archive/README.md](archive/README.md))

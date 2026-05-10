# Personal Coding Assistant v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn DH into a fast local-first personal coding assistant with an OpenCode-like TUI and stronger code-context accuracy than the parity MVP.

**Architecture:** Keep Rust as the indexing, graph, ranking, and runtime authority. Keep TypeScript for CLI/TUI orchestration and provider integration. Treat OpenCode as UX inspiration only; do not expand community/cloud/platform surfaces unless they directly improve the maintainer's daily local workflow.

**Tech Stack:** Rust engine, TypeScript CLI/TUI, SQLite/file-backed storage, tree-sitter, LSP augmentation, AI SDK provider stack, Vitest, Cargo.

---

## Scope

Core priorities:

- TUI daily-use quality.
- Deep code context with file/line evidence.
- Fast incremental indexing and retrieval.
- Context packing that reports what was included, skipped, and why.
- Permissioned local tool execution.
- Provider/model/agent choice for personal workflows.

Explicitly not priorities:

- Community plugin marketplace.
- Web app or desktop wrapper.
- Cloud console, hosted share, billing, remote accounts.
- GitHub/PR automation as a first-class surface.
- Full OpenCode `db`, `acp`, or console parity.

## Milestone P1: TUI Daily Driver

**Goal:** Make `dh tui` the primary interface for daily coding sessions.

**Tasks:**

- [ ] Add real event streaming from `dh serve` to TUI.
- [ ] Render streaming text, tool start/delta/finish, runtime degradation, and session status.
- [ ] Add interactive permission approval/deny flow.
- [ ] Add session switch, resume, fork, delete shortcuts.
- [ ] Add model and agent switch dialogs.
- [ ] Add file/context panel showing selected evidence.
- [ ] Keep non-interactive fallback testable with reducer/controller tests.

**Acceptance Gates:**

- `npm test -- tui server sdk run root parity-report`
- `npm run check`
- Manual: `dh tui` can run, resume, approve/deny a tool, and switch sessions.

## Milestone P2: Deep Context Planner

**Goal:** Reduce missed context by making context selection explicit, ranked, and auditable.

**Tasks:**

- [ ] Add context planner service that merges semantic search, symbol graph, LSP diagnostics, references, and file mentions.
- [ ] Emit an evidence ledger with file path, line range, reason, score, and source.
- [ ] Add coverage warnings for unindexed files, stale graph data, unsupported languages, and truncated context.
- [ ] Add `dh context inspect <query> --json`.
- [ ] Surface context coverage in TUI before model submission.

**Acceptance Gates:**

- `npm test -- context retrieval lsp parity-report`
- `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine`
- Manual: context inspect reports included/skipped evidence with reasons.

## Milestone P3: Speed And Freshness

**Goal:** Keep large-repo workflows fast enough for repeated daily use.

**Tasks:**

- [ ] Add incremental index freshness checks for changed files.
- [ ] Cache symbol graph and retrieval rankings by workspace fingerprint.
- [ ] Add latency metrics for index, retrieval, context planning, provider call, and tool execution.
- [ ] Add `dh doctor --json` performance/freshness section.
- [ ] Add budget knobs for fast/normal/deep context modes.

**Acceptance Gates:**

- `npm test -- index retrieval doctor`
- `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine`
- Manual: repeated context queries avoid full re-index and report cache/freshness status.

## Milestone P4: Personal Tool Loop Hardening

**Goal:** Make local tool use useful without opening broad platform scope.

**Tasks:**

- [ ] Integrate audited tool runner into model tool-call loop.
- [ ] Keep permission defaults conservative.
- [ ] Add TUI tool result rendering with file diff summaries.
- [ ] Add apply-patch execution only through existing permission/audit path.
- [ ] Keep webfetch/websearch optional and disabled by default.

**Acceptance Gates:**

- `npm test -- tool-runner tui run`
- `npm run check`
- Manual: TUI can approve a bounded edit and show the resulting diff.

## Definition Of Done

DH is a personal coding assistant, not a platform clone:

- `dh tui` is usable as the main daily surface.
- Context selection is explainable and file/line grounded.
- Doctor reports context/index freshness and no longer pressures full OpenCode/community parity.
- Large-repo repeated queries are measurably faster through incremental freshness and caching.

# ADR: Personal Coding Assistant Product Direction

- Status: Accepted
- Date: 2026-05-10

## Context

DH started with an OpenCode gap roadmap so the project could identify which command, runtime, session, provider, MCP, tool, server, and TUI surfaces were missing.

That parity work is useful as a comparison baseline, but DH is not intended to become a full OpenCode clone or a community platform. The target user is the maintainer using DH as a daily local coding assistant.

The product requirement is now:

- a TUI experience close enough to OpenCode for daily terminal work
- deep code understanding with low context loss
- fast local-first indexing, retrieval, ranking, and context packing
- strong evidence and file/line grounding
- minimal community/platform scope unless it improves the personal workflow

## Decision

Supersede the full OpenCode parity roadmap as the active product direction.

DH will focus on **Personal Coding Assistant v1: TUI + Deep Context + Speed**.

The following are core:

- interactive TUI quality
- Rust-first indexing and retrieval
- tree-sitter/LSP/symbol graph augmentation
- context planner and evidence ledger
- permissioned local tools
- local server/SDK only where it supports TUI and automation
- provider/model selection for personal workflows

The following are intentionally deferred or out of core scope:

- community plugin ecosystem
- public marketplace or remote plugin install
- web app and desktop wrapper
- cloud console, hosted share, billing, and account console
- GitHub/PR automation as a first-class product surface
- OpenCode `db`, `acp`, and console parity

## Rationale

1. The highest-value DH advantage is Rust-backed code intelligence, not cloning every OpenCode surface.
2. A personal local-first assistant has a smaller and sharper security boundary.
3. Community features add API compatibility, packaging, sandboxing, docs, and support cost without improving the maintainer's daily loop.
4. TUI quality and context correctness directly affect daily usefulness.
5. Speed depends on bounded retrieval, incremental indexing, and native graph work; those need focus.

## Consequences

Positive:

- Roadmap decisions can optimize for one real workflow instead of broad platform parity.
- Doctor/parity diagnostics can remain truthful without pressuring implementation of intentionally deferred surfaces.
- Engineering effort moves to TUI, context coverage, ranking, and runtime latency.

Trade-offs:

- DH will not claim full OpenCode parity.
- Plugin/community/web/desktop/GitHub surfaces remain available only as future opt-in projects.
- OpenCode parity report remains a conservative comparison artifact, not the active roadmap.

## Verification

The active follow-up plan is `docs/superpowers/plans/2026-05-10-personal-coding-assistant-v1.md`.

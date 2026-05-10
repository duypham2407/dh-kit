# Personal Coding Assistant v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn DH into a fast local-first personal coding assistant with an OpenCode-like TUI, strong code-context accuracy, and bounded multi-agent delivery workflow.

**Architecture:** Keep Rust as the indexing, graph, ranking, and runtime authority. Keep TypeScript for CLI/TUI orchestration, provider integration, and OpenKit-style role/stage workflow. Treat OpenCode as UX inspiration only; treat OpenKit as the team-workflow reference model only; do not expand community/cloud/platform surfaces unless they directly improve the maintainer's daily local workflow.

**Tech Stack:** Rust engine, TypeScript CLI/TUI, SQLite/file-backed storage, tree-sitter, LSP augmentation, AI SDK provider stack, Vitest, Cargo.

---

## Scope

Core priorities:

- TUI daily-use quality.
- OpenKit-style bounded multi-agent workflow.
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
- Free-form agent swarm, autonomous background team execution, or multiple write agents racing on the same files.

## Product Formula

`Personal Coding Assistant v1 = TUI + Deep Context + Speed + Multi Agent`

Meaning:

- **TUI** is the daily workspace.
- **Deep Context** is the code-understanding brain.
- **Speed** is the experience contract.
- **Multi Agent** is the software-team workflow layer that turns large tasks into scoped, reviewable, testable delivery.

## Multi-Agent Team Model

DH should implement multi-agent as a bounded software delivery team, not as an unstructured swarm.

| Role | Default Permission | Responsibility |
| --- | --- | --- |
| Master Orchestrator | read-only orchestration | Own parent session, route stages, keep task graph, enforce gates, surface status in TUI |
| Product Lead | read-only | Convert intent into scope, user stories, acceptance criteria, edge cases |
| Solution Lead | read-only | Convert approved scope into architecture, work items, sequencing, validation plan |
| Fullstack Agent | write with permission | Implement scoped code changes and record verification evidence |
| Code Reviewer | read-only | Review diff for bugs, regressions, architecture drift, and missing tests |
| QA Agent | bounded shell/read-only by default | Validate acceptance criteria, run tests, record QA evidence |
| Context Scout | read-only | Gather semantic, symbol, LSP, test, docs, and recent-change evidence for the shared ledger |
| Summarizer | read-only | Compress role outputs into parent-session memory without replacing evidence |

Canonical full workflow:

```text
full_intake
-> full_product
-> full_solution
-> full_implementation
-> full_code_review
-> full_qa
-> full_done
```

Approval gates:

```text
product_to_solution
solution_to_fullstack
fullstack_to_code_review
code_review_to_qa
qa_to_done
```

Reroute rules:

| Finding | Reroute Target |
| --- | --- |
| Requirement gap | Product Lead / `full_product` |
| Design flaw | Solution Lead / `full_solution` |
| Implementation bug | Fullstack Agent / `full_implementation` |
| Missing or failing verification | QA Agent or Fullstack Agent depending on failure root cause |

Runtime rules:

- Parent session owns the task graph, stage, approval gates, artifacts, and shared evidence ledger.
- Child agent sessions own role-specific work and must write summaries back to the parent session.
- Master Orchestrator coordinates only; it must not silently author Product Lead, Solution Lead, Review, or QA decisions.
- Product Lead, Solution Lead, Code Reviewer, QA Agent, Context Scout, and Summarizer are read-only unless a specific bounded tool permission is granted.
- Fullstack Agent is the only default write owner in MVP.
- Parallelism is allowed first for read-only context scouts and independent review/QA analysis.
- Multiple write agents editing overlapping files are out of scope for v1.
- Every role output must link to artifacts, evidence, or runtime events.

## Milestone P1: TUI Daily Driver

**Goal:** Make `dh tui` the primary interface for daily coding sessions.

**Tasks:**

- [x] Add event streaming from `dh serve` to TUI through `/command/run/stream` NDJSON and SDK `runStream()`.
- [x] Render streaming text, tool start/delta/finish, runtime degradation, and session status.
- [x] Add interactive permission approval/deny flow.
- [x] Add session switch, resume, fork, delete shortcuts.
- [x] Add model and agent switch dialogs.
- [x] Add file/context panel showing selected evidence.
- [x] Keep non-interactive fallback testable with reducer/controller tests.

**Implemented slice:**

- `dh serve` exposes a local NDJSON run-event stream at `/command/run/stream`.
- `packages/sdk` exposes `DhClient.runStream()` as an async iterator.
- TUI controller prefers stream mode when available and falls back to report mode otherwise.
- TUI state/rendering now handles streamed `text.delta`, tool events, permission events, and message/session finish status.
- `dh serve` exposes `/permission/respond`, `packages/sdk` exposes `DhClient.respondPermission()`, and TUI supports `/approve` plus `/deny [reason]` for the active permission prompt.
- `dh serve` exposes persisted session list/fork/delete endpoints, `packages/sdk` exposes session lifecycle methods, and TUI supports `/resume <id>`, `/session <id>`, `/next`, `/fork [title]`, and `/delete [id]`.
- `dh serve` exposes builtin agent/model option endpoints, `packages/sdk` exposes `agents()` and `models()`, and TUI supports `/model [id]` plus `/agent [id]` selection commands.
- TUI renders final/degraded runtime status and a context panel populated from attached files plus streamed tool paths.

**Acceptance Gates:**

- `npm test -- tui server sdk run root parity-report`
- `npm run check`
- Manual: `dh tui` can run, resume, approve/deny a tool, and switch sessions.

## Milestone P2: Bounded Multi-Agent Runtime

**Goal:** Add OpenKit-style team workflow as a first-class local runtime.

**Tasks:**

- [x] Add canonical role, stage, approval-gate, artifact, and reroute contracts for `full` workflow.
- [x] Add parent session state for current stage, current owner, child agent sessions, approvals, artifacts, reroute issues, and shared evidence ledger refs.
- [x] Add Master Orchestrator routing that can start, inspect, advance, block, reroute, and close a full-delivery work item.
- [x] Add child agent task runtime for Product Lead, Solution Lead, Fullstack Agent, Code Reviewer, QA Agent, Context Scout, and Summarizer.
- [x] Add `dh run --multi "<task>" --json` or equivalent runtime entry that creates a parent session and first-stage child task.
- [x] Add audit records for role start/finish, gate approval/rejection, reroute, and artifact handoff.
- [x] Keep concurrency bounded with max read-only workers and single write owner.

**Implemented slice:**

- `packages/shared` defines bounded full-workflow roles, stages, gates, artifacts, approvals, reroute issues, audit records, and parent state.
- `packages/runtime` exposes `startFullWorkflow()`, `inspectFullWorkflow()`, `advanceFullWorkflow()`, `blockFullWorkflow()`, `rerouteFullWorkflow()`, `closeFullWorkflow()`, and support-role execution.
- Full workflow creates a persisted `full` parent session, writes workflow state, stores inspectable parent state under `.dh/full-workflow`, and records audit events into `session_runtime_events`.
- `dh run --multi "<task>" --json` starts the parent workflow and runs the Product Lead first-stage child task.
- Concurrency contract is explicit: bounded read-only worker count plus `fullstack_agent` as the single write owner.

**Acceptance Gates:**

- `npm test -- agent subagent-runtime session workflow tui parity-report`
- `npm run check`
- Manual: one full work item moves from Product Lead to Solution Lead to Fullstack to Code Review to QA with inspectable artifacts and at least one reroute path.

## Milestone P3: Deep Context Shared Ledger

**Goal:** Reduce missed context by making context selection explicit, ranked, and auditable.

**Tasks:**

- [x] Add context planner service that merges semantic search, symbol graph, LSP diagnostics, references, and file mentions.
- [x] Emit an evidence ledger with file path, line range, reason, score, and source.
- [x] Add coverage warnings for unindexed files, stale graph data, unsupported languages, and truncated context.
- [x] Add `dh context inspect <query> --json`.
- [x] Surface context coverage in TUI before model submission.
- [x] Let Context Scout child agents contribute evidence to the same parent-session ledger without duplicating retrieval work.
- [x] Let Product Lead, Solution Lead, Code Reviewer, and QA Agent cite shared evidence rather than each rebuilding context from scratch.

**Implemented slice:**

- `inspectContext()` builds a persisted `.dh/context-ledgers/<ledger-id>.json` report from retrieval results, file mentions, graph availability, scan coverage, and LSP availability.
- Evidence ledger entries include `filePath`, `lineRange`, `reason`, `score`, `source`, and optional symbol names.
- Coverage warnings include reduced scan coverage, scan stop reasons, dependency graph degradation, LSP unconfigured state, no evidence, and context truncation.
- CLI exposes `dh context inspect <query> --json`; server/SDK expose `/context/inspect` and `DhClient.inspectContext()`.
- TUI runs context planning before prompt submission and renders selected evidence plus context warnings.
- Full workflow `context_scout` stores a shared context ledger ref on the parent state so later role artifacts cite the same evidence refs.

**Acceptance Gates:**

- `npm test -- context retrieval lsp parity-report`
- `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine`
- Manual: context inspect reports included/skipped evidence with reasons.

## Milestone P4: Speed And Freshness

**Goal:** Keep large-repo workflows fast enough for repeated daily use.

**Tasks:**

- [ ] Add incremental index freshness checks for changed files.
- [ ] Cache symbol graph and retrieval rankings by workspace fingerprint.
- [ ] Add latency metrics for index, retrieval, context planning, provider call, and tool execution.
- [ ] Add latency metrics for parent orchestration and child agent execution.
- [ ] Add `dh doctor --json` performance/freshness section.
- [ ] Add budget knobs for fast/normal/deep context modes.
- [ ] Add budget knobs for max child agents, max read-only concurrency, and max per-role runtime.

**Acceptance Gates:**

- `npm test -- index retrieval doctor`
- `cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine`
- Manual: repeated context queries avoid full re-index and report cache/freshness status.

## Milestone P5: Personal Tool Loop Hardening

**Goal:** Make local tool use useful without opening broad platform scope.

**Tasks:**

- [ ] Integrate audited tool runner into model tool-call loop.
- [ ] Keep permission defaults conservative.
- [ ] Add TUI tool result rendering with file diff summaries.
- [ ] Add apply-patch execution only through existing permission/audit path.
- [ ] Keep webfetch/websearch optional and disabled by default.
- [ ] Keep write tools available to Fullstack Agent only by default.
- [ ] Require Code Reviewer and QA Agent to report findings through artifacts, not direct mutation.

**Acceptance Gates:**

- `npm test -- tool-runner tui run`
- `npm run check`
- Manual: TUI can approve a bounded edit and show the resulting diff.

## Definition Of Done

DH is a personal coding assistant, not a platform clone:

- `dh tui` is usable as the main daily surface.
- Multi-agent full workflow is inspectable through parent session, child sessions, stages, gates, artifacts, and reroute state.
- Context selection is explainable and file/line grounded.
- Doctor reports context/index freshness and no longer pressures full OpenCode/community parity.
- Large-repo repeated queries are measurably faster through incremental freshness and caching.

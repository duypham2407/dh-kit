---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: RUST-HOSTED-BUILD-EVIDENCE
feature_slug: rust-hosted-build-evidence
source_scope_package: docs/scope/2026-04-25-rust-hosted-build-evidence.md
architecture_source: docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md
prior_feature: RUST-HOST-LIFECYCLE-AUTHORITY
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Rust-Hosted Build Evidence

## Problem Framing

The approved scope package (`docs/scope/2026-04-25-rust-hosted-build-evidence.md`) starts from the completed `RUST-HOST-LIFECYCLE-AUTHORITY` topology: Rust is the process parent and lifecycle authority for the first-wave local knowledge commands, while TypeScript runs as a supervised worker. That prior feature intentionally kept the worker-to-host reverse-RPC query surface narrow: `query.search`, `query.definition`, and `query.relationship`.

This feature advances the architecture source's coarse-grained bridge target by adding one canonical Rust-authored build-evidence path to that Rust-hosted topology. The problem is not to redesign retrieval or prompts; it is to make bounded broad-understanding `dh ask` requests request `query.buildEvidence` from Rust, preserve the Rust packet as answer/evidence truth, and keep narrow ask/explain flows on the specialized query methods when those methods are the more truthful contract.

## Recommended Path

Add `query.buildEvidence` as one named, allowlisted worker-to-host reverse-RPC method on the Rust-hosted first-wave knowledge-command path, backed by the existing Rust `dh-query` `BuildEvidenceQuery` / `BuildEvidenceResult` packet model. TypeScript should add one bounded broad-understanding ask class that maps to this method, consume the returned Rust packet without confidence upgrades or TS packet synthesis, and present packet state/evidence/gaps/bounds separately from Rust host lifecycle status.

This is enough because the repository already has the Rust host lifecycle topology, Rust evidence packet types, Rust query engine build-evidence logic, TypeScript worker bridge injection, and knowledge-command reporting surfaces. The implementation should wire those existing surfaces end to end and add missing negative/contract coverage; it should not broaden into daemon mode, worker pools, remote transports, Windows support, prompt/retrieval redesign, trace-flow execution, or full workflow redesign.

## Non-Goals And Explicit Boundaries

- No Windows support, Windows hardening, Windows packaging, or Windows wording beyond explicit non-support.
- No daemon, `dhd`, persistent worker pool, warm worker pool, socket/control plane, TCP/HTTP/gRPC transport, or remote execution.
- No generic worker-to-host method passthrough. The reverse-RPC surface grows by exactly one named query method: `query.buildEvidence`.
- No replacement of every narrow query method with build evidence. Narrow `ask` and `explain` keep using search/definition/relationship methods when those are the truthful surface.
- No broad `dh trace` execution support. Trace may still report bounded unsupported truth; this feature must not turn trace into a runtime tracer or path analyzer.
- No TypeScript-authored canonical evidence packet construction on touched Rust-hosted flows.
- No retrieval ranking redesign, prompt-system redesign, LLM-provider redesign, or legacy retrieval packet promotion.
- No workflow lane/stage redesign and no workflow-state schema change.
- Linux/macOS remain the only supported target-platform truth for this path.

## Impacted Surfaces

### Rust canonical evidence and reverse-RPC contract

- `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - Add `query.buildEvidence` to `WORKER_TO_HOST_QUERY_METHODS` and the protocol contract tests.
  - Keep `arbitrary_method_passthrough: false` and no network transport.
- `rust-engine/crates/dh-engine/src/bridge.rs`
  - Add `query.buildEvidence` to advertised bridge capabilities only when routed end to end.
  - Add `query.buildEvidence` to the `session.runCommand` delegated-method allowlist and direct router handling.
  - Parse bounded request params and call Rust query engine build-evidence truth.
  - Return the canonical `evidence` packet with `answerState`, `questionClass: build_evidence`, source/provenance, gaps, and bounds.
- `rust-engine/crates/dh-query/src/lib.rs`
  - Reuse/refine `BuildEvidenceQuery` / `BuildEvidenceResult` behavior for the approved bounded ask contract.
  - Keep grounded/partial/insufficient/unsupported packet-state decisions in Rust.
  - Add guardrails for empty, too-broad, unsupported-runtime-trace, stale/partial-index, ambiguity, and bounds/cutoff outcomes where not already covered.
- `rust-engine/crates/dh-types/src/lib.rs`
  - Touch only if the packet/result contract needs an additive enum or field. Do not make a breaking packet rewrite if the existing `EvidencePacket` shape is sufficient.
- `rust-engine/crates/dh-engine/src/host_commands.rs`
  - Preserve separation between `RustHostedKnowledgeReport.rust_lifecycle` and worker command/evidence result.
  - Ensure Rust-hosted final text/JSON does not hide build-evidence packet state, evidence preview, gaps, or bounds when the worker report contains them.

### TypeScript worker, bridge client, and knowledge workflow

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - Add a `graph_build_evidence` / equivalent ask class and `query.buildEvidence` method type.
  - Add typed request shaping for `query`, `intent`, `targets`, bounded budgets, and optional freshness.
  - Keep direct legacy bridge support compatibility-only; completion claims are for the Rust-hosted worker path.
- `packages/opencode-app/src/worker/host-bridge-client.ts`
  - Add `query.buildEvidence` to host-backed supported methods and `buildBridgeCall` mapping.
  - Keep `HostBridgeClient` subordinate: it must never spawn Rust and never own lifecycle truth.
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - Add conservative broad-understanding `dh ask` classification and route only eligible bounded patterns to build evidence.
  - Preserve existing specialized/narrow classification for file discovery, definition, usage, dependencies, and dependents.
  - Assemble answers from Rust packet fields without upgrading confidence, removing material gaps, or synthesizing fallback packets from preview items.
- `packages/opencode-app/src/worker/worker-command-router.ts` and `packages/opencode-app/src/worker/worker-main.ts`
  - Touch only as needed for tests or capability propagation; keep worker mode injected with host-backed bridge.

### Presentation, docs, and compatibility wording

- `apps/cli/src/presenters/knowledge-command.ts`
  - Show build-evidence method, answer/evidence state, Rust packet subject/summary/conclusion, evidence entries, gaps/limitations, and bounds.
  - Keep `rust host lifecycle` output separate from `answer state` / `evidence` state.
- `apps/cli/src/presenters/knowledge-command.test.ts`
  - Add snapshots or assertions for grounded, partial, insufficient, unsupported, and lifecycle-success/evidence-non-success states.
- `packages/retrieval/src/query/build-evidence-packets.ts` and `packages/shared/src/types/evidence.ts`
  - No required functional change. They remain legacy/retrieval-local and non-authoritative for touched product flows.
- `README.md`, `docs/user-guide.md`, `apps/cli/src/commands/root.ts`, and doctor/help wording only where touched.
  - Update wording only if the delivered surface mentions build-evidence support.
  - Keep wording bounded to Rust-hosted first-wave build evidence and Linux/macOS.

## Rust/TypeScript Boundary Contract

### Ownership model

| Surface | Rust owns | TypeScript owns | Must not happen |
| --- | --- | --- | --- |
| Build-evidence method truth | `query.buildEvidence` method support, request validation, packet-state decision, source/provenance, gaps, bounds, stop reasons | choosing eligible bounded ask class and shaping allowed params | TypeScript constructing a stronger canonical packet |
| Narrow ask/explain truth | specialized `query.search`, `query.definition`, `query.relationship` when those match the request | preserving existing classifier and presenter behavior | forcing narrow requests through build evidence |
| Worker-to-host bridge | allowlisted methods and Rust router refusal for unknown methods | calling only typed host-backed methods | generic passthrough, arbitrary method forwarding, shell/network expansion |
| Lifecycle vs evidence | lifecycle envelope, final lifecycle status, final host exit status | command answer/report body and evidence presentation | lifecycle success being labeled grounded answer success |
| Unsupported/insufficient truth | packet-level unsupported/insufficient reasons when Rust can classify them | surfacing reasons and guidance without upgrading them | hidden fallback to legacy retrieval packet authority |

### JSON-RPC and reverse-RPC method changes

Use the existing JSON-RPC 2.0 over stdio with `Content-Length` framing from `RUST-HOST-LIFECYCLE-AUTHORITY`. This feature changes only the named worker-to-host query allowlist.

#### Worker-to-host methods after this feature

- Existing methods preserved:
  - `query.search`
  - `query.definition`
  - `query.relationship`
- New method:
  - `query.buildEvidence`

Unsupported methods such as `query.trace`, `query.impactAnalysis`, `tool.execute` from the worker query path, or `arbitrary.forward` must continue to receive method-not-supported / capability-unsupported responses instead of being forwarded generically.

#### `query.buildEvidence` request contract

Recommended wire shape:

```json
{
  "query": "how does auth work?",
  "intent": "explain",
  "targets": ["auth"],
  "budget": {
    "maxFiles": 5,
    "maxSymbols": 8,
    "maxSnippets": 8
  },
  "freshness": "indexed"
}
```

Rules:

- `query` is required and non-empty.
- `intent` is `explain` for this feature's supported broad-understanding ask path.
- `targets` are optional hints extracted by TypeScript; Rust remains responsible for final evidence truth.
- Budgets are bounded by Rust defaults and hard caps. TypeScript may request narrower budgets but may not bypass Rust limits.
- `freshness` is advisory unless Rust can prove stronger index readiness; stale/partial index truth must surface as gaps/partial/insufficient.

#### `query.buildEvidence` result contract

Return through the existing bridge result envelope:

- `answerState`: `grounded`, `partial`, `insufficient`, or `unsupported`.
- `questionClass`: `build_evidence`.
- `items`: optional preview rows only; not canonical proof.
- `evidence`: canonical Rust-authored packet with:
  - `subject`
  - `summary`
  - `conclusion`
  - non-empty `evidence[]` for grounded results
  - `gaps[]` for partial/insufficient/unsupported or degraded cases
  - `bounds` with traversal scope, hop/node limits, and stop reason when relevant
- `languageCapabilitySummary`: include only when it truthfully helps explain supported/partial/unsupported language capability; it must not imply new language parity.

### Broad-understanding ask eligibility freeze

Route to `query.buildEvidence` only for bounded, static repository-understanding asks where a finite subject can be extracted:

- `how does <subject> work?`
- `how is <subject> implemented?`
- `how is <subject> wired?`
- `what is the <subject> flow?` when it is a static code-understanding request, not runtime tracing.
- `explain how <subject> works` when invoked through `dh ask`, not `dh explain`.

Keep these unsupported or insufficient rather than silently broadening:

- runtime tracing/debugging/profiling requests
- `trace flow`, `call hierarchy`, `impact analysis`, `multi-hop`, or universal path requests
- `entire subsystem`, `everything`, `all behavior`, or other unbounded scope without a finite subject
- unsupported language/capability depth
- missing or stale index cases where Rust cannot produce safe evidence

## Implementation Slices

### TASK-RHBE-1 — Freeze build-evidence protocol and Rust packet contract (`kind: implementation+tests`)

- **Files**:
  - `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-types/src/lib.rs` only if an additive packet/capability type is necessary
- **Goal**: define one explicit `query.buildEvidence` reverse-RPC contract and verify it is advertised only as a named supported method.
- **Details**:
  - Add `query.buildEvidence` to worker protocol method arrays and bridge capability output.
  - Keep existing methods unchanged and keep arbitrary passthrough false.
  - Freeze request fields, budget caps, result packet state, and unsupported/insufficient semantics.
  - Add unit tests proving method advertisement and unsupported-method refusal.
- **Validation**:
  - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`

### TASK-RHBE-2 — Implement Rust bridge handler for canonical build evidence (`kind: implementation+tests`)

- **Files**:
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
  - Rust tests adjacent to those modules or under `rust-engine/crates/dh-engine/tests/`
- **Goal**: make `query.buildEvidence` callable through the Rust router and return Rust-authored evidence packets for grounded, partial, insufficient, and unsupported outcomes.
- **Details**:
  - Parse `query`, `intent`, `targets`, `budget`, and `freshness` from JSON-RPC params.
  - Call Rust query build-evidence logic and serialize the result through the existing `WireEvidencePacket` envelope.
  - Ensure grounded results require inspectable non-empty evidence.
  - Ensure empty query, no indexed match, stale/partial index, ambiguity, unsupported capability, and bounds/cutoff cases preserve `gaps` and `bounds.stopReason`.
  - Keep `items` as preview rows only; Rust packet remains canonical.
- **Validation**:
  - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`
  - Targeted Rust tests for `query.buildEvidence` happy path and negative states.

### TASK-RHBE-3 — Extend host-backed TypeScript bridge without broadening lifecycle authority (`kind: implementation+tests`)

- **Files**:
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/worker/host-bridge-client.ts`
  - `packages/opencode-app/src/worker/host-bridge-client.test.ts`
- **Goal**: let the supervised TypeScript worker request build-evidence packets from the Rust host without spawning Rust or creating a second authority story.
- **Details**:
  - Add a typed `query.buildEvidence` method and `graph_build_evidence` ask class.
  - Add request shaping from TS into the approved wire fields.
  - Add parser/validator coverage for Rust packet states and packet fields.
  - Prove unsupported methods remain refused and `HostBridgeClient` remains subordinate/no-op close/no Rust spawn.
- **Validation**:
  - `npm run check`
  - `npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts packages/opencode-app/src/worker/host-bridge-client.test.ts`

### TASK-RHBE-4 — Route bounded broad `dh ask` while preserving narrow behavior (`kind: implementation+tests`)

- **Files**:
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `packages/opencode-app/src/worker/worker-command-router.ts` only if router tests need capability propagation
- **Goal**: route eligible broad-understanding ask requests to `query.buildEvidence` and keep existing narrow ask/explain routing unchanged.
- **Details**:
  - Add conservative classifier patterns listed in this package.
  - Keep definition, file discovery, usage, dependencies, and dependents ahead of broad-understanding routing when those specialized patterns match.
  - Keep `dh explain` definition-oriented for this feature.
  - Return explicit unsupported/insufficient results for out-of-scope broad asks instead of falling back to TS-composed evidence.
  - Tests must prove narrow behavior is not forced through build evidence.
- **Validation**:
  - `npm run check`
  - `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts packages/opencode-app/src/worker/worker-main.test.ts`

### TASK-RHBE-5 — Present Rust packet truth and separate lifecycle from answer success (`kind: implementation+tests`)

- **Files**:
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `rust-engine/crates/dh-engine/src/host_commands.rs`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- **Goal**: make final Rust-hosted output inspectable for build-evidence packet truth without confusing lifecycle success with evidence success.
- **Details**:
  - Show packet `answerState`, `questionClass`, subject/summary/conclusion, evidence entries/provenance, gaps/limitations, and bounds.
  - Show host lifecycle state separately from answer/evidence state.
  - Partial results must keep useful evidence visible and limitations explicit.
  - Insufficient and unsupported results must not look like grounded answers.
  - TypeScript may format but may not remove gaps or upgrade answer state.
- **Validation**:
  - `npm run check`
  - `npm test -- apps/cli/src/presenters/knowledge-command.test.ts packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`

### TASK-RHBE-6 — Align bounded operator wording and legacy packet isolation (`kind: docs+tests`)

- **Files**:
  - `README.md`
  - `docs/user-guide.md`
  - `apps/cli/src/commands/root.ts`
  - `packages/retrieval/src/query/build-evidence-packets.ts` and `packages/shared/src/types/evidence.ts` only if comments/tests must reinforce non-authoritative status
- **Goal**: update only touched wording so support claims match delivered runtime truth.
- **Details**:
  - Say build-evidence support is bounded to Rust-hosted first-wave `dh ask` broad-understanding requests.
  - Avoid universal reasoning, trace execution, daemon, remote, worker-pool, or Windows claims.
  - Keep legacy retrieval packet builder explicitly non-authoritative for touched product flows.
  - If no wording currently mentions this support, do not add broad marketing copy just to touch docs.
- **Validation**:
  - `npm run check`
  - `npm test -- apps/cli/src/commands/root.test.ts apps/cli/src/presenters/knowledge-command.test.ts`
  - Targeted manual wording review of touched docs/help/presenter output.

### TASK-RHBE-7 — Integrated Rust-hosted evidence smoke and handoff bundle (`kind: validation`)

- **Files**: all touched implementation, tests, and docs above.
- **Goal**: prove one coherent Rust-hosted build-evidence story before Code Review and QA.
- **Required evidence**:
  - `query.buildEvidence` appears in capabilities only when callable end to end.
  - Rust-hosted broad `ask` uses `query.buildEvidence` packet truth.
  - Narrow ask/explain still use the specialized truthful methods.
  - Partial, insufficient, unsupported, and unknown-method refusal cases are visible.
  - Lifecycle success remains separate from answer/evidence state.
  - Linux/macOS-only truth and no-daemon/no-remote/no-Windows boundaries remain intact.
- **Validation**:
  - `npm run check`
  - `npm test`
  - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`
  - `make build`
  - Rust-hosted positive smoke: `cargo run -p dh-engine --manifest-path rust-engine/Cargo.toml -- ask "how does auth work?" --workspace . --json`
  - Rust-hosted narrow regression smoke: `cargo run -p dh-engine --manifest-path rust-engine/Cargo.toml -- explain "runKnowledgeCommand" --workspace . --json`
  - Rust-hosted unsupported smoke: `cargo run -p dh-engine --manifest-path rust-engine/Cargo.toml -- ask "trace flow through the entire subsystem" --workspace . --json`

## Dependency Graph And Parallelization Recommendation

- Critical path: `TASK-RHBE-1 -> TASK-RHBE-2 -> TASK-RHBE-3 -> TASK-RHBE-4 -> TASK-RHBE-5 -> TASK-RHBE-6 -> TASK-RHBE-7`.
- `TASK-RHBE-1` must complete before any implementation or tests rely on method advertisement or wire shapes.
- `TASK-RHBE-2` depends on `TASK-RHBE-1` because Rust router behavior must match the frozen protocol.
- `TASK-RHBE-3` depends on `TASK-RHBE-1`/`TASK-RHBE-2` because TS should consume the real Rust method contract, not a speculative shape.
- `TASK-RHBE-4` depends on `TASK-RHBE-3` because routing must call the host-backed bridge method and preserve existing narrow behavior.
- `TASK-RHBE-5` depends on `TASK-RHBE-4` because presentation must reflect actual report fields.
- `TASK-RHBE-6` follows implementation so wording describes delivered truth.
- `TASK-RHBE-7` is the integration checkpoint before Code Review.

Parallelization recommendation:

- parallel_mode: `none`
- why: this feature changes one shared Rust/TS protocol contract and one truth boundary. Parallel edits across Rust router, TS bridge types, ask classifier, and presenter wording would risk mismatched method names, premature capability advertisement, TS fallback packet synthesis, or mixed lifecycle/evidence truth.
- safe_parallel_zones: []
- sequential_constraints:
  - `TASK-RHBE-1 -> TASK-RHBE-2 -> TASK-RHBE-3 -> TASK-RHBE-4 -> TASK-RHBE-5 -> TASK-RHBE-6 -> TASK-RHBE-7`
- integration_checkpoint: prove method advertisement, Rust router execution, host-backed TS consumption, broad/narrow routing, presentation, and smoke evidence in one integrated path before `full_code_review`.
- max_active_execution_tracks: `1`

## Validation Matrix

| Scope AC | Validation path | Required evidence |
| --- | --- | --- |
| AC-1 capability truth | `cargo test --workspace --manifest-path rust-engine/Cargo.toml`; TS bridge tests; Rust-hosted smoke | `query.buildEvidence` is advertised in Rust and TS capabilities only after router and host-backed worker can call it end to end. |
| AC-2 broad `ask` uses Rust packet | `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts`; positive Rust-hosted smoke | A bounded `dh ask "how does auth work?"` routes to `query.buildEvidence` and final report traces to Rust packet truth. |
| AC-3 narrow behavior preserved | TS workflow regression tests; narrow smoke with `explain` and specialized ask patterns | Definition/search/relationship requests still call their specialized methods and do not route through build evidence unnecessarily. |
| AC-4 grounded result inspectability | Rust build-evidence tests; presenter tests; positive smoke | Grounded packet has non-empty evidence entries with file/path/line/provenance and visible packet state. |
| AC-5 partial result limitations | Rust partial fixture; TS/presenter tests | Evidence remains visible and gaps/bounds/stop reasons survive TypeScript consumption and final output. |
| AC-6 insufficient result honesty | Rust no-evidence/missing-index tests; TS workflow tests | Result is `insufficient` with missing proof reason; TS does not synthesize a stronger packet. |
| AC-7 unsupported classes | TS classifier tests; Rust unsupported fixture; unsupported smoke | Runtime tracing, universal subsystem, unsupported depth, and arbitrary methods are `unsupported` with explicit reason and no hidden fallback packet. |
| AC-8 TS no confidence upgrade | Code review plus TS unit tests | TypeScript preserves Rust `answerState`, gaps, bounds, and packet fields; preview rows are non-authoritative. |
| AC-9 reverse-RPC allowlist | Rust `worker_protocol` / `BridgeRpcRouter` tests; host-bridge tests | Unknown methods and out-of-contract methods are refused after adding `query.buildEvidence`; no generic forwarding appears. |
| AC-10 lifecycle/evidence separation | presenter tests; Rust-hosted insufficient/unsupported smoke | `rust_lifecycle.finalStatus` / exit code stay separate from `answerState` and evidence state in JSON/text output. |
| AC-11 bounded wording | Targeted manual wording review; presenter/help snapshots where touched | Docs/help/doctor/presenter text avoids Windows, daemon, remote, universal reasoning, runtime tracing, or broad workflow claims. |
| AC-12 fresh validation | Final evidence bundle from `TASK-RHBE-7` | `npm run check`, `npm test`, Rust tests, `make build`, and Rust-hosted positive/narrow/unsupported smokes are reported with outcomes or explicit unavailable notes. |

## Acceptance Mapping

- AC-1 maps to `TASK-RHBE-1`, `TASK-RHBE-2`, and `TASK-RHBE-3`.
- AC-2 maps to `TASK-RHBE-4` and `TASK-RHBE-7`.
- AC-3 maps to `TASK-RHBE-4` narrow-regression tests and `TASK-RHBE-7` narrow smoke.
- AC-4 maps to `TASK-RHBE-2`, `TASK-RHBE-5`, and positive smoke evidence.
- AC-5 maps to `TASK-RHBE-2` partial fixtures and `TASK-RHBE-5` presenter tests.
- AC-6 maps to `TASK-RHBE-2` insufficient fixtures and `TASK-RHBE-4` no-synthesis tests.
- AC-7 maps to `TASK-RHBE-1`, `TASK-RHBE-2`, `TASK-RHBE-4`, and unsupported smoke.
- AC-8 maps to `TASK-RHBE-3`, `TASK-RHBE-4`, and Code Review focus.
- AC-9 maps to `TASK-RHBE-1` and `TASK-RHBE-3` allowlist-negative tests.
- AC-10 maps to `TASK-RHBE-5` and `TASK-RHBE-7` lifecycle/evidence output checks.
- AC-11 maps to `TASK-RHBE-6` and final wording review.
- AC-12 maps to `TASK-RHBE-7` final handoff evidence.

## Risk Controls And Rollback/Fallback Plan

### Risk controls

- **Premature capability advertisement**: add `query.buildEvidence` to capability output in the same slice that makes the Rust router and TS host-backed client callable; tests must fail if advertised but unrouteable.
- **TS second-truth regression**: keep `packages/retrieval` packet builders out of touched product flow imports; TS report assembly may format Rust packets but not create canonical packet truth.
- **Unsupported broad ask overreach**: classifier remains conservative and Rust validates request bounds. Unsupported/unbounded requests return explicit unsupported or insufficient states.
- **Allowlist regression**: add negative tests for arbitrary methods after expanding the allowlist by one method.
- **Lifecycle/evidence conflation**: presenters and Rust-host reports keep lifecycle final status separate from answer/evidence state.
- **Packet-state drift**: Rust owns grounded/partial/insufficient/unsupported decisions; TypeScript must preserve states and gaps.
- **Platform/scope drift**: wording and tests must preserve Linux/macOS-only, no-daemon, no-remote, no-worker-pool, and no-Windows boundaries.

### Rollback/fallback

- Keep existing `query.search`, `query.definition`, and `query.relationship` behavior intact throughout implementation.
- If `query.buildEvidence` cannot pass end-to-end validation, remove it from advertised capabilities and leave broad-understanding ask as explicit unsupported/insufficient rather than falling back to TS-composed packet truth.
- If presentation changes are unstable, preserve JSON packet fields first and roll back only text rendering changes; do not ship output that hides packet gaps.
- If Rust-hosted smoke fails after TS bridge changes, revert TS broad-understanding routing while keeping narrow ask/explain regressions green.
- No data migration is expected. Rollback is code, tests, docs/help wording, and capability advertisement rollback only.

## Integration Checkpoint

Do not advance to `full_code_review` until `TASK-RHBE-7` confirms one integrated Rust-hosted evidence path:

- Rust protocol/capability output advertises `query.buildEvidence` and refuses arbitrary methods.
- Rust router handles `query.buildEvidence` and returns canonical packet states with evidence/gaps/bounds.
- TypeScript worker uses `HostBridgeClient` to call the Rust host and does not spawn Rust on the supported path.
- Bounded broad `dh ask` routes to build evidence, while narrow ask/explain behavior remains on specialized methods.
- Final output exposes packet truth and keeps lifecycle status distinct from evidence/answer state.
- Positive, narrow-regression, unsupported, insufficient/partial, and unknown-method validations have fresh evidence.
- Touched wording remains bounded: Linux/macOS only, no daemon, no remote/socket/control plane, no worker pool, no runtime trace execution, no universal reasoning, no workflow redesign.

## Reviewer And QA Preservation Notes

- **Fullstack Agent must preserve** the one-method expansion, Rust packet authority, host-backed worker bridge, narrow-method regressions, lifecycle/evidence separation, and explicit non-goals.
- **Code Reviewer must preserve** scope compliance first: reject generic method forwarding, TS packet synthesis, capability advertisement without end-to-end execution, hidden retrieval fallback, trace-flow expansion, Windows work, daemon/remote surfaces, and lifecycle/evidence conflation.
- **QA Agent must preserve** evidence quality: positive build-evidence smoke, narrow regression smoke, unsupported/insufficient states, allowlist refusal, lifecycle-vs-answer-state separation, and bounded wording review.

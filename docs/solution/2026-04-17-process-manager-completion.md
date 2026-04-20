---
artifact_type: solution_package
version: 2
status: solution_lead_handoff
feature_id: PROCESS-MANAGER-COMPLETION
feature_slug: process-manager-completion
source_scope_package: docs/scope/2026-04-17-process-manager-completion.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Process Manager Completion

## Recommended Path

- Keep current repo topology honest: TypeScript remains the practical host/orchestrator that spawns the Rust bridge process on the local JSON-RPC-over-stdio knowledge-command path.
- Complete lifecycle truth and bounded control within that existing path rather than forcing the stronger Rust-host / TypeScript-worker inversion inside this feature.
- Preserve the recovered lifecycle seam already proven in implementation: `dh.initialized`, `dh.ready`, `session.runCommand`, `runtime.ping`, `dh.shutdown`, plus one-attempt replay-safe recovery and degraded/recovered reporting.
- Explicitly defer “Rust is the sole spawning/supervising host and TypeScript is only a worker subprocess” to a future architecture feature.

Why this is enough:

- It preserves the approved operator-facing lifecycle outcomes from the scope package on the runtime the repository actually executes today.
- Recovered implementation and green tests/checks/scans show the bounded lifecycle-control contract is real in the current topology.
- The remaining gap is broader architecture movement, not the lifecycle truth/reporting contract needed for this feature.

## Reroute Repair Note

- Solution v1 assumed a stronger end state: full Rust-host lifecycle authority with TypeScript demoted to worker-only status.
- Implementation evidence showed that current repo reality is still TypeScript host -> Rust bridge subprocess.
- This repaired solution narrows the technical promise without rewriting the product goal:
  - preserve inspectable lifecycle states and truthful operator behavior on the current path
  - preserve bounded recovery/control work already delivered
  - stop short of claiming host-authority inversion that the repo does not yet perform
- Future architecture movement may still pursue the Rust-host / TypeScript-worker model, but it needs separate scope and solution work.

## Recovered Implementation State Preserved By This Repair

- lifecycle/control methods on the current bridge path:
  - `dh.initialized`
  - `dh.ready`
  - `session.runCommand`
  - `runtime.ping`
  - `dh.shutdown`
- bounded one-attempt replay-safe recovery
- operator-visible recovered/degraded reporting
- tests/checks/scans already green for the recovered implementation

## Guarantees In This Feature

- the current knowledge-command path distinguishes spawned vs ready
- request handling is not treated as started until readiness completes
- failures before ready are startup-class failures
- failures after ready during active handling are request-class failures
- bridge liveness/health truth is surfaced through the current lifecycle seam, including degraded or blocked conditions
- automatic recovery is limited to one replay-safe attempt per command path
- replay-unsafe or uncertain work is not silently replayed
- shutdown/cleanup outcome remains inspectable on the current path

## Remaining Boundary Limitation

- This feature does not establish Rust as the sole spawning/supervising host for the end-to-end process tree.
- TypeScript remains the practical command-path host/orchestrator in current repo reality.
- This feature does not convert all lifecycle ownership, timeout authority, or recovery policy into a Rust-first host boundary for every future surface.
- Do not describe this feature as completion of the broader Rust-host / TypeScript-worker architecture migration.

## Dependencies

- Approved upstream scope package: `docs/scope/2026-04-17-process-manager-completion.md`
- Existing runtime/topology reality to preserve:
  - `docs/solution/2026-04-15-bridge-contract-v2.md`
  - `docs/migration/deep-dive-04-process-model.md`
- Existing operator/report surfaces to reuse rather than replace:
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
- Validation path already used successfully for the recovered implementation:
  - `npm run check`
  - `npm test`
  - `cargo test --workspace`
- No transport redesign, daemon mode, or broader architecture inversion is required for this repaired solution.

## Impacted Surfaces

- TypeScript host/orchestration seam
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- Rust bridge lifecycle handlers
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- Operator/diagnostic surfaces
  - `apps/cli/src/commands/ask.ts`
  - `apps/cli/src/commands/explain.ts`
  - `apps/cli/src/commands/trace.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `apps/cli/src/commands/doctor.ts`
  - `docs/user-guide.md` only if wording must be narrowed to match current topology honestly
- Primary tests
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - Rust tests adjacent to `rust-engine/crates/dh-engine/src/main.rs` and `rust-engine/crates/dh-engine/src/bridge.rs`
- Optional persistence note
  - if current knowledge-command summary/session surfaces already persist lifecycle outcome fields, keep those additions additive and bounded; persistence is not a required topology-changing slice for this repaired solution

## Boundaries And Components

### Current runtime topology

- Current supported path for this feature is: TypeScript host/orchestrator spawns the Rust bridge process over local JSON-RPC 2.0 over stdio.
- This repaired solution completes lifecycle truth inside that topology.
- It does not claim the inverse topology as already shipped.

### TypeScript host boundary

- TypeScript owns in this feature:
  - subprocess spawn/teardown initiation
  - lifecycle gating on the current command path
  - timeout/recovery orchestration for the current bridge run
  - phase-aware classification surfaced to CLI/workflow layers
  - operator-visible recovery/degraded wording
- TypeScript must use the lifecycle seam instead of inferring readiness from raw spawn success or transport existence.

### Rust bridge boundary

- Rust owns within this feature:
  - truthful readiness signaling
  - command execution for the current request
  - liveness/health response via `runtime.ping` or equivalent
  - graceful shutdown participation via `dh.shutdown`
  - lifecycle failure signals that allow TypeScript to classify startup/request/health/shutdown truthfully
- Rust in this feature is not the sole top-level lifecycle supervisor of the entire process relationship.

### Transport boundary

- Preserve JSON-RPC 2.0 over stdio with `Content-Length` framing.
- Preserve local-only process communication.
- Do not introduce TCP, HTTP, gRPC, daemon mode, service mode, or remote transport.

### Reporting boundary

- Keep bridge/protocol evidence separate from lifecycle/process evidence.
- Presenter and doctor surfaces must describe current topology truthfully and must not imply Rust-only host authority.

## Interfaces And Data Contracts

### Required lifecycle distinctions on the current path

- `not_running`
- `spawned_not_ready`
- `ready`
- `busy`
- `degraded_or_blocked`
- `shutting_down`
- `stopped`

Readiness and health remain separate facts:

- spawn does not equal ready
- ready does not automatically equal healthy
- a ready bridge may later become degraded or blocked

### Current handshake/control seam

- TypeScript host spawns the Rust bridge process.
- The lifecycle handshake must not treat spawn as readiness.
- The current bounded lifecycle seam includes:
  - `dh.initialized`
  - `dh.ready`
  - `session.runCommand`
  - `runtime.ping`
  - `dh.shutdown`
- Request execution begins only after ready is established on this seam.
- If the seam breaks before ready, classify as startup failure.
- If the seam breaks after ready during active work, classify as request failure unless only shutdown cleanup remains.

### Failure classification rules

- before `dh.ready` => startup failure
- after `dh.ready` with an active request => request failure
- ping/health failure after ready while idle => degraded/blocked lifecycle state
- transport/protocol corruption stays distinct from a handled request error
- shutdown timeout stays separate from an already-known request result

Minimum inspectable failure families remain:

- startup failure
- request failure
- crash or signal termination
- transport/protocol failure
- timeout class:
  - startup timeout
  - request timeout
  - health timeout
  - shutdown timeout

### Recovery contract

- automatic recovery is limited to one attempt per command path
- automatic recovery is allowed only for replay-safe work in the current knowledge-command scope
- recovered success must surface as recovered/degraded, not clean first-pass success
- replay-unsafe or uncertain work must never be silently replayed
- this feature does not claim that recovery policy is already enforced by a Rust-only host boundary

### Cleanup contract

- attempt graceful shutdown through the current lifecycle seam
- fall back to forced termination if graceful shutdown fails or times out
- keep cleanup outcome inspectable as:
  - `graceful`
  - `forced`
  - `incomplete`

### Operator-visible reporting contract

Operators and reviewers must be able to inspect at least:

- whether the bridge reached ready
- whether the request phase actually started
- failure class and timeout class when relevant
- whether automatic recovery was allowed, attempted, succeeded, or was forbidden
- cleanup outcome
- what DH did automatically
- what the operator should do next

`dh doctor` must not claim healthy lifecycle status when launchability, readiness, or ping/health truth cannot be established on the current path.

## Risks And Trade-offs

- **Architecture honesty risk:** docs or review notes may overread this feature as full Rust-host inversion. Mitigation: state current TypeScript-host -> Rust-bridge topology explicitly everywhere.
- **Recovery honesty risk:** replay-safe classification can overclaim. Mitigation: keep the one-attempt limit and default to no silent replay under uncertainty.
- **Contract drift risk:** bridge evidence and lifecycle evidence can blur together. Mitigation: keep separate evidence surfaces.
- **Future migration risk:** a later Rust-host inversion could break terminology. Mitigation: freeze product-facing lifecycle vocabulary now and map future topology changes onto it rather than redefining operator semantics later.
- **Scope drift risk:** do not expand this reroute into daemon mode, persistent worker pools, or full process-model migration.

## Implementation Flow

1. **Freeze current-topology lifecycle vocabulary and report shape**
   - keep the product contract anchored to the current TypeScript-host -> Rust-bridge path
2. **Keep lifecycle methods on the existing bridge seam authoritative for current-path truth**
   - use `dh.initialized`, `dh.ready`, `session.runCommand`, `runtime.ping`, and `dh.shutdown` instead of inferring lifecycle state indirectly
3. **Preserve bounded failure classification, recovery, and cleanup truth**
   - keep one replay-safe retry at most and phase-aware failure reporting
4. **Align operator output and doctor messaging with repo reality**
   - no output may imply broader Rust-host authority than the repo actually has
5. **Run the sequential integration checkpoint before handoff**
   - confirm recovered implementation evidence stays green and wording stays architecture-honest

## Implementation Slices

### Slice 1: Freeze lifecycle vocabulary and the current-topology contract

- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- **Goal:** define one inspectable lifecycle model for the current TypeScript-host -> Rust-bridge path.
- **Validation Command:** `npm run check && npm test && cargo test --workspace`
- **Details:**
  - make spawned vs ready, ready vs healthy, startup vs request failure, recovery, and cleanup explicit
  - preserve separation between bridge evidence and lifecycle/process evidence
  - reviewer focus: no contract or wording that implies Rust-only host authority

### Slice 2: Complete bounded lifecycle-control semantics on the existing bridge path

- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- **Goal:** use the recovered lifecycle seam as the authoritative current-path contract.
- **Validation Command:** `npm run check && npm test && cargo test --workspace`
- **Details:**
  - preserve and use `dh.initialized`, `dh.ready`, `session.runCommand`, `runtime.ping`, and `dh.shutdown`
  - gate request start on readiness rather than spawn
  - keep TypeScript as the current-path orchestrator and Rust as bridged execution/ready/ping/shutdown participant
  - do not add architecture-migration work to invert host topology here

### Slice 3: Preserve bounded recovery, failure classification, and cleanup truth

- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- **Goal:** keep the recovered lifecycle behavior truthful on the existing path.
- **Validation Command:** `npm run check && npm test && cargo test --workspace`
- **Details:**
  - preserve one-attempt replay-safe recovery
  - prevent silent replay on replay-unsafe or uncertain work
  - keep cleanup result inspectable
  - surface degraded/recovered outcomes truthfully
  - reviewer focus: request/startup classification remains phase-aware on the current path

### Slice 4: Operator and diagnostic alignment

- **Files:**
  - `apps/cli/src/commands/ask.ts`
  - `apps/cli/src/commands/explain.ts`
  - `apps/cli/src/commands/trace.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `apps/cli/src/commands/doctor.ts`
  - `docs/user-guide.md` only if needed
- **Goal:** ensure CLI and doctor output match the repaired solution boundary.
- **Validation Command:** `npm run check && npm test`
- **Details:**
  - recovered success must remain visibly recovered/degraded
  - doctor must validate current launchability/readiness/ping truth, not future architecture aspirations
  - no wording may imply that Rust is already the sole spawning/supervising host

### Slice 5: Integration checkpoint and handoff discipline

- **Files:** all touched surfaces above plus their tests
- **Goal:** verify the repaired solution boundary is what implementation and reviewers preserve.
- **Validation Command:** `npm run check && npm test && cargo test --workspace`
- **Details:**
  - confirm the recovered implementation evidence remains green
  - confirm documentation and output now match current topology honestly
  - confirm no follow-up task silently reintroduces the v1 Rust-host-authority assumption

## Dependency Graph

- Critical path: `contract freeze -> lifecycle seam truth -> recovery/classification/cleanup truth -> operator/doctor alignment -> integration checkpoint`
- Slice 1 must land first.
- Slice 2 depends on Slice 1.
- Slice 3 depends on Slice 2.
- Slice 4 depends on Slices 1-3.
- Slice 5 is the sequential integration checkpoint before handoff.
- This reroute remains sequential; no parallel-safe zones are approved.

## Parallelization Assessment

- parallel_mode: `none`
- why: lifecycle vocabulary, current topology truth, recovery rules, and operator wording all share one boundary decision and one execution seam
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- integration_checkpoint: verify one consistent story across TypeScript host orchestration, Rust bridge lifecycle methods, recovery behavior, and operator/doctor output before leaving implementation
- max_active_execution_tracks: `1`

## Validation Matrix

| Target | Validation path |
| --- | --- |
| spawn is not treated as ready | bridge/workflow tests plus command-report assertions |
| startup vs request failure stays phase-aware | recovered TypeScript/Rust tests on pre-ready vs post-ready failure paths |
| readiness/health truth is surfaced on the current seam | `runtime.ping` behavior plus doctor/report tests |
| bounded replay-safe recovery remains truthful | recovered lifecycle tests plus presenter assertions that success is marked recovered/degraded |
| replay-unsafe work is not silently replayed | recovered workflow/bridge tests |
| shutdown and cleanup stay inspectable | bridge/workflow/doctor tests covering graceful vs forced cleanup |
| operator output stays honest about topology | reviewer and QA inspection of presenter/doctor/docs wording against the current TypeScript-host -> Rust-bridge path |
| validation uses real repo commands | `npm run check`, `npm test`, `cargo test --workspace` |

## Integration Checkpoint

Before rerouting back to implementation and then onward to review, the repaired solution expects:

- the current path to show spawned vs ready truth without implying request start before ready
- startup-class failure before ready and request-class failure after ready to remain distinct
- `runtime.ping` health/liveness behavior to keep degraded or blocked states truthful
- one replay-safe recovery attempt at most, surfaced as recovered/degraded
- replay-unsafe or uncertain failure to remain non-replayed and explicit
- shutdown/cleanup outcome to remain inspectable
- docs, output, and review notes to stop short of claiming full Rust-host authority

## Future Feature Boundary

A future architecture feature is required if the product still wants to claim all of the following:

- Rust directly spawns and supervises the TypeScript worker
- Rust becomes the sole lifecycle authority for the end-to-end process tree
- the current TypeScript host/orchestrator role is reduced to a worker-only or thin-client position
- equivalent lifecycle control is carried across that inverted topology

That work must be scoped separately rather than smuggled into this feature during recovery.

## Reviewer Focus Points

- Review against the repaired boundary: current TypeScript-host -> Rust-bridge lifecycle completion, not full topology inversion.
- Preserve the approved lifecycle distinctions from the scope package:
  - spawned vs ready
  - ready vs healthy
  - startup failure vs request failure
  - recovery-safe vs replay-unsafe failure
  - degraded/recovered vs clean success
  - graceful vs forced/incomplete cleanup
- Confirm the recovered lifecycle methods remain the current contract:
  - `dh.initialized`
  - `dh.ready`
  - `session.runCommand`
  - `runtime.ping`
  - `dh.shutdown`
- Confirm operator and diagnostic surfaces do not imply Rust-only host authority.
- Reject any late follow-up that broadens this feature into daemon mode, persistent worker pools, or architecture migration beyond the repaired scope.

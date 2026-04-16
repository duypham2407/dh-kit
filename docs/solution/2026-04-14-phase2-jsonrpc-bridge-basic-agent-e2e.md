---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: PHASE2-JSONRPC-BRIDGE
feature_slug: phase2-jsonrpc-bridge-basic-agent-e2e
source_scope_package: docs/scope/2026-04-14-phase2-jsonrpc-bridge-basic-agent-e2e.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Phase2 Jsonrpc Bridge Basic Agent E2e

## Chosen Approach

- Use the existing `dh ask "..."` knowledge-command path as the single Phase 2 entry path.
- Route one bounded code-intelligence request through a local Rust child-process bridge using JSON-RPC 2.0 over stdio with `Content-Length` framing.
- Keep the method surface intentionally minimal: `dh.initialize` plus one bounded query method for the happy-path demo, with optional `runtime.ping` only if needed for health diagnostics.
- Surface bridge proof, startup outcome, and request outcome through the existing operator-visible knowledge-command report instead of creating a second demo-only command.

Why this is enough:

- It satisfies the approved scope of one local bridge and one basic end-to-end workflow.
- It reuses an existing repo-visible runtime path that already has CLI and presenter coverage.
- It keeps Phase 2 bounded and avoids premature parity, daemon, packaging, or multi-workflow expansion.

## Impacted Surfaces

- `apps/cli/src/commands/ask.ts`
- `apps/cli/src/presenters/knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- new or adjacent bridge-client surface under `packages/runtime/` or `packages/opencode-app/src/` for:
  - Rust child-process spawn and teardown
  - JSON-RPC framing and correlation
  - timeout handling
  - typed request wrappers
  - bridge evidence capture
- `rust-engine/crates/dh-engine/src/main.rs` plus nearby Rust bridge-serving files
- `docs/qa/2026-04-14-phase2-jsonrpc-bridge-basic-agent-e2e.md` during QA handoff

## Boundaries And Components

### Entry Host

- `dh ask` is the only required operator entry path for this phase.
- `runKnowledgeCommand` is the workflow host for the bounded bridge-backed request.
- `explain`, `trace`, lane workflows, and index workflows are out of scope unless implementation needs shared bridge plumbing with no behavior expansion.

### TypeScript Side

- Owns command handling, child-process lifecycle, bridge client behavior, timeout enforcement, error mapping, and result presentation.
- Must remain the JSON-RPC client.
- Must not silently report success from a non-bridge shortcut when Phase 2 bridge mode is expected.

### Rust Side

- Owns the local JSON-RPC server endpoint within `dh-engine`.
- Must add a serve/bridge mode without replacing existing Phase 1 CLI commands (`init`, `status`, `index`, `parity`).
- Must keep stdout protocol-only and stderr log-only.

### Transport Boundary

- Local-only stdio bridge.
- No TCP port.
- No background daemon.
- No multi-client lifecycle hardening.
- One spawned process per `dh ask` invocation is sufficient for Phase 2.

## Interfaces And Data Contracts

### Lifecycle Model

Per `dh ask` invocation:

1. TS workflow receives operator input.
2. TS spawns `dh-engine` in bridge/serve mode.
3. TS performs `dh.initialize` handshake.
4. TS sends one bounded query request.
5. TS receives one terminal success or failure response.
6. TS records bridge evidence and terminates the child process.

### JSON-RPC Envelope Rules

- Use JSON-RPC 2.0 envelope semantics exactly.
- Every request/response includes `jsonrpc: "2.0"`.
- Success responses use `result`.
- Failures use `error`.
- Notifications are optional and should stay minimal for this phase.

### Minimum Method Surface

#### Required

- `dh.initialize`
  - purpose: protocol/workspace handshake and readiness confirmation
- one bounded query method
  - recommended family: `query.search`
  - purpose: return structured, non-empty code-intelligence results for the `dh ask` Phase 2 demo

#### Optional only if honestly needed

- `runtime.ping`
  - allowed only for health/timeout diagnostics
  - not a replacement for the actual end-to-end query proof

### Request Expectations

#### `dh.initialize` params

- protocol version
- workspace/repo root
- client identity
- supported framing metadata if needed

#### bounded query params

- raw operator query string
- repo/workspace context
- optional result limit
- correlation/request id as needed by the client wrapper

### Success Result Expectations

The bounded query result must be structured and non-empty. It should include:

- result items list
- for each item: file path, line/range, short preview/snippet, and any ranking/reason field available
- bridge metadata sufficient for observability:
  - method name
  - request id
  - engine identity/version when available

Empty or ambiguous output must be treated as failure for this phase.

### Error Expectations

TypeScript should map bridge failures into explicit categories that distinguish startup from request handling. Expected surfaced categories:

- `BRIDGE_STARTUP_FAILED`
- `BRIDGE_UNREACHABLE`
- `BRIDGE_TIMEOUT`
- `METHOD_NOT_SUPPORTED`
- `INVALID_REQUEST`
- `REQUEST_FAILED`
- `EMPTY_RESULT_TREATED_AS_FAILURE`

Each failure should surface:

- failure category/code
- human-readable message
- phase: `startup` or `request`
- retryability hint only if implementation can state it honestly

## Risks And Trade-offs

- **Silent fallback risk:** if `runKnowledgeCommand` can still succeed without the bridge, reviewers may not be able to tell whether Rust was exercised. Mitigation: success output must carry explicit bridge evidence fields.
- **Transport-success but unusable-result risk:** a technically valid response could still be empty or ambiguous. Mitigation: treat empty/partial output as failure in this phase.
- **Over-expansion risk:** bridge work could drift into future protocol families or workflow parity. Mitigation: keep Phase 2 to `dh.initialize`, one bounded query method, and existing `dh ask` host path only.
- **Hanging subprocess risk:** startup or request can stall. Mitigation: explicit startup/request timeouts and explicit surfaced timeout category.
- **Review ambiguity risk:** startup failures and request failures could be conflated. Mitigation: preserve a strict failure taxonomy and phase tagging.

## Recommended Path

- Entry path: `dh ask "<question>"`
- Client: TypeScript knowledge-command workflow
- Server: local `dh-engine` child process in bridge mode
- Transport: JSON-RPC 2.0 over stdio with `Content-Length` framing
- Proof target: one bounded code-intelligence query returns a structured, non-empty Rust-backed result with operator-visible bridge evidence

## Implementation Slices

### Slice 1: Bridge contract and serving seam

- **Goal:** establish the minimal TS client ↔ Rust server contract without changing broader workflow architecture.
- **Files:**
  - `rust-engine/crates/dh-engine/src/main.rs`
  - adjacent new Rust bridge-serving files as needed
  - new or adjacent TS bridge client files under `packages/runtime/` or `packages/opencode-app/src/`
- **Validation Command:** `cargo test --workspace && npm run check`
- **Details:**
  - add a bridge/serve mode to `dh-engine`
  - implement stdio `Content-Length` framing
  - implement `dh.initialize`
  - keep existing Phase 1 CLI surfaces intact

### Slice 2: Route one bounded `dh ask` request through the bridge

- **Goal:** make one real operator-visible knowledge flow cross the bridge and return structured results.
- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - bridge client files from Slice 1
- **Validation Command:** `npm test && npm run check`
- **Details:**
  - wire the bounded request path through the bridge-backed query method
  - keep scope to one minimal request family only
  - map Rust response into the existing knowledge-command report shape with additive bridge metadata
  - treat empty result as failure

### Slice 3: Operator-visible evidence and failure mapping

- **Goal:** make success/failure inspectable enough for review and QA.
- **Files:**
  - `apps/cli/src/presenters/knowledge-command.ts`
  - any report types supporting `runKnowledgeCommand`
- **Validation Command:** `npm test && npm run check`
- **Details:**
  - extend the report with a compact bridge evidence block
  - text and JSON outputs must show whether startup succeeded, which method ran, and whether Rust-backed evidence was verified
  - surface startup failure separately from request failure

### Slice 4: Integration checkpoint and handoff evidence

- **Goal:** prove the real end-to-end path before QA starts.
- **Files:**
  - implementation surfaces above
  - QA artifact created later under `docs/qa/`
- **Validation Command:** `cargo test --workspace && npm test && npm run check`
- **Details:**
  - verify one successful bridge-backed `dh ask` run
  - verify at least one startup-failure path and one request-failure path are surfaced honestly
  - confirm success evidence proves Rust-backed execution rather than a mock or bypass

## Dependency Graph

- Critical path: `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- Shared surfaces are narrow and overlapping, so work should remain sequential.

## Parallelization Assessment

- parallel_mode: `none`
- why: bridge contract, workflow wiring, and evidence mapping all touch the same minimal end-to-end path; parallel work would increase ambiguity for little gain.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- integration_checkpoint: prove one successful bridge-backed `dh ask` result and explicit startup/request failures before QA handoff.
- max_active_execution_tracks: `1`

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix

| Target | Validation path |
| --- | --- |
| AC1 minimal bridge exists | Rust bridge-serving tests + TS bridge client tests + `npm run check` |
| AC2 one basic e2e flow succeeds | `runKnowledgeCommand` tests + CLI presenter tests + bridge-backed `dh ask` smoke path |
| AC3 success is inspectable | knowledge-command report/presenter assertions showing startup, method, and Rust-backed evidence |
| AC4 startup failure is explicit | targeted failure test covering spawn/handshake/timeout classification |
| AC5 request failure is explicit | targeted failure test covering handled request failure separate from startup |
| AC6 scope remains minimal | Code Reviewer confirms only one entry path, one bounded workflow, and minimal method surface |
| AC7 operator guidance exists | solution package + later QA artifact clearly describe supported flow and failure categories |

## Integration Checkpoint

Before `full_code_review` or QA handoff, implementation must show:

- one successful `dh ask` invocation returning a structured, non-empty result with bridge evidence
- one explicit startup-failure outcome
- one explicit request-failure outcome
- confirmation that success did not come from a TS-only fallback path

## Rollback Notes

- If the bridge cannot produce an honest, inspectable Rust-backed success path within the bounded scope, do not broaden into parity or daemon work.
- Preserve existing Phase 1 `dh-engine` CLI behavior while adding bridge mode.
- If bridge wiring destabilizes `dh ask`, revert to the pre-bridge knowledge-command path and reassess before expanding scope.

## Reviewer Focus Points

- Preserve Phase 2 boundary: one local bridge and one basic end-to-end workflow only.
- Confirm stdout is protocol-only and stderr remains log-only.
- Confirm success output contains explicit bridge evidence proving Rust-backed execution.
- Confirm empty/ambiguous output is treated as failure.
- Confirm failure taxonomy distinguishes startup from request handling.
- Confirm no broad method-family, packaging, daemon, or workflow-parity expansion was introduced.

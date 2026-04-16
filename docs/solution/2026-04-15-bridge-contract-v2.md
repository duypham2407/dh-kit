---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: BRIDGE-CONTRACT-V2
feature_slug: bridge-contract-v2
source_scope_package: docs/scope/2026-04-15-bridge-contract-v2.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Bridge Contract V2

## Chosen Approach

- Mature the existing local Rust↔TS bridge into a bounded V2 contract without changing the surrounding runtime shape.
- Preserve JSON-RPC 2.0 over stdio with `Content-Length` framing, TypeScript as host/client, and Rust as spawned worker/server.
- Make method support, readiness, terminal outcomes, and failure classes explicit and inspectable.

Why this is enough:

- The repository already has a working bridge and bridge-backed flows.
- The approved scope is contract maturity, not transport or product redesign.
- The missing piece is a stable, inspectable contract boundary that implementation, review, and QA can rely on.

## Impacted Surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.ts`
- `rust-engine/crates/dh-engine/src/bridge.rs`
- Bridge-focused tests under:
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - Rust bridge tests in `rust-engine/crates/dh-engine/src/bridge.rs`

## Boundaries And Components

### Entry Host

- Keep the existing TypeScript workflow host and CLI presentation path.
- Do not add a second bridge-only operator surface in this phase.

### TypeScript Side

- Owns worker spawn, initialization, request correlation, timeout enforcement, error mapping, and operator-visible bridge evidence.
- Must remain the JSON-RPC client/host.

### Rust Side

- Owns the local JSON-RPC server behavior for the spawned worker.
- Must keep stdout protocol-only and stderr log-only.

### Transport Boundary

- Local-only stdio transport.
- No daemon, TCP transport, remote transport, or multi-client lifecycle manager in V2.

## Interfaces And Data Contracts

### Guaranteed Method Families And Concrete Methods

#### Initialization / capability handshake

- `dh.initialize` — required

#### Query

- `query.search` — required
- `query.definition` — required
- `query.relationship` — required with only these guaranteed relations in V2:
  - `usage`
  - `dependencies`
  - `dependents`

#### Runtime / health

- No separate `runtime.ping` guarantee in this phase.
- Runtime/health is made inspectable through:
  - `dh.initialize` readiness result
  - host-side lifecycle evidence
  - explicit terminal failure taxonomy

#### Notifications / events

- No general notification or event-stream guarantee in V2.
- Lifecycle inspectability must come from initialize success/failure and terminal request outcomes, not broad streaming behavior.

### JSON-RPC Envelope Rules

- Use JSON-RPC 2.0 over stdio with `Content-Length` framing.
- stdout is reserved for protocol frames.
- stderr is reserved for logs.
- Every request/response includes `jsonrpc: "2.0"`.
- Success responses use `result`.
- Failures use `error`.

### Request Envelope

```json
{
  "jsonrpc": "2.0",
  "id": "<number-or-string>",
  "method": "<method-name>",
  "params": {}
}
```

### Success Envelope

```json
{
  "jsonrpc": "2.0",
  "id": "<same-id>",
  "result": {}
}
```

### Error Envelope

```json
{
  "jsonrpc": "2.0",
  "id": "<same-id>",
  "error": {
    "code": 0,
    "message": "<human-readable>",
    "data": {}
  }
}
```

### Initialize Result Contract

`dh.initialize.result` must expose at minimum:

- `serverName`
- `serverVersion`
- `protocolVersion`
- `workspaceRoot`
- `capabilities`

`capabilities` must advertise, at minimum:

- supported protocol version
- supported methods:
  - `dh.initialize`
  - `query.search`
  - `query.definition`
  - `query.relationship`
- supported `query.relationship` relations:
  - `usage`
  - `dependencies`
  - `dependents`

Anything else currently implemented but not listed above is not part of the guaranteed V2 contract.

### Query Result Contract

- Query responses must remain typed and structured.
- Results must be non-empty to count as success for the supported bridge-backed flow.
- Empty, partial, or operator-ambiguous output must be treated as failure.

### Failure Taxonomy

- `BRIDGE_STARTUP_FAILED`
- `BRIDGE_UNREACHABLE`
- `BRIDGE_TIMEOUT`
- `METHOD_NOT_SUPPORTED`
- `INVALID_REQUEST`
- `REQUEST_FAILED`
- `EMPTY_RESULT_TREATED_AS_FAILURE`

Each surfaced failure must include:

- `code`
- `phase`: `startup` or `request`
- human-readable `message`
- `retryable` only when implementation can state it honestly

## Risks And Trade-offs

- **Silent fallback risk:** bridge failure must not be masked by a success path outside the bridge contract.
- **Transport-success but unusable-result risk:** structurally valid but empty or ambiguous output must still fail.
- **Over-expansion risk:** bridge-contract work could drift into daemonization, broad notifications, or parity expansion.
- **Lifecycle ambiguity risk:** startup failure, readiness failure, timeout, and request failure could be conflated unless the host contract preserves phase-aware error mapping.
- **Truthfulness risk:** capability advertisement must match the actual guaranteed method set, not aspirational future support.

## Recommended Path

- Keep the current Rust worker + TypeScript host architecture.
- Freeze a bounded V2 method catalog and relation subset.
- Add explicit capability advertisement to `dh.initialize`.
- Treat readiness as successful `dh.initialize` completion.
- Keep one terminal outcome per request: success or explicit failure.
- Keep notifications/events out of the minimum V2 guarantee.

## Implementation Slices

### Slice 1: Contract hardening

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- **Goal:** define the V2 method catalog, envelope expectations, capability advertisement shape, and failure mapping without changing transport shape.
- **Validation Command:** `cargo test --workspace && npm run check && npm test`
- **Details:**
  - preserve JSON-RPC/stdin-stdout framing
  - make `dh.initialize` return explicit capability advertisement
  - freeze guaranteed methods and supported `query.relationship` relations

### Slice 2: Lifecycle truthfulness

- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- **Goal:** make readiness, timeout, unreachable-worker, and ambiguous output end in distinct inspectable terminal outcomes.
- **Validation Command:** `npm run check && npm test`
- **Details:**
  - readiness is only a successful `dh.initialize`
  - startup and request failures remain distinct
  - no silent success from empty or ambiguous output
  - no hidden in-request auto-restart guarantee

### Slice 3: Method support enforcement

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- **Goal:** ensure unsupported methods or unsupported relationship variants are surfaced explicitly instead of being implied through weak output.
- **Validation Command:** `cargo test --workspace && npm test`
- **Details:**
  - supported methods must succeed through the bounded V2 path
  - unsupported methods/relations must map to explicit unsupported-capability or method-not-supported outcomes

### Slice 4: Operator-visible evidence

- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
- **Goal:** make bridge readiness, capability support, method identity, and terminal request state visible enough for review and QA.
- **Validation Command:** `npm run check && npm test`
- **Details:**
  - surface whether startup succeeded
  - surface which method ran and request id
  - surface engine identity/version when available
  - surface explicit failure classification when the request does not succeed

## Dependency Graph

- Critical path: `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- Shared surfaces overlap heavily across Rust bridge, TS client, and operator evidence, so work should remain sequential.

## Parallelization Assessment

- parallel_mode: `none`
- why: contract, lifecycle mapping, and operator evidence all touch the same narrow end-to-end seam; parallel work would add ambiguity with little gain.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- integration_checkpoint: verify one supported bridge-backed flow plus explicit startup, unsupported-capability, timeout/unreachable, and request-failure outcomes before QA handoff.
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
| AC1 first-class method families are explicit | Rust bridge tests + TS bridge-client tests confirm guaranteed V2 method catalog and relation subset |
| AC2 capability support is inspectable | `dh.initialize` capability advertisement assertions + workflow/report assertions |
| AC3 lifecycle outcomes are distinguishable | targeted startup/request failure tests and presenter/workflow assertions |
| AC4 one terminal outcome per request | bridge client and workflow tests confirm exactly one success/failure outcome per request |
| AC5 empty/ambiguous output is not success | targeted empty-result tests mapped to `EMPTY_RESULT_TREATED_AS_FAILURE` |
| AC6 failure taxonomy is explicit | tests for startup failure, unreachable worker, timeout, method unsupported, invalid request, and request failure |
| AC7 scope remains bounded | Code Reviewer confirms no transport redesign, broad notifications, daemon, or parity expansion |

## Integration Checkpoint

- Before QA starts, implementation must prove:
  - one successful supported bridge-backed request
  - one explicit startup/readiness failure
  - one explicit unsupported method/capability path
  - one explicit timeout or unreachable-worker path
  - one explicit request failure after readiness
  - empty or ambiguous output is treated as failure, not success

## Rollback Notes

- This phase must remain additive over the existing bridge-backed workflow shape.
- If capability advertisement or stricter failure classification creates integration regressions, rollback should preserve the prior narrow bridge behavior rather than introducing a different transport or host/worker architecture.
- Do not couple rollback to daemon/process-model redesign.

## Reviewer Focus Points

- Preserve JSON-RPC 2.0 over stdio with `Content-Length` framing.
- Preserve TypeScript host/client and Rust spawned worker/server roles.
- Confirm capability advertisement matches the guaranteed V2 method catalog exactly.
- Confirm unsupported capability/method is explicit and not inferred from empty output.
- Confirm readiness is tied to successful `dh.initialize`, not inferred from process spawn alone.
- Confirm no broad notification/event-stream contract is introduced in this phase.
- Confirm no silent fallback, daemonization, remote transport, or runtime redesign drift.

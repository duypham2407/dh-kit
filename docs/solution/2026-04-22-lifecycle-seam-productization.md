---
artifact_type: solution_package
version: 2
status: solution_lead_handoff
feature_id: LIFECYCLE-SEAM-PRODUCTIZATION
feature_slug: lifecycle-seam-productization
source_scope_package: docs/scope/2026-04-22-lifecycle-seam-productization.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Lifecycle Seam Productization

## Chosen Approach

- Productize only the two already-live lifecycle seam methods by adding typed TypeScript wrappers and wiring them into the smallest existing product paths.
- Exact first-wave operator/runtime surface for `runtime.ping`: the existing `dh doctor` surface, with a **dedicated lifecycle-seam subsection** in `packages/runtime/src/diagnostics/doctor.ts` and its JSON mirror surfaced by `apps/cli/src/commands/doctor.ts`.
- Exact first-wave bounded TS consumer path for `session.runCommand`: the existing `packages/opencode-app/src/workflows/run-knowledge-command.ts` ask/explain flow for **only** `search_file_discovery`, `graph_definition`, `graph_relationship_usage`, `graph_relationship_dependencies`, and `graph_relationship_dependents`, surfaced through `apps/cli/src/commands/ask.ts`, `apps/cli/src/commands/explain.ts`, and `apps/cli/src/presenters/knowledge-command.ts`.
- Keep Rust authoritative for lifecycle seam truth and delegated request outcome truth. Keep TypeScript limited to typed routing, consumption, presentation, and operator use.
- Preserve current runtime topology exactly as shipped today: **TypeScript host/orchestrator -> Rust bridge subprocess** over local JSON-RPC over stdio.

Why this is enough:

- The Rust bridge already exposes `runtime.ping` and `session.runCommand`; the missing gap is typed TS consumption and a real operator/product path, not a new architecture tier.
- `dh doctor` already exists as the bounded operator/runtime inspection surface, so `runtime.ping` can become real without inventing a new CLI family.
- `runKnowledgeCommand` already owns the ask/explain bounded query path, so routing its existing search/definition/relationship classes through `session.runCommand` creates one clear delegated truth story without widening the delegated surface.

## Impacted Surfaces

### Rust lifecycle seam truth

- `rust-engine/crates/dh-engine/src/bridge.rs`

### TypeScript bridge contract

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`

### First-wave bounded TS consumer path for `session.runCommand`

- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.test.ts`
- surfaced through existing entrypoints:
  - `apps/cli/src/commands/ask.ts`
  - `apps/cli/src/commands/explain.ts`

### First-wave operator/runtime surface for `runtime.ping`

- `packages/runtime/src/diagnostics/rust-engine-status.ts`
- `packages/runtime/src/diagnostics/doctor.ts`
- `packages/runtime/src/diagnostics/doctor.test.ts`
- surfaced through existing entrypoint:
  - `apps/cli/src/commands/doctor.ts`
  - `apps/cli/src/commands/doctor.test.ts`

### Documentation / wording alignment

- `docs/user-guide.md`

## Boundaries And Components

### Current topology to preserve

- This feature does **not** change process ownership.
- The supported path remains:
  - TypeScript host/orchestrator starts and talks to the Rust bridge subprocess.
  - Rust bridge remains the seam truth owner for lifecycle and delegated request outcome on that path.
- This feature must not be written up or reviewed as Rust-host inversion, daemon mode, remote transport, or control-plane expansion.

### Exact first-wave product paths

| Seam method | First-wave product path | Exact TS touchpoint | Boundary |
| --- | --- | --- | --- |
| `runtime.ping` | existing `dh doctor` text and `--json` output | `packages/runtime/src/diagnostics/rust-engine-status.ts` -> `packages/runtime/src/diagnostics/doctor.ts` -> `apps/cli/src/commands/doctor.ts` | lifecycle/liveness seam truth only |
| `session.runCommand` | existing `dh ask` / `dh explain` bounded knowledge flow | `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` -> `packages/opencode-app/src/workflows/run-knowledge-command.ts` -> `apps/cli/src/presenters/knowledge-command.ts` | delegated `query.search` / `query.definition` / `query.relationship` only |

### Rust vs TypeScript responsibilities

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| `runtime.ping` | authoritative seam liveness response, `ok`/workerState/healthState/phase truth, refusal or absence truth when the method cannot be served | typed wrapper, doctor routing, operator wording, explicit degraded/unavailable presentation when the seam cannot be reached | `runtime.health`, `runtime.diagnostics`, workflow-state truth, approval/release/install truth |
| `session.runCommand` | delegated method allowlist, delegated request acceptance/refusal, terminal delegated result truth | typed union request wrapper, bounded consumer routing, surfaced delegated-method metadata, presentation of refusal/failure/degraded states | generic command execution, raw method passthrough, shell/tool runner, broad RPC forwarding |
| ask/explain product output | none | render seam usage and delegated-method inspectability without inventing a second result story | fallback direct-query success that hides refused or failed delegation |
| doctor operator output | none | present `runtime.ping` as its own seam subsection, separate from existing `runtime.health` / `runtime.diagnostics` sections | a merged “one health number” that hides seam-specific truth |

## Interfaces And Data Contracts

### `runtime.ping` first-wave typed contract

Recommended TS wrapper shape in `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`:

- `getRuntimePing(): Promise<BridgeRuntimePingResult>`
- `BridgeRuntimePingResult` should preserve the Rust payload directly:
  - `ok: boolean`
  - `workerState: string`
  - `healthState: string`
  - `phase: string`

First-wave operator semantics:

- `dh doctor` should show a **lifecycle seam subsection sourced from `runtime.ping`**.
- That subsection should remain bounded to seam liveness truth only.
- `dh doctor` may map the raw ping result to compact operator wording, but it must not erase the raw seam facts in the JSON report.
- Existing `runtime.health` / `runtime.diagnostics` sections remain separate and unchanged in purpose.

### Exact delegated-method boundary for `session.runCommand`

This feature keeps `session.runCommand` explicitly bounded to the Rust allowlist already present in `rust-engine/crates/dh-engine/src/bridge.rs`:

- allowed delegated methods:
  - `query.search`
  - `query.definition`
  - `query.relationship`
- `query.relationship` stays bounded to the currently supported relation family already advertised by the bridge:
  - `usage`
  - `dependencies`
  - `dependents`

Out of boundary in this feature:

- `query.buildEvidence`
- `query.callHierarchy`
- `query.traceFlow`
- `query.impactAnalysis`
- `runtime.*` methods other than the separate first-wave `runtime.ping` wrapper
- `tool.execute`, `file.*`, or any shell/CLI/system command path
- arbitrary `method: string` passthrough from TS

Recommended TS wrapper shape:

- `runSessionCommand(input: BridgeSessionRunCommandRequest): Promise<BridgeAskResult>`
- `BridgeSessionRunCommandRequest` should be a typed union for only:
  - file-path search requests currently routed from `search_file_discovery`
  - definition requests currently routed from `graph_definition`
  - relationship requests currently routed from `graph_relationship_usage`, `graph_relationship_dependencies`, and `graph_relationship_dependents`

Design rule:

- For the routed first-wave classes above, TypeScript must not fall back to direct `query.search`, `query.definition`, or `query.relationship` when `session.runCommand` refuses or fails.
- For out-of-bound classes (`buildEvidence`, `callHierarchy`, `traceFlow`, `impactAnalysis`), the current direct methods remain unchanged in this feature.

### Inspectability contract

For the first-wave `session.runCommand` consumer path, surfaced output should make both of these inspectable:

- seam method used: `session.runCommand`
- delegated method used: one of `query.search`, `query.definition`, `query.relationship`

The cleanest place to carry that truth is `KnowledgeCommandReport.bridgeEvidence` by extending it with explicit delegated-method metadata rather than burying it in free-form text.

### Refusal / error / degraded semantics

| Case | Rust truth source | Required surfaced behavior |
| --- | --- | --- |
| `runtime.ping` success | Rust `runtime.ping` result | show lifecycle seam available/healthy without upgrading it into runtime-health or workflow truth |
| `runtime.ping` timeout / bridge unreachable / startup failure | transport + existing `DhBridgeError` phase/code | show explicit degraded or unavailable seam state; do not synthesize a healthy ping |
| `runtime.ping` unsupported / missing | Rust refusal or client capability absence | show explicit unsupported or unavailable seam state; do not silently fall back to `runtime.health` |
| `session.runCommand` delegated success | Rust delegated result plus delegated `method` | show seam usage and delegated method inspectably |
| `session.runCommand` unsupported delegated method | Rust `CAPABILITY_UNSUPPORTED` / method-not-supported response | show explicit refused/unsupported outcome; never retry direct method on the touched path |
| `session.runCommand` invalid request shape | Rust `INVALID_REQUEST` response | surface explicit invalid request |
| delegated request failure | delegated Rust error payload or request-phase `DhBridgeError` | keep failure distinguishable from refusal and from clean success |
| startup/request timeout or bridge loss | existing `DhBridgeError` phase + retryable truth | preserve startup vs request classification; do not flatten into generic “command failed” |

## Risks And Trade-offs

- **Two-truth-story risk on delegated queries**
  - If first-wave ask/explain classes still bypass `session.runCommand`, reviewers will see both a seam path and a direct-query path for the same product behavior.
  - Mitigation: route the bounded first-wave classes through `session.runCommand` only.

- **`runtime.ping` / `runtime.health` drift risk**
  - If `dh doctor` merges ping and health into one surface, seam truth will become ambiguous.
  - Mitigation: keep a separate lifecycle seam subsection for `runtime.ping` and preserve existing bridge runtime health/diagnostics sections.

- **Delegation-scope creep risk**
  - Widening `session.runCommand` to `buildEvidence`, trace, impact, or arbitrary methods would turn this feature into generic bridge execution.
  - Mitigation: freeze the delegated union to `query.search`, `query.definition`, and `query.relationship` only.

- **Output ambiguity risk**
  - If presenters show only the delegated method, reviewers cannot tell that the seam path was really used.
  - Mitigation: surface both seam method and delegated method metadata.

- **Topology honesty risk**
  - Lifecycle-seam productization can be misread as broader process-model completion.
  - Mitigation: state TypeScript host/orchestrator -> Rust bridge subprocess explicitly in code comments, docs, review notes, and output wording where touched.

## Recommended Path

1. **Add two typed TS wrappers and preserve current Rust seam truth**
   - add `getRuntimePing()`
   - add `runSessionCommand()` bounded to the current delegated union
   - preserve existing Rust lifecycleControl capability advertisement without adding new lifecycle methods

2. **Route only the smallest truthful TS consumer surface through `session.runCommand`**
   - reroute `runKnowledgeCommand` for:
     - `search_file_discovery`
     - `graph_definition`
     - `graph_relationship_usage`
     - `graph_relationship_dependencies`
     - `graph_relationship_dependents`
   - keep `graph_build_evidence`, `graph_call_hierarchy`, `graph_trace_flow`, and `graph_impact` on their current direct methods

3. **Route only the smallest truthful operator/runtime surface through `runtime.ping`**
   - add a lifecycle-seam subsection to `dh doctor`
   - keep that subsection separate from the existing `runtime.health` / `runtime.diagnostics` story

4. **Make refusal, error, timeout, and degraded states inspectable**
   - `session.runCommand` must surface refused vs invalid vs failed distinctly
   - `runtime.ping` must surface unavailable/degraded explicitly when the seam cannot be reached

5. **Align wording and tests to one topology-honest story**
   - no host inversion claims
   - no new CLI family
   - no generic execution language

## Implementation Slices

### Slice 1: Freeze the seam contract in TS without widening the Rust seam

- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- **Goal:** make `runtime.ping` and `session.runCommand` typed, inspectable TS wrappers while preserving the existing Rust lifecycle seam boundary.
- **Validation Command:**
  - from repo root: `npm run check`
  - from repo root: `npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - from `rust-engine/`: `cargo test --workspace`
- **Details:**
  - add `getRuntimePing()` that preserves the Rust payload directly
  - add `runSessionCommand()` with a typed delegated-method union instead of `method: string`
  - keep Rust lifecycle advertisement limited to the existing lifecycle seam list:
    - `dh.initialized`
    - `dh.ready`
    - `session.runCommand`
    - `runtime.ping`
    - `dh.shutdown`
  - reviewer focus: no new lifecycle methods, no widened delegated family, no generic passthrough types

### Slice 2: Productize `session.runCommand` on the bounded ask/explain path

- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - surfaced through:
    - `apps/cli/src/commands/ask.ts`
    - `apps/cli/src/commands/explain.ts`
- **Goal:** make `session.runCommand` a real current TS consumer path without widening it beyond the Rust delegated boundary.
- **Validation Command:**
  - from repo root: `npm run check`
  - from repo root: `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts apps/cli/src/presenters/knowledge-command.test.ts`
  - from `rust-engine/`: `cargo test --workspace`
- **Details:**
  - reroute only the bounded first-wave classes to `runSessionCommand()`
  - keep build-evidence / call-hierarchy / trace-flow / impact on their direct methods
  - extend surfaced metadata so reviewers can see:
    - seam method = `session.runCommand`
    - delegated method = `query.search` / `query.definition` / `query.relationship`
  - preserve startup vs request failure classification from `DhBridgeError`
  - reviewer focus: no fallback direct-query retry on the touched delegated classes

### Slice 3: Productize `runtime.ping` on the existing doctor surface

- **Files:**
  - `packages/runtime/src/diagnostics/rust-engine-status.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - surfaced through:
    - `apps/cli/src/commands/doctor.ts`
    - `apps/cli/src/commands/doctor.test.ts`
- **Goal:** make `runtime.ping` a real operator/runtime lifecycle seam surface on `dh doctor` without collapsing it into `runtime.health` or `runtime.diagnostics`.
- **Validation Command:**
  - from repo root: `npm run check`
  - from repo root: `npm test -- packages/runtime/src/diagnostics/doctor.test.ts apps/cli/src/commands/doctor.test.ts`
  - from `rust-engine/`: `cargo test --workspace`
- **Details:**
  - probe `runtime.ping` explicitly in `rust-engine-status.ts`
  - add a separate doctor subsection for lifecycle seam status sourced from `runtime.ping`
  - keep the existing bridge runtime section sourced from `runtime.health` / `runtime.diagnostics`
  - preserve the doctor command’s existing product/install/workspace condition as a separate top-level story
  - reviewer focus: `runtime.ping` is seam lifecycle truth only, not a replacement for existing runtime utility or workflow-state inspection surfaces

### Slice 4: Align refusal, degraded, and topology wording across output and docs

- **Files:**
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `docs/user-guide.md`
- **Goal:** make the product path readable and inspectable without creating broader architecture or capability claims.
- **Validation Command:**
  - from repo root: `npm run check`
  - from repo root: `npm test -- apps/cli/src/presenters/knowledge-command.test.ts packages/runtime/src/diagnostics/doctor.test.ts apps/cli/src/commands/doctor.test.ts`
- **Details:**
  - keep unsupported, refused, invalid, failed, timed-out, degraded, and unavailable outcomes distinct in touched output
  - describe `runtime.ping` as lifecycle seam truth only
  - describe `session.runCommand` as bounded delegated query execution only
  - keep wording explicit about current TypeScript host/orchestrator -> Rust bridge subprocess topology

### Slice 5: Integration checkpoint and release-to-review consistency pass

- **Files:** all touched surfaces above
- **Goal:** prove one coherent end-to-end story before Fullstack hands off to Code Review.
- **Validation Command:**
  - from repo root: `npm run check`
  - from repo root: `npm test`
  - from `rust-engine/`: `cargo test --workspace`
- **Details:**
  - confirm the first-wave ask/explain classes really use `session.runCommand`
  - confirm `dh doctor` really uses `runtime.ping`
  - confirm direct methods still exist only where intentionally outside the delegated boundary
  - confirm touched docs and output do not imply daemon mode, host inversion, or generic command execution

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- Why sequential:
  - Slice 1 freezes the seam contract and avoids half-live TS support.
  - Slice 2 depends on the client contract from Slice 1.
  - Slice 3 depends on the same client contract and on a settled refusal/error taxonomy.
  - Slice 4 should describe shipped truth, not speculative intermediate wording.
  - Slice 5 is the end-to-end checkpoint before handoff.
- Critical-path summary:
  - typed seam contract -> bounded delegated consumer path -> bounded operator ping path -> wording alignment -> integration proof

## Parallelization Assessment

- parallel_mode: `none`
- why: the bridge client contract, bounded consumer routing, operator wording, and refusal semantics all share one cross-cutting seam boundary. Parallel implementation would risk mixed direct/delegated truth, contradictory doctor wording, or partial inspectability.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- integration_checkpoint: verify one coherent story across Rust lifecycle capability advertisement, TS wrappers, `dh ask`/`dh explain` delegated routing, `dh doctor` lifecycle seam output, and topology-honest docs before handing off to Code Review.
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
| TS bridge client exposes typed `runtime.ping` and bounded `session.runCommand` wrappers | from repo root: `npm run check`; from repo root: `npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`; from `rust-engine/`: `cargo test --workspace` |
| first-wave ask/explain classes really route through `session.runCommand` | from repo root: `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts apps/cli/src/presenters/knowledge-command.test.ts` |
| `session.runCommand` remains bounded to delegated `query.search` / `query.definition` / `query.relationship` | from `rust-engine/`: `cargo test --workspace`; reviewer inspection of `rust-engine/crates/dh-engine/src/bridge.rs` against TS wrapper types |
| refused / invalid / failed delegated outcomes remain distinguishable | from repo root: `npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts packages/opencode-app/src/workflows/run-knowledge-command.test.ts apps/cli/src/presenters/knowledge-command.test.ts`; from `rust-engine/`: `cargo test --workspace` |
| `dh doctor` uses `runtime.ping` as a separate lifecycle seam input | from repo root: `npm test -- packages/runtime/src/diagnostics/doctor.test.ts apps/cli/src/commands/doctor.test.ts` |
| `runtime.ping` does not replace `runtime.health` / `runtime.diagnostics` or workflow-state inspection | from repo root: `npm test -- packages/runtime/src/diagnostics/doctor.test.ts apps/cli/src/commands/doctor.test.ts`; reviewer inspection of `packages/runtime/src/diagnostics/doctor.ts` and `docs/user-guide.md` |
| touched docs and output remain topology-honest | from repo root: `npm run check && npm test`; reviewer inspection of `docs/user-guide.md`, `apps/cli/src/presenters/knowledge-command.ts`, and `packages/runtime/src/diagnostics/doctor.ts` |

Validation reality notes:

- Use real repository commands only:
  - from repo root: `npm run check`
  - from repo root: `npm test`
  - from `rust-engine/`: `cargo test --workspace`
- There is no repo-native lint command. Do not invent one.

## Integration Checkpoint

Before this work is handed to Fullstack completion review, one combined inspection pass must be able to show all of the following together:

- `dh.initialize` still advertises the existing lifecycle seam methods and does **not** advertise any broadened delegated control family.
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` exposes typed wrappers for:
  - `runtime.ping`
  - bounded `session.runCommand`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts` routes only the approved first-wave classes through `session.runCommand`:
  - `search_file_discovery`
  - `graph_definition`
  - `graph_relationship_usage`
  - `graph_relationship_dependencies`
  - `graph_relationship_dependents`
- build-evidence, call-hierarchy, trace-flow, and impact remain on their current direct methods and are not silently folded into delegated execution.
- `KnowledgeCommandReport` / presenter output makes seam usage inspectable by showing both:
  - seam method = `session.runCommand`
  - delegated method = underlying query method
- `dh doctor` has a lifecycle-seam subsection sourced from `runtime.ping` and a separate bridge-runtime subsection sourced from `runtime.health` / `runtime.diagnostics`.
- startup failure, request failure, timeout, unsupported/refused delegation, invalid request, and ping unavailability all remain explicit in tests and touched output.
- touched docs and user-facing wording still describe the live topology as TypeScript host/orchestrator -> Rust bridge subprocess.

## Rollback Notes

- If `session.runCommand` routing starts pushing toward broader delegated methods, stop at the current Rust allowlist and defer any widening to a separate scoped feature.
- If `runtime.ping` cannot be presented cleanly without drifting into `runtime.health`, keep it as a smaller dedicated doctor subsection rather than merging the two stories.
- If surfaced output cannot make seam usage inspectable, prefer adding explicit metadata fields over hiding seam truth in prose.
- If TypeScript presentation disagrees with Rust seam truth, narrow TS output; do not “correct” Rust locally.

## Reviewer Focus Points

- Reject any implementation that claims or implies Rust-host topology inversion.
- Reject any implementation that widens `session.runCommand` into generic execution, arbitrary `method: string` forwarding, shell passthrough, or tool execution.
- Reject any implementation that reroutes `runtime.ping` into `runtime.health`, `runtime.diagnostics`, workflow-state, approval, release-readiness, or install-health truth.
- Verify the touched ask/explain classes do not keep a hidden direct-query fallback once `session.runCommand` is wired in.
- Verify operator output keeps refused, invalid, timed-out, degraded, unavailable, and failed outcomes distinguishable.
- Verify docs and output describe the current TypeScript host/orchestrator -> Rust bridge subprocess topology plainly.

### Preservation notes by downstream role

- **Fullstack Agent must preserve:**
  - Rust as the seam truth owner
  - the exact first-wave surfaces chosen here
  - the delegated boundary for `session.runCommand`
  - the separate lifecycle-seam role for `runtime.ping`
- **Code Reviewer must preserve:**
  - no hidden direct-query fallback on the touched delegated classes
  - no widening into generic command execution
  - no doctor/output drift that makes `runtime.ping` a replacement for broader runtime or workflow truth
- **QA Agent must preserve:**
  - explicit evidence for success and non-success outcomes on both first-wave paths
  - one inspectable story across Rust seam support, TS wrappers, operator output, and docs

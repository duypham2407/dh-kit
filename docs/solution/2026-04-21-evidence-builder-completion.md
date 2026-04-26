---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: EVIDENCE-BUILDER-COMPLETION
feature_slug: evidence-builder-completion
source_scope_package: docs/scope/2026-04-21-evidence-builder-completion.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Evidence Builder Completion

## Recommended Path

- Add an additive Rust `query.buildEvidence` bridge method and make it the **first-class packet source** for the smallest truthful aggregated-evidence wave on the existing knowledge-command path.
- Use existing operator surfaces only:
  - route bounded broad-understanding `dh ask` requests such as `how does auth work?` and `how does this project work?` to `query.buildEvidence`
  - keep `dh trace`, `dh ask` impact, and `dh ask` call-hierarchy on their existing specialized Rust query methods, but require those touched flows to emit their canonical packet truth from the same Rust evidence-builder logic rather than a separate TS or per-method packet story
- Keep TypeScript limited to request classification, request shaping, packet consumption, presentation, and workflow behavior. TS must not author a canonical fallback packet on touched flows.
- This is enough because the repository already has:
  - Rust `EvidencePacket` and evidence-bearing query results in `dh-query`
  - structured Rust payloads for call hierarchy, trace flow, and impact analysis
  - a live TS bridge/client/report/presenter path for `dh ask`, `dh explain`, and `dh trace`
  - existing TS retrieval-side packet builders that can be isolated instead of promoted

## First-Wave Touched Aggregated-Evidence Flows

### Flow 1: broad-understanding `dh ask`

- **Surface:** existing `dh ask` product path
- **Examples:** `how does auth work?`, `how does this project work?`, bounded `how does X work?`
- **Why it is first-wave:** current help and user-guide already point operators at these prompts, but `run-knowledge-command.ts` currently routes them to `unsupported_question_class` instead of a canonical Rust aggregated-evidence flow.
- **Required path:** TS classifies these prompts into one new aggregated-evidence request class and calls Rust `query.buildEvidence` directly.

### Flow 2: bounded static `dh trace`

- **Surface:** existing `dh trace` product path
- **Why it is first-wave:** it already carries an aggregated Rust trace payload and canonical packet, so it is the clearest touched flow that must share one evidence-builder truth story with the new `query.buildEvidence` path.
- **Required path:** keep `query.traceFlow` for ordered path steps and cut-points, but require the packet on this touched flow to come from the same Rust evidence-builder rules that back `query.buildEvidence`.

### Flow 3: bounded `dh ask` impact analysis

- **Surface:** existing `dh ask` impact path
- **Why it is first-wave:** it is already a bounded aggregated neighborhood flow with direct/inferred impact sections and explicit cut-points.
- **Required path:** keep `query.impactAnalysis` for direct/inferred payload structure, but align packet truth to the shared Rust evidence builder.

### Flow 4: bounded `dh ask` call hierarchy

- **Surface:** existing `dh ask` call-hierarchy path
- **Why it is first-wave:** it is already an aggregated graph neighborhood flow and is small enough to validate end-to-end packet consistency without reopening the whole catalog.
- **Required path:** keep `query.callHierarchy` for caller/callee payload structure, but align packet truth to the shared Rust evidence builder.

### Not touched in first wave

- `dh explain` stays definition-oriented and should not be widened into a second broad-understanding surface in this work item.
- narrow `query.definition` and `query.relationship` surfaces remain specialized and truthful where they already fit
- search-only classes remain separate and should not be silently upgraded into aggregated canonical packet truth
- no new top-level command family is introduced

## Impacted Surfaces

### Rust canonical evidence and bridge surfaces

- `rust-engine/crates/dh-types/src/lib.rs`
- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`

### TypeScript bridge and workflow-routing surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`

### CLI presentation and operator wording surfaces

- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.test.ts`
- `apps/cli/src/commands/root.ts`
- `docs/user-guide.md`

### Legacy TS packet-builder surfaces to isolate from touched product flows

- `packages/retrieval/src/query/build-evidence-packets.ts`
- `packages/retrieval/src/query/build-evidence-packets.test.ts`
- `packages/retrieval/src/query/run-retrieval.ts`
- `packages/retrieval/src/query/run-retrieval.test.ts`
- `packages/shared/src/types/evidence.ts`

## Rust vs TypeScript Responsibilities

### Rust owns

- canonical `query.buildEvidence` request handling and result-state decisions
- canonical evidence packet truth for touched aggregated-evidence flows
- subgraph, chunk, and evidence-entry selection
- packet gaps, ambiguity, bounds, stop reasons, and confidence truth
- any Rust-authored packet-level summary or serialized evidence view included on touched flows
- packet alignment for `query.callHierarchy`, `query.traceFlow`, and `query.impactAnalysis` on touched flows

### TypeScript owns

- classifying existing operator requests onto the approved bridge contract
- passing bounded intent/targets/budget/freshness parameters only
- consuming Rust packets and Rust structured payloads
- prompt/context formatting, report shaping, presentation, and workflow behavior
- explicit degraded/insufficient/unsupported presentation without strengthening the underlying Rust truth

### TypeScript must not own

- canonical packet construction on touched flows
- confidence upgrades or packet summary upgrades beyond Rust output
- silent merging of retrieval-built packet truth into the canonical packet
- fallback packet synthesis from `items`, preview rows, or `packages/retrieval` packet builders

## Boundaries And Components

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| Broad-understanding ask | `query.buildEvidence`, canonical packet, packet summary/serialization when present | routing from `dh ask`, presenter/report formatting | a TS-composed understanding packet from retrieval hits or preview rows |
| Trace flow | ordered path, cut-point, packet truth, capability truth | `dh trace` routing and step rendering | TS-authored path synthesis or packet replacement |
| Impact analysis | direct vs inferred impacts, cut-point, packet truth | ask classification, section rendering | merged unqualified impact list or TS-authored packet |
| Call hierarchy | one-hop callers/callees, unresolved-edge truth, packet truth | ask classification and section rendering | TS-authored call graph or packet |
| Retrieval package | supplementary input, diagnostics, legacy comparison only | compatibility maintenance if still needed | authoritative product packet source on touched flows |

## Interfaces And Data Contracts

### 1. Additive bridge method

- Add `query.buildEvidence` to the existing Rust bridge under the current protocol version.
- No top-level CLI command is added; existing `dh ask` routes to the method when the request class is a bounded broad-understanding flow.
- Add `query.buildEvidence` to:
  - `dh.initialize` advertised methods in `rust-engine/crates/dh-engine/src/bridge.rs`
  - `session.runCommand` allowlist in the same file

### 2. TS request-class addition

- Add one TS-side aggregated-evidence request class for broad-understanding asks on the current product path.
- Recommended name: a single additive ask-class such as `graph_build_evidence` or equivalent, mapped only to `query.buildEvidence`.
- Keep existing specialized classes for:
  - `graph_definition`
  - `graph_relationship_*`
  - `graph_call_hierarchy`
  - `graph_trace_flow`
  - `graph_impact`

### 3. `query.buildEvidence` request shape

- Reuse the additive coarse-grained shape already documented in `docs/migration/deep-dive-02-bridge-jsonrpc.md`:
  - `query`
  - `intent`
  - `targets?`
  - `budget?`
  - `freshness?`
- First-wave intent usage should stay truthful:
  - `explain` is required immediately for broad-understanding ask
  - `debug`, `plan`, `review`, and `migration` may exist as additive contract values for future prompt/context consumers, but this work item should not invent new top-level user surfaces for them

### 4. `query.buildEvidence` result shape

- Keep the existing `evidence` envelope canonical.
- Add an additive build-evidence result section only if the current `EvidencePacket` shape is too narrow for first-wave presentation.
- Recommended additive section if needed:
  - Rust-authored summary or serialized evidence narrative for the touched flow
  - selected relevant files/symbols/chunks/relationships when those are already truthfully available
  - no fields that require TS to reconstruct packet authority
- Prefer additive `buildEvidence`/`aggregatedEvidence` payload fields over a breaking rewrite of every existing bridge result.

### 5. Shared canonical packet rule on touched aggregated flows

- `query.callHierarchy`, `query.traceFlow`, and `query.impactAnalysis` may keep their structured domain payloads.
- On touched flows, their `evidence` packet must come from the same Rust evidence-builder rules used by `query.buildEvidence`, not from method-local TS assembly or a competing Rust packet shape.
- TS may render specialized sections plus the packet, but the packet remains the canonical truth source.

### 6. Legacy TS evidence-builder demotion rule

- `packages/retrieval/src/query/build-evidence-packets.ts` and `packages/shared/src/types/evidence.ts` remain secondary-truth surfaces only.
- First wave does **not** require deleting them.
- First wave **does** require that touched knowledge-command flows do not import or depend on them for canonical product packet truth.

## Risks And Trade-offs

| Risk | Why it matters | Required response |
| --- | --- | --- |
| Broad-understanding scope drift | `dh ask "how does auth work?"` can turn into unbounded repo reasoning if routing is too loose | keep classifier conservative and bounded; unresolved or too-broad asks return `insufficient` or `unsupported` |
| Packet-contract drift between buildEvidence and existing trace/impact/call flows | different Rust paths could emit different packet truth for the same request class | require one shared Rust evidence-builder logic or one shared conversion layer for touched flows |
| TS second-truth regression | `run-knowledge-command.ts` already derives previews and evidence report rows | keep those as formatting only; never let them replace missing Rust packet truth |
| Legacy retrieval builder reuse | `packages/retrieval` still has packet builders that are easy to reach for | isolate them explicitly from touched product flows and treat them as supplementary/legacy only |
| Missing live non-knowledge prompt consumer evidence | repository reality does not show a current non-knowledge-command `query.buildEvidence` consumer | ship the reusable bridge/client contract now, but do not invent broader lane-workflow prompt integration in this work item without a concrete existing call site |

## Implementation Slices

### Slice 1: Rust canonical evidence-builder contract

- **Files:**
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
- **Goal:** define the additive `query.buildEvidence` contract and the shared Rust packet-builder path for first-wave aggregated evidence.
- **Validation Command:** from `rust-engine/`: `cargo test --workspace`
- **Details:**
  - add the new request/result contract without breaking existing query methods
  - keep answer-state, gaps, bounds, and confidence decisions in Rust
  - prefer an additive build-evidence payload over a breaking rewrite of the current generic packet envelope
  - reviewer focus: no TS-authored packet fallback and no universal reasoning claims

### Slice 2: Rust bridge exposure and touched-flow packet reuse

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- **Goal:** expose `query.buildEvidence` on the live bridge and align touched aggregated flows to the same packet-authority rules.
- **Validation Command:** from `rust-engine/`: `cargo test --workspace`
- **Details:**
  - advertise `query.buildEvidence` from `dh.initialize`
  - add it to `session.runCommand` allowlists
  - route broad-understanding asks to the new method
  - keep `query.callHierarchy`, `query.traceFlow`, and `query.impactAnalysis` as specialized bounded methods, but require them to surface packet truth from the shared Rust builder logic on touched flows
  - reviewer focus: one bridge, one transport, no new top-level command family, no TS packet authority

### Slice 3: TS bridge client and broad-understanding routing

- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- **Goal:** make `query.buildEvidence` a first-class product path on the existing knowledge-command surface.
- **Validation Command:** from repo root: `npm test && npm run check`
- **Details:**
  - add the new TS request class and `buildAskCall` branch for bounded broad-understanding asks
  - add `query.buildEvidence` to the client method union and intent mapping
  - keep current trace/impact/call-hierarchy routing intact unless the Rust contract makes a more direct reuse truthful
  - preserve explicit `grounded`, `partial`, `insufficient`, and `unsupported` states
  - reviewer focus: broad-understanding `dh ask` becomes supported through Rust, not through a TS fallback query path

### Slice 4: TS report/presenter consumption

- **Files:**
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `apps/cli/src/commands/root.ts`
  - `docs/user-guide.md`
- **Goal:** present the new first-wave aggregated-evidence path truthfully on existing operator surfaces.
- **Validation Command:** from repo root: `npm test && npm run check`
- **Details:**
  - surface broad-understanding packet summary/bounds/gaps through the existing `dh ask` path
  - keep existing trace/impact/call-hierarchy sections while showing the same Rust packet truth underneath
  - align help and user-guide wording with bounded support; no runtime-trace or unlimited reasoning claims
  - reviewer focus: presentation may compress Rust output, but it must not strengthen it

### Slice 5: Legacy retrieval-packet isolation

- **Files:**
  - `packages/retrieval/src/query/build-evidence-packets.ts`
  - `packages/retrieval/src/query/build-evidence-packets.test.ts`
  - `packages/retrieval/src/query/run-retrieval.ts`
  - `packages/retrieval/src/query/run-retrieval.test.ts`
  - `packages/shared/src/types/evidence.ts`
- **Goal:** demote existing TS retrieval packet builders to secondary-truth status for this feature.
- **Validation Command:** from repo root: `npm test && npm run check`
- **Details:**
  - do not promote these packages into touched knowledge-command flows
  - if comments/tests/typing need adjustment, make their non-authoritative role explicit
  - no requirement to delete or rewrite the retrieval package broadly in this feature
  - reviewer focus: touched flows must not import or depend on these packet builders for final product truth

### Slice 6: Cross-surface integration checkpoint

- **Files:** all touched Rust, TS, presenter, and doc surfaces above
- **Goal:** prove one canonical Rust evidence story across raw bridge output, workflow consumption, and surfaced product output.
- **Validation Command:** from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test && npm run check`
- **Details:**
  - broad-understanding ask uses `query.buildEvidence` directly
  - trace, impact, and call hierarchy still surface their structured payloads while preserving the same canonical Rust packet truth
  - insufficient and unsupported paths stay explicit with no TS fallback packet
  - reviewer focus: same request, same Rust packet story, end to end

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- Why sequential:
  - the Rust packet contract must exist before the bridge can expose it
  - the bridge must expose it before TS can route or consume it
  - TS workflow/report consumption must settle before presenter/help wording can be aligned honestly
  - legacy retrieval isolation depends on the new product-authoritative path being clear
  - the integration checkpoint depends on all touched surfaces agreeing on one packet story

## Parallelization Assessment

- parallel_mode: `none`
- why: the Rust packet contract, bridge method advertisement, TS request routing, report shapes, presenter wording, and legacy-packet isolation all depend on one shared evidence-truth contract. Splitting them across parallel tracks would create immediate second-truth drift risk.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- integration_checkpoint: compare the same broad-understanding ask, trace flow, impact case, and call-hierarchy case across raw Rust bridge payloads, TS workflow output, and CLI rendering before review handoff.
- max_active_execution_tracks: `1`

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

Task-board guidance for implementation:

- create one sequential task board only if the runtime owner wants explicit execution tracking
- use one task per slice above
- do not split Rust contract, Rust bridge, and TS client/workflow work into concurrent tasks
- docs/help alignment should stay after runtime truth is stable

## Validation Matrix

| Target | Validation path |
| --- | --- |
| Broad-understanding `dh ask` becomes a first-class `query.buildEvidence` product path | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test && npm run check`; tests should assert the routed method is `query.buildEvidence` and that a canonical Rust packet is present |
| Trace, impact, and call hierarchy share one canonical packet truth on touched flows | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test && npm run check`; bridge/workflow/presenter tests should compare structured payload plus packet presence and answer-state preservation |
| No TS-authored canonical fallback packet exists on touched flows | from repo root: `npm test && npm run check`; tests should fail if `items`, preview rows, or `packages/retrieval` packet builders become product authority when Rust packet truth is missing |
| Degraded, insufficient, and unsupported behavior stays explicit | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test && npm run check`; tests should cover insufficient broad-understanding asks, unsupported runtime/deep requests, and bounded partial results |
| Legacy TS retrieval packet builders remain secondary truth only | from repo root: `npm test && npm run check`; touched workflow/presenter paths should not import or depend on retrieval packet builders for final product truth |
| Help and user-guide wording match bounded support | from repo root: `npm test && npm run check`; plus manual comparison of `apps/cli/src/commands/root.ts` and `docs/user-guide.md` against final runtime behavior |

## Integration Checkpoint

Before implementation is handed to Code Reviewer and QA, the touched product path should be able to prove all of the following together:

1. **Broad-understanding ask**
   - one `dh ask` broad-understanding request routes to `query.buildEvidence`
   - the surfaced answer includes a canonical Rust packet with explicit bounds/gaps/confidence signals
2. **Trace flow**
   - one bounded `dh trace` case still surfaces ordered Rust-authored path steps
   - the same case also carries the canonical Rust packet truth with no TS fallback packet
3. **Impact analysis**
   - one bounded impact case still surfaces separate direct and inferred sections
   - the same case also carries the canonical Rust packet truth with no TS fallback packet
4. **Call hierarchy**
   - one bounded call-hierarchy case still surfaces callers/callees
   - the same case also carries the canonical Rust packet truth with no TS fallback packet
5. **Bounded honesty**
   - one insufficient broad-understanding case stays insufficient
   - one unsupported runtime/deep/capability-boundary case stays unsupported
6. **Legacy isolation**
   - no touched product flow depends on `packages/retrieval/src/query/build-evidence-packets.ts` for canonical packet truth

## Rollback Notes

- If `query.buildEvidence` destabilizes the bridge or broad-understanding ask routing, roll back the new direct ask route first while preserving the current truthful Rust packet handling on trace/impact/call-hierarchy.
- Do **not** roll back by wiring `packages/retrieval` packet builders into touched flows; that would violate the approved ownership boundary.
- If the current `EvidencePacket` type proves too narrow, prefer rolling back only the additive `buildEvidence` payload extension rather than widening TS packet ownership.
- If help/docs cannot be aligned in the same change window, roll back the stronger wording before widening runtime claims.

## Reviewer Focus Points

- Confirm Rust is the only authoritative packet source for touched aggregated-evidence flows.
- Reject any implementation where TS builds or strengthens a canonical packet from preview rows, `items`, retrieval outputs, or legacy retrieval packet builders.
- Confirm broad-understanding `dh ask` becomes a first-class `query.buildEvidence` path without creating a new top-level command family.
- Confirm `query.callHierarchy`, `query.traceFlow`, and `query.impactAnalysis` keep their structured payloads only as presentation helpers around the same canonical Rust packet truth.
- Confirm bounded degraded/insufficient/unsupported behavior remains explicit.
- Confirm no change implies universal reasoning, runtime tracing, language-parity expansion, or replacement of every narrow query surface.

## Preservation Notes By Downstream Role

### Fullstack Agent must preserve

- one canonical Rust packet story across broad understanding, trace, impact, and call hierarchy
- no TS-authored canonical fallback packet on touched flows
- existing `dh ask` / `dh trace` operator entrypoints only
- bounded unsupported and insufficient behavior

### Code Reviewer must preserve

- no second truth source in `packages/opencode-app` or `packages/retrieval`
- no bridge change that hides `query.buildEvidence` behind unrelated query classes
- no presenter wording stronger than the Rust packet truth

### QA Agent must preserve

- one broad-understanding ask case using `query.buildEvidence`
- one trace case, one impact case, and one call-hierarchy case showing the same canonical packet truth end to end
- one insufficient case and one unsupported case with explicit limitations

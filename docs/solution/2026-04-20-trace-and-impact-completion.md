---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: TRACE-AND-IMPACT-COMPLETION
feature_slug: trace-and-impact-completion
source_scope_package: docs/scope/2026-04-20-trace-and-impact-completion.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Trace And Impact Completion

## Chosen Approach

- Complete bounded **call hierarchy**, **trace flow**, and **impact analysis** on the existing knowledge-command surfaces by promoting the already-present Rust query-engine truth into first-class bridge-backed operator results.
- Preserve the architecture boundary as a hard rule:
  - **Rust owns** call hierarchy edges, ordered trace steps, impact classification, evidence packets, gaps, bounds, cut-points, and request-scoped capability truth.
  - **TypeScript owns** request routing, bridge-envelope consumption, presenter/report formatting, CLI/help wording, and operator guidance only.
- Extend the current JSON-RPC bridge **additively** instead of inventing a new command family or a second transport:
  - keep the same local stdio host path
  - keep the existing `dh ask`, `dh explain`, and `dh trace` CLI surfaces
  - add bounded trace/call/impact query methods and structured Rust-authored payloads to the existing bridge contract
- Keep the release boundary conservative:
  - one-hop caller/callee truth only
  - short static trace paths only
  - bounded impact neighborhoods only
  - explicit unsupported results for runtime tracing, unbounded subsystem tracing, and unsupported language/capability paths

Why this is enough:

- The Rust query layer already has real `call_hierarchy`, `trace_flow`, `impact_analysis`, and `EvidencePacket` behavior in `rust-engine/crates/dh-query/src/lib.rs`.
- The current gap is product completion, not missing core topology:
  - the bridge does not yet expose trace/call/impact methods
  - TypeScript still treats `dh trace` as initialize-derived `unsupported`
  - current impact output is still a flat `impacted` list without the required direct-vs-inferred separation
- The smallest truthful path is therefore:
  1. strengthen Rust result contracts where they are still too coarse
  2. expose those contracts through the bridge
  3. make TypeScript consume and present them without inventing truth

## Dependencies

- Approved upstream scope package:
  - `docs/scope/2026-04-20-trace-and-impact-completion.md`
- Architectural reference to preserve:
  - `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md` _(Query Engine + Evidence Builder sections)_
- Prior solution contracts to preserve:
  - `docs/solution/2026-04-19-query-evidence-hardening.md`
  - `docs/solution/2026-04-18-language-depth-hardening.md`
  - `docs/solution/2026-04-16-query-and-search-catalog-completion.md`
  - `docs/solution/2026-04-15-bridge-contract-v2.md`
- Minimum operator wording surface required by this feature:
  - `apps/cli/src/commands/root.ts`
  - `docs/user-guide.md`
- Optional public-onboarding follow-up only if implementation chooses to align broader onboarding copy in the same window:
  - `README.md`

Real validation commands available now:

- from repo root: `npm run check`
- from repo root: `npm test`
- from `rust-engine/`: `cargo test --workspace`

Validation reality notes:

- No repo-native lint command exists; do not invent one.
- CLI/help/docs alignment still needs manual comparison against runtime output where tests do not already cover the wording.

## Impacted Surfaces

### Rust truth and wire-contract surfaces

- `rust-engine/crates/dh-types/src/lib.rs`
- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`

### TypeScript bridge-consumption and workflow-routing surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`

### CLI presentation and operator wording surfaces

- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.test.ts`
- `apps/cli/src/commands/root.ts`
- `docs/user-guide.md`

### Preserve-only surfaces that should not be widened accidentally

- `apps/cli/src/commands/trace.ts` _(keep the same operator entrypoint; no new top-level trace command family)_
- `docs/solution/2026-04-19-query-evidence-hardening.md`
- `docs/solution/2026-04-18-language-depth-hardening.md`
- `docs/solution/2026-04-15-bridge-contract-v2.md`

## Boundaries And Components

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| Call hierarchy truth | one-hop callers/callees, unresolved-edge truth, evidence, capability truth | request routing, formatting, operator wording | TS-authored call-edge invention or multi-hop overclaim |
| Trace truth | endpoint resolution outcome, ordered path steps, path evidence, grounded prefix, cut-point truth, capability truth | CLI routing, step rendering, bounded summaries, next-step guidance | runtime-execution story, reordered steps, or TS-derived path synthesis |
| Impact truth | direct-vs-inferred classification, inclusion reasons, bounds, cut-points, capability truth | section layout, wording, operator guidance | one flat unqualified blast-radius list or TS-authored impact tiering |
| Bridge capability advertisement | exact method support and request-scoped capability summaries | capability parsing and reporting | a second TS capability source or exact-array parsing that blocks additive truthful methods |
| Operator-visible wording | Rust-authored truth vocabulary and stop reasons | compact phrasing on CLI/help/docs | simplified wording that sounds broader than the Rust truth |

### Product boundary to preserve

- No runtime execution tracing.
- No universal interprocedural or subsystem-wide tracing.
- No guaranteed blast-radius or breakage certainty scoring.
- No cross-language parity promises beyond current Rust capability truth.
- No TypeScript-authored path steps, cut-points, or impact classes.
- No new top-level `dh call-hierarchy` or `dh impact` command.
- No bridge transport redesign, daemonization, or separate trace worker.

## Supported Request And Target Shapes

### 1. Call hierarchy requests

Supported outward shape:

- routed from `dh ask`
- target must resolve to an indexed symbol
- bounded contract is **one hop only**:
  - incoming callers
  - outgoing callees

Examples of in-scope routing intent:

- `who calls helper`
- `what calls helper`
- `what does helper call`
- `call hierarchy of helper`

Result expectations:

- `grounded` when surfaced one-hop edges are resolved and inspectable
- `partial` when one-hop edges exist but any surfaced edge is unresolved, dynamic, or best-effort
- `insufficient` when the symbol exists but no bounded caller/callee truth is proven
- `unsupported` only when the request or language/capability is outside the bounded contract

### 2. Trace requests

Supported outward shape:

- routed from `dh trace`
- request must resolve to **two bounded supported endpoints**
- simplest acceptable endpoint forms:
  - `A -> B`
  - `from A to B`
  - `trace A to B`
- endpoint extraction stays conservative; if endpoint intent is in scope but cannot be resolved uniquely, return `insufficient`, not a fabricated path

Bounded defaults:

- `max_hops = 4`
- static repository-grounded graph traversal only

Result expectations:

- `grounded` only when Rust surfaces ordered path steps and no material hidden unresolved edge remains
- `partial` when a grounded prefix exists but an unresolved edge, ambiguity, unsupported capability boundary, or explicit bound stops continuation
- `insufficient` when the request remains inside bounded static trace class but current evidence cannot prove endpoints or a path
- `unsupported` for runtime flow, unbounded subsystem flow, or unsupported capability/language requests

### 3. Impact requests

Supported outward shape:

- routed from `dh ask`
- target must resolve to either:
  - an indexed file path
  - an indexed symbol

Examples of in-scope routing intent:

- `what is impacted by helper`
- `impact of src/main.ts`
- `if I change helper what could break`

Bounded defaults:

- `hop_limit = 2`
- `node_limit = 10`

Result expectations:

- output must separate:
  - `directImpacts`
  - `inferredImpacts`
- `grounded` is allowed when the bounded impact result is fully surfaced and the direct/inferred split is explicit, even if inferred items exist
- `partial` is required when traversal hits a cut-point or unresolved boundary after some grounded direct or inferred progress
- `insufficient` is required when the target shape is valid but current indexed evidence cannot prove any bounded impact neighborhood
- `unsupported` is required when the target is not an indexed file or indexed symbol, or capability truth is unsupported for the request

## Interfaces And Data Contracts

### 1. Additive bridge capability advertisement contract

Keep the same `protocolVersion: "1"` transport and framing, but expand the method advertisement additively.

Required core methods that must still exist:

- `dh.initialize`
- `query.search`
- `query.definition`
- `query.relationship`

New bounded query methods for this feature:

- `query.callHierarchy`
- `query.traceFlow`
- `query.impactAnalysis`

Contract rule:

- TypeScript capability parsing must stop requiring an exact four-method array.
- It should instead require the current core methods and accept additional advertised bounded methods.
- `session.runCommand` allowlists must expand in lock-step with direct method advertisement; otherwise capability truth and delegated execution will drift.

### 2. Requested question class contract in TypeScript

TypeScript request routing should grow from the current bounded set to include:

- `search_file_discovery`
- `graph_definition`
- `graph_relationship_usage`
- `graph_relationship_dependencies`
- `graph_relationship_dependents`
- `graph_call_hierarchy`
- `graph_trace_flow`
- `graph_impact`

Routing rules:

- `dh ask` may classify into `graph_call_hierarchy` and `graph_impact`
- `dh trace` should classify only into `graph_trace_flow`
- `dh explain` remains definition-oriented and should not be widened into a second trace/impact surface

### 3. Canonical result envelope contract

Every touched call/trace/impact result must keep the same top-level truth split already established by prior features:

- `answerState`: `grounded | partial | insufficient | unsupported`
- `questionClass`: `call_hierarchy | trace_flow | impact`
- `evidence`: canonical Rust-authored `EvidencePacket`
- `languageCapabilitySummary`: canonical Rust-authored request-scoped capability summary

For these three classes, flat preview `items[]` are not sufficient as the canonical truth source.

Required structured payloads:

- `callHierarchy`
- `traceFlow`
- `impactAnalysis`

Those payloads must be authored in Rust and passed through TS without semantic reconstruction.

### 4. Call hierarchy payload contract

Minimum outward payload:

```text
callHierarchy: {
  subject: string
  callers: EdgeRow[]
  callees: EdgeRow[]
}
```

Minimum `EdgeRow` fields:

- `label`
- `filePath?`
- `lineStart?`
- `lineEnd?`
- `reason`
- `confidence: grounded | partial`

Contract rules:

- one-hop only
- Rust order is canonical; TS may format but not resort or infer additional rows
- unresolved or dynamic one-hop edges must surface as `confidence=partial` and drive `answerState=partial` when materially present

### 5. Trace payload contract

Minimum outward payload:

```text
traceFlow: {
  subject: string
  pathSteps: TraceStep[]
  cutPoint?: CutPoint
}
```

Minimum `TraceStep` fields:

- `index`
- `from`
- `to`
- `relationKind`
- `filePath?`
- `lineStart?`
- `lineEnd?`
- `reason`
- `confidence: grounded | partial`

Contract rules:

- `pathSteps[]` order from Rust is the only outward path truth
- TS must not reorder, dedupe, or narratively compress away a material step
- if traversal stops after some grounded progress, `cutPoint` plus `evidence.bounds.stopReason` must preserve the last grounded prefix

### 6. Impact payload contract

Minimum outward payload:

```text
impactAnalysis: {
  target: string
  targetKind: file | symbol
  directImpacts: ImpactItem[]
  inferredImpacts: ImpactItem[]
  cutPoint?: CutPoint
}
```

Minimum `ImpactItem` fields:

- `label`
- `itemKind`
- `relationKind`
- `hopCount`
- `reason`
- `confidence: grounded | partial`
- `filePath?`
- `lineStart?`
- `lineEnd?`

Contract rules:

- `directImpacts` contain only items supported by an explicit direct relation from the target or the first bounded step from it
- `inferredImpacts` contain only items reached through bounded propagation beyond that direct layer
- every inferred item must carry the bounded reason it was included
- TS must render `directImpacts` and `inferredImpacts` as separate sections; no merged unqualified impact list is allowed

### 7. Cut-point semantics contract

Use one canonical machine-readable stop/cut-point vocabulary authored in Rust.

Minimum classes:

- `missing_target`
- `missing_endpoint`
- `unresolved_edge`
- `ambiguous_resolution`
- `unsupported_language_capability`
- `hop_limit_reached`
- `node_limit_reached`
- `dynamic_construct`
- `path_not_found`
- `unsupported_target`

Minimum outward shape:

```text
CutPoint {
  class: string
  summary: string
  lastGroundedLabel?: string
}
```

Contract rules:

- `evidence.bounds.stopReason` carries the canonical class
- `evidence.gaps[]` carries the human-readable explanation
- `cutPoint` is the domain-specific structured mirror for trace/impact rendering
- call hierarchy may use edge-level partial rows without a top-level cut-point when the one-hop surface itself is still visible

### 8. Mixed-language and capability-boundary contract

- request-scoped `languageCapabilitySummary` must be derived from the languages actually touched by the resolved target/path/impact neighborhood, not from a broad initialize snapshot alone
- the weakest relevant capability state stays visible
- crossing into an unsupported trace/impact language boundary must become an explicit cut-point, not a hidden continuation
- current matrix truth to preserve unless separately re-approved:
  - TS/JS: strongest current bounded path
  - Go/Rust call hierarchy: may remain `best-effort`
  - Go/Rust trace/impact: remain `unsupported`
  - Python call hierarchy/trace/impact: remain `unsupported`

## Risks And Trade-offs

| Hotspot | Current repo reality | Resolution choice | Why |
| --- | --- | --- | --- |
| `rust-engine/crates/dh-query/src/lib.rs` impact output | current `ImpactAnalysisResult` exposes one flat `impacted` list only | strengthen Rust contract | direct-vs-inferred separation cannot be invented in TS |
| `rust-engine/crates/dh-query/src/lib.rs` partial semantics | trace already has partial support, but impact currently lacks the full cut-point model and call hierarchy only exposes generic unresolved gaps | strengthen Rust answer-state/cut-point truth | the product promise depends on precise partial vs insufficient vs unsupported behavior |
| `rust-engine/crates/dh-engine/src/bridge.rs` method catalog | initialize advertises only search/definition/relationship and relation allowlist rejects `call_hierarchy`, `trace_flow`, and `impact` | additive bridge expansion | the Rust truth already exists but the bridge still hides it |
| `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` capability parsing | V2 parsing currently requires exact methods and exact relationship arrays | relax to required-core-plus-additive-method model | new truthful methods would otherwise look like startup failure |
| `packages/opencode-app/src/workflows/run-knowledge-command.ts` trace path | `dh trace` currently fabricates an unsupported result from initialize capability data instead of asking Rust for trace truth | remove TS-authored trace truth | TS must stop being a second truth source |
| `packages/opencode-app/src/workflows/run-knowledge-command.ts` ask classifier | `call hierarchy`, `impact analysis`, and `trace flow` phrases are currently classified as `unsupported` | conservative but expanded routing | the product surface must expose bounded supported classes now, but still reject out-of-bounds requests honestly |
| `apps/cli/src/presenters/knowledge-command.ts` presenter shape | current output has generic answer/evidence sections only | add structured call/trace/impact sections | ordered path steps and direct/inferred impact cannot survive only as flat preview rows |
| CLI/help/docs wording | `dh trace` still reads as blanket unsupported in root help and user guide | align touched operator wording | runtime truth and docs/help must tell the same bounded story |

Additional trade-offs:

- **Bridge method expansion is safer than relationship overloading**
  - Using new explicit methods keeps class identity clear and avoids stuffing path/impact semantics into `query.relationship`.

- **Some results will stay conservative even after this feature lands**
  - That is correct. Unsupported or partial results are part of the honest product contract, not implementation failure.

- **Impact may need to get narrower before it gets stronger**
  - If the current bounded neighborhood logic cannot classify items honestly, direct-only release wording is safer than shipping a merged blast-radius story.

## Recommended Path

- **Step 1: freeze failing tests around the current truth gap.**
  - Lock the current unsupported trace synthesis, flat impact output, and strict method-catalog parsing into tests before changing behavior.
- **Step 2: make Rust result payloads complete enough for product truth.**
  - Add direct/inferred impact separation, structured path/call payloads, and canonical cut-point classes in Rust.
- **Step 3: expose those payloads through additive bridge methods.**
  - Keep the same transport; add explicit call/trace/impact query methods and request-scoped capability summaries.
- **Step 4: make TypeScript consume rather than invent.**
  - Remove initialize-only unsupported trace synthesis and render the Rust payloads directly.
- **Step 5: align help/docs and run one cross-surface checkpoint.**
  - Runtime output, presenter sections, root help, and `docs/user-guide.md` must tell the same bounded story.

This is the simplest adequate path because it reuses the existing Rust engine, keeps the operator surface stable, and fixes the truth gap by surfacing real bounded evidence instead of broadening the product promise.

## Implementation Flow

1. **Write failing Rust and TS tests for the missing product contract.**
2. **Strengthen Rust result types and answer-state semantics for call hierarchy, trace, and impact.**
3. **Add additive bridge methods and request-scoped capability advertisement/consumption.**
4. **Route `dh trace` to real Rust trace execution and expand `dh ask` to bounded call hierarchy/impact classes.**
5. **Render structured call/path/impact sections without TS-authored semantic upgrades.**
6. **Update root help and `docs/user-guide.md` from blanket unsupported wording to bounded supported wording plus explicit unsupported cases.**
7. **Run one integration checkpoint covering grounded, partial, insufficient, and unsupported outcomes before handoff.**

## Implementation Slices

### Slice 1: Baseline contract freeze and failing tests

- **Files:**
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
- **Goal:** freeze the current truth gap before implementation changes land.
- **Validation Command:** `cargo test --workspace && npm test && npm run check`
- **Details:**
  - add failing tests for real trace routing instead of initialize-only unsupported synthesis
  - add failing tests for direct-vs-inferred impact separation and cut-point exposure
  - add failing tests for additive method advertisement so new truthful methods do not break startup parsing
  - add failing tests for call hierarchy one-hop presentation and mixed capability boundaries
  - reviewer focus: narrowing a claim in tests is valid when current truth is weaker than old wording

### Slice 2: Strengthen Rust truth for call hierarchy, trace, and impact

- **Files:**
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
- **Goal:** make Rust capable of authoring the full bounded outward contract without TS interpretation.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - add structured result payloads for `call_hierarchy`, `trace_flow`, and `impact_analysis`
  - add canonical cut-point semantics and explicit `stop_reason` classes
  - split impact into `directImpacts` and `inferredImpacts`
  - preserve current bounded defaults and capability boundaries
  - ensure partial trace/impact results keep the grounded prefix or grounded direct-impact subset visible
  - reviewer focus: no runtime tracing, no universal blast radius, no silent omission of unresolved or unsupported boundaries

### Slice 3: Additive bridge method and envelope completion

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- **Goal:** expose Rust-authored call/trace/impact truth through the existing bridge path.
- **Validation Command:** `cargo test --workspace && npm test`
- **Details:**
  - advertise `query.callHierarchy`, `query.traceFlow`, and `query.impactAnalysis` from `dh.initialize`
  - extend `session.runCommand` allowlists for the same methods
  - parse additive method catalogs in the TS client without rejecting the established core methods
  - generalize the client result model so call/trace/impact can return structured payloads plus the canonical evidence packet
  - reviewer focus: keep one bridge, one transport, one truth source, and explicit class identity

### Slice 4: TypeScript routing and presentation alignment

- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
- **Goal:** consume Rust truth faithfully and expose the bounded classes on the existing operator surfaces.
- **Validation Command:** `npm test && npm run check`
- **Details:**
  - route `dh trace` to the real Rust trace method instead of initialize-only unsupported synthesis
  - expand `dh ask` classification for bounded call hierarchy and impact requests
  - keep trace endpoint parsing conservative; unresolved endpoint intent should become `insufficient`, not guessed path truth
  - add presenter sections for:
    - callers / callees
    - ordered trace steps
    - direct impacts
    - inferred impacts
    - cut-point / stop reason
  - extend `answerType` values as needed so call hierarchy, trace, and impact do not collapse into generic `partial`
  - reviewer focus: no TS-authored step ordering, no impact reclassification, no capability-state/answer-state collapse

### Slice 5: Help and user-guide wording alignment

- **Files:**
  - `apps/cli/src/commands/root.ts`
  - `docs/user-guide.md`
  - `README.md` _(optional only if implementation chooses to align broader onboarding copy in the same change window)_
- **Goal:** replace the blanket unsupported trace story with the new bounded truthful story on touched operator surfaces only.
- **Validation Command:** `npm run check && npm test`
- **Details:**
  - describe `dh trace` as bounded static trace support for resolvable supported endpoints
  - keep runtime tracing, broad subsystem tracing, and unsupported language/capability cases explicitly unsupported
  - document that call hierarchy and impact remain bounded static analysis, not runtime proof or full blast radius
  - reviewer focus: docs/help may get narrower or more conditional, but never broader than runtime truth

### Slice 6: Cross-surface integration checkpoint

- **Files:** all surfaces above
- **Goal:** prove one consistent bounded story across Rust bridge payloads, TS workflow output, CLI presentation, and touched docs/help.
- **Validation Command:** `cargo test --workspace && npm test && npm run check`
- **Details:**
  - verify one grounded one-hop call hierarchy case
  - verify one grounded trace path case with ordered Rust-authored steps
  - verify one partial trace or impact case with explicit cut-point and preserved grounded subset
  - verify one impact case containing both direct and inferred items
  - verify one unsupported runtime or too-broad trace request
  - verify one mixed-language or unsupported-capability boundary case
  - reviewer focus: the same case must tell the same truth in raw bridge data, workflow JSON, text presentation, and touched docs/help

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- Why sequential:
  - Slice 1 freezes the behavioral contract and protects against accidental overclaim.
  - Slice 2 must land before bridge work because bridge payloads need the final Rust truth model.
  - Slice 3 must land before TS routing/presentation can consume the new methods and payloads.
  - Slice 4 must settle the runtime output before help/docs are aligned.
  - Slice 6 is the single integration gate before implementation handoff is considered complete.

## Parallelization Assessment

- parallel_mode: `none`
- why: Rust result types, bridge method advertisement, TS capability parsing, workflow routing, presenter sections, and operator wording all depend on one shared contract. Parallel execution would create immediate cross-surface drift risk.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- integration_checkpoint: compare one grounded call hierarchy case, one grounded trace case, one partial cut-point case, one direct-plus-inferred impact case, and one unsupported runtime/depth case across raw bridge output, workflow JSON, presenter text, and touched docs/help.
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
| one-hop call hierarchy stays bounded and unresolved edges force `partial` | from `rust-engine/`: `cargo test --workspace`; call hierarchy tests must assert one-hop-only payloads, visible unresolved edges, and preserved evidence |
| trace grounded/partial/insufficient/unsupported states are truthful | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test && npm run check`; Rust and TS tests must cover grounded path, cut-point partial, missing-endpoint insufficient, and runtime/depth unsupported |
| impact output separates direct from inferred | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test`; result and presenter tests must fail if the two categories are merged |
| inferred impact never reads as direct proof | from repo root: `npm test && npm run check`; presenter/workflow tests must keep inferred wording and reasons explicit |
| cut-point classes are preserved end-to-end | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test`; bridge/workflow/presenter tests must surface canonical `stopReason` plus human-readable gaps |
| mixed-language and unsupported capability boundaries stay explicit | from `rust-engine/`: `cargo test --workspace`; request-scoped capability tests must show weakest relevant state and explicit boundary stop |
| TypeScript no longer fabricates trace truth from initialize-only data | from repo root: `npm test && npm run check`; `run-knowledge-command` tests must fail if `dh trace` succeeds without invoking the new Rust trace method |
| additive bridge methods do not break startup parsing | from repo root: `npm test`; bridge client tests must accept required core methods plus the new bounded methods |
| touched help/docs match runtime truth | from repo root: `npm run check && npm test`; plus manual comparison of `apps/cli/src/commands/root.ts` and `docs/user-guide.md` against the final runtime output |
| scope remains bounded | Code Reviewer and QA confirm no runtime tracing, no universal interprocedural flow, no universal blast-radius claims, and no new top-level commands |

Validation reality notes:

- Use real commands only: `cargo test --workspace`, `npm test`, `npm run check`.
- No repo-native lint command exists.
- Manual wording review is still required for touched docs/help surfaces that are not fully covered by tests.

## Integration Checkpoint

Before `solution_to_fullstack` work is considered execution-ready, the implementation path must be able to prove all of the following together:

1. **Call hierarchy truth**
   - one bounded one-hop caller/callee case is visible and inspectable
   - unresolved/dynamic edge handling degrades to `partial`
2. **Trace truth**
   - one bounded grounded trace result shows ordered path steps from Rust
   - one bounded partial trace keeps the grounded prefix and names the cut-point class
3. **Impact truth**
   - one bounded impact result shows separate direct and inferred sections
   - one bounded partial impact keeps the grounded direct subset and names the cut-point
4. **Boundary truth**
   - one unsupported runtime/deep request remains explicitly unsupported
   - one mixed-language or unsupported capability boundary becomes a visible stop, not a hidden continuation
5. **Cross-surface alignment**
   - raw bridge payload, workflow JSON, CLI text, and touched docs/help all describe the same bounded support story

## Rollback Notes

- If additive bridge method advertisement destabilizes initialization, roll back to the last state where startup succeeds and keep the older unsupported trace/help story until client parsing and bridge capability advertisement are aligned.
- If Rust cannot yet author a truthful direct-vs-inferred impact split, roll back impact exposure to the last honest narrower state instead of shipping one merged unqualified impacted list.
- If trace endpoint parsing in TS starts guessing endpoints from vague natural language, roll it back to the stricter resolvable-endpoint subset and return `insufficient` more often.
- If presenter changes flatten ordered trace steps or merge direct/inferred impact sections, roll back the presenter changes rather than allowing TS to become a second truth source.
- If touched help/docs cannot be aligned in the same change window, roll back the stronger wording first. Narrow docs are safer than widened runtime promises.

## Reviewer Focus Points

- Confirm Rust remains the only source of:
  - ordered trace steps
  - call hierarchy edges
  - impact classification
  - cut-point classes
  - request-scoped capability truth
- Reject any implementation where TypeScript:
  - invents path steps
  - reorders path steps
  - invents a cut-point
  - relabels inferred impact as direct impact
  - upgrades answer-state beyond Rust evidence
- Confirm `query.callHierarchy`, `query.traceFlow`, and `query.impactAnalysis` remain explicit bounded classes rather than hidden `query.relationship` overloads.
- Confirm mixed capability boundaries surface the weakest relevant truth.
- Confirm unsupported runtime/deep requests stay unsupported.
- Confirm help/docs stop using the blanket `dh trace` unsupported story only where the runtime now truly supports bounded trace, and still call out unsupported cases explicitly.

## Preservation Notes By Downstream Role

### Fullstack Agent must preserve

- the Rust-vs-TypeScript truth boundary without exception
- one-hop call hierarchy only
- static bounded trace only
- direct-vs-inferred impact separation authored in Rust
- explicit cut-point and capability-boundary truth
- no runtime tracing, no universal flow reconstruction, no blast-radius promises

### Code Reviewer must preserve

- no second TS-owned truth source
- no exact-array capability parsing that breaks truthful additive methods
- no merged direct/inferred impact list
- no reordered trace steps or missing cut-point disclosure
- no doc/help wording stronger than runtime proof

### QA Agent must preserve

- one grounded call hierarchy case
- one grounded trace case
- one partial cut-point case
- one direct-plus-inferred impact case
- one unsupported runtime/deep request
- one mixed-language or unsupported capability boundary case
- explicit comparison of runtime output, presenter output, and touched help/docs wording

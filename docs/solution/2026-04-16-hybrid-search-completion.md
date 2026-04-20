---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: HYBRID-SEARCH-COMPLETION
feature_slug: hybrid-search-completion
source_scope_package: docs/scope/2026-04-16-hybrid-search-completion.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Hybrid Search Completion

## Chosen Approach

- Expose hybrid search as a bounded first-class search class on the existing `dh ask` / knowledge-command path, not as a new CLI surface.
- Keep the architecture split intact: Rust remains the source of grounded search/query evidence and bridge contracts; TypeScript owns request classification, bounded intent mapping, result-state selection, degradation wording, and presenter output.
- Implement hybrid search by combining three already-real signal families in a controlled way:
  - keyword/path or exact symbol cues
  - structural / graph-grounded cues
  - semantic relevance when embeddings and semantic search are actually available
- Narrow the guarantee to current repo reality: hybrid search may be fully hybrid only when semantic support is healthy and current; otherwise it must degrade truthfully to keyword+structural or narrower bounded retrieval rather than silently implying semantic contribution.

Why this is enough:

- The repo already exposes a knowledge-command surface with explicit catalog classes and support states in `packages/opencode-app/src/workflows/run-knowledge-command.ts` and `apps/cli/src/presenters/knowledge-command.ts`.
- The Rust bridge already provides bounded query/search primitives via `query.search`, `query.definition`, and `query.relationship` in `rust-engine/crates/dh-engine/src/bridge.rs`.
- The retrieval layer already has keyword/structural-style matching plus semantic retrieval plumbing in `packages/retrieval/src/query/run-retrieval.ts` and `packages/retrieval/src/semantic/semantic-search.ts`.
- The missing work is truthful orchestration of those signals into one inspectable hybrid contract, plus explicit degraded-semantic behavior, not a broad redesign of ranking, UI, or intelligence architecture.

## Impacted Surfaces

- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.test.ts`
- `packages/retrieval/src/query/run-retrieval.ts`
- `packages/retrieval/src/query/run-retrieval.test.ts`
- `packages/retrieval/src/query/build-retrieval-plan.ts`
- `packages/retrieval/src/query/retrieval-plan.ts`
- `packages/retrieval/src/semantic/semantic-search.ts`
- `packages/retrieval/src/semantic/telemetry-collector.ts` and tests only if semantic degradation/status needs additional inspectable evidence
- `rust-engine/crates/dh-engine/src/bridge.rs`
- `docs/user-guide.md`
- `README.md` only if command/help wording currently overpromises or omits the bounded hybrid behavior

## Boundaries And Components

### Product Boundary To Preserve

- **Rust-owned foundation/intelligence boundary:** search/query primitives, evidence production, query/search mode contracts, graph-backed relationships, and any bridge-visible capability/degradation metadata.
- **TypeScript-owned workflow/operator boundary:** request classification, supported-intent mapping, hybrid ranking policy selection, support-state derivation, limitation wording, presenter formatting, and operator-visible inspection fields.

Implementation must not move ranking/presentation policy into Rust if that policy is primarily operator-facing, and must not make TypeScript invent grounded evidence that Rust or retrieval layers did not actually produce.

### Hybrid Search Definition For This Release

Hybrid search in this feature means one bounded search class that can combine:

1. **keyword signals**
   - exact path/name hits
   - direct symbol-string overlap
   - obvious lexical matches already available in current search/retrieval paths
2. **structural signals**
   - symbol lookup proxies
   - graph-backed direct relationships or file/symbol context that increase confidence
   - structural/pattern search support where already available
3. **semantic signals**
   - embedding-backed similarity from `packages/retrieval/src/semantic/semantic-search.ts`
   - only counted when embeddings exist and the semantic path returns usable results

This does **not** promise:

- universal natural-language understanding
- semantic contribution on every hybrid request
- deep multi-hop graph reasoning beyond existing bounded query/search depth
- IDE-grade ranking quality or exhaustive relevance

### Supported Intents And Bounded Weighting

Intent-aware ranking is approved only for these bounded operator intents:

- `lookup`
  - bias toward exact file/symbol/path matches and direct structural evidence
  - semantic input may assist tie-breaking but must not dominate exact hits
- `explain`
  - allow broader structural + semantic contribution when repository evidence stays grounded
  - exact lexical hits remain favored when they clearly identify the target
- `debug`
  - bias toward structural neighbors, direct relationships, and semantically related implementation hotspots
  - still bounded to repository evidence; no causal reasoning claim

If current request classification cannot support one of those intents truthfully for a given input, TypeScript should fall back to a documented default weighting profile instead of pretending stronger intent understanding.

### Degraded Semantic States To Surface

The product contract must explicitly distinguish at least these operator-visible cases:

- **full hybrid support**: keyword + structural + semantic all contributed meaningfully
- **bounded fallback**: keyword + structural were used, semantic was disabled/unavailable/unhealthy/stale/not present
- **semantic weak**: semantic path was available but did not contribute enough trustworthy evidence to improve confidence
- **insufficient**: even after fallback to available signals, evidence was too weak for a safe answer
- **unsupported**: requested depth or intent behavior exceeds the bounded hybrid contract

Current repo reality note:

- the present Rust `query.search` bridge in `rust-engine/crates/dh-engine/src/bridge.rs` exposes `file_path`, `symbol`, `structural`, and `concept`-style bounded modes, but not a live `search.hybrid` bridge method on the product path today;
- the TS retrieval path can combine keyword-ish and semantic results, but current reranking is generic score sorting rather than a finalized intent-aware hybrid contract.

Therefore the implementation should prefer one of these truthful paths:

- add bounded hybrid mode metadata and signal breakdown where the bridge/retrieval layers can actually support it, or
- keep hybrid orchestration in TypeScript while treating Rust/query outputs and semantic retrieval outputs as distinct evidence sources and surfacing when semantic contribution was absent.

Do **not** claim a Rust-native hybrid engine if implementation only assembles hybrid behavior in TypeScript.

## Interfaces And Data Contracts

### Required Operator-Facing Hybrid Envelope

Hybrid-search results should extend the current `KnowledgeCommandReport` contract with fields or equivalent structure that make hybrid inspectable, while preserving existing catalog/support-state semantics.

Minimum required inspectable fields:

- `catalogClass: "concept_relevance_search"` or a narrower dedicated hybrid search class if implementation adds one consistently across workflow, bridge, presenter, and docs
- `supportState: "grounded" | "partial" | "insufficient" | "unsupported"`
- `supportDepth: "bounded_semantic" | "pattern_match" | "symbol_match" | "path_match" | other existing bounded labels as appropriate`
- `provider`: must distinguish pure bridge query/search from retrieval-backed hybrid assembly
- `evidence[]`: retained as the grounded evidence list shown to operators
- `limitations[]`: explicit explanation of missing/degraded support
- `inspection`: enough metadata to understand classified request and selected path

Recommended additional inspectable fields for this feature:

- `hybridMode: "keyword_structural_semantic" | "keyword_structural" | "keyword_only" | "structural_only"`
- `intentProfile: "lookup" | "explain" | "debug" | "default"`
- `signalSummary`: object showing whether keyword, structural, and semantic signals were:
  - `used`
  - `available_but_weak`
  - `unavailable`
  - `disabled`
  - `stale_or_unhealthy` if the implementation can detect this truthfully

If the current codebase cannot support all recommended fields cleanly, the minimum acceptable contract is explicit `limitations` wording plus one inspectable field that shows whether semantic contribution actually participated.

### Result-State Rules For Hybrid Search

- `grounded`
  - returned ranking is directly supported by surfaced repository evidence
  - may still be hybrid even if one signal has low contribution, but only if available signals are sufficient and no missing semantic capability is being hidden
- `partial`
  - some evidence is useful, but one or more expected hybrid inputs were missing, weak, or degraded
  - this is the default state when hybrid falls back from semantic-backed operation to keyword+structural and the missing semantic contribution materially matters to the request
- `insufficient`
  - available signals did not yield enough evidence to return a safe bounded result
- `unsupported`
  - request asks for unsupported depth, unsupported intent behavior, or broader semantic capability than this release supports

### Signal Combination Contract

The implementation should keep signal families distinct through ranking and presentation:

- **keyword score**: derived from exact lexical/path/symbol match behavior already present
- **structural score**: derived from graph or structural matches, direct relationships, or bounded pattern hits
- **semantic score**: derived from embedding similarity only when semantic search actually runs and returns usable results

TypeScript may normalize or weight those scores for intent-aware ranking, but the surfaced result must not erase whether semantic contribution was absent.

### Bridge / Retrieval Contract Notes

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` currently maps search classes to `query.search` modes of `file_path`, `symbol`, `structural`, and `concept`.
- `packages/retrieval/src/query/run-retrieval.ts` currently merges symbol results, file results, graph expansion, and semantic retrieval into one sorted set.
- Because the current retrieval path does not yet expose explicit signal breakdown or semantic-health status, Fullstack should add only the minimum new contract data needed for truthful hybrid inspection.

Truthful narrowing rule:

- if semantic health/staleness cannot be detected precisely, the implementation may surface `semantic unavailable or not contributing` rather than inventing a finer-grained diagnostic reason.

## Risks And Trade-offs

- **Overclaim risk:** the repo contains architecture docs for `search.hybrid`, but the current product path does not obviously expose that method live. Mitigation: only promise hybrid behavior that can be produced by current bridge + retrieval reality, and document whether orchestration is TS-assembled rather than Rust-native.
- **Signal-blending opacity risk:** combining results into one sorted list can hide which signal actually drove the answer. Mitigation: require signal summary / hybrid mode metadata and explicit limitation wording.
- **Intent creep risk:** intent-aware ranking can drift into broad planner or LLM behavior claims. Mitigation: restrict to `lookup`, `explain`, and `debug` weighting profiles only, with a default fallback path.
- **Semantic-health ambiguity risk:** the codebase has semantic retrieval machinery, but explicit stale/disabled/unhealthy detection may be limited. Mitigation: degrade to a coarser but honest operator message when precise health classification is unavailable.
- **Cross-layer contract drift:** Rust bridge output, TS workflow logic, presenter output, and docs can diverge quickly. Mitigation: freeze one hybrid envelope and one degradation vocabulary before expanding behavior.
- **Ranking churn risk:** changing scoring too aggressively could reduce exact-match quality for lookup queries. Mitigation: keep lookup keyword/structural-heavy and use semantic primarily as bounded tie-break or expansion input.

## Recommended Path

- Keep the existing knowledge-command product surface and add hybrid search as a bounded first-class search capability there.
- Extend the current TS workflow contract first so the operator-visible shape clearly records:
  - selected hybrid intent profile
  - whether semantic contributed
  - whether the result is full hybrid, bounded fallback, partial, insufficient, or unsupported
- Then add the minimum bridge/retrieval data needed to support that operator contract truthfully.
- Prefer conservative ranking rules over ambitious ones:
  - lookup -> keyword/structural heavy
  - explain -> balanced, semantic allowed to contribute more
  - debug -> structural first, semantic assist second
- If semantic support is absent or weak, return an explicit narrowed result rather than silently presenting a “hybrid” answer.

## Implementation Slices

### Slice 1: Freeze the hybrid contract and degradation vocabulary

- **Goal:** define one operator-visible hybrid result contract before changing ranking behavior.
- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - related tests in the same areas
- **Validation Command:** `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts apps/cli/src/presenters/knowledge-command.test.ts && npm run check`
- **Details:**
  - decide whether hybrid remains a bounded form of `concept_relevance_search` or becomes an explicit dedicated class on the product surface
  - add/adjust inspectable fields for hybrid mode, signal usage, and intent profile
  - define exact wording for semantic unavailable vs semantic weak vs insufficient vs unsupported
  - reviewer focus: no vague “AI ranking” language and no hidden semantic fallback

### Slice 2: Add bounded intent-aware hybrid routing in TypeScript

- **Goal:** make `dh ask` classify eligible requests into bounded hybrid intent profiles and select the appropriate weighting path.
- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/retrieval/src/query/build-retrieval-plan.ts`
  - `packages/retrieval/src/query/retrieval-plan.ts`
  - tests in `packages/opencode-app/src/workflows/run-knowledge-command.test.ts` and `packages/retrieval/src/query/run-retrieval.test.ts`
- **Validation Command:** `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts packages/retrieval/src/query/run-retrieval.test.ts && npm run check`
- **Details:**
  - keep supported intent set bounded to `lookup`, `explain`, `debug`, plus a conservative default
  - do not make `explain` or `debug` imply broader product scope than the approved contract
  - ensure non-hybrid query classes still take precedence for explicit definition/usage/dependency/trace/impact questions
  - reviewer focus: hybrid routing must not collapse distinct graph query classes into vague search

### Slice 3: Make hybrid signal composition inspectable

- **Goal:** combine keyword, structural, and semantic signals with explicit contribution tracking instead of opaque merged sorting.
- **Files:**
  - `packages/retrieval/src/query/run-retrieval.ts`
  - `packages/retrieval/src/semantic/semantic-search.ts`
  - optional retrieval helper files if a small score-breakdown helper is needed
  - associated tests
- **Validation Command:** `npm test -- packages/retrieval/src/query/run-retrieval.test.ts packages/retrieval/src/semantic/semantic-search.test.ts && npm run check`
- **Details:**
  - retain the three signal families distinctly in intermediate ranking data
  - support keyword-only / keyword+structural / keyword+structural+semantic truthful outcomes
  - avoid large retrieval redesign; small metadata additions are in scope, storage or ANN redesign is not
  - reviewer focus: semantic contribution must never be implied when no semantic search actually ran or no usable semantic evidence was returned

### Slice 4: Surface degraded semantic states through the bridge or workflow contract

- **Goal:** make semantic degradation inspectable enough for truthful operator output.
- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - possibly `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- **Validation Command:** `npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts packages/opencode-app/src/workflows/run-knowledge-command.test.ts && npm run check && cargo test --workspace`
- **Details:**
  - if Rust can honestly report capability/degradation metadata, surface it through the bridge
  - if not, TS should derive only the limited states it can prove from runtime evidence (for example “semantic not contributing”)
  - do not invent stale-health diagnostics if no current source of truth exists
  - reviewer focus: bridge contract changes must stay additive and backward-compatible for current bounded surfaces

### Slice 5: Align presenter output and docs with the bounded hybrid promise

- **Goal:** make hybrid support, fallback, and limitations visible without requiring internal inspection.
- **Files:**
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `docs/user-guide.md`
  - `README.md` if needed for consistency
- **Validation Command:** `npm test -- apps/cli/src/presenters/knowledge-command.test.ts && npm run check`
- **Details:**
  - document hybrid search as bounded, not universal
  - ensure presenter output shows support state, limitation wording, and whether semantic contributed
  - reviewer focus: docs must not promise healthy/full semantic support by default

### Slice 6: Hybrid integration checkpoint before code review

- **Goal:** prove the full product path is consistent before handoff to Code Reviewer.
- **Files:** all touched surfaces above
- **Validation Command:** `npm test && npm run check && cargo test --workspace`
- **Details:**
  - verify at least one lookup-oriented hybrid case that favors exact/structural evidence
  - verify at least one explain-oriented case where semantic can contribute when available
  - verify a degraded-semantic case that surfaces a truthful bounded fallback
  - verify `partial`, `insufficient`, and `unsupported` remain distinct
  - verify explicit graph query classes still bypass hybrid when they are the more precise class

## Dependency Graph

- Critical path: `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- Slice 1 must happen first because the hybrid envelope and degradation vocabulary define what later code must surface.
- Slice 2 precedes deeper ranking work so intent-aware routing is frozen before signal-composition changes land.
- Slice 3 and Slice 4 are tightly coupled and should remain sequential unless implementation discovers a genuinely additive bridge metadata change that can be isolated safely.
- Slice 5 depends on the final contract from Slices 1–4.
- Slice 6 is the required integration checkpoint before code review.

## Parallelization Assessment

- parallel_mode: `none`
- why: workflow classification, signal-composition metadata, bridge degradation signaling, presenter output, and docs all depend on one shared hybrid contract. Running these in parallel would create high drift risk across the same narrow product surface.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- integration_checkpoint: prove one consistent hybrid envelope across TypeScript workflow, retrieval composition, bridge/degradation metadata, presenter output, and docs before `full_code_review`.
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
| hybrid search is first-class and inspectable | workflow tests assert explicit hybrid classification/output fields; presenter tests assert surfaced hybrid/support metadata |
| keyword + structural + semantic combination remains bounded | retrieval tests cover signal breakdown and verify no universal semantic claim |
| degraded semantic states are surfaced truthfully | workflow/bridge tests cover semantic absent or non-contributing paths and assert limitation wording |
| intent-aware ranking stays bounded | targeted tests verify lookup/explain/debug weighting profiles without changing support-state semantics |
| explicit graph query classes remain distinct | `run-knowledge-command` tests verify definition/usage/dependency/call hierarchy/trace/impact still route to their direct classes |
| support states remain distinct | tests assert `grounded`, `partial`, `insufficient`, and `unsupported` each occur under the correct conditions |
| Rust/TS architecture boundary is preserved | code review verifies Rust owns evidence/search capability surfaces and TS owns operator-facing classification/presentation |
| docs match runtime reality | `docs/user-guide.md` and `README.md` reviewed against presenter output and actual support/degradation behavior |

## Integration Checkpoint

- Before `full_code_review`, confirm all of the following are inspectable on the real product path:
  - hybrid search is exposed explicitly on the current knowledge-command surface
  - the result shows whether semantic actually contributed
  - lookup/explain/debug use bounded, conservative weighting differences only
  - degraded semantic conditions produce truthful fallback wording instead of silent downgrade
  - explicit graph query classes still use their direct routes rather than being swallowed by generic hybrid search
  - no docs or presenter output imply IDE-grade or universal semantic search support

## Rollback Notes

- If hybrid implementation starts to require broad retrieval or bridge redesign, roll back to the last state where the existing catalog/search contract remains truthful, then narrow the hybrid guarantee instead of widening architecture scope.
- If precise semantic-health detection cannot be implemented honestly, keep the feature with a coarser but truthful state such as “semantic unavailable or not contributing,” rather than blocking the whole feature on fine-grained health taxonomy.
- If hybrid routing degrades exact lookup quality, revert to keyword/structural-heavy lookup behavior and keep semantic as optional assist only.
- If a dedicated hybrid catalog class causes drift across workflow, presenter, and docs, revert to the last consistent catalog shape and keep hybrid as an explicitly described bounded search mode under the existing search family until a later scoped feature revisits taxonomy.

## Reviewer Focus Points

- Preserve the approved architecture boundary: Rust owns search/evidence foundations; TypeScript owns classification, state presentation, and operator wording.
- Reject any implementation that claims semantic contribution when semantic retrieval did not actually contribute usable evidence.
- Reject any implementation that collapses `partial`, `insufficient`, and `unsupported` into one generic degraded state.
- Reject any implementation that broadens intent-aware ranking into open-ended semantic reasoning or planner redesign.
- Confirm lookup-oriented hybrid behavior still prefers exact and structural evidence over semantic similarity when exact evidence is strong.
- Confirm degraded semantic cases are inspectable from the surfaced result, not only from internal logs.
- Confirm docs and presenter output do not promise live Rust-native `search.hybrid` support unless the implementation truly adds and wires that product path.

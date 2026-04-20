---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: QUERY-EVIDENCE-HARDENING
feature_slug: query-evidence-hardening
source_scope_package: docs/scope/2026-04-19-query-evidence-hardening.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Query Evidence Hardening

## Chosen Approach

- Use a **drift-first hardening pass** on the existing bounded query surfaces instead of expanding the catalog or adding new language support.
- Keep the architecture boundary unchanged:
  - **Rust owns** answer-state truth, evidence packets, gaps, parser-backed provenance, and language/capability truth.
  - **TypeScript owns** bridge envelope consumption, presenter/report formatting, provider wording, and operator guidance.
- Prefer **strengthening Rust-authored evidence** where the current bounded bridge/query path already exists, and **narrow outward claims** where the current surface cannot truthfully meet a stronger claim without reopening scope.
- Keep `dh ask`, `dh explain`, and `dh trace` as the only relevant operator surfaces for this feature. Do not add new query classes, new commands, new languages, or broader semantic/parity claims.

Why this is enough:

- The repo already has the bounded query/search classes, Rust `EvidencePacket` and language-capability types, a JSON-RPC bridge, TS workflow assembly, CLI presenters, and operator docs.
- The main remaining problem is **cross-surface truth drift**, not missing product topology.
- A single authoritative Rust result contract plus TS presentation alignment closes that gap without redesigning retrieval, ranking, or the command surface.

## Dependencies

- Approved upstream scope package:
  - `docs/scope/2026-04-19-query-evidence-hardening.md`
- Prior solution contracts to preserve:
  - `docs/solution/2026-04-16-query-and-search-catalog-completion.md`
  - `docs/solution/2026-04-18-multi-language-support.md`
  - `docs/solution/2026-04-18-language-depth-hardening.md`
- Real validation commands available now:
  - from repo root: `npm run check`
  - from repo root: `npm test`
  - from `rust-engine/`: `cargo test --workspace`
- No repo-native lint command exists; do not invent one.

## Impacted Surfaces

### Rust truth and bridge-envelope surfaces

- `rust-engine/crates/dh-types/src/lib.rs`
- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`

### TypeScript bridge consumption and workflow-report surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`

### Operator-visible presenter and help/doc surfaces

- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.test.ts`
- `apps/cli/src/commands/root.ts`
- `docs/user-guide.md`
- `README.md`

### Existing truth surfaces to preserve

- `docs/scope/2026-04-19-query-evidence-hardening.md`
- `docs/solution/2026-04-16-query-and-search-catalog-completion.md`
- `docs/solution/2026-04-18-multi-language-support.md`
- `docs/solution/2026-04-18-language-depth-hardening.md`

## Boundaries And Components

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| Bounded query/search answer truth | canonical `answerState`, `EvidencePacket`, gaps, question-class truth, provider/source provenance | consuming and presenting that truth | TS-authored regrading of `grounded` / `partial` / `insufficient` / `unsupported` |
| Language/capability truth | `languageCapabilityMatrix`, `languageCapabilitySummary`, `retrievalOnly`, per-language `parserBacked` truth | rendering and operator wording for that capability truth | a second TS-derived capability source or a collapsed answer-state story |
| Search-class grounding | whether a bounded search result is grounded for **its own** class, and what evidence supports it | explain the source family clearly to operators | parser-backed relation proof inferred from retrieval/search hits |
| Relation-class grounding | parser/index/query/graph-backed proof for definition/usage/dependencies/dependents | wording, formatting, limitations, and next steps | retrieval-only or score-only proof presented as parser-backed relation certainty |
| Existing commands | `dh ask`, `dh explain`, bounded unsupported handling for `dh trace` | command/help text, report wording, examples | feature expansion into new query classes, trace support, or new languages |

### Product boundary to preserve

- No new query classes.
- No new languages.
- No collapse of answer-state and language/capability state into one outward field.
- No retrieval-as-parser-proof behavior.
- No broad retrieval or ranking redesign.
- No attempt to implement trace-flow/call-hierarchy/impact support under this feature.

## Interfaces And Data Contracts

### 1. Authoritative bridge result contract

For every touched bounded query/search surface, the Rust bridge envelope should be treated as the only truth source for:

- `answerState`: `grounded | partial | insufficient | unsupported`
- `questionClass`: existing bounded class identity only
- `evidence`: canonical Rust-authored evidence packet and gaps
- `languageCapabilitySummary`: separate capability truth, including `weakestState`, `languages[]`, `parserBacked`, and `retrievalOnly`
- source/provenance needed to explain whether the surfaced answer is parser-backed or retrieval-only

Contract rules:

- TS must **consume** the Rust envelope; it must not silently strengthen or replace it.
- `items` or preview rows are operator/report convenience only. They must not substitute for a missing Rust evidence packet.
- If Rust does not provide enough evidence for a stronger answer-state, TS must narrow the outward claim rather than reconstructing stronger proof.

### 2. Answer-state and capability-state separation contract

- `answerState` answers: “How trustworthy is this specific result?”
- `languageCapabilitySummary` answers: “What language/capability boundary applies here?”
- A result may be:
  - `grounded` for a bounded search class while still being `retrievalOnly=true`
  - `partial` or `insufficient` even when the relevant language capability is generally `supported`
- No touched surface may let `languageCapabilitySummary` silently replace or imply `answerState`.

### 3. Minimum grounded evidence by surface family

#### Parser-backed relation surfaces

Applies to:

- `graph_definition`
- `graph_relationship_usage`
- `graph_relationship_dependencies`
- `graph_relationship_dependents`

Required before outward `grounded`:

- non-empty Rust-authored evidence entries directly supporting the conclusion
- inspectable source path and reason
- symbol/line/snippet when truthfully available
- visible unresolved gaps when any remain
- parser/index/query/graph provenance rather than retrieval-only support

If these cannot be met, the result must narrow to `partial` or `insufficient`.

#### Search-class surfaces

Applies to:

- `search_symbol`
- `search_file_discovery`
- `search_structural`
- `search_concept_relevance`

Required before outward `grounded`:

- non-empty inspectable evidence for the search-class conclusion
- explicit source family and provider wording
- explicit `retrievalOnly` truth when parser-backed capability proof is not being claimed
- no language/capability wording that upgrades the result into parser-backed relation support

These surfaces may remain grounded for their own bounded search class, but they must not masquerade as parser-backed capability proof.

### 4. Unsupported and degraded contract

- `dh trace` remains an existing operator surface, but the current bounded contract stays `unsupported` for trace-flow behavior in this feature.
- `unsupported` and `insufficient` results should still carry explicit missing-proof or out-of-scope reasons from the Rust-authored envelope whenever possible.
- TS may shorten wording, but it must not invent a stronger or different explanation than the Rust truth source.

### 5. Provider/source wording contract

- Existing provider values remain bounded to current surfaces:
  - `bridge_query_definition`
  - `bridge_query_relationship`
  - `bridge_query_search`
  - `retrieval_keyword_semantic`
- TS owns operator wording for these providers.
- Parser-backed wording is allowed only when the Rust evidence packet and capability summary support it.
- Retrieval-only wording must stay explicit when the answer came from retrieval or hybrid ranking rather than parser-backed proof.

## Risks And Trade-offs

### Evidence drift inventory and resolution choice

| Hotspot | Current likely drift | Resolution choice | Why |
| --- | --- | --- | --- |
| `rust-engine/crates/dh-engine/src/bridge.rs` search results | `query.search` can return `grounded` with `evidence: None`, which leaves TS to reconstruct proof from items | **Strengthen evidence** | Rust must own answer/evidence truth for search-class grounding too |
| `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` | bridge client parses answer state and items but not the full Rust evidence packet | **Strengthen evidence consumption** | TS cannot preserve Rust truth if the canonical envelope is dropped at the bridge boundary |
| `packages/opencode-app/src/workflows/run-knowledge-command.ts` (`assembleAskAnswer`, `runHybridSearchAsk`) | TS currently regrades or narrows answer truth from scores/ambiguity and can become a second truth source | **Strengthen Rust semantics + narrow TS role** | answer-state logic must live in Rust; TS should report, not adjudicate |
| Retrieval fallback and hybrid search summaries | retrieval-backed outputs can be useful but can still read like parser-backed proof if capability wording is too optimistic | **Narrow outward claims** | retrieval-only outputs must stay retrieval-only unless Rust proves a stronger parser-backed claim |
| `fallbackLanguageCapabilitySummary(...)` mapping | retrieval-only search classes can inherit structural/parser-flavored capability wording that is stronger than the real evidence | **Narrow outward claims** | when no truthful parser-backed capability claim exists, present the limitation explicitly instead of reusing a stronger capability label |
| `apps/cli/src/presenters/knowledge-command.ts` | “support state” plus capability summary can blur answer-state vs capability-state, and preview items can look like proof | **Narrow wording** | operator text must visibly separate answer truth, capability truth, and preview/report convenience |
| `apps/cli/src/commands/root.ts`, `README.md`, `docs/user-guide.md` | `dh trace` is still shown in general examples even though current bounded behavior is unsupported | **Narrow outward claims** | doc/help surfaces must match runtime truth instead of implying broader support |
| Degraded/unsupported bridge responses | insufficient/unsupported paths can still lack Rust-authored gap detail, forcing TS to improvise explanation | **Strengthen degraded envelope** | Rust should own gaps and missing-proof reasons, not TS heuristics |

### Additional trade-offs

- **Rust-first truth hardening adds contract work before UI polish**
  - This is intentional. If TS wording is polished before Rust truth is settled, drift will reappear.

- **Some current outward claims may need to get weaker before they can become stronger**
  - This is acceptable and expected. Narrowing is the honest fallback when the stronger evidence cannot be produced inside the bounded surface.

- **Hybrid search will stay bounded**
  - This feature should not turn into a retrieval redesign or semantic ranking project. Any hybrid path that cannot preserve Rust truth must narrow rather than expand.

## Recommended Path

- **Step 1: write failing drift tests first.**
  - Freeze the known hotspots before changing runtime behavior.
- **Step 2: make the Rust bridge envelope authoritative for every touched bounded surface.**
  - Relation and search-class results should carry Rust-authored answer-state, evidence, and gaps.
- **Step 3: make TS consume, not reinterpret, that truth.**
  - Remove TS answer-state invention and keep preview/report formatting separate from proof.
- **Step 4: narrow outward wording where the stronger story cannot be justified.**
  - This especially applies to retrieval-only search wording and `dh trace` examples/help.
- **Step 5: run one cross-surface checkpoint before handoff.**
  - Compare raw bridge output, workflow JSON, CLI text output, and docs/help for the same bounded cases.

This is the simplest adequate path because it keeps one truth source, preserves the existing command surface, and fixes drift by either strengthening evidence or narrowing claims instead of expanding scope.

## Implementation Slices

### Slice 1: Baseline drift inventory and failing contract tests

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
- **Goal:** lock the current drift hotspots into failing tests before production behavior changes.
- **Validation Command:** `cargo test --workspace && npm test && npm run check`
- **Details:**
  - add or update failing tests for search results that currently look grounded without Rust-authored evidence
  - add failing tests for TS-side answer-state mutation and retrieval-only/parser-backed confusion
  - add fixture coverage for `grounded`, `partial`, `insufficient`, and `unsupported`
  - reviewer focus: narrowing a claim in this slice is valid if proof is currently missing

### Slice 2: Strengthen Rust answer/evidence truth across bounded query/search surfaces

- **Files:**
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- **Goal:** make Rust the canonical source for answer-state, evidence packets, gaps, and source-family truth for every touched bounded surface.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - ensure relation queries emit grounded/partial/insufficient/unsupported with inspectable Rust-authored evidence and visible gaps
  - strengthen bounded search-class outputs so grounded search results are backed by Rust-authored evidence for the search class itself
  - ensure degraded and unsupported paths carry truthful gap/out-of-scope reasons instead of leaving TS to invent them
  - reviewer focus: no new query classes, no new languages, no retrieval redesign

### Slice 3: Consume the full Rust envelope in TypeScript without regrading truth

- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- **Goal:** make TS consume Rust truth faithfully and keep answer-state separate from language/capability state.
- **Validation Command:** `npm test && npm run check`
- **Details:**
  - parse and retain the Rust evidence packet at the bridge client boundary
  - stop treating preview `items` as the canonical proof source
  - remove or demote TS-side answer-state heuristics that currently upgrade or downgrade Rust truth independently
  - preserve `languageCapabilitySummary` as a separate field with explicit `retrievalOnly` meaning
  - reviewer focus: no TS-derived parser-backed story and no `supportState` / capability-state collapse

### Slice 4: Align presenter/help/doc wording to the bounded truth model

- **Files:**
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `apps/cli/src/commands/root.ts`
  - `docs/user-guide.md`
  - `README.md`
- **Goal:** make operator-facing wording say exactly what the runtime now proves.
- **Validation Command:** `npm test && npm run check`
- **Details:**
  - render answer-state separately from language/capability state
  - render retrieval-only vs parser-backed distinction explicitly
  - ensure `dh trace` remains visibly unsupported in current bounded release wording instead of reading as a working trace product
  - narrow docs/help claims wherever the runtime stays weaker than older examples implied
  - reviewer focus: docs/help must never promise stronger support than runtime output provides

### Slice 5: Cross-surface integration checkpoint for one inspectable truth story

- **Files:** all surfaces above
- **Goal:** prove the same bounded case tells the same truth in raw bridge output, workflow report JSON, CLI text, and docs/help.
- **Validation Command:** `cargo test --workspace && npm test && npm run check`
- **Details:**
  - verify one parser-backed grounded relation case with non-empty Rust evidence
  - verify one retrieval-backed or search-grounded case that remains explicitly retrieval-only or non-parser-proof
  - verify one mixed/degraded case that stays `partial` with visible gaps
  - verify one `insufficient` case and one `unsupported` case (`dh trace` / over-depth request)
  - reviewer focus: a stronger outward story is allowed only when every touched surface agrees with the stronger evidence

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- Why sequential:
  - Slice 1 freezes the drift inventory and protects against accidental overclaim.
  - Slice 2 must land before TS can consume the final authoritative envelope.
  - Slice 3 must settle bridge/workflow consumption before presenter and docs can align honestly.
  - Slice 4 depends on the final Rust and TS truth model.
  - Slice 5 is the single integration checkpoint before code review and QA.

## Parallelization Assessment

- parallel_mode: `none`
- why: Rust truth, TS envelope consumption, presenter wording, and docs/help all sit on one shared answer/evidence contract. Parallel execution would create contradictory claims across the same narrow surface.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- integration_checkpoint: compare one grounded relation case, one retrieval-backed search case, one partial case, one insufficient case, and one unsupported `dh trace` case across Rust bridge payloads, TS workflow output, CLI presenter text, and docs/help wording before QA handoff.
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
| grounded relation answers always have non-empty inspectable Rust proof | from `rust-engine/`: `cargo test --workspace`; relation and bridge tests must assert non-empty evidence packet contents and visible gaps when degraded |
| search-class grounding does not masquerade as parser-backed capability proof | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test && npm run check`; workflow/presenter tests must show retrieval-only or non-parser-backed wording where applicable |
| answer-state stays separate from language/capability state | from repo root: `npm test && npm run check`; workflow and presenter fixtures must preserve separate fields and separate operator wording |
| TS no longer regrades Rust truth independently | from repo root: `npm test && npm run check`; bridge/workflow tests should fail if TS mutates Rust-authored answer-state without explicit Rust evidence/gap support |
| insufficient and unsupported cases explain missing proof honestly | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test`; degraded-path tests must verify gap/out-of-scope explanations remain visible |
| `dh trace` help/runtime/docs stay aligned | from repo root: `npm test && npm run check`; manual review of `apps/cli/src/commands/root.ts`, `docs/user-guide.md`, and `README.md` against current runtime behavior |
| scope remains bounded | Code Reviewer and QA confirm no new query classes, no new languages, no trace support expansion, and no retrieval redesign were introduced |

## Integration Checkpoint

- Before `full_code_review`, verify all of the following for the same touched release surface:
  1. Rust bridge payload exposes one authoritative answer-state and evidence story.
  2. TS workflow JSON preserves that answer-state and does not silently strengthen it.
  3. CLI text output renders answer-state and language/capability state separately.
  4. Retrieval-only or search-grounded outputs remain visibly retrieval-only when parser-backed proof is absent.
  5. `dh trace` remains explicitly unsupported in runtime output and help/docs.
  6. No touched surface presents preview items, retrieval hits, or structural proxies as parser-backed relation proof.

## Rollback Notes

- If bounded search surfaces cannot produce truthful Rust-authored evidence packets without drifting into retrieval redesign, rollback to the last state where the surface is clearly narrowed and mark the outward claim `partial` or `insufficient` rather than shipping a grounded-looking answer without Rust proof.
- If TS bridge/workflow changes destabilize reporting, rollback to the last state where TS only presents raw Rust truth and remove any TS-side truth-derivation heuristic before trying again.
- If docs/help cannot be aligned in the same change window, rollback the stronger examples/help text first. Narrowing docs is safer than widening runtime promises.
- If an implementation attempts to add trace support, new query classes, or new languages under this feature, route back to `full_solution`; that is out of scope, not an acceptable fallback.

## Reviewer Focus Points

- Confirm Rust remains the only source of answer-state, evidence, gaps, and parser-backed capability truth.
- Reject any implementation where TS reconstructs or upgrades answer truth from item scores, preview rows, retrieval hits, or local heuristics.
- Confirm `answerState` and `languageCapabilitySummary` remain separate in data and in operator wording.
- Confirm search-class outputs may be grounded only for their own bounded search class and do not imply parser-backed relation proof.
- Confirm `dh trace` remains explicitly unsupported and that help/docs no longer imply otherwise.
- Confirm every outward `grounded` claim on a touched surface has inspectable evidence and no hidden material gap.
- Confirm the feature stays bounded to current query surfaces and does not broaden into new classes, new languages, or retrieval redesign.

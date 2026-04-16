---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: PHASE3-GRAPH-QUERY-EVIDENCE
feature_slug: phase3-graph-query-search-evidence
source_scope_package: docs/scope/2026-04-14-phase3-graph-query-search-evidence.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Phase3 Graph Query Search Evidence

## Chosen Approach

- Keep `dh ask` on the existing Phase 2 host path and extend only the bounded `ask` branch.
- Phase 3 should add a small, explicit set of supported question classes that produce structured answer content plus inspectable evidence, instead of returning only evidence previews from `query.search`.
- The TypeScript side should remain responsible for question classification, answer assembly, operator-visible formatting, and honest limitation reporting.
- The Rust side should remain a bounded query/search provider over the existing JSON-RPC bridge, adding only the minimum graph-aware and search-aware methods or result shapes needed for the approved classes.

Why this is enough:

- It preserves the approved Phase 2 bridge path (`apps/cli/src/commands/ask.ts`, `packages/opencode-app/src/workflows/run-knowledge-command.ts`, `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`, `rust-engine/crates/dh-engine/src/bridge.rs`).
- It gives operators a materially more useful bounded repo-investigation flow without claiming IDE-grade or Phase 4 parity.
- It fits current repo reality: the Rust side already has graph/query crates (`rust-engine/crates/dh-query/src/lib.rs`, `rust-engine/crates/dh-graph/src/lib.rs`) but the live bridge currently exposes only `query.search`; Phase 3 should leverage that direction without promising the whole future query surface.

## Impacted Surfaces

- `apps/cli/src/commands/ask.ts`
- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.test.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- `packages/shared/src/types/evidence.ts`
- optional new shared report/answer type file under `packages/shared/src/types/` if the answer/evidence contract should be reused cleanly across presenter and workflow layers
- `packages/retrieval/src/query/build-evidence-packets.ts` only if existing evidence-packet shape is reused or minimally extended
- `rust-engine/crates/dh-engine/src/bridge.rs`
- adjacent `rust-engine/crates/dh-engine/src/main.rs` wiring if new bridge methods are added
- `rust-engine/crates/dh-query/src/lib.rs` and/or adjacent query implementation files only for the bounded graph/query capability actually exposed in Phase 3
- downstream QA artifact: `docs/qa/2026-04-14-phase3-graph-query-search-evidence.md`

## Boundaries And Components

### Supported Question Classes (exact Phase 3 guarantee)

Phase 3 should guarantee only these classes:

1. **Search-aware file discovery questions**
   - examples: “where is workflow state persisted”, “find auth flow”, “which files mention bridge startup”
   - expected answer basis: bounded repository matches returned from search results

2. **Graph-aware definition/location questions**
   - examples: “where is `runKnowledgeCommand` defined”, “where is `KnowledgeCommandSessionBridge` implemented”
   - expected answer basis: a definition-oriented graph/query result, not only generic substring matches

3. **Graph-aware relationship questions with one-hop scope**
   - examples: “what files import X”, “what does file Y depend on”, “where is symbol X used”
   - expected answer basis: direct dependency/import/reference relationships only

Everything else remains outside the guaranteed Phase 3 contract, including:

- multi-hop reasoning across large graph chains
- full call hierarchy / impact analysis / trace-flow answers
- broad conceptual “explain the entire subsystem” parity
- unbounded natural-language support for arbitrary repo questions

### TypeScript Side

- Owns mapping raw operator input into one of the explicit Phase 3 supported classes or an unsupported/best-effort classification.
- Owns RPC client lifecycle, bounded fallback decisions, answer synthesis, evidence labeling, and weak-evidence wording.
- Owns the operator-visible distinction between:
  - supported grounded answer
  - supported but weak/partial answer
  - unsupported question class
- Must not silently present a generic narrative as a fully grounded graph/search answer.

### Rust Side

- Owns the bounded repository query/search execution behind the JSON-RPC bridge.
- Should expose only the minimum additional bridge capability needed to support the guaranteed classes above.
- Must return structured machine-readable results with enough provenance for TS to build inspectable answer/evidence output.
- Must not expand to the full `dh-query` surface just because interfaces already exist in `rust-engine/crates/dh-query/src/lib.rs`.

### Bridge Contract Boundary

- Transport stays JSON-RPC 2.0 over stdio with `Content-Length` framing.
- Per-invocation child-process lifecycle remains acceptable for Phase 3.
- TS remains the orchestrating client; Rust remains the bounded provider.
- No background daemon, no streaming session protocol, no multi-client coordination, and no broad workflow-lane integration changes.

## Interfaces And Data Contracts

### Minimal Answer Model

For supported `ask` questions, Phase 3 output should add a first-class answer section instead of only counts and evidence preview lines.

Minimum operator-visible payload expectations:

- `answer`: concise conclusion in plain text, grounded in the returned evidence
- `answerType`: one of `search_match`, `definition`, `usage`, `dependencies`, `dependents`, `partial`, `unsupported`
- `grounding`: `grounded`, `partial`, or `unsupported`
- `evidence`: bounded list of supporting evidence entries
- `limitations`: optional list explaining weak, sparse, ambiguous, or unsupported situations

### Evidence Entry Expectations

Each surfaced evidence entry should identify:

- repo-relative `filePath`
- line or line range when available
- symbol or relationship label when available
- short `reason`
- source method/tool family used (`query.search`, definition lookup, dependency lookup, reference lookup, etc.)
- snippet or compact preview when it materially helps operator inspection

The existing `EvidencePacket` shape in `packages/shared/src/types/evidence.ts` is a strong base and should be reused where practical rather than inventing a wholly separate provenance model.

### Weak / Partial Evidence Rules

For supported classes, TS should surface explicit limitation states when any of these happen:

- the result set is sparse and only partially supports the answer
- search results exist but do not clearly justify a single confident conclusion
- graph lookup returns an incomplete one-hop surface
- answer assembly had to choose a best candidate among ambiguous matches

In those cases:

- `grounding` must be `partial`
- the answer text must include a limitation cue (for example: “Best match based on limited evidence” or “Partial answer from direct references only”)
- evidence should still be shown
- the output must avoid certainty wording that implies full correctness

### Unsupported Question Rule

If the operator question is outside the exact guaranteed classes, output should clearly say that the question is outside the Phase 3 supported set and may optionally show best-effort search evidence only if that does not look like a guaranteed grounded answer.

## Risks And Trade-offs

- **Scope-drift risk:** adding one graph-aware class can tempt expansion into call hierarchy, trace-flow, or broad explainability. Mitigation: freeze supported classes to definition/location, one-hop usage, and one-hop dependency questions only.
- **Narrative-over-grounding risk:** TS answer synthesis could overstate what sparse evidence proves. Mitigation: require `grounding` state and limitations for weak evidence.
- **Bridge inflation risk:** the Rust bridge could grow toward full parity because `dh-query` interfaces already list many future query types. Mitigation: expose only the methods/result shapes needed for the Phase 3 guaranteed classes.
- **Mixed-source ambiguity risk:** combining search-aware and graph-aware evidence could confuse operators if the answer source is opaque. Mitigation: label answer type and evidence source method clearly.
- **Review ambiguity risk:** reviewers may not know whether a question class is guaranteed or merely best-effort. Mitigation: encode supported class boundaries in workflow/report tests and reviewer checklist.

## Recommended Path

- Keep `dh ask` as the only Phase 3 operator entry path.
- Add a thin TS-side question classifier that routes only supported classes into graph-aware or search-aware bridge calls.
- Extend the Rust bridge from a single `query.search` demo method to a minimal bounded method family or typed result variants sufficient for:
  - search-aware file discovery
  - graph-aware definition lookup
  - graph-aware one-hop usage / dependency lookup
- Extend the report/presenter shape so operators see:
  - concise answer
  - answer type / grounding state
  - evidence list with source references
  - explicit limitations when grounding is weak or partial

## Implementation Slices

### Slice 1: Freeze supported question classes and answer contract

- **Goal:** make the Phase 3 guarantee explicit before bridge or presenter work expands.
- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - optional shared answer/report types under `packages/shared/src/types/`
  - `apps/cli/src/presenters/knowledge-command.ts`
- **Validation Command:** `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts apps/cli/src/presenters/knowledge-command.test.ts && npm run check`
- **Details:**
  - define the exact supported question classes above in code-facing contract terms
  - add explicit unsupported/partial states
  - update presenter/report expectations so answer content and evidence are distinguishable
  - reviewer focus: no unsupported class should be implied as guaranteed

### Slice 2: Add bounded graph/query bridge capability on the Rust side

- **Goal:** make the Rust bridge able to return minimal graph-aware results, not only substring search items.
- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - adjacent `rust-engine/crates/dh-engine/src/main.rs` wiring if needed
  - any minimal implementation files required under `rust-engine/crates/dh-query/src/` or nearby crates
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- **Validation Command:** `cargo test --workspace && npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts && npm run check`
- **Details:**
  - preserve `dh.initialize` and existing Phase 2 path
  - add only the minimal request/response shapes needed for supported classes
  - prefer one-hop graph answers and bounded result limits
  - reviewer focus: no full parity method family, no daemon/protocol expansion

### Slice 3: TS-side answer assembly and weak-evidence handling

- **Goal:** turn structured search/graph results into honest operator-visible answers.
- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `packages/shared/src/types/evidence.ts` if minimal evidence metadata additions are needed
  - `packages/retrieval/src/query/build-evidence-packets.ts` only if shared evidence shaping is reused
- **Validation Command:** `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts apps/cli/src/presenters/knowledge-command.test.ts && npm run check`
- **Details:**
  - assemble concise answer text from bounded bridge results
  - mark grounded vs partial vs unsupported
  - surface evidence entries clearly enough for operator inspection
  - ensure weak evidence never appears as a fully grounded answer

### Slice 4: Integration checkpoint for supported graph/search questions

- **Goal:** prove the exact Phase 3 supported classes work end to end and remain bounded.
- **Files:**
  - implementation surfaces above
  - downstream QA artifact under `docs/qa/`
- **Validation Command:** `npm test && npm run check && cargo test --workspace`
- **Details:**
  - verify at least one search-aware question succeeds with grounded evidence
  - verify at least one graph-aware definition question succeeds with grounded evidence
  - verify at least one graph-aware relationship question succeeds with grounded or explicitly partial evidence
  - verify an unsupported adjacent question is labeled unsupported rather than overclaimed

## Dependency Graph

- Critical path: `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- Slice 1 must happen first because the guaranteed question classes and answer contract define the Rust/TS interface target.
- Slice 2 must precede Slice 3 because answer assembly depends on actual bridge result shapes.
- Slice 4 is the integration checkpoint before code review and QA.

## Parallelization Assessment

- parallel_mode: `none`
- why: supported-class freeze, bridge shape, workflow answer assembly, and presenter output all touch the same narrow end-to-end path; parallel work increases mismatch risk more than it saves time.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- integration_checkpoint: prove one supported search-aware answer, one supported graph-aware answer, one weak/partial evidence case, and one unsupported-class case before QA handoff.
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
| AC1 deeper question support exists | `run-knowledge-command` tests cover at least one supported search-aware class and at least one supported graph-aware class |
| AC2 graph-aware answers are grounded | targeted workflow + bridge tests for definition/relationship queries; Rust bridge tests validate structured graph result payloads |
| AC3 search-aware answers are grounded | targeted workflow tests for search-aware file discovery answers using search-backed evidence |
| AC4 evidence is inspectable | presenter tests and workflow tests assert file paths, ranges/reasons, and visible evidence section |
| AC5 answer and evidence are distinguishable | presenter text/JSON tests assert explicit answer fields separate from evidence entries |
| AC6 weak evidence is reported honestly | targeted tests for sparse/ambiguous graph or search results yielding `partial` grounding and limitations |
| AC7 workflow usefulness improves | end-to-end `dh ask` path assertions show answer + evidence, not only evidence preview counts |
| AC8 scope remains bounded | Code Reviewer and QA confirm only the exact supported classes are guaranteed; no Phase 4 or IDE-grade claims surface in code or output |

Implementation validation commands available in this repo today:

- `npm test`
- `npm run check`
- `cargo test --workspace`

Additional review/QA checks recommended:

- targeted Vitest for `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- targeted Vitest for `apps/cli/src/presenters/knowledge-command.test.ts`
- targeted Vitest for `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- targeted Rust tests in `dh-engine` bridge/query surfaces

If QA uses extra static analysis (for example Semgrep), it should be recorded as additive evidence, not assumed as a repo-native requirement.

## Integration Checkpoint

Before `full_code_review` and QA handoff, implementation must demonstrate all of the following:

1. a supported **search-aware** `dh ask` question returns:
   - answer text
   - explicit grounded state
   - inspectable evidence entries
2. a supported **graph-aware definition or relationship** question returns grounded or explicitly partial output with graph-aware provenance
3. a **weak/partial evidence** case is surfaced honestly with visible limitations
4. an **unsupported adjacent question** is reported as outside the guaranteed Phase 3 set instead of being overclaimed as grounded support

## Rollback Notes

- If graph-aware support cannot be added honestly within the bounded one-hop scope, do not broaden to speculative parity; keep Phase 2 behavior and re-scope.
- Preserve the existing Phase 2 `query.search` success path while adding richer Phase 3 capabilities.
- If answer synthesis becomes too interpretive, prefer narrower grounded output with explicit limitations rather than richer but untrustworthy narrative text.

## Reviewer Focus Points

- Confirm the exact supported question classes are explicit in code behavior and operator output.
- Confirm graph-aware support is bounded to definition/location and one-hop relationship queries only.
- Confirm answer content is separate from evidence content.
- Confirm weak/partial evidence is labeled explicitly and does not use unjustified certainty.
- Confirm unsupported adjacent questions are surfaced as unsupported rather than silently treated as guaranteed.
- Confirm no Phase 4 parity behavior, broad explainability, daemonization, or full query-surface expansion was introduced.

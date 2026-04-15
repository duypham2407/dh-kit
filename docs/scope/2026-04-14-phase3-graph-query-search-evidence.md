---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: PHASE3-GRAPH-QUERY-EVIDENCE
feature_slug: phase3-graph-query-search-evidence
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Phase3 Graph Query Search Evidence

## Goal

- Move beyond Phase 2's basic `dh ask` end-to-end proof by making `dh ask` useful for bounded repository investigation through deeper graph-aware, search-aware, and evidence-backed answers.

## Target Users

- OpenKit operators and maintainers using `dh ask` to inspect repository structure and answer bounded codebase questions.
- Solution Lead, Code Reviewer, and QA as downstream consumers of a clear Phase 3 boundary and inspectable acceptance intent.

## Problem Statement

- Phase 2 proves the ask path works end to end, but it does not yet make `dh ask` trustworthy or materially useful for deeper repository analysis.
- Operators need to ask more than simple demo-style questions and receive answers grounded in repository relationships and visible supporting evidence.
- Without that deeper answer surface, `dh ask` remains a transport proof rather than a practical repo-analysis capability.

## In Scope

- Add operator-visible support for a deeper class of repository questions through `dh ask` beyond the basic Phase 2 flow.
- Support a bounded set of graph-aware question types, such as dependency, import, definition, usage, or related-file questions.
- Support a bounded set of search-aware question types, such as locating relevant files, concepts, or code patterns tied to a repo question.
- Ensure supported deeper answers include inspectable evidence or provenance that identifies the sources used.
- Improve operator trust by making answer basis visible rather than opaque.
- Preserve the existing ask path while extending its usefulness for bounded repository investigation.

## Out of Scope

- Full workflow parity across all current and planned OpenKit runtime surfaces.
- Full IDE-grade graph navigation or comprehensive code-intelligence parity.
- Broad agent orchestration expansion, new workflow lanes, or Phase 4 behavior.
- Unbounded natural-language support for every possible repository question.
- Large packaging, deployment, auth, collaboration, or multi-user product changes.
- Broad ranking or relevance work beyond what is minimally required for inspectable bounded usefulness.
- Retirement of prior paths, repo-wide migration mandates, or claims of comprehensive correctness across all query types.

## Main Flows

### Flow 1 — Graph-aware question returns grounded answer

- Operator asks a graph-oriented repository question through `dh ask`.
- The system returns an answer grounded in repository relationships.
- The returned result includes inspectable supporting evidence.

### Flow 2 — Search-aware question returns grounded answer

- Operator asks a search-oriented repository question through `dh ask`.
- The system returns an answer grounded in relevant repository matches.
- The returned result includes inspectable supporting evidence.

### Flow 3 — Evidence lets operator inspect why the answer was returned

- Operator receives an answer to a supported deeper question.
- The answer clearly identifies the supporting source paths or references.
- The operator can inspect the basis of the answer without needing internal implementation knowledge.

### Flow 4 — Weak or missing evidence is reported honestly

- Operator asks a supported deeper question but the available evidence is weak, partial, or unavailable.
- The system reports that limitation explicitly.
- The result does not present an ungrounded answer as certain.

## Business Rules

- Phase 3 extends the operator-visible usefulness of `dh ask`; it is not only an internal capability expansion.
- "Deeper" in this phase means graph-aware questions, search-aware questions, and evidence-backed answers at a bounded level appropriate to current repo reality.
- Supported question classes for Phase 3 must be explicit and inspectable; they must not be implied only by implementation details.
- For supported deeper questions, answer output must distinguish the answer content from the evidence or provenance used to support it.
- Evidence must identify supporting repo sources clearly enough for operator inspection.
- If evidence is insufficient, partial, or unavailable, the product must communicate that limitation explicitly.
- Phase 3 must preserve the basic Phase 2 ask flow rather than replace it with a new operator workflow model.
- The phase must remain bounded and must not expand into full parity, full-product search coverage, or later-phase behavior.

## Acceptance Criteria Matrix

- **AC1 — Deeper question support exists:** When an operator uses `dh ask`, at least one graph-oriented repository question class and at least one search-oriented repository question class are supported beyond the basic Phase 2 flow.
- **AC2 — Graph-aware answers are grounded:** When an operator asks a supported graph-oriented question, the returned answer is grounded in repository relationships rather than only generic narrative output.
- **AC3 — Search-aware answers are grounded:** When an operator asks a supported search-oriented question, the returned answer is grounded in relevant repository matches rather than only generic narrative output.
- **AC4 — Evidence is inspectable:** For supported deeper questions, the returned result includes inspectable supporting evidence that identifies the relevant repo source paths and/or references clearly enough for operator inspection.
- **AC5 — Answer and evidence are distinguishable:** For supported deeper questions, the operator-visible output clearly distinguishes the answer from the evidence or provenance used to support it.
- **AC6 — Weak evidence is reported honestly:** If a supported deeper question has weak, partial, or unavailable evidence, the returned output reports that limitation explicitly and does not present the answer as fully grounded with unjustified certainty.
- **AC7 — Workflow usefulness improves:** Compared with Phase 2, an operator can complete a bounded repo-investigation workflow through `dh ask` that includes both a useful answer and inspectable supporting evidence.
- **AC8 — Scope remains bounded:** Review of the delivered phase shows a bounded graph/query/search/evidence improvement only and does not claim full workflow parity, full IDE-grade parity, or Phase 4 product behavior.

## Edge Cases

- A supported deeper question returns a plausible answer but does not include enough source identification for inspection.
- A result includes evidence, but the evidence does not clearly support the surfaced conclusion.
- A question is adjacent to a supported class but falls outside the bounded Phase 3 guarantee.
- A supported question yields only sparse or ambiguous supporting evidence.
- The system returns a narrative answer when it should instead surface uncertainty or limitation.

## Error And Failure Cases

- A supported deeper question cannot be answered with sufficient grounding.
- Evidence is missing, partial, or too ambiguous to justify a confident answer.
- Output format fails to make the evidence basis inspectable.
- Product behavior implies support for a broader question class than Phase 3 actually guarantees.
- A deeper question path regresses into opaque answer behavior that is not materially more inspectable than Phase 2.

## Open Questions

- Which exact graph-oriented question classes should be guaranteed in Phase 3, and which should remain unsupported?
- Which exact search-oriented question classes should be guaranteed in Phase 3, and which should remain unsupported?
- What is the minimum evidence or provenance payload that makes answers inspectable without overwhelming the operator?
- How should the product communicate partial confidence, sparse evidence, or unsupported deeper queries?
- What operator-visible wording should define the boundary between a supported deeper question and a best-effort answer?

## Success Signal

- Operators can use `dh ask` for bounded repository investigation rather than only basic end-to-end validation.
- Supported deeper answers are visibly grounded in repository evidence.
- Operators can inspect why a supported answer was returned by reviewing cited sources or references.
- The phase remains clearly bounded to graph/query/search/evidence depth and does not drift into full parity or later-phase behavior.

## Handoff Notes For Solution Lead

- Preserve the bounded Phase 3 contract: improve operator-visible repo investigation through graph-aware, search-aware, and evidence-backed `dh ask` behavior only.
- Keep the guarantee surface explicit. Choose the smallest truthful set of supported deeper question classes and define them clearly.
- Preserve inspectability. The answer format must make it obvious what the answer is, what evidence supports it, and when evidence is weak or incomplete.
- Do not broaden into full workflow parity, IDE-grade parity, packaging expansion, or Phase 4 scope.
- Resolve the open questions above in the solution package, especially supported question classes, minimum evidence payload, and limitation/uncertainty handling.

---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: QUERY-EVIDENCE-HARDENING
feature_slug: query-evidence-hardening
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Query Evidence Hardening

QUERY-EVIDENCE-HARDENING hardens one inspectable truth across the existing bounded DH query surfaces. The feature keeps Rust authoritative for answer-state, evidence packets, gaps, and parser-backed capability truth; keeps TypeScript authoritative for operator-visible presentation, provider wording, and reporting; and requires that `grounded`, `partial`, `insufficient`, `unsupported`, retrieval-only, and language-capability summaries never contradict each other across runtime output, presenters, or user-facing docs. This feature does not add new query classes, new languages, or broader semantic/parity claims.

## Goal

- Make existing bounded DH query/search outputs trustworthy end to end.
- Ensure answer-state, language-capability state, evidence packets, provider labeling, and operator-facing wording tell one consistent story for the same result.
- Prevent grounded-looking answers, parser-backed claims, or operator docs from overstating what current evidence actually proves.

## Target Users

- Operators using `dh ask`, `dh explain`, and `dh trace` who need to know whether a result is truly grounded, partial, insufficient, unsupported, parser-backed, or retrieval-only.
- Maintainers, reviewers, and QA who need one inspectable contract for evidence truth across Rust output, TS reporting, and operator docs.
- Solution Lead and Fullstack implementers who need a bounded hardening target without reopening catalog scope, language onboarding, or architecture redesign.

## Problem Statement

- The repository already has bounded query/search classes, answer-state vocabulary, language-capability truth, and evidence packet concepts from earlier features.
- The remaining risk is cross-surface truth drift: one layer can still look stronger, cleaner, or more certain than the underlying evidence actually supports.
- Current bounded query surfaces become untrustworthy when any of the following happen:
  - a result is marked `grounded` even though evidence is empty, too thin, or materially unresolved
  - retrieval-backed output reads like parser-backed proof
  - answer/result state and language/capability state are collapsed or inferred from each other
  - TS presenters, provider labels, or docs imply stronger support than Rust truth and surfaced evidence justify
- This feature is needed to harden consistency and inspectability across the existing bounded product surface so operators can trust what DH is claiming, why it is claiming it, and where that claim stops.

## In Scope

- Preserve the current architecture boundary:
  - Rust owns answer-state truth, evidence packets, gaps, parser-backed capability truth, and source provenance.
  - TypeScript owns presentation, provider wording, limitation wording, inspection/report formatting, and user-facing reporting.
- Preserve the existing bounded query/search catalog only; this feature hardens truth for already approved surfaces instead of adding new classes.
- Harden consistency across these existing bounded surfaces where they surface query truth:
  - `dh ask`
  - `dh explain`
  - `dh trace`
  - bounded query/search result envelopes and evidence packets
  - language-capability summaries and provider labels exposed to operators
  - presenter/help/doc wording that explains those bounded outputs
- Define explicit rules for:
  - answer-state vs language-capability-state boundaries
  - minimum evidence required before a result may be shown as `grounded`
  - degraded and mixed-evidence behavior
  - retrieval-only vs parser-backed boundaries
  - operator-visible trust wording for `grounded`, `partial`, `insufficient`, and `unsupported`
  - unacceptable evidence drift across runtime, presenters, and docs
- Require that if a touched bounded surface cannot meet the stronger claim it currently shows, the shipped behavior narrows the claim rather than keeping optimistic wording.

## Out of Scope

- Adding new query classes, search classes, or operator commands.
- New language onboarding or broader capability expansion beyond the already approved bounded language set.
- Universal semantic reasoning, universal parity, or IDE-grade proof claims.
- Broad retrieval redesign, ranking redesign, or LLM-behavior redesign.
- Collapsing answer-state and capability-state into one field or one top-line status.
- Treating retrieval hits, semantic matches, or file discovery as parser-backed proof for relation/capability claims.
- Architecture inversion or ownership changes that make TypeScript the source of structural/evidence truth.
- Daemon/service-mode expansion, topology redesign, or unrelated workflow/platform changes.

## Main Flows

- **Flow 1 — Parser-backed bounded relation answer stays evidence-first**
  - As an operator, I ask an already supported bounded relation question.
  - DH returns a result whose answer-state, evidence packet, provider labeling, and language-capability summary agree with each other.
  - If the answer is shown as `grounded`, the surfaced evidence directly supports that conclusion.

- **Flow 2 — Retrieval-backed bounded search result stays retrieval-backed**
  - As an operator, I receive a useful retrieval/search result on an existing bounded search surface.
  - DH may show the result as useful or even grounded for that search class when the surfaced evidence supports it.
  - DH does not present that result as parser-backed language/capability proof unless parser-backed evidence actually exists.

- **Flow 3 — Mixed or degraded output explains the gap**
  - As an operator, I get a result that combines strong evidence with unresolved, partial, or unsupported portions.
  - DH keeps the useful grounded portion visible.
  - DH also explains what is limited, why it is limited, and what remains unresolved instead of hiding the weakness.

- **Flow 4 — Unsupported requests stay explicitly unsupported**
  - As an operator, I ask for a class, depth, or language/capability behavior outside the current bounded contract.
  - DH returns `unsupported` with an explicit reason.
  - No fallback wording makes it look partially parser-backed when that support does not exist.

- **Flow 5 — Reviewer and QA can inspect drift directly**
  - As a maintainer, reviewer, or QA agent, I compare Rust truth, TS output, and docs for a touched bounded surface.
  - I can tell whether the shipped behavior is aligned or drifting.
  - Any stronger claim is backed by inspectable evidence or is narrowed before release.

## Business Rules

### Contract and ownership rules

- Rust remains the only truth source for:
  - answer-state emitted by the bounded query/search path
  - evidence packet contents and gaps
  - parser-backed source provenance
  - language/capability truth for parser-backed behavior
- TypeScript may summarize and present that truth, but it must not strengthen it.
- TypeScript presentation/reporting may clarify or compress wording, but it must not convert weaker evidence into a stronger product claim.

### Answer-state vs capability-state boundary rules

- Answer/result state and language/capability state are separate concepts and must remain separate in outward behavior.
- Answer/result state remains bounded to: `grounded`, `partial`, `insufficient`, `unsupported`.
- Language/capability state remains bounded to the existing capability vocabulary established by prior approved work; it must not be replaced by answer-state wording.
- A `grounded` answer does not automatically mean the underlying language/capability is universally supported.
- A `supported` capability does not automatically mean a specific invocation is `grounded`.
- No touched surface may use one field as a silent substitute for the other.

### Minimum evidence required before `grounded`

- A result may be shown as `grounded` only when all of the following are true:
  - the surfaced output includes at least one evidence entry that directly supports the returned conclusion
  - the evidence is inspectable enough for operator review, including source path and reason, plus symbol/line/snippet when the surface can truthfully provide them
  - the provider label matches the real source family used
  - material unresolved edges, gaps, or ambiguity are not hidden
  - for parser-backed relation claims, the proving evidence comes from parser/index/query/graph truth rather than retrieval-only output
- If the product cannot meet the grounded minimum for a touched surface, it must narrow to `partial` or `insufficient` instead of keeping a stronger label.

### Degraded, partial, and insufficient behavior rules

- Use `partial` when some real supporting evidence exists but coverage, binding, or depth remains incomplete.
- Use `insufficient` when the request is in scope but the available evidence is too weak or too ambiguous for a safe conclusion.
- Use `unsupported` when the requested class, depth, or language/capability lies outside the current bounded release contract.
- When a result is `partial` or `insufficient`, the operator-facing output must explain the missing proof or limitation instead of only showing a weaker label.
- Material unresolved gaps must remain visible even if some useful evidence exists.

### Retrieval-only vs parser-backed boundary rules

- Retrieval-backed outputs may remain useful on bounded search surfaces.
- Retrieval-backed outputs may support a grounded search result for that search class when the evidence shown is sufficient for that class.
- Retrieval-backed outputs must not be used as proof that a parser-backed relation or language/capability claim is supported.
- Retrieval evidence may supplement parser-backed answers, but it must not silently upgrade capability-state or parser-backed provider wording.
- File/path discovery, concept/relevance search, or semantic matches must stay explicitly retrieval-backed when parser-backed proof is absent.

### Operator-visible wording and trust rules

- Operator-facing wording for touched bounded query surfaces must make clear:
  - what surface this output represents
  - the current condition/state
  - why that state applies
  - what still works versus what is limited
  - the next recommended action when one exists
- `grounded`, `partial`, `insufficient`, and `unsupported` must remain visibly distinct.
- Touched docs/help/presenters must use the same bounded truth model as runtime output.
- Helpful narrative is allowed, but it must not hide weaker state, retrieval-only status, or unresolved gaps.

### Unacceptable evidence drift

The feature is considered to have unacceptable evidence drift if any touched bounded surface does any of the following after implementation:

- marks a result `grounded` while surfaced evidence is empty, null, non-inspectable, or materially unresolved
- presents retrieval-only output as parser-backed proof
- shows a stronger answer-state in TS output than Rust truth and surfaced evidence justify
- shows a stronger language/capability story than the Rust truth source exposes
- omits material gaps or unresolved conditions that would change how an operator trusts the answer
- uses docs/help wording that promises stronger support than runtime output actually provides
- collapses answer-state and capability-state into one visible or implicit field/story

## Acceptance Criteria Matrix

- **AC1** — **Given** a touched bounded query or search surface, **when** its result is shown as `grounded`, **then** the surfaced output contains non-empty inspectable evidence directly supporting the conclusion and does not hide material unresolved gaps.
- **AC2** — **Given** a touched parser-backed relation result, **when** the product claims parser-backed grounding, **then** the proving evidence comes from parser/index/query/graph truth rather than retrieval-only output.
- **AC3** — **Given** a touched retrieval-backed search result, **when** it is surfaced to the operator, **then** the provider/report wording makes clear that it is retrieval-backed and does not use that result to claim parser-backed language/capability support.
- **AC4** — **Given** a touched bounded output that includes both answer/result state and language/capability information, **when** that output is rendered, **then** the answer-state and capability-state remain separate and keep their distinct meanings rather than collapsing into one field or one implied story.
- **AC5** — **Given** some direct evidence exists but coverage or binding is incomplete, **when** the result is shown on a touched bounded surface, **then** it is labeled `partial` and the surfaced limitations explain the missing or unresolved portion.
- **AC6** — **Given** a request is in scope but the available evidence is too thin or ambiguous for a safe conclusion, **when** the result is shown on a touched bounded surface, **then** it is labeled `insufficient` with an explanation of what proof is missing.
- **AC7** — **Given** a request exceeds the current bounded class, depth, or language/capability contract, **when** DH handles that request on a touched bounded surface, **then** the result is labeled `unsupported` with an explicit reason and does not imply hidden fallback support.
- **AC8** — **Given** a touched bounded surface currently contains stronger wording than its evidence can support, **when** this feature ships, **then** that surface is either brought up to the minimum grounded evidence standard or narrowed to the weaker truthful state.
- **AC9** — **Given** a touched result mixes stronger and weaker evidence, languages, or providers, **when** it is surfaced, **then** the useful grounded portion remains visible while the weakest relevant capability or gap also remains explicit.
- **AC10** — **Given** a touched operator-facing presenter, report, or user-facing doc describing bounded query truth, **when** it is compared against runtime behavior for the same touched surfaces, **then** the wording, state vocabulary, and trust boundaries do not contradict runtime output.
- **AC11** — **Given** a fatal parse, binding, or query failure affecting a touched bounded surface, **when** the operator inspects the result, **then** stale, empty, or outdated evidence is not presented as current grounded proof.
- **AC12** — **Given** the completed scope package, **when** Solution Lead begins design, **then** they can identify the touched surfaces, grounded minimum, degraded-state rules, retrieval-only boundary, and drift conditions without inventing new product behavior.

## Edge Cases

- A mixed-language answer contains a strong TS/JS parser-backed result alongside a weaker Python, Go, or Rust capability for the same bounded query surface.
- A result combines parser-backed evidence with retrieval-only context and must keep those source families distinct.
- A bounded search result can be grounded for its own search class even though it does not prove parser-backed relation support.
- A touched surface can provide file-path proof but not symbol/line detail for a particular search result; the result may still be inspectable if source path, reason, and provider truth remain explicit.
- An answer is mostly supported but includes one unresolved edge that materially affects a dependent, reference, or relationship claim.
- A doc/help surface still reflects an older stronger story after runtime behavior has been narrowed.
- A request stays within an existing query class but asks for a depth or proof type that remains out of bounds.

## Error And Failure Cases

- The feature fails if any touched bounded surface still shows `grounded` without meeting the minimum grounded evidence rules.
- The feature fails if retrieval-only outputs can still be mistaken for parser-backed proof.
- The feature fails if TS presentation/reporting strengthens or replaces Rust truth rather than presenting it.
- The feature fails if answer-state and capability-state are collapsed, blended, or inferred from each other on a touched surface.
- The feature fails if `partial`, `insufficient`, and `unsupported` remain visually or semantically merged.
- The feature fails if material gaps or unresolved conditions are omitted from operator-facing limitations on a touched degraded result.
- The feature fails if user-facing docs/help promise stronger bounded support than runtime actually delivers.
- The feature fails if it broadens into new query classes, new languages, universal semantic reasoning, or broader parity claims in order to satisfy acceptance.

## Open Questions

- None blocking at Product Lead handoff.
- Required solution-stage baseline: identify every currently shipped bounded query surface that still has evidence drift and decide, surface by surface, whether to strengthen evidence or narrow outward claims. This is a required design activity, not permission to broaden scope.

## Success Signal

- Operators can inspect any touched bounded query result and tell, without contradiction, whether it is grounded, partial, insufficient, unsupported, parser-backed, or retrieval-only.
- A grounded-looking result always has inspectable evidence that matches the claim being made.
- Language/capability summaries remain separate from answer/result state and no longer create contradictory stories.
- Presenter/help/doc wording matches runtime truth for the touched surfaces.
- Reviewers and QA can identify evidence drift mechanically from surfaced output instead of inferring hidden intent.
- The feature improves trust on existing bounded surfaces without adding new classes, languages, or broader parity claims.

## Handoff Notes For Solution Lead

- Preserve the architecture boundary named in the user request and earlier approved work:
  - Rust = answer/evidence truth and parser-backed capability truth
  - TypeScript = presentation/reporting and operator wording
- Start with a bounded drift inventory across the current shipped surfaces for `dh ask`, `dh explain`, `dh trace`, result envelopes, evidence packets, presenters, and user-facing docs.
- Treat any known or discovered case of stronger outward wording than evidence supports as a must-resolve hotspot. Resolution may be either:
  - strengthen the surfaced evidence truthfully, or
  - narrow the claim/state/provider wording
- Preserve these hard requirements:
  - no new query classes
  - no new languages
  - no answer-state / capability-state collapse
  - no retrieval-as-parser-proof behavior
  - no universal semantic or parity claims
- Solution design should explicitly define:
  - which existing bounded surfaces are in the hardening pass
  - the minimum grounded evidence standard applied to each touched surface family
  - how degraded, mixed, and unsupported states are explained
  - how runtime, presenters, and docs are kept in sync for the touched surfaces

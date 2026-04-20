---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: OPERATOR-CAPABILITY-INTROSPECTION
feature_slug: operator-capability-introspection
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Operator Capability Introspection

OPERATOR-CAPABILITY-INTROSPECTION defines the bounded operator-facing introspection contract for DH’s existing Rust-authored truth surfaces. The feature exposes, on the operator-visible command, report, help, doctor, and user-guide surfaces that already speak about support or trust, the distinct stories for language/query capability support, specific answer state, parser-backed freshness, and benchmark truth. Rust remains the only source of capability, freshness, and benchmark truth; TypeScript remains presentation only. This work is about inspectability and honest wording, not new capabilities, new query classes, watch-mode rollout, benchmark-system expansion, release/install overhaul, or a universal support dashboard.

## Goal

- Let operators inspect what DH currently supports, what a specific result means, whether parser-backed facts are current, and what benchmark evidence actually proves without reading internal design docs.
- Keep language/query capability state, answer state, freshness state, and benchmark state visibly separate on touched operator-facing surfaces.
- Make operator wording bounded and honest so existing Rust-authored truth is surfaced without overclaiming product guarantees.

## Target Users

- Operators using `dh doctor`, `dh index`, `dh ask`, `dh explain`, and `dh trace` who need to understand current support boundaries and trust conditions.
- Maintainers, reviewers, and QA who need one inspectable contract for how support, freshness, and benchmark truth should appear outwardly.
- Solution Lead and downstream implementers who need explicit product boundaries for introspection work without inventing new capability claims.

## Problem Statement

- DH already has multiple bounded truth contracts spread across recent approved work:
  - language and query capability truth
  - answer-state truth for specific query results
  - freshness truth for parser-backed currentness
  - benchmark truth for local benchmark evidence
- Those truths are intentionally separate, but they are not yet defined as one bounded operator-facing introspection contract across the surfaces operators actually read first.
- Without that contract, the product risks several forms of operator confusion and overclaim:
  - language support can be mistaken for query-result trust
  - a grounded-looking answer can be mistaken for universal capability support
  - prior success, retrieval hits, or chunk-refresh counts can be mistaken for parser-backed freshness
  - benchmark output can be mistaken for a product-wide guarantee instead of local evidence
  - help, doctor, presenters, and docs can drift into a broader “support dashboard” story than Rust currently proves
- This feature closes that inspectability gap. It does not add new capabilities. It makes existing Rust-authored truth inspectable and bounded on operator-facing surfaces.

## In Scope

- Expose bounded introspection for these truth families only:
  - language/query capability support
  - answer/result state
  - parser-backed freshness state
  - benchmark truth and benchmark completeness state
- Keep Rust authoritative for capability, freshness, benchmark, and parser-backed truth; keep TypeScript authoritative only for presentation, formatting, and operator wording.
- Cover the operator-visible surfaces that already speak about support, trust, or readiness for DH, including:
  - `dh doctor`
  - `dh ask`
  - `dh explain`
  - `dh trace`
  - `dh index` follow-up output plus current operator-visible index or status reporting that speaks about parser-backed freshness
  - current Rust-owned benchmark or parity command/report output
  - CLI help surfaces such as `dh --help` and relevant subcommand help
  - `docs/user-guide.md` and other touched user-facing documentation for the above surfaces
- Define which state distinctions must be visible on which touched surfaces and which details may stay internal.
- Define degraded and unsupported reporting rules for touched operator-facing surfaces.
- Define non-overclaim wording rules so summaries stay bounded to current repository truth.
- Define the routing rule for which truth belongs on which surface, including when a surface should summarize briefly versus point the operator to a deeper report or command.

## Out of Scope

- Adding new languages, new query classes, new benchmark classes, or new parser capabilities.
- Reworking Rust/TypeScript ownership so TypeScript becomes a second truth source.
- Broad watch-mode rollout, release/install overhaul, daemon/service rollout, or new benchmark infrastructure.
- A universal GUI, dashboard, or support matrix that implies more coverage than Rust currently exposes.
- Treating retrieval success, prior successful answers, grammar availability, or TS chunk/index counts as a substitute for Rust-authored capability or freshness truth.
- Routing benchmark truth through `dh ask`, `dh explain`, or `dh trace` as though benchmark evidence were part of query answer-state.
- Replacing bounded support wording with broad promises such as `full support`, `always current`, or `proven for all repos`.
- Exposing raw low-level proof fields as the primary operator contract when bounded state-and-reason reporting is sufficient.

## Main Flows

- **Flow 1 — Operator checks bounded support before trusting a query**
  - Operator uses `dh doctor`, help, or a touched result surface.
  - DH shows which language or query capability is `supported`, `partial`, `best-effort`, or `unsupported` for the relevant request.
  - The surface does not imply universal support beyond the current bounded contract.

- **Flow 2 — Operator receives a specific query result**
  - Operator runs `dh ask` or `dh explain`.
  - DH shows the answer/result state for that invocation and keeps it separate from language/query capability state.
  - If the result is retrieval-only or only partially parser-backed, the output says so explicitly.

- **Flow 3 — Operator requests a currently unsupported query class**
  - Operator runs `dh trace` under the current bounded contract.
  - DH reports `unsupported` explicitly.
  - Help, docs, and command output do not imply hidden fallback parser-backed support.

- **Flow 4 — Operator inspects parser-backed freshness after indexing or status checks**
  - Operator runs `dh index` or a touched operator-visible status/report surface for parser-backed freshness.
  - DH surfaces whether relevant parser-backed truth is retained current, refreshed current, degraded partial, or not current using Rust-authored truth or a truthfully narrowed subset.
  - The surface does not infer freshness from prior success, retrieval success, or TS-owned counters.

- **Flow 5 — Operator reads benchmark evidence**
  - Operator reads the current Rust-owned benchmark/parity output or report.
  - DH shows what benchmark class ran, on which corpus, under which preparation conditions, and whether the result is complete, degraded, or failed.
  - The summary stays local, corpus-bound, and environment-bound rather than sounding like a general product guarantee.

- **Flow 6 — Operator hits a degraded or unsupported condition**
  - A touched surface cannot truthfully present full support or complete evidence.
  - DH says what still works, what is limited, and why.
  - When relevant, the surface points the operator to the next command or report for deeper inspection instead of hiding the limitation.

## Business Rules

### Truth ownership boundary

- Rust is the only source of truth for:
  - language/query capability truth
  - parser-backed answer-state truth and retrieval-vs-parser-backed boundaries where applicable
  - freshness truth
  - benchmark truth and benchmark completeness/degraded status
- TypeScript may consume, summarize, and format that truth, but it must not derive a stronger or separate status model.
- If a touched TypeScript surface cannot present Rust truth honestly, the outward claim must be narrowed instead of inferred or upgraded.

### In-scope surface coverage rules

- `dh ask`, `dh explain`, and `dh trace` are in scope for answer-state and capability introspection.
- `dh doctor` and help/docs are in scope for bounded support routing and operator explanation.
- `dh index` follow-up output and touched operator-visible freshness/status reporting are in scope for freshness introspection.
- Current Rust benchmark/parity command/report surfaces are in scope for benchmark truth introspection.
- Benchmark truth is **not** in scope on ask/explain/trace answer surfaces unless the benchmark surface itself is being shown; query surfaces must not reuse benchmark wording as proof of query support.
- If a touched high-level surface cannot carry the full truthful detail, it may show a bounded summary and route the operator to the deeper command/report surface that already holds the Rust-authored truth.

### State-separation rules

| State family | Core question it answers | Allowed outward vocabulary | Must not be silently substituted by |
| --- | --- | --- | --- |
| Language/query capability state | What does the product currently promise for this language or query class? | `supported`, `partial`, `best-effort`, `unsupported` | answer-state, retrieval success, benchmark completion, or generic success wording |
| Answer/result state | How trustworthy is this specific query result? | `grounded`, `partial`, `insufficient`, `unsupported` | capability state, freshness state, or benchmark state |
| Freshness state | Are the relevant parser-backed facts current enough to trust as current parser-backed truth? | `retained current`, `refreshed current`, `degraded partial`, `not current` or a truthfully narrowed equivalent on summary surfaces | prior success, `parse_status` alone, retrieval success, or TS chunk/index counters |
| Benchmark truth/state | What benchmark was run, under what corpus/preparation, and is the evidence complete, degraded, or failed? | benchmark class plus bounded status such as `complete`, `degraded`, `failed` and explicit corpus/preparation identity | capability state, answer-state, freshness state, or a generic `benchmark passed` claim |

- These state families may appear together on a touched surface, but they must keep their own meanings.
- `supported` capability does not imply a specific invocation is `grounded`.
- `grounded` answer does not imply universal support for the underlying language or query class.
- `refreshed current` freshness does not imply benchmark success or broader capability expansion.
- `complete` benchmark evidence does not imply all query classes are supported or all parser-backed facts are fresh.

### What introspection must reveal vs. what may remain internal

| Must be revealable to operators on touched surfaces | May remain internal unless a lower-level diagnostic/report surface already exposes it explicitly |
| --- | --- |
| Which state family is being reported | Raw `content_hash`, `structure_hash`, and `public_api_hash` values |
| Current condition/status for that state family | Raw parser or adapter internals not needed for operator trust |
| Why that condition applies | Raw benchmark instrumentation fields not needed for the declared operator story |
| What still works vs. what is limited | TS-derived heuristics or shadow matrices that are not part of Rust truth |
| Whether the result/support is parser-backed, retrieval-only, or mixed when relevant | Low-level implementation topology or storage details |
| For freshness: whether parser-backed truth is current, degraded, or not current | Full invalidation-planner internals when a bounded state-and-reason summary is enough |
| For benchmarks: benchmark class, corpus identity, preparation meaning, and whether the evidence is complete/degraded/failed | Additional debug-only measurement detail not required by the operator-facing benchmark contract |

### Degraded and unsupported reporting rules

- Any touched surface that reports degraded or unsupported state must communicate, in bounded wording:
  - what surface this output represents
  - the relevant state family and current condition
  - why that condition applies
  - what still works versus what is limited
  - the next recommended action when one exists
- Unsupported language/query capability must remain explicitly unsupported; it must not be softened into vague `limited support` wording when the contract is actually out of scope.
- Retrieval-only or mixed-evidence results may remain useful, but they must not upgrade parser-backed capability truth.
- Freshness degradation must remain visible wherever parser-backed currentness is materially relevant to trust.
- Benchmark degradation must remain visible wherever a benchmark summary omits a corpus, omits measurement completeness, or only partially completed.

### Non-overclaim wording rules

- Use capability-state vocabulary only for product support boundaries.
- Use answer-state vocabulary only for specific query-result trust.
- Use freshness wording only when speaking about currentness of parser-backed truth.
- Use benchmark wording only for local benchmark evidence with explicit class, corpus, and preparation context.
- Operator-facing wording must stay bounded and honest. Prohibited patterns include:
  - `full multi-language support`
  - `all query classes supported`
  - `always current`
  - `support dashboard` when the surface is only a bounded summary of current truth
  - `proven performance for all repos`
  - any equivalent universal, SLA-style, or guarantee-style phrasing
- If a surface summarizes only part of the truth, it must say it is a bounded summary and point to the deeper report or command when needed.

## Acceptance Criteria Matrix

- **AC1** — **Given** a touched operator-facing support or trust surface, **when** it reports capability introspection, **then** the surface identifies the relevant bounded state family and does not imply universal support coverage beyond what Rust currently exposes.
- **AC2** — **Given** `dh ask` or `dh explain`, **when** the output includes both result trust and support information, **then** answer-state and language/query capability state remain visibly separate and keep their distinct meanings.
- **AC3** — **Given** `dh trace` under the current bounded contract, **when** the operator invokes it or reads its touched help/docs, **then** the surface reports `unsupported` explicitly and does not imply hidden fallback parser-backed support.
- **AC4** — **Given** a retrieval-only or mixed-evidence result on a touched query surface, **when** the operator inspects it, **then** the output does not present retrieval success as parser-backed capability proof.
- **AC5** — **Given** Rust-authored capability, freshness, or benchmark truth for a touched scenario, **when** a TypeScript presenter, doctor surface, or doc renders it, **then** TypeScript does not introduce a stronger second status or a separate truth source.
- **AC6** — **Given** a touched operator-facing freshness surface, **when** Rust truth says parser-backed facts are retained current, refreshed current, degraded partial, or not current, **then** the outward state reflects that Rust truth or a truthfully narrowed subset rather than a generic success story.
- **AC7** — **Given** parser-backed freshness is degraded or not current for a touched scenario, **when** related operator-visible output is shown, **then** that output does not present parser-backed trust as fully current.
- **AC8** — **Given** a touched benchmark surface, **when** benchmark evidence is reported, **then** the surface identifies the benchmark class, corpus, preparation context, and complete/degraded/failed status or truthful equivalent instead of using answer-state, capability-state, or freshness wording as a substitute.
- **AC9** — **Given** a touched benchmark surface references memory evidence, **when** the operator inspects it, **then** the surface either reports the memory measurement explicitly or states that it was not measured or otherwise unavailable rather than staying silent.
- **AC10** — **Given** any touched degraded or unsupported introspection surface, **when** the operator reads the output, **then** it states what still works, what is limited, and why, and gives a next action when one is relevant.
- **AC11** — **Given** touched help or user-facing docs for `dh doctor`, `dh ask`, `dh explain`, `dh trace`, indexing freshness/status, or benchmark/report surfaces, **when** reviewers compare them to runtime behavior, **then** the wording and state vocabulary do not overclaim beyond Rust truth.
- **AC12** — **Given** the completed scope package, **when** Solution Lead begins design, **then** they can define the touched surfaces, state-separation contract, degraded-reporting rules, reveal-vs-internal boundary, and wording guardrails without inventing new capabilities or a TS-owned truth source.

## Edge Cases

- A single query touches multiple languages and the strongest language capability differs from the weakest one relevant to the result.
- A query class is generally supported, but the specific answer for this invocation is only `partial` or `insufficient`.
- A result is useful through retrieval-only evidence even though parser-backed capability for that language or class is unsupported.
- A previously grounded-looking parser-backed answer is revisited after freshness for the relevant scope becomes degraded or not current.
- `dh doctor` can summarize support or readiness but cannot honestly carry every low-level detail of answer-state, freshness, and benchmark proof in one screen.
- A benchmark result is complete for timing but degraded for memory measurement, or is fixture-bound rather than real-repo-bound.
- A warm benchmark result exists, but operators must not mistake it for first-run, daemon, or watch-mode behavior.
- A freshness/report surface can only support a narrowed summary and must point to a deeper status/report surface instead of pretending to expose the full internal state.

## Error And Failure Cases

- The feature fails if any touched TypeScript surface creates a second capability, freshness, or benchmark truth source.
- The feature fails if capability state, answer-state, freshness state, and benchmark state collapse into one generic support story.
- The feature fails if `dh trace` or another currently out-of-bounds class is worded as partially supported when the bounded contract is actually `unsupported`.
- The feature fails if retrieval hits, prior success, grammar availability, or TS counters are used to overstate Rust-authored capability or freshness truth.
- The feature fails if benchmark output sounds like product-wide proof instead of local evidence bound to a benchmark class, corpus, and preparation context.
- The feature fails if a touched high-level surface behaves like a universal support dashboard and implies more product guarantees than the bounded Rust truth actually provides.
- The feature fails if degraded or unsupported states are hidden behind generic success wording or if operators cannot tell what still works and what is limited.
- The feature fails if the work broadens into release/install overhaul, watch-mode rollout, new query classes, or new capability expansion instead of bounded introspection.

## Open Questions

- None blocking at Product Lead handoff.
- Solution Lead may choose whether introspection is best exposed as additive summaries on existing surfaces, one bounded dedicated summary surface, or a combination of both, but any chosen surface must consume existing Rust-authored truth and must not become a second TS-owned truth source or a universal dashboard claim.

## Success Signal

- Operators can tell, from touched surfaces alone, what DH supports, how trustworthy a specific result is, whether parser-backed truth is current, and what benchmark evidence actually measured.
- Capability state, answer-state, freshness state, and benchmark state no longer blur together across touched commands, reports, help, doctor output, or user-facing docs.
- Degraded and unsupported conditions become honest enough that operators know what still works and where to inspect next.
- Benchmark wording stays local, corpus-bound, and environment-bound and no longer reads like a general guarantee.
- Solution design can proceed without rediscovering surface boundaries, truth ownership, or wording rules from scattered prior features.

## Handoff Notes For Solution Lead

- Preserve the architecture boundary from the approved upstream context:
  - Rust = capability truth, answer/evidence truth where relevant, freshness truth, and benchmark truth
  - TypeScript = presentation only
- Preserve the state separation from adjacent approved work:
  - capability state remains distinct from answer-state
  - freshness state remains distinct from both capability and answer-state
  - benchmark truth/state remains distinct from all three
- Preserve the bounded query/search reality in `docs/user-guide.md`, including the current explicit `dh trace` unsupported story.
- Use the recent approved solution packages as truth inputs, not as permission to broaden scope:
  - `docs/solution/2026-04-18-multi-language-support.md`
  - `docs/solution/2026-04-19-incremental-indexing-completion.md`
  - `docs/solution/2026-04-19-performance-benchmark-hardening.md`
- The solution package must explicitly define:
  - which operator-visible surfaces are touched
  - which truth family each touched surface is allowed to summarize
  - how those surfaces keep the four state families separate
  - which details are revealable versus internal
  - degraded/unsupported reporting patterns and next-step routing
  - bounded wording rules for help, doctor, presenters, and docs
- No solution path may introduce a second TS-owned matrix, truth cache, or heuristic summary that can drift from Rust.
- No solution path may promise a universal support dashboard. If a summary surface is added, it must label itself as a bounded summary of currently exposed Rust truth only.

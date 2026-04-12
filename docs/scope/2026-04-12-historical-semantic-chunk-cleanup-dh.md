# Scope Package: Telemetry-Driven Historical Semantic Chunk Cleanup (DH)

Date: 2026-04-12
Owner: DH intelligence/runtime team
Execution driver:
- `docs/opencode/telemetry-driven-historical-semantic-chunk-cleanup-analysis-dh.md`

---

DH has already completed semantic path/evidence hardening for new and read-time retrieval flows. The remaining follow-on gap is operational: historical semantic chunk records can still contain mixed or unresolved path semantics, which no longer break retrieval correctness immediately but continue to create avoidable normalization overhead and unresolved telemetry noise. This scope is limited to telemetry-driven cleanup/remediation of historical chunk data so stored semantic chunk records better match the canonical contract over time; it does not reopen retrieval design, segmentation work, or require a forced full cache rebuild.

## Problem Statement

- DH semantic path/evidence hardening is complete for the active runtime path:
  - new semantic data follows the canonical path contract,
  - retrieval/evidence read paths safely normalize historical mixed-path data,
  - unresolved cases are observable through telemetry.
- The remaining issue is **historical semantic chunk data quality** in storage:
  - some `chunks.file_path` values may still use legacy workspace-relative, absolute, or otherwise non-canonical path forms,
  - some historical rows may no longer resolve deterministically to a current canonical repo-relative path,
  - these rows keep generating repeated normalization work and unresolved telemetry even though runtime behavior is hardened.
- The problem to solve is **cleanup/remediation of historical semantic chunk data based on telemetry evidence**, so DH can reduce operational data debt without changing retrieval architecture.

## Current State vs Target State

| Dimension | Current state in DH | Target state for this scope |
|---|---|---|
| Semantic path/evidence hardening | Complete for new write paths and read-time evidence handling | Remains unchanged and treated as baseline |
| Historical chunk storage | May still contain mixed or unresolved legacy path forms | Historical chunk records are classified and cleaned when deterministic remediation is possible |
| Runtime normalization | Continues to normalize older data at read time | Still available as a safety net, but relied on less for remediable historical rows |
| Telemetry unresolved signals | Reflect both real new issues and historical storage debt | Historical-data noise is reduced so unresolved telemetry better represents remaining true exceptions |
| Cleanup approach | No explicit historical remediation loop yet | Cleanup is driven by telemetry-informed candidate discovery, dry-run reporting, and controlled apply behavior |
| Scope ambition | Follow-on operational debt after hardening | Narrow historical data cleanup/remediation only |

## In Scope

1. **Telemetry-driven candidate discovery**
   - Use existing unresolved telemetry/evidence signals to identify historical semantic chunk records that are likely carrying non-canonical or unresolved path semantics.

2. **Historical chunk-path classification**
   - Classify candidate historical chunk rows into:
     - already canonical,
     - deterministically convertible to canonical,
     - unresolved / not safe to rewrite.

3. **Controlled historical remediation flow**
   - Define a bounded cleanup flow that supports:
     - impact reporting before mutation,
     - apply behavior only for deterministically convertible rows,
     - explicit retention/reporting for rows that cannot be safely rewritten.

4. **Storage integrity checks around cleanup**
   - Confirm cleanup does not introduce chunk/embedding integrity drift.
   - Include follow-up handling for orphaned or low-value related records only when required to preserve storage consistency after cleanup.

5. **Before/after operational verification**
   - Compare telemetry and storage-level outcomes before and after cleanup.
   - Record what was remediated, what remains unresolved, and why.

## Out of Scope

- Retrieval redesign of any kind, including planner, ranking, indexing, segmentation, or evidence architecture changes.
- Reopening the completed semantic path/evidence hardening task except where its outputs are used as baseline assumptions.
- Mandatory full semantic cache rebuild, full re-embed, or forced rewrite of all historical data regardless of telemetry evidence.
- Rewriting rows when canonicalization is not deterministic.
- Broad schema redesign for chunks or embeddings.
- Cleanup of unrelated non-semantic storage debt.

## Business Rules and Scope Boundaries

1. **Hardening is already complete** — this task starts from the assumption that semantic path/evidence hardening is done and functioning.
2. **Historical cleanup only** — the task addresses historical semantic chunk data debt, not retrieval behavior redesign.
3. **Telemetry-informed, not speculative** — cleanup scope must be driven by observed telemetry/storage evidence, not a broad rewrite of all records.
4. **Deterministic rewrite only** — historical rows may be rewritten only when canonical mapping is provably safe.
5. **Unresolved rows stay observable** — records that cannot be safely canonicalized must remain reported rather than force-fixed.
6. **No forced full rebuild** — the scope must not require a complete cache or embedding rebuild to be considered successful.
7. **Storage consistency must hold** — cleanup may not leave chunk/embedding relationships in a worse integrity state than before execution.

## Acceptance Criteria

| # | Acceptance criterion | Observable completion signal |
|---|---|---|
| AC-1 | The scope and downstream solution treat this work as historical semantic chunk cleanup following completed hardening | The solution/implementation path does not reopen retrieval redesign, segmentation work, or hardening scope |
| AC-2 | DH defines a telemetry-informed method to identify historical chunk rows that are candidates for cleanup | Candidate discovery is explicitly tied to existing unresolved telemetry and storage inspection rather than a blind full rewrite |
| AC-3 | Historical candidate rows are separated into canonical, deterministically convertible, and unresolved groups | Reporting/output distinguishes which rows need no action, which are safe to remediate, and which must remain unresolved |
| AC-4 | Any apply path only updates deterministically convertible historical chunk paths | No acceptance path permits rewriting ambiguous rows or forcing canonicalization without sufficient evidence |
| AC-5 | Cleanup execution includes pre-mutation reporting and post-apply integrity verification | The execution flow requires dry-run-style impact visibility and explicit follow-up checks for chunk/embedding consistency |
| AC-6 | The task verifies before/after operational results using telemetry and storage-level evidence | Delivered verification shows what historical unresolved noise was reduced and what unresolved residue remains |
| AC-7 | The task does not require a forced full cache rebuild or broad schema/retrieval redesign to succeed | The final solution remains a narrow remediation/data-hygiene change |

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Over-remediation of ambiguous rows | Incorrect path rewrites would damage historical evidence quality more than leaving rows unresolved | Only permit apply behavior for deterministic mappings; keep ambiguous rows observable |
| High-impact storage mutation | Bulk cleanup can be difficult to inspect or recover if the blast radius is unclear | Require pre-apply reporting, controlled execution, and explicit integrity checks |
| Misleading telemetry improvement | Short-term traffic patterns could make unresolved counts appear improved without real cleanup value | Compare before/after telemetry in a defined observation window and pair it with storage-level reporting |
| Integrity drift between chunks and embeddings | Historical chunk cleanup could leave related embedding records in a stale or orphaned state | Include post-cleanup storage integrity verification and bounded orphan handling where necessary |
| Scope creep | Cleanup work can easily expand into architectural retrieval changes | Hold planning and review against the out-of-scope list and sequencing rules |

### Assumptions

1. `docs/opencode/telemetry-driven-historical-semantic-chunk-cleanup-analysis-dh.md` is the authoritative analysis input for this scope.
2. Semantic path/evidence hardening is already complete and serves as baseline, not as open scope.
3. Existing telemetry surfaces already provide enough signal to identify an initial cleanup candidate set.
4. Some historical rows will remain unresolved after the first cleanup pass and that is acceptable if they are explicitly reported.
5. Success is measured by reduction of historical operational noise/debt, not by elimination of every unresolved historical row.

## Execution Sequencing Expectations

### Required sequence
1. **Phase 0 — Baseline and scope freeze**
   - Capture the relevant telemetry baseline for unresolved semantic/evidence path cases.
   - Freeze the scope to historical semantic chunk cleanup only.

2. **Phase 1 — Candidate discovery and classification**
   - Identify historical cleanup candidates from telemetry and storage inspection.
   - Classify rows into canonical, deterministically convertible, and unresolved groups.

3. **Phase 2 — Cleanup flow definition with pre-apply reporting**
   - Define the remediation flow so it can report scan counts, convertible counts, unresolved counts, and representative path cases before mutation.
   - Require the apply path to exclude ambiguous rows.

4. **Phase 3 — Controlled apply and integrity checks**
   - Apply remediation only to approved deterministic candidates.
   - Verify chunk/embedding consistency and perform bounded orphan cleanup only if cleanup introduced that need.

5. **Phase 4 — Telemetry verification and closure**
   - Compare before/after telemetry and storage summary outputs.
   - Record what debt was removed, what unresolved residue remains, and whether any manual follow-up backlog is required.

### Hard sequencing rules
- Do not broaden the task into retrieval redesign, segmentation changes, or evidence pipeline re-architecture.
- Do not skip the baseline and pre-apply reporting steps.
- Do not apply cleanup to rows that are not deterministically mappable.
- Do not require or imply a forced full cache rebuild as the default remediation path.
- Do not mark the work complete unless both remediation results and residual unresolved cases are explicitly accounted for.

## Handoff Notes for Solution Lead

- Preserve DH reality: semantic path/evidence hardening is already complete; this is a follow-on cleanup/remediation task for historical chunk data.
- Keep the solution narrow: telemetry-informed candidate discovery, classification, dry-run/apply remediation flow, and integrity/telemetry verification.
- Treat the main acceptance hotspots as deterministic rewrite boundaries, residual unresolved reporting, and explicit rejection of retrieval redesign or forced full rebuild strategies.
- If later operational evidence suggests recurring historical debt, that can justify a future incremental remediation loop, but it is not required scope for this first cleanup slice.

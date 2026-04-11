# Scope Package: Semantic Retrieval Segmented-Path Hardening (DH)

Date: 2026-04-11
Owner: DH intelligence/runtime team
Execution driver:
- `docs/opencode/semantic-retrieval-segmented-path-hardening-analysis-dh.md`

---

DH has already completed marker-driven segmentation. The remaining follow-on gap is narrower: semantic retrieval still has potential path-semantics drift between persisted semantic chunk paths and the evidence-building path contract, which can reduce evidence correctness in segmented repositories. This scope is limited to hardening semantic retrieval path semantics and evidence correctness so semantic results consistently resolve to the correct repo-relative file identity; it does not reopen segmentation work or redesign retrieval architecture.

## Problem Statement

- DH segmentation work is complete and already established the intended repository/workspace boundaries.
- The remaining issue is a **semantic retrieval correctness gap**:
  - semantic chunk persistence can carry path values whose semantics are not fully aligned with the evidence pipeline,
  - evidence-building logic expects retrieval results to resolve through a repo-relative path contract,
  - segmented repositories make this mismatch more visible because workspace-relative and repo-relative identities are easier to drift apart.
- The problem to solve is **path semantics and evidence correctness only** for the semantic retrieval path, so retrieval outputs can be trusted to point to the correct file when building snippets and evidence packets.

## Current State vs Target State

| Dimension | Current state in DH | Target state for this scope |
|---|---|---|
| Segmentation | Completed | Remains unchanged and treated as baseline |
| Semantic chunk path persistence | Can persist path values whose semantics are not explicitly guaranteed to match the evidence contract | Newly written semantic chunk paths follow one canonical repo-relative contract |
| Semantic read path | Can pass through historical or mixed path semantics | Read path safely normalizes legacy or mixed semantic paths before downstream use |
| Retrieval result contract | Semantic and non-semantic results are not guaranteed to share identical path semantics in all cases | `NormalizedRetrievalResult.filePath` is consistently repo-relative canonical for semantic and non-semantic flows |
| Evidence building | Assumes retrieval result paths can be resolved correctly against repo root | Evidence building receives paths that resolve deterministically, with clear failure behavior when they do not |
| Scope ambition | Follow-on hardening gap after segmentation | Narrow semantic path-semantics and evidence-correctness hardening only |

## In Scope

1. **Canonical semantic path contract**
   - Define the required path semantics for semantic retrieval outputs used by the retrieval/evidence pipeline.
   - Treat repo-relative canonical file identity as the required downstream contract.

2. **Write-path hardening for new semantic data**
   - Ensure newly persisted semantic chunk paths are written using the canonical repo-relative contract.
   - Apply this consistently across semantic chunk generation branches.

3. **Read-path normalization for legacy or mixed data**
   - Add backward-compatible normalization on semantic read/adapter paths so older chunk records with non-canonical path semantics can still be consumed safely.
   - Ensure downstream normalized retrieval results use one file-path contract.

4. **Evidence-path correctness hardening**
   - Harden evidence-building behavior so invalid or non-resolvable paths do not silently masquerade as correct evidence.
   - Keep the evidence builder as a consumer of the canonical contract, with bounded resilience for bad historical data.

5. **Verification coverage focused on segmented-repo evidence correctness**
   - Validate that semantic retrieval results in segmented repositories resolve to the expected file for evidence/snippet generation.
   - Include cases covering new canonical data and legacy-path compatibility behavior.

## Out of Scope

- Reopening or extending the already-completed segmentation task.
- Broad retrieval redesign, including planner changes, scoring changes, ANN/index strategy changes, or graph-retrieval architecture changes.
- General path-contract redesign across unrelated DH subsystems beyond what semantic retrieval and evidence correctness directly require.
- Mandatory hard migration or full cache rebuild as part of this scope.
- New product behavior unrelated to semantic retrieval path correctness.

## Business Rules and Scope Boundaries

1. **Segmentation is already complete** — this task starts after segmentation and must not reframe segmentation as unfinished.
2. **Single downstream contract** — retrieval/evidence-facing file paths for semantic results must resolve to repo-relative canonical identity.
3. **Write-clean, read-safe** — new semantic data must be written in canonical form, while historical data must remain safely consumable through bounded normalization.
4. **Evidence correctness over redesign** — the priority is correct path identity and snippet/evidence resolution, not broader retrieval optimization.
5. **Narrow blast radius** — changes must stay limited to semantic retrieval path semantics and evidence correctness.
6. **Failure must be observable** — unresolved or invalid path cases must be diagnosable rather than hidden behind silent fallback behavior.

## Acceptance Criteria

| # | Acceptance criterion | Observable completion signal |
|---|---|---|
| AC-1 | DH defines one explicit canonical file-path contract for semantic retrieval results used by the retrieval/evidence pipeline | Scope, solution, and implementation surfaces all treat semantic retrieval file paths as repo-relative canonical downstream of normalization |
| AC-2 | Newly generated semantic chunk records are persisted using the canonical repo-relative file-path contract | New chunk data written after the change does not retain workspace-relative or otherwise non-canonical path semantics |
| AC-3 | Semantic read/adapter paths normalize legacy or mixed path records before producing downstream normalized results | Historical chunk data with non-canonical path representations can still produce usable normalized retrieval results when conversion is possible |
| AC-4 | `NormalizedRetrievalResult.filePath` is consistent between semantic and non-semantic retrieval flows for the same repo file identity | Downstream retrieval/evidence consumers no longer receive semantically mismatched file-path representations for equivalent files |
| AC-5 | Evidence building resolves semantic retrieval results against the expected file in segmented-repository scenarios | Target verification cases show snippets/evidence packets resolving to the correct file rather than failing or pointing to the wrong file because of path-semantics drift |
| AC-6 | Invalid or non-resolvable semantic paths do not fail silently | Diagnostics, telemetry, or equivalent observable signals identify cases where legacy or malformed paths cannot be normalized/resolved |
| AC-7 | The delivered work remains narrow and does not introduce a broad retrieval redesign | No implementation in this task changes retrieval planning, ranking strategy, or unrelated retrieval subsystem architecture |

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Historical mixed-state chunk data | Existing embeddings/chunks may still contain older path semantics and create inconsistent behavior | Require backward-compatible read-path normalization before relying on new write-path guarantees alone |
| Over-normalization | Aggressive normalization could incorrectly rewrite already-valid identities in edge cases | Define deterministic normalization rules and verify against segmented-repo cases |
| Duplicate file identity after normalization | Historical data may represent the same file under multiple path forms | Ensure downstream handling does not treat path-form duplicates as distinct evidence identities |
| Silent evidence fallback | A generic snippet-unavailable outcome without observability would hide whether the hardening actually worked | Require explicit diagnostics/telemetry for unresolved-path cases |
| Scope creep into retrieval redesign | The task could expand into wider semantic retrieval changes and lose its narrow follow-on character | Hold solution review against the out-of-scope list and acceptance criteria |

### Assumptions

1. `docs/opencode/semantic-retrieval-segmented-path-hardening-analysis-dh.md` is the authoritative analysis input for this scope.
2. Marker-driven segmentation is already complete and is not being reopened by this task.
3. The remaining DH gap is path-semantics alignment and evidence correctness for semantic retrieval, not boundary detection.
4. Backward-compatible handling of historical semantic data is required, but a mandatory full re-embed/re-chunk migration is not assumed for this slice.

## Execution Sequencing Expectations

### Required sequence
1. **Phase 0 — Contract confirmation**
   - Confirm the current semantic-path write surfaces, read/adapter surfaces, and evidence consumer contract.
   - Define the canonical repo-relative path contract and the bounded legacy-normalization rules.

2. **Phase 1 — New-data write-path hardening**
   - Update semantic chunk writing so new records persist canonical repo-relative file paths.
   - Keep the blast radius limited to semantic path identity behavior.

3. **Phase 2 — Backward-compatible read normalization**
   - Normalize legacy or mixed semantic paths before they reach normalized retrieval results and evidence consumers.
   - Ensure semantic and non-semantic retrieval flows converge on one downstream file-path contract.

4. **Phase 3 — Evidence correctness verification**
   - Verify end-to-end semantic retrieval to evidence/snippet resolution in segmented-repository scenarios.
   - Confirm that unresolved historical edge cases are observable rather than silent.

### Hard sequencing rules
- Do not reopen segmentation behavior or workspace-boundary logic as part of this task.
- Do not begin with a broad retrieval redesign before the path contract and legacy-normalization rules are defined.
- Do not treat evidence resilience alone as sufficient if canonical semantic-path semantics are still undefined.
- Do not mark the task complete unless both new-data correctness and historical-data compatibility are explicitly verified.

## Handoff Notes for Solution Lead

- Preserve DH reality: segmentation is complete; this is a follow-on correctness hardening task for semantic retrieval path semantics and evidence behavior.
- Keep the solution narrow: canonical repo-relative path contract, new-data write hardening, legacy read normalization, and evidence correctness verification.
- Treat the main acceptance hotspots as semantic/non-semantic path consistency, backward compatibility for historical chunk data, and observability of unresolved-path failures.
- Reject solution directions that broaden into retrieval redesign, segmentation rework, or unrelated runtime architecture changes.

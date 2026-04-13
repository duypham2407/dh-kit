# Solution Package: Semantic Retrieval Segmented-Path Hardening (DH)

**Date:** 2026-04-11
**Approved scope:** `docs/scope/2026-04-11-semantic-retrieval-segmented-path-hardening-dh.md`
**Analysis input:** `docs/opencode/semantic-retrieval-segmented-path-hardening-analysis-dh.md`

---

## Recommended Path

Adopt a **hybrid hardening path**: write canonical repo-relative file paths for newly generated semantic chunks, normalize legacy semantic chunk paths before they become downstream retrieval results, and harden evidence building so unresolved paths are observable instead of silently looking valid.

This is enough for DH's current architecture because the needed building blocks already exist:

- `packages/intelligence/src/workspace/scan-paths.ts` already provides `resolveIndexedFileAbsolutePath(...)` and `toRepoRelativePath(...)`
- `packages/retrieval/src/semantic/chunker.ts` already resolves workspace-aware absolute paths before reading files
- `packages/retrieval/src/query/run-retrieval.ts` already uses repo-relative normalization for non-semantic retrieval results
- `packages/retrieval/src/semantic/telemetry-collector.ts` already provides a local telemetry surface for observable failures

This solution is **path/evidence hardening only**. It does **not** redesign semantic retrieval, change segmentation behavior, change ANN/HNSW strategy, or broaden retrieval planning/ranking.

---

## Repository Reality Constraints

1. **Segmentation is already complete and stays baseline.**
   - `IndexedFile.path` may still originate from workspace-local semantics.
   - The follow-on gap is downstream semantic-path consistency, not workspace discovery.

2. **Evidence building currently assumes repo-relative input.**
   - `packages/retrieval/src/query/build-evidence-packets.ts` currently does `path.join(repoRoot, result.filePath)`.
   - That consumer contract should remain the downstream rule rather than being widened to multiple path semantics.

3. **Semantic write and read paths are split across modules.**
   - `chunker.ts` controls path values persisted for new chunks.
   - `semantic-search.ts` controls how stored chunk rows become `SemanticSearchResult`.
   - `run-retrieval.ts` is the query-layer convergence point where semantic and non-semantic results are combined.

4. **DH already has real validation commands.**
   - `npm run check`
   - `npm run test`

5. **Historical chunk data must remain usable.**
   - Scope does not allow a mandatory cache rebuild or hard migration.
   - The design must tolerate mixed historical path semantics during transition.

---

## Architecture Decisions

### AD-1: Canonical downstream contract is repo-relative path identity

From `NormalizedRetrievalResult.filePath` onward, semantic retrieval must use the same repo-relative canonical semantics already expected by the evidence pipeline and already used by non-semantic retrieval.

### AD-2: Write-clean, read-safe transition model

New chunk records should be written in canonical form at the chunker boundary, while historical chunk rows must be normalized at read time before they reach downstream retrieval/evidence consumers.

This keeps the architecture clean for new data without requiring an immediate database migration or re-embed cycle.

### AD-3: Reuse existing path helpers instead of inventing a second normalization system

Path resolution and repo-relativization should reuse the existing workspace-aware helpers in `packages/intelligence/src/workspace/scan-paths.ts` wherever possible. The follow-on should not introduce a parallel path semantics utility with different rules.

### AD-4: Evidence builder remains a consumer, not the primary fixer

`build-evidence-packets.ts` should keep treating `result.filePath` as repo-relative. Its hardening should be bounded to validation/diagnostic behavior for bad historical data, not a silent attempt to reinterpret arbitrary path shapes.

### AD-5: Observability is part of correctness for unresolved legacy paths

If a stored semantic chunk path cannot be normalized or resolved safely, DH should emit explicit diagnostics or telemetry. Returning only `Snippet unavailable.` is not enough to prove the hardening worked.

### AD-6: No schema or retrieval-strategy redesign in this slice

Keep `filePath: string` in shared types and keep the current storage schema intact. This slice should not expand into typed path-enum redesign, planner changes, ranking changes, or ANN/index architecture changes.

---

## Impacted Surfaces

### Primary implementation surfaces

| File | Why it changes |
|---|---|
| `packages/retrieval/src/semantic/chunker.ts` | Persist canonical repo-relative `filePath` for all newly generated chunk branches |
| `packages/retrieval/src/semantic/semantic-search.ts` | Normalize legacy/mixed chunk paths before exposing semantic results downstream |
| `packages/retrieval/src/query/run-retrieval.ts` | Enforce final convergence of semantic and non-semantic results onto one repo-relative contract |
| `packages/retrieval/src/query/build-evidence-packets.ts` | Add bounded path validation/resolution hardening and observable failure behavior |
| `packages/intelligence/src/workspace/scan-paths.ts` | Reused helper surface; may receive small helper additions if current exports are not enough for deterministic normalization |

### Shared contract/documentation surfaces

| File | Why it changes |
|---|---|
| `packages/shared/src/types/embedding.ts` | Add contract comments clarifying canonical semantic `filePath` semantics |
| `packages/shared/src/types/evidence.ts` | Add contract comments clarifying downstream repo-relative expectation |
| `packages/shared/src/types/telemetry.ts` | May need additive telemetry event shape support if unresolved-path diagnostics are recorded structurally |
| `packages/retrieval/src/semantic/telemetry-collector.ts` | Existing telemetry sink likely used for unresolved-path observability |

### Test surfaces likely affected

| File | Why it changes |
|---|---|
| `packages/retrieval/src/semantic/chunker.test.ts` | Verify new chunk writes persist repo-relative paths, including segmented workspace cases |
| `packages/retrieval/src/semantic/semantic-search.test.ts` | Verify legacy-path normalization and normalized result semantics |
| `packages/retrieval/src/query/run-retrieval.test.ts` | Verify semantic/non-semantic path consistency and segmented evidence correctness |
| `packages/retrieval/src/query/build-evidence-packets.test.ts` | Add focused tests for valid repo-relative resolution and diagnosable invalid-path behavior if a dedicated test file is introduced |

---

## Technical Risks

| Risk | Why it matters | Planned mitigation |
|---|---|---|
| Historical mixed-state chunk rows | Old chunk records can still carry non-canonical path forms | Normalize on semantic read path before downstream use |
| Over-normalization | Aggressive rewriting could damage already-correct identities | Keep rules deterministic: absolute-in-repo -> repo-relative; workspace-relative legacy -> resolve only when provable; otherwise diagnose |
| Duplicate file identity after normalization | Old and new path forms could collapse to the same repo file | Keep rerank/dedup behavior focused on final normalized `filePath` |
| Silent evidence fallback | Generic snippet failure hides whether path hardening is actually correct | Emit telemetry/diagnostic signal for unresolved normalization/resolution failures |
| Scope creep into retrieval redesign | Follow-on could expand into broader semantic changes | Hold all slices to path semantics and evidence correctness only |

---

## Phased Implementation Plan

### Phase 0: Contract freeze and failing coverage

- **Goal:** Freeze the exact downstream path contract and add targeted tests before implementation changes widen.
- **Primary files:**
  - `packages/retrieval/src/semantic/chunker.test.ts`
  - `packages/retrieval/src/semantic/semantic-search.test.ts`
  - `packages/retrieval/src/query/run-retrieval.test.ts`
  - `packages/retrieval/src/query/build-evidence-packets.test.ts` (new, if needed)
  - `packages/shared/src/types/embedding.ts`
  - `packages/shared/src/types/evidence.ts`
- **Work:**
  - freeze the rule that semantic downstream paths must be repo-relative canonical
  - add or update tests for segmented workspace files, legacy non-canonical semantic chunk paths, and evidence resolution behavior
  - document that this slice is path/evidence hardening only, not retrieval redesign
- **Dependencies:** none
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 1: New-data write-path hardening

- **Goal:** Ensure newly generated chunk inputs persist canonical repo-relative paths.
- **Primary files:**
  - `packages/retrieval/src/semantic/chunker.ts`
  - `packages/intelligence/src/workspace/scan-paths.ts` (only if helper refinement is needed)
  - `packages/retrieval/src/semantic/chunker.test.ts`
- **Work:**
  - derive a canonical repo-relative path once per indexed file after `resolveIndexedFileAbsolutePath(...)`
  - use that normalized path for all chunk emission branches: symbol chunk, gap chunk, trailing chunk, and sliding-window chunk
  - preserve existing guard behavior when the file cannot be resolved safely
  - keep chunk content, line ranges, and token logic unchanged
- **Dependencies:** Phase 0
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 2: Backward-compatible semantic read normalization

- **Goal:** Keep historical chunk rows usable while converging downstream semantic results on the canonical path contract.
- **Primary files:**
  - `packages/retrieval/src/semantic/semantic-search.ts`
  - `packages/retrieval/src/query/run-retrieval.ts`
  - `packages/retrieval/src/semantic/telemetry-collector.ts`
  - `packages/shared/src/types/telemetry.ts` (if additive event typing is needed)
  - `packages/retrieval/src/semantic/semantic-search.test.ts`
  - `packages/retrieval/src/query/run-retrieval.test.ts`
- **Work:**
  - add deterministic normalization for stored chunk paths before they become `SemanticSearchResult` or normalized retrieval results
  - support the minimum safe transition cases:
    - already repo-relative canonical path -> pass through
    - absolute path inside `repoRoot` -> convert to repo-relative
    - resolvable legacy workspace-relative path -> convert only through a bounded, deterministic rule
    - non-resolvable or invalid path -> preserve observability and prevent silent correctness claims
  - ensure the final semantic results merged in `run-retrieval.ts` use the same repo-relative contract as symbol/file results
  - keep dedup/rerank behavior operating on final normalized `filePath`
- **Dependencies:** Phase 1
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 3: Evidence-path hardening and focused integration verification

- **Goal:** Prove that semantic retrieval results now resolve to the correct file for evidence/snippet generation in segmented repos.
- **Primary files:**
  - `packages/retrieval/src/query/build-evidence-packets.ts`
  - `packages/retrieval/src/query/run-retrieval.test.ts`
  - `packages/retrieval/src/query/build-evidence-packets.test.ts` (new, if needed)
- **Work:**
  - harden path resolution before file read so obviously invalid paths are rejected cleanly
  - preserve the main contract that evidence input is repo-relative canonical
  - attach clear observable behavior for unresolved paths instead of relying only on generic snippet failure
  - verify end-to-end segmented-repo scenarios for both newly written chunk data and legacy-compatible data
- **Dependencies:** Phase 2
- **Validation hook:**
  - `npm run check`
  - `npm run test`

---

## Dependency Graph

- **Sequential:** Phase 0 -> Phase 1 -> Phase 2 -> Phase 3
- **Critical path:** freeze the canonical path contract first, then harden chunk writes, then normalize historical reads, then prove evidence correctness end to end.
- **Parallelism note:**
  - Test additions within a phase can be split safely.
  - Implementation work for `chunker.ts`, `semantic-search.ts`, and `build-evidence-packets.ts` should not be treated as independent parallel streams because they all converge on one file-path contract and one integration checkpoint.

---

## Integration Checkpoint

Before closing the work, DH should demonstrate one segmented repository scenario where:

- semantic chunk generation writes repo-relative paths for new chunks
- a legacy or mixed stored path can still be normalized when safely resolvable
- `runRetrieval()` returns semantic and non-semantic results with the same repo-relative `filePath` semantics
- `buildEvidencePackets()` reads the expected file and does not silently mask unresolved-path cases

This checkpoint matters because the risk is not isolated to one module; the correctness claim only holds when write path, read path, and evidence path all converge on the same file identity.

---

## Validation Strategy

### Required repository commands

- `npm run check`
- `npm run test`

### Validation matrix

| Target | Validation path |
|---|---|
| New semantic chunks persist canonical repo-relative paths | Unit tests in `packages/retrieval/src/semantic/chunker.test.ts` plus `npm run test` |
| Legacy semantic chunk paths normalize safely | Unit tests in `packages/retrieval/src/semantic/semantic-search.test.ts` plus `npm run test` |
| Semantic/non-semantic downstream path consistency | Integration coverage in `packages/retrieval/src/query/run-retrieval.test.ts` plus `npm run test` |
| Evidence packets resolve the correct segmented file | Focused retrieval/evidence tests plus `npm run test` |
| Invalid or unresolved paths are observable | Tests asserting diagnostic/telemetry behavior plus repository test run |
| No type-contract regression from additive comments or telemetry typing | `npm run check` |

### Reviewer focus

- confirm the implementation does not reinterpret segmentation as incomplete work
- confirm the semantic path contract is explicit and consistently applied at the write boundary and the downstream read boundary
- confirm evidence hardening remains bounded and does not become a second path-normalization system
- confirm observability exists for unresolved-path cases
- confirm no planner, scoring, ANN, or graph-retrieval redesign is introduced

---

## Compatibility Boundaries

1. **Backward compatibility with historical chunk rows is required.**
   - Mixed historical data must remain readable when normalization is possible.
   - The solution must not require a mandatory full cache rebuild.

2. **Storage/schema compatibility should be preserved.**
   - Keep existing `filePath: string` fields and current chunk storage shape.
   - Prefer additive comments or additive telemetry typing over breaking type redesign.

3. **Downstream evidence contract stays stable.**
   - `build-evidence-packets.ts` should continue consuming repo-relative file paths.
   - Hardening should improve resilience and diagnosability without changing the public retrieval shape broadly.

4. **Segmented repository behavior must remain aligned with existing scan helpers.**
   - Any normalization logic should stay consistent with `scan-paths.ts` rather than duplicating divergent path rules.

---

## Out of Scope

- reopening marker-driven segmentation or workspace-boundary logic
- broad retrieval redesign, including planner changes, scoring changes, ANN/HNSW changes, or graph-retrieval changes
- mandatory migration or full chunk/embedding rebuild
- general path-contract redesign across unrelated DH subsystems
- unrelated runtime, product, or operator behavior changes

---

## Explicit Scope Guard

This solution package is for **path/evidence hardening only**. It is **not** a broad retrieval redesign. Any implementation proposal that changes retrieval planning, ranking, ANN/index strategy, graph retrieval, or segmentation policy should be rejected as outside the approved DH scope for this follow-on.

---

## Handoff Notes

### FullstackAgent must preserve

- repo-relative canonical `filePath` as the single downstream semantic retrieval contract
- backward-compatible handling of historical chunk rows
- bounded evidence hardening with explicit diagnostics/telemetry for unresolved paths
- narrow blast radius limited to semantic path semantics and evidence correctness

### Code Reviewer must preserve

- no hidden second path-normalization system with conflicting rules
- no broad retrieval redesign hidden behind this hardening task
- deterministic normalization behavior for absolute, repo-relative, and legacy-path cases
- tests that prove segmented-repo evidence correctness rather than only happy-path file reads

### QA / verification must preserve

- evidence that newly written chunks are canonical
- evidence that legacy-path normalization still works when conversion is possible
- evidence that unresolved paths are observable
- evidence that segmented semantic retrieval now points to the correct file identity end to end

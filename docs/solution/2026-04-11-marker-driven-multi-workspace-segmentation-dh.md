# Solution Package: Marker-Driven Multi-Workspace Segmentation (DH)

**Date:** 2026-04-11
**Approved scope:** `docs/scope/2026-04-11-marker-driven-multi-workspace-segmentation-dh.md`
**Analysis input:** `docs/opencode/marker-driven-multi-workspace-segmentation-analysis-dh.md`

---

## Recommended Path

Implement marker-driven segmentation inside DH's existing workspace scan entry point, keep file identity workspace-local, and align every downstream file-reading consumer to resolve absolute file paths from `workspaceRoot` rather than `repoRoot + file.path`.

This is enough because DH already has the hardened pieces this follow-on needs:

- bounded scan options in `detect-projects.ts`
- canonical path helpers in `scan-paths.ts`
- additive workspace diagnostics in `packages/shared/src/types/indexing.ts`
- downstream consumers that already accept `IndexedWorkspace[]`

The missing work is boundary selection and segmented-consumer alignment. It is **not** a new project/worktree lifecycle subsystem, and **worktree/project subsystem parity remains explicitly deferred**.

---

## Repository Reality Constraints

1. **`detectProjects()` is already the scan authority.**
   - `packages/intelligence/src/workspace/detect-projects.ts` owns marker detection, file collection, diagnostics, and `IndexedWorkspace[]` emission.
   - It currently canonicalizes `repoRoot`, detects only root-level markers, and always returns one workspace.

2. **`IndexedFile.path` is only incidentally repo-relative today.**
   - The current implementation emits paths relative to the workspace root.
   - Because the only workspace root today is `repoRoot`, downstream code has been able to join `repoRoot` and `file.path` without noticing the assumption.
   - Once segmentation is enabled, that assumption becomes incorrect for child workspaces.

3. **Multiple downstream readers currently assume `repoRoot + file.path`.**
   - `packages/intelligence/src/graph/graph-indexer.ts`
   - `packages/intelligence/src/graph/extract-import-edges.ts`
   - `packages/intelligence/src/graph/extract-call-edges.ts`
   - `packages/intelligence/src/graph/extract-call-sites.ts`
   - `packages/intelligence/src/parser/ast-symbol-extractor.ts`
   - `packages/intelligence/src/symbols/extract-symbols.ts`
   - `packages/retrieval/src/semantic/chunker.ts`

4. **`workspaceRoot` already exists on `IndexedFile`.**
   - This gives DH a compatible place to anchor segmented file resolution without redefining the indexing model.

5. **DH has real validation commands.**
   - `npm run check`
   - `npm run test`

---

## Architecture Decisions

### AD-1: Keep `detect-projects.ts` as the only segmentation authority

Marker discovery, root finalization, fallback behavior, and per-workspace diagnostics should stay in `packages/intelligence/src/workspace/detect-projects.ts`. Do not introduce a parallel project-management service.

### AD-2: Milestone-1 segmentation stays marker-driven and budget-bounded

Candidate roots should be discovered during controlled traversal under the existing scan guardrails (`maxFiles`, `maxDepth`, `maxFileSizeBytes`, `followSymlinks`, `ignoreDirs`). No manifest-driven configuration layer is needed in this milestone.

### AD-3: Preserve workspace-local file identity; fix consumers instead of flattening boundaries away

`IndexedFile.path` should continue to mean "path relative to that file's workspace root". The segmented boundary is then explicit in `workspaceRoot`, and consumers must resolve absolute file paths from `(workspaceRoot, file.path)` rather than reinterpreting the file as repo-relative.

This is the smallest architecture change that preserves the meaning of `toWorkspaceRelativePath()` and avoids baking single-root assumptions into the segmentation layer.

### AD-4: Root selection must produce non-overlapping emitted workspaces

Milestone-1 should use one explicit nested-root rule:

- canonicalize all candidate roots
- reject out-of-repo roots
- remove duplicates
- when one candidate strictly contains another candidate, keep the **leaf marker root** and suppress the ancestor from emitted workspace output

This yields non-overlapping workspaces and avoids double indexing. It also keeps the policy narrow and reviewable.

### AD-5: Single-root fallback remains mandatory

If no valid finalized marker roots remain, `detectProjects()` must keep the current behavior and emit exactly one workspace rooted at `repoRoot`.

### AD-6: Workspace-level partial scan is the correctness boundary for downstream behavior

Graph deletion safety, retrieval coverage reporting, and runtime summaries should continue to treat partial scan as a first-class state, now aggregated across multiple workspaces instead of one flat repo-level view.

### AD-7: Worktree/project subsystem parity remains deferred

This task does **not** add:

- worktree lifecycle management
- project creation/removal/reset flows
- git-aware orchestration
- a new workspace state machine
- full parity with upstream project/worktree subsystems

Any pressure to solve those problems here should be treated as out of scope.

---

## Impacted Surfaces

### Primary implementation surfaces

| File | Why it changes |
|---|---|
| `packages/intelligence/src/workspace/detect-projects.ts` | Add candidate marker discovery, root finalization, segmented emission, and fallback behavior |
| `packages/intelligence/src/workspace/scan-paths.ts` | Centralize path containment, ancestor/overlap checks, and absolute path resolution helpers needed by segmented consumers |
| `packages/shared/src/types/indexing.ts` | Keep segmented output backward-compatible; add only optional metadata if needed for segmentation diagnostics |
| `packages/intelligence/src/workspace/detect-projects.test.ts` | Cover marker discovery, leaf-root policy, duplicate suppression, fallback, and segmented diagnostics |

### Required downstream alignment surfaces

| File | Why it changes |
|---|---|
| `packages/intelligence/src/graph/graph-indexer.ts` | Stop assuming `repoRoot + file.path`; preserve safe delete behavior under partial multi-workspace scans |
| `packages/intelligence/src/graph/extract-import-edges.ts` | Resolve source/target files from workspace-aware absolute paths |
| `packages/intelligence/src/graph/extract-call-edges.ts` | Read files from workspace-aware absolute paths |
| `packages/intelligence/src/graph/extract-call-sites.ts` | Read files from workspace-aware absolute paths |
| `packages/intelligence/src/parser/ast-symbol-extractor.ts` | Parse files from workspace-aware absolute paths |
| `packages/intelligence/src/symbols/extract-symbols.ts` | Regex fallback must read files from workspace-aware absolute paths |
| `packages/retrieval/src/semantic/chunker.ts` | Chunking must read file contents from workspace-aware absolute paths |
| `packages/retrieval/src/query/run-retrieval.ts` | Continue surfacing reduced coverage, now with segmented workspace meaning |
| `packages/runtime/src/jobs/index-job-runner.ts` | Summaries and diagnostics should report multi-workspace coverage explicitly |

### Test surfaces likely affected

| File | Why it changes |
|---|---|
| `packages/intelligence/src/graph/graph-indexer.test.ts` | Verify segmented indexing and delete safety |
| `packages/retrieval/src/query/run-retrieval.test.ts` | Verify segmented reduced-coverage behavior remains observable |
| `packages/runtime/src/jobs/index-job-runner.test.ts` | Verify workspace-level summary/diagnostics output |

---

## Technical Risks

| Risk | Why it matters | Planned mitigation |
|---|---|---|
| Nested marker ambiguity | Parent and child markers can create contradictory workspace emission | Freeze one leaf-root policy before implementation and test it directly |
| Hidden single-root path assumptions | Many consumers read files using `repoRoot + file.path` today | Introduce one shared absolute-path helper and migrate all file readers in the same slice |
| File identity drift across workspaces | Graph/retrieval/chunker logic can misread or collide if file identity changes inconsistently | Preserve workspace-relative `file.path`, keep `workspaceRoot`, and avoid redefining the file ID model unless tests prove it necessary |
| Extra traversal or duplicate collection cost | Discovery plus per-workspace collection can repeat work | Reuse canonicalized discovery results and keep marker set narrow in milestone 1 |
| Scope creep into project/worktree parity | Follow-on can expand beyond approved segmentation scope | Reject lifecycle/state-machine additions and keep all slices tied to acceptance criteria |

---

## Phased Implementation Plan

### Phase 0: Contract confirmation and boundary freeze

- **Goal:** Freeze the milestone-1 segmentation rules before code changes spread across consumers.
- **Primary files:**
  - `packages/intelligence/src/workspace/detect-projects.ts`
  - `packages/intelligence/src/workspace/scan-paths.ts`
  - `packages/shared/src/types/indexing.ts`
  - `packages/intelligence/src/workspace/detect-projects.test.ts`
- **Work:**
  - confirm supported markers are limited to `package.json` and `go.mod`
  - confirm `IndexedFile.path` remains workspace-relative
  - define the leaf-root nested-marker policy and duplicate-suppression rule
  - define the helper contract for resolving an indexed file to an absolute path from `workspaceRoot`
  - add failing/coverage tests for segmented output, nested markers, and fallback before implementation changes
- **Dependencies:** none
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 1: Marker discovery and finalized workspace emission

- **Goal:** Teach `detectProjects()` to emit multiple non-overlapping workspaces when valid markers exist.
- **Primary files:**
  - `packages/intelligence/src/workspace/detect-projects.ts`
  - `packages/intelligence/src/workspace/scan-paths.ts`
  - `packages/shared/src/types/indexing.ts`
  - `packages/intelligence/src/workspace/detect-projects.test.ts`
- **Work:**
  - add controlled marker discovery during traversal instead of root-only marker checks
  - canonicalize and validate candidate roots against `repoRoot`
  - finalize roots through duplicate removal and the leaf-root policy
  - collect files per finalized workspace root
  - preserve single-root fallback when no finalized segmented roots remain
  - keep metadata additive/optional if segmentation needs an explicit mode flag or root-selection note
- **Dependencies:** Phase 0
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 2: Segmented consumer alignment

- **Goal:** Remove every remaining single-root file-resolution assumption from indexing and retrieval paths.
- **Primary files:**
  - `packages/intelligence/src/graph/graph-indexer.ts`
  - `packages/intelligence/src/graph/extract-import-edges.ts`
  - `packages/intelligence/src/graph/extract-call-edges.ts`
  - `packages/intelligence/src/graph/extract-call-sites.ts`
  - `packages/intelligence/src/parser/ast-symbol-extractor.ts`
  - `packages/intelligence/src/symbols/extract-symbols.ts`
  - `packages/retrieval/src/semantic/chunker.ts`
  - related tests
- **Work:**
  - switch all file readers to a shared workspace-aware absolute-path helper
  - preserve current import-edge and symbol extraction behavior while allowing files to live under non-root workspaces
  - ensure graph path keys stay normalized consistently even when absolute file resolution changes
  - keep delete protection gated on partial scan across all emitted workspaces
- **Dependencies:** Phase 1
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 3: Diagnostics and runtime clarity for segmented coverage

- **Goal:** Make multi-workspace coverage visible without redesigning runtime planners.
- **Primary files:**
  - `packages/retrieval/src/query/run-retrieval.ts`
  - `packages/runtime/src/jobs/index-job-runner.ts`
  - `packages/intelligence/src/graph/graph-indexer.ts`
  - related tests
- **Work:**
  - report workspace count and workspace-level partial/stop-reason visibility in runtime summaries
  - keep retrieval's `reducedCoverage` signal, but ensure its meaning remains correct when only one workspace is partial
  - verify graph index stats and runtime summary language do not imply whole-repo failure when only one workspace is partial
- **Dependencies:** Phase 2
- **Validation hook:**
  - `npm run check`
  - `npm run test`

---

## Dependency Graph

- **Sequential:** Phase 0 -> Phase 1 -> Phase 2 -> Phase 3
- **Critical path:** freeze root-selection and file-resolution invariants first, then emit segmented workspaces, then align all file-reading consumers, then tighten diagnostics.
- **Parallelism note:**
  - Test additions inside a single phase can be split across files.
  - Consumer updates should **not** be treated as independent parallel work unless they all depend on the same shared absolute-path helper and merge behind one integration checkpoint.

---

## Integration Checkpoint

Before QA or broader verification, DH should demonstrate one end-to-end segmented sample repo where:

- `detectProjects()` emits multiple workspaces
- graph indexing reads files successfully from child workspace roots
- retrieval still returns results without path-resolution regressions
- index job summary reports segmented coverage without collapsing it into a misleading flat success/failure state

This checkpoint matters because segmented emission alone is not enough; the downstream path-resolution assumption is the real integration risk.

---

## Validation Strategy

### Required repository commands

- `npm run check`
- `npm run test`

### Validation matrix

| Target | Validation path |
|---|---|
| Marker discovery under current budgets | Extend `packages/intelligence/src/workspace/detect-projects.test.ts`, then run `npm run test` |
| Duplicate suppression and nested-root leaf policy | Add direct nested-marker test coverage in `detect-projects.test.ts`, then run `npm run test` |
| Single-root fallback remains intact | Keep/extend existing fallback tests in `detect-projects.test.ts`, then run `npm run test` |
| Segmented indexing reads correct files | Extend `packages/intelligence/src/graph/graph-indexer.test.ts`, then run `npm run test` |
| Partial scan still prevents unsafe deletes | Keep graph-indexer partial-scan coverage and extend to multi-workspace cases, then run `npm run test` |
| Retrieval reduced-coverage signal remains correct | Extend `packages/retrieval/src/query/run-retrieval.test.ts`, then run `npm run test` |
| Runtime summary reports segmented coverage clearly | Extend `packages/runtime/src/jobs/index-job-runner.test.ts`, then run `npm run test` |
| Type compatibility across shared contracts | Run `npm run check` |

### Reviewer focus points

- any remaining `path.join(repoRoot, file.path)` assumptions after Phase 2
- any nested-root rule that still emits overlapping workspaces
- any type change that makes segmented metadata mandatory for existing callers
- any summary/reporting language that treats one partial workspace as flat whole-repo failure

---

## Compatibility Boundaries

1. **Backward-compatible fallback is required.**
   - Repositories without valid segmented roots must still behave as one root workspace.

2. **Type compatibility should stay additive.**
   - Reuse existing `workspaceRoot`, `diagnostics`, `markers`, and `scanMeta` fields where possible.
   - Add new metadata only if it improves segmented observability without forcing broad caller rewrites.

3. **Marker set stays narrow in milestone 1.**
   - `package.json` and `go.mod` only, unless separately approved.

4. **Consumer alignment is limited to safe segmented consumption.**
   - No planner rewrite, no retrieval-strategy redesign, no graph-model rewrite beyond what segmented file resolution requires.

---

## Out-of-Scope Boundaries

- reopening scan hardening beyond segmentation-specific follow-on changes
- project/worktree lifecycle management
- git-aware orchestration or checkout/worktree commands
- full parity with upstream project/workspace subsystems
- per-workspace budget tuning or complex policy layering
- broad retrieval or graph redesign unrelated to consuming segmented workspaces

**Explicit deferral:** worktree/project subsystem parity remains deferred and must not be smuggled into this execution slice under the banner of segmentation.

---

## Handoff Notes

### FullstackAgent must preserve

- workspace-relative `IndexedFile.path` semantics
- mandatory single-root fallback
- non-overlapping emitted workspaces
- partial-scan safety in graph deletion behavior
- narrow marker-driven scope only

### Code Reviewer must verify

- no hidden single-root path assumptions remain in file-reading code paths
- root finalization logic is centralized and test-backed
- no overlap or duplicate workspace emission survives nested-marker cases
- new metadata is optional/additive unless a stronger contract is absolutely necessary

### QA Agent must verify

- segmented sample repo behavior
- fallback single-root behavior
- partial multi-workspace scan reporting
- no accidental expansion into worktree/project subsystem behaviors
